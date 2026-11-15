-- Lead follow-ups: tracked "chat with us" emails/texts, run as two
-- sequences per B2C stage, that move leads through the funnel.
--
-- Stages stay New -> Inquiry -> Quotation -> Confirmation / Lost for B2C.
-- A follow-up is not a stage: it's something the system does AT a stage.
--   no_reply  runs while a B2C lead sits at New (never replied)
--   quote     runs while a B2C lead sits at Quotation (quote sent, quiet)
-- Each runs up to 4 steps; a step counts only follow-ups sent since the
-- contact entered its current stage, so a lead re-entering a stage starts
-- that sequence fresh. B2B follow-ups are sent by staff only.
--
-- (1) contacts.stage_changed_at + trigger -- when the current stage began.
-- (2) messages follow-up columns: kind, sequence, step, a per-message
--     tracking token (the capability inside the email/SMS link), clicks.
-- (3) message_clicks -- one row per recorded click on a follow-up link.
-- (5) follow_up_sequence_for() -- which sequence a contact is in.
-- (6) advance_stage_for_follow_up() -- internal, forward-only stage move.
-- (7) mark_follow_ups_sent() -- staff/cron call after a send (B2B moves).
-- (8) record_follow_up_click() -- the public /go/<token> route's only write.
-- (9) follow_up_progress -- per contact, the current sequence's progress
--     (for badges and step numbering).
-- (10) list_due_follow_ups() -- the daily automation's work list.
-- (12) follow_up_settings -- when follow-ups went live, for the one-time
--      backlog limit in list_due_follow_ups().
-- (13) A CRM quote linked to a contact moves it to Quotation.

-- ============================================================================
-- (1) contacts.stage_changed_at
-- ============================================================================
alter table contacts add column stage_changed_at timestamptz;

-- Best available guess for existing rows: a lead still at New entered it
-- when created; anything else at its last update.
alter table contacts disable trigger contacts_set_updated_by;
update contacts
set stage_changed_at = case when stage = 'new' then created_at else updated_at end;
alter table contacts enable trigger contacts_set_updated_by;

alter table contacts
  alter column stage_changed_at set default now(),
  alter column stage_changed_at set not null;

create function public.contacts_set_stage_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage
     or new.client_type is distinct from old.client_type then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger contacts_set_stage_changed_at
  before update on contacts
  for each row execute function public.contacts_set_stage_changed_at();

-- ============================================================================
-- (2) messages follow-up columns
-- ============================================================================
alter table messages
  add column kind text not null default 'message'
    check (kind in ('message', 'follow_up')),
  add column follow_up_sequence text
    check (follow_up_sequence in ('no_reply', 'quote')),
  add column follow_up_step smallint
    check (follow_up_step is null or follow_up_step > 0),
  add column tracking_token text unique,
  add column click_count integer not null default 0,
  add column first_clicked_at timestamptz,
  add column last_clicked_at timestamptz,
  add constraint messages_follow_up_fields check (
    case kind
      when 'follow_up' then follow_up_sequence is not null and follow_up_step is not null
      else follow_up_sequence is null and follow_up_step is null and tracking_token is null
    end
  );

create index messages_contact_kind_created_at_idx
  on messages(contact_id, kind, created_at desc);

-- ============================================================================
-- (3) message_clicks
-- ============================================================================
create table message_clicks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  target text not null check (target in ('messenger', 'whatsapp')),
  created_at timestamptz not null default now()
);

alter table message_clicks enable row level security;

create index message_clicks_message_id_idx on message_clicks(message_id);
create index message_clicks_contact_id_idx on message_clicks(contact_id);

-- Read-only for staff. Writes go through record_follow_up_click() only.
create policy "authenticated staff can read message clicks" on message_clicks
  for select to authenticated using (true);

-- ============================================================================
-- (5) follow_up_sequence_for() -- B2C Quotation -> quote, else no_reply.
-- Staff can follow up a contact at any stage; the copy then comes from the
-- no_reply sequence.
-- ============================================================================
create function public.follow_up_sequence_for(p_client_type text, p_stage text)
returns text
language sql
immutable
as $$
  select case
    when p_client_type = 'b2c' and p_stage = 'quotation' then 'quote'
    else 'no_reply'
  end;
$$;

