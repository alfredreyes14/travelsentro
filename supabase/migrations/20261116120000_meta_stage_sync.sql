-- Sync CRM stages with Meta, two ways (lib/meta-sync):
--
--   A. Messenger chats -> CRM stage. Each Messenger chat (a PSID, Meta's
--      page-scoped id for the person) can be linked to a contact. Chats are
--      read every 15 minutes (lib/meta-sync/poll.ts, run by Vercel Cron)
--      and, when Meta delivers them, through the webhook:
--        - a linked lead who writes to us again moves New/Lost -> Inquiry;
--        - a staff message containing a saved-reply phrase
--          (messenger_stage_phrases) moves the lead forward, e.g. sending
--          the prices -> Quotation.
--      Inbox labels <-> stage also work once the Meta app has App Review
--      (Advanced Access to pages_messaging); off until then.
--   B. CRM stage -> Meta Ads (Conversions API for CRM). Every stage change
--      of a contact that came from a Meta lead ad is reported with its
--      leadgen id, so Meta can optimise ads toward leads that book.
--
-- Both go through meta_outbox: database triggers queue a job on each stage
-- change, and the app sends queued jobs (after a change, and from the
-- daily crons). Nothing here talks to Meta directly.
--
-- (1) contacts.messenger_psid + messenger_threads
-- (2) meta_outbox + claim_meta_outbox()
-- (3) triggers that queue jobs
-- (4) record_messenger_inbound() -- webhook: a customer wrote to the Page
-- (5) link_messenger_by_token() -- webhook: a follow-up "Chat on
--     Messenger" tap opened the chat
-- (6) apply_inbox_stage() -- webhook: staff put a stage label on a chat
-- (7) link_messenger_thread() / unlink_messenger_thread() -- staff, by hand
-- (8) messenger_stage_phrases + record_messenger_staff_message()
-- (9) messenger_sync_state

-- ============================================================================
-- (1) Messenger chats
-- ============================================================================
alter table contacts add column messenger_psid text unique;

-- One row per person who has written to the Page, so staff can link chats
-- the webhook couldn't match on its own. Holds only what staff need to
-- recognise the chat: a display name and a short snippet.
create table messenger_threads (
  psid text primary key,
  name text,
  contact_id uuid references contacts(id) on delete set null,
  last_inbound_at timestamptz,
  last_snippet text check (last_snippet is null or length(last_snippet) <= 100),
  -- The chat in the Facebook inbox (facebook.com + this path).
  chat_link text check (chat_link is null or chat_link like '/%'),
  -- A stage label staff put on the chat before it was linked; applied on link.
  pending_stage text,
  created_at timestamptz not null default now()
);

alter table messenger_threads enable row level security;

create index messenger_threads_unlinked_idx
  on messenger_threads(last_inbound_at desc) where contact_id is null;

create policy "authenticated staff can read messenger threads" on messenger_threads
  for select to authenticated using (true);

-- ============================================================================
-- (2) meta_outbox
-- ============================================================================
create table meta_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('capi_event', 'inbox_label')),
  contact_id uuid not null references contacts(id) on delete cascade,
  -- capi_event:  { lead_id, stage, client_type, event_time }
  -- inbox_label: { psid, stage, client_type }
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

-- Service role only: no policies.
alter table meta_outbox enable row level security;

create index meta_outbox_pending_idx on meta_outbox(created_at) where sent_at is null;

-- Hands out up to p_limit unsent jobs, oldest first, and marks them claimed
-- for 5 minutes, so two senders running at once never send the same job.
create function public.claim_meta_outbox(p_limit integer)
returns setof meta_outbox
language sql
security invoker
set search_path = public
as $$
  update meta_outbox o
  set claimed_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from meta_outbox
    where sent_at is null
      and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning o.*;
$$;

revoke execute on function public.claim_meta_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_meta_outbox(integer) to service_role;

-- ============================================================================
-- (3) Triggers that queue jobs
-- ============================================================================