-- ============================================================================
-- (6) advance_stage_for_follow_up() -- forward-only
--
-- B2C, on click:  no_reply follow-up -> Inquiry; quote follow-up -> Quotation
-- B2B, on send:   New / Contacted -> Follow-up
-- B2B, on click:  -> Discovery
--
-- Never moves a contact backwards, and never touches a closed deal
-- (Confirmation / Won). A click revives a Lost lead: they asked to chat.
-- Internal: no grants.
-- ============================================================================
create function public.advance_stage_for_follow_up(
  p_contact_id uuid,
  p_event text,
  p_sequence text default 'no_reply'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_stage text;
  v_order text[];
  v_target text;
begin
  select c.client_type, c.stage into v_type, v_stage
  from contacts c
  where c.id = p_contact_id
  for update;

  if not found then
    return null;
  end if;

  if v_type = 'b2b' then
    v_order := array['new', 'contacted', 'follow_up', 'discovery', 'contract_review', 'won'];
    v_target := case p_event when 'sent' then 'follow_up' when 'clicked' then 'discovery' end;
  else
    v_order := array['new', 'inquiry', 'quotation', 'confirmation'];
    v_target := case
      when p_event <> 'clicked' then null
      when p_sequence = 'quote' then 'quotation'
      else 'inquiry'
    end;
  end if;

  if v_target is null then
    return v_stage;
  end if;

  if v_stage = 'lost' then
    if p_event <> 'clicked' then
      return v_stage;
    end if;
  elsif array_position(v_order, v_stage) is null
     or array_position(v_order, v_stage) >= array_position(v_order, v_target) then
    return v_stage;
  end if;

  update contacts set stage = v_target where id = p_contact_id;
  return v_target;
end;
$$;

revoke execute on function public.advance_stage_for_follow_up(uuid, text, text)
  from public, anon, authenticated;

-- ============================================================================
-- (7) mark_follow_ups_sent()
--
-- Called right after follow-up messages are logged. Only messages that are
-- really sent follow-ups count, so the permission it needs is the sender's
-- (can_message_customers), not can_edit_crm. Today only B2B stages move on
-- send; B2C stays put while its sequence runs.
-- ============================================================================
create function public.mark_follow_ups_sent(p_message_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.has_permission(auth.uid(), 'can_message_customers') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  for v_contact_id in
    select distinct m.contact_id
    from messages m
    where m.id = any (p_message_ids)
      and m.kind = 'follow_up'
      and m.status = 'sent'
  loop
    perform public.advance_stage_for_follow_up(v_contact_id, 'sent');
  end loop;
end;
$$;

revoke execute on function public.mark_follow_ups_sent(uuid[]) from public, anon;
grant execute on function public.mark_follow_ups_sent(uuid[]) to authenticated, service_role;

-- ============================================================================
-- (8) record_follow_up_click()
--
-- The token is a random 96-bit value only the recipient has. An unknown
-- token returns no row (the route still sends them to the chat). Repeat
-- clicks on the same button within a minute are counted once.
-- Returns what the redirect needs: the name (WhatsApp prefill), the channel
-- the link came in, and the lead's package slug (Messenger ref).
-- ============================================================================
create function public.record_follow_up_click(p_token text, p_target text)
returns table (contact_name text, channel text, package_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message messages%rowtype;
begin
  if p_target not in ('messenger', 'whatsapp') then
    raise exception 'unknown click target';
  end if;

  select * into v_message
  from messages m
  where m.tracking_token = p_token
    and m.kind = 'follow_up';

  if not found then
    return;
  end if;

  if not exists (
    select 1 from message_clicks mc
    where mc.message_id = v_message.id
      and mc.target = p_target
      and mc.created_at > now() - interval '1 minute'
  ) then
    insert into message_clicks (message_id, contact_id, target)
    values (v_message.id, v_message.contact_id, p_target);

    update messages
    set click_count = click_count + 1,
        first_clicked_at = coalesce(first_clicked_at, now()),
        last_clicked_at = now()
    where id = v_message.id;

    perform public.advance_stage_for_follow_up(
      v_message.contact_id, 'clicked', v_message.follow_up_sequence
    );
  end if;

  return query
  select
    c.name,
    v_message.channel,
    (
      select p.slug
      from inquiries i
      join packages p on p.id = i.package_id
      where i.contact_id = c.id
      order by i.created_at desc
      limit 1
    )
  from contacts c
  where c.id = v_message.contact_id;
end;
$$;

revoke execute on function public.record_follow_up_click(text, text) from public;
grant execute on function public.record_follow_up_click(text, text) to anon, authenticated;

-- ============================================================================
-- (9) follow_up_progress -- the current sequence, per contact.
--
-- Counts only follow-ups of the contact's current sequence sent since it
-- entered its current stage. security_invoker: readers see what RLS lets
-- them see on contacts and messages (all staff can read both).
-- ============================================================================
create view public.follow_up_progress
with (security_invoker = true) as
select
  c.id as contact_id,
  public.follow_up_sequence_for(c.client_type, c.stage) as sequence,
  count(m.id) filter (where m.status = 'sent')::integer as sent_count,
  count(m.id) filter (where m.status = 'failed')::integer as failed_count,
  max(m.created_at) filter (where m.status = 'sent') as last_sent_at,
  coalesce(bool_or(m.click_count > 0), false) as clicked
from contacts c
left join messages m
  on m.contact_id = c.id
  and m.kind = 'follow_up'
  and m.follow_up_sequence = public.follow_up_sequence_for(c.client_type, c.stage)
  and m.created_at >= c.stage_changed_at
group by c.id;

grant select on public.follow_up_progress to authenticated, service_role;
revoke select on public.follow_up_progress from anon;

-- ============================================================================
-- (12) follow_up_settings -- one row. launched_at is when this migration ran,
-- i.e. when follow-ups went live on this database.
-- ============================================================================
create table follow_up_settings (
  id boolean primary key default true check (id),
  launched_at timestamptz not null default now()
);

alter table follow_up_settings enable row level security;

create policy "authenticated staff can read follow-up settings" on follow_up_settings
  for select to authenticated using (true);

insert into follow_up_settings (id) values (true);

-- ============================================================================
-- (10) list_due_follow_ups()
--
-- B2C contacts with an email, not opted out, at New (with an inquiry --
-- leads, not contacts staff typed in) or at Quotation, who haven't clicked
-- in this sequence, and whose next step is due. p_gap_days[n] = days to
-- wait before step n, counted from the previous follow-up (or from
-- entering the stage, for step 1). Half a day of slack lets a once-a-day
-- run catch contacts that arrived later in the day.
-- Who may START a sequence (a contact already in one always finishes it):
--   - reached its stage after follow-ups went live: within
--     p_max_lead_age_days of reaching it (the usual rule);
--   - already at its stage when follow-ups went live (the backlog): only if
--     the lead came in (latest inquiry, else when added) within
--     p_backlog_days before launch -- so the first run reaches the last few
--     weeks of leads, not every old one.
-- Skips contacts staff messaged or logged contact with in the last day, and
-- gives up after 3 failed sends. Newest first.
-- ============================================================================
create function public.list_due_follow_ups(
  p_gap_days integer[],
  p_max_lead_age_days integer,
  p_limit integer,
  p_backlog_days integer default 21
)
returns table (
  contact_id uuid,
  name text,
  email text,
  sequence text,
  next_step integer,
  package_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.email,
    fp.sequence,
    fp.sent_count + 1,
    (
      select p.name
      from inquiries i
      join packages p on p.id = i.package_id
      where i.contact_id = c.id
      order by i.created_at desc
      limit 1
    )
  from contacts c
  join follow_up_progress fp on fp.contact_id = c.id
  cross join follow_up_settings s
  where c.client_type = 'b2c'
    and (
      c.stage = 'quotation'
      or (c.stage = 'new' and exists (select 1 from inquiries i where i.contact_id = c.id))
    )
    and c.opted_out = false
    and nullif(trim(coalesce(c.email, '')), '') is not null
    and (
      fp.sent_count > 0
      or (
        c.stage_changed_at > s.launched_at
        and c.stage_changed_at >= now() - make_interval(days => p_max_lead_age_days)
      )
      or (
        c.stage_changed_at <= s.launched_at
        and coalesce(
          (select max(i.created_at) from inquiries i where i.contact_id = c.id),
          c.created_at
        ) >= s.launched_at - make_interval(days => p_backlog_days)
      )
    )
    and fp.clicked = false
    and fp.failed_count < 3
    and fp.sent_count < coalesce(array_length(p_gap_days, 1), 0)
    and coalesce(fp.last_sent_at, c.stage_changed_at)
      <= now() - make_interval(days => p_gap_days[fp.sent_count + 1])
         + interval '12 hours'
    and not exists (
      select 1 from messages m
      where m.contact_id = c.id
        and m.created_at > now() - interval '1 day'
    )
    -- ...or logged a call/chat with (contact_logs).
    and not exists (
      select 1 from contact_logs l
      where l.contact_id = c.id
        and l.contacted_at > now() - interval '1 day'
    )
  order by c.stage_changed_at desc
  limit p_limit;
$$;

revoke execute on function public.list_due_follow_ups(integer[], integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_due_follow_ups(integer[], integer, integer, integer)
  to service_role;

-- ============================================================================
-- (13) A CRM quote linked to a contact moves it to Quotation: creating or
-- linking a quote is the clearest sign one went out. B2C, forward only (a
-- Lost lead comes back). The quote sequence then follows up on it.
-- ============================================================================
create function public.advance_stage_on_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is not null
     and (tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id) then
    update contacts
    set stage = 'quotation'
    where id = new.contact_id
      and client_type = 'b2c'
      and stage in ('new', 'inquiry', 'lost');
  end if;
  return new;
end;
$$;

create trigger quotes_advance_contact_stage
  after insert or update of contact_id on quotes
  for each row execute function public.advance_stage_on_quote();