-- The contact's most recent Meta lead (leadgen id), if any.
create function public.latest_meta_lead_id(p_contact_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select i.external_id
  from inquiries i
  where i.contact_id = p_contact_id
    and i.source = 'meta_lead_ad'
    and i.external_id is not null
  order by i.created_at desc
  limit 1;
$$;

revoke execute on function public.latest_meta_lead_id(uuid) from public, anon, authenticated;

create function public.queue_meta_sync_on_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id text;
begin
  if tg_op = 'UPDATE'
     and new.stage is not distinct from old.stage
     and new.client_type is not distinct from old.client_type
     and new.messenger_psid is not distinct from old.messenger_psid then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.stage is distinct from old.stage
     or new.client_type is distinct from old.client_type then
    v_lead_id := public.latest_meta_lead_id(new.id);
    if v_lead_id is not null then
      insert into meta_outbox (kind, contact_id, payload)
      values ('capi_event', new.id, jsonb_build_object(
        'lead_id', v_lead_id,
        'stage', new.stage,
        'client_type', new.client_type,
        'event_time', extract(epoch from now())::bigint
      ));
    end if;
  end if;

  if new.messenger_psid is not null then
    insert into meta_outbox (kind, contact_id, payload)
    values ('inbox_label', new.id, jsonb_build_object(
      'psid', new.messenger_psid,
      'stage', new.stage,
      'client_type', new.client_type
    ));
  end if;

  return new;
end;
$$;

create trigger contacts_queue_meta_sync
  after insert or update of stage, client_type, messenger_psid on contacts
  for each row execute function public.queue_meta_sync_on_stage_change();

-- A new Meta lead is the "raw lead" event Meta wants first for each lead id,
-- reported with the contact's current stage.
create function public.queue_meta_sync_on_meta_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact contacts%rowtype;
begin
  if new.source <> 'meta_lead_ad' or new.external_id is null then
    return new;
  end if;

  select * into v_contact from contacts where id = new.contact_id;
  if not found then
    return new;
  end if;

  insert into meta_outbox (kind, contact_id, payload)
  values ('capi_event', new.contact_id, jsonb_build_object(
    'lead_id', new.external_id,
    'stage', v_contact.stage,
    'client_type', v_contact.client_type,
    'event_time', extract(epoch from new.created_at)::bigint
  ));
  return new;
end;
$$;

create trigger inquiries_queue_meta_sync
  after insert on inquiries
  for each row execute function public.queue_meta_sync_on_meta_lead();

-- ============================================================================
-- Shared: link a chat to a contact. Applies a stage label staff put on the
-- chat before it was linked. Internal: no grants.
-- ============================================================================
create function public.link_messenger_psid(p_contact_id uuid, p_psid text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending text;
begin
  -- Either side already linked elsewhere: leave it for staff to sort out.
  if exists (select 1 from contacts where messenger_psid = p_psid and id <> p_contact_id)
     or exists (
       select 1 from contacts
       where id = p_contact_id and messenger_psid is not null and messenger_psid <> p_psid
     ) then
    return false;
  end if;

  insert into messenger_threads (psid) values (p_psid) on conflict (psid) do nothing;

  update messenger_threads
  set contact_id = p_contact_id
  where psid = p_psid
  returning pending_stage into v_pending;

  update contacts set messenger_psid = p_psid
  where id = p_contact_id and messenger_psid is distinct from p_psid;

  if v_pending is not null then
    begin
      update contacts set stage = v_pending where id = p_contact_id;
    exception when check_violation then
      null; -- a stage from the other pipeline (B2B label on a B2C contact)
    end;
    update messenger_threads set pending_stage = null where psid = p_psid;
  end if;

  return true;
end;
$$;

revoke execute on function public.link_messenger_psid(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- (4) record_messenger_inbound() -- a customer wrote to the Page.
--
-- Saves the chat for staff. When the chat isn't linked yet, links it to the
-- one contact whose email or phone appears in the message (the lead form's
-- first Messenger message carries both); that message is the form, not a
-- reply, so it moves nothing. When it was already linked, the customer is
-- replying: a B2C contact at New or Lost moves to Inquiry -- unless the
-- message is older than the contact's current stage (a reply read late
-- must not undo a stage staff or the automation set since).
-- p_phone_keys are the last 10 digits of each phone number in the text.
-- Safe to call twice for the same message.
-- ============================================================================
create function public.record_messenger_inbound(
  p_psid text,
  p_name text,
  p_snippet text,
  p_emails text[],
  p_phone_keys text[],
  p_chat_link text default null,
  p_sent_at timestamptz default now()
)
returns table (contact_id uuid, linked_now boolean, moved_to text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_candidates uuid[];
  v_stage text;
  v_type text;
  v_stage_changed_at timestamptz;
begin
  insert into messenger_threads (psid, name, last_inbound_at, last_snippet, chat_link)
  values (p_psid, nullif(trim(p_name), ''), p_sent_at, left(p_snippet, 100), p_chat_link)
  on conflict (psid) do update
  set name = coalesce(nullif(trim(excluded.name), ''), messenger_threads.name),
      chat_link = coalesce(excluded.chat_link, messenger_threads.chat_link),
      last_inbound_at = greatest(excluded.last_inbound_at, messenger_threads.last_inbound_at),
      last_snippet = case
        when messenger_threads.last_inbound_at is null
          or excluded.last_inbound_at >= messenger_threads.last_inbound_at
        then excluded.last_snippet
        else messenger_threads.last_snippet
      end;

  select c.id into v_contact_id from contacts c where c.messenger_psid = p_psid;

  if v_contact_id is null then
    select array_agg(distinct c.id) into v_candidates
    from contacts c
    where c.messenger_psid is null
      and (
        lower(c.email) = any (select lower(e) from unnest(p_emails) e)
        or right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = any (p_phone_keys)
      );

    if coalesce(array_length(v_candidates, 1), 0) = 1
       and public.link_messenger_psid(v_candidates[1], p_psid) then
      return query select v_candidates[1], true, null::text;
      return;
    end if;

    return query select null::uuid, false, null::text;
    return;
  end if;

  select c.stage, c.client_type, c.stage_changed_at
  into v_stage, v_type, v_stage_changed_at
  from contacts c where c.id = v_contact_id;

  if v_type = 'b2c' and v_stage in ('new', 'lost') and p_sent_at > v_stage_changed_at then
    update contacts set stage = 'inquiry' where id = v_contact_id;
    return query select v_contact_id, false, 'inquiry'::text;
    return;
  end if;

  return query select v_contact_id, false, null::text;
end;
$$;

revoke execute on function public.record_messenger_inbound(text, text, text, text[], text[], text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_messenger_inbound(text, text, text, text[], text[], text, timestamptz)
  to service_role;

-- ============================================================================
-- (5) link_messenger_by_token() -- a follow-up "Chat on Messenger" tap.
-- The m.me ref carries the follow-up's tracking token, which names the
-- contact. Returns their latest inquired package name for the greeting.
-- ============================================================================
create function public.link_messenger_by_token(p_psid text, p_token text)
returns table (contact_id uuid, package_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
begin
  select m.contact_id into v_contact_id
  from messages m
  where m.tracking_token = p_token and m.kind = 'follow_up';

  if v_contact_id is null then
    return;
  end if;

  perform public.link_messenger_psid(v_contact_id, p_psid);

  return query
  select v_contact_id, (
    select p.name
    from inquiries i
    join packages p on p.id = i.package_id
    where i.contact_id = v_contact_id
    order by i.created_at desc
    limit 1
  );
end;
$$;

revoke execute on function public.link_messenger_by_token(text, text) from public, anon, authenticated;
grant execute on function public.link_messenger_by_token(text, text) to service_role;

-- ============================================================================
-- (6) apply_inbox_stage() -- staff put a stage label on a chat.
--
-- Linked chat: the contact moves to that stage (staff's explicit choice,
-- so any direction). A stage from the other pipeline is ignored. Not
-- linked yet: remembered and applied when the chat gets linked.
-- Returns the contact's stage afterwards (null when not linked).
-- ============================================================================
create function public.apply_inbox_stage(p_psid text, p_stage text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_stage text;
begin
  select c.id into v_contact_id from contacts c where c.messenger_psid = p_psid;

  if v_contact_id is null then
    insert into messenger_threads (psid, pending_stage) values (p_psid, p_stage)
    on conflict (psid) do update set pending_stage = excluded.pending_stage;
    return null;
  end if;

  begin
    update contacts set stage = p_stage where id = v_contact_id;
  exception when check_violation then
    null;
  end;

  select stage into v_stage from contacts where id = v_contact_id;
  return v_stage;
end;
$$;

revoke execute on function public.apply_inbox_stage(text, text) from public, anon, authenticated;
grant execute on function public.apply_inbox_stage(text, text) to service_role;

-- ============================================================================
-- (7) Staff link / unlink by hand (can_edit_crm).
-- ============================================================================
create function public.link_messenger_thread(p_contact_id uuid, p_psid text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'can_edit_crm') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from messenger_threads where psid = p_psid) then
    return false;
  end if;
  return public.link_messenger_psid(p_contact_id, p_psid);
end;
$$;

revoke execute on function public.link_messenger_thread(uuid, text) from public, anon;
grant execute on function public.link_messenger_thread(uuid, text) to authenticated;

create function public.unlink_messenger_thread(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'can_edit_crm') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update messenger_threads set contact_id = null where contact_id = p_contact_id;
  update contacts set messenger_psid = null where id = p_contact_id;
end;
$$;

revoke execute on function public.unlink_messenger_thread(uuid) from public, anon;
grant execute on function public.unlink_messenger_thread(uuid) to authenticated;

-- ============================================================================
-- (8) messenger_stage_phrases + record_messenger_staff_message()
--
-- Staff reuse Messenger saved replies at each step ("here po yung
-- available namin..." with the prices). When a staff message in a linked
-- chat contains one of these phrases, the B2C contact moves forward to the
-- phrase's stage (never backwards; a Lost lead comes back). Matching
-- ignores case and extra spaces. Managed at /admin/crm/messenger.
-- ============================================================================
create table messenger_stage_phrases (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique check (length(trim(phrase)) >= 10),
  stage text not null check (stage in ('inquiry', 'quotation', 'confirmation')),
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table messenger_stage_phrases enable row level security;

create policy "authenticated staff can read stage phrases" on messenger_stage_phrases
  for select to authenticated using (true);
create policy "can_edit_crm can add stage phrases" on messenger_stage_phrases
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_edit_crm'));
create policy "can_edit_crm can delete stage phrases" on messenger_stage_phrases
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'can_edit_crm'));

-- Starting rules, from the team's real replies. Editable in the admin.
insert into messenger_stage_phrases (phrase, stage, created_by_name) values
  ('here po yung available namin', 'quotation', 'Default'),
  ('kindly send us the passport copies', 'quotation', 'Default');

create function public.normalize_chat_text(p_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

-- A staff (Page) message in a chat. Saves the chat's link/name, and applies
-- a saved-reply phrase to a linked B2C contact. Returns the new stage, or
-- null when nothing moved. Safe to call twice for the same message.
create function public.record_messenger_staff_message(
  p_psid text,
  p_name text,
  p_text text,
  p_chat_link text default null,
  p_sent_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_stage text;
  v_type text;
  v_stage_changed_at timestamptz;
  v_target text;
  v_order constant text[] := array['new', 'inquiry', 'quotation', 'confirmation'];
begin
  insert into messenger_threads (psid, name, chat_link)
  values (p_psid, nullif(trim(p_name), ''), p_chat_link)
  on conflict (psid) do update
  set name = coalesce(nullif(trim(excluded.name), ''), messenger_threads.name),
      chat_link = coalesce(excluded.chat_link, messenger_threads.chat_link);

  select c.id, c.stage, c.client_type, c.stage_changed_at
  into v_contact_id, v_stage, v_type, v_stage_changed_at
  from contacts c where c.messenger_psid = p_psid;

  if v_contact_id is null or v_type <> 'b2c' or p_sent_at <= v_stage_changed_at then
    return null;
  end if;

  -- The furthest stage any matching phrase points to.
  select p.stage into v_target
  from messenger_stage_phrases p
  where position(public.normalize_chat_text(p.phrase) in public.normalize_chat_text(p_text)) > 0
  order by array_position(v_order, p.stage) desc
  limit 1;

  if v_target is null then
    return null;
  end if;

  if v_stage <> 'lost'
     and array_position(v_order, v_stage) >= array_position(v_order, v_target) then
    return null;
  end if;

  update contacts set stage = v_target where id = v_contact_id;
  return v_target;
end;
$$;

revoke execute on function public.record_messenger_staff_message(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_messenger_staff_message(text, text, text, text, timestamptz)
  to service_role;

-- ============================================================================
-- (9) messenger_sync_state -- when the 15-minute Messenger check (Vercel
-- Cron -> /api/cron/messenger-sync) last ran, and what it did. Shown on
-- the Messenger settings page.
-- ============================================================================
create table messenger_sync_state (
  id boolean primary key default true check (id),
  last_synced_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

alter table messenger_sync_state enable row level security;

create policy "authenticated staff can read messenger sync state" on messenger_sync_state
  for select to authenticated using (true);

insert into messenger_sync_state (id) values (true);
