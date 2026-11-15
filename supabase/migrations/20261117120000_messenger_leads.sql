-- Messenger-only leads and staff to-dos (Leads page "Messenger to-do"):
--
-- (1) A lead can be saved with just a name and a Messenger chat (no email
--     or phone), e.g. someone who messaged the Page without an ad.
-- (2) Contact details typed in a linked chat fill a lead's missing email /
--     phone, so automatic follow-up emails can start.
-- (3) A staff picture in a chat no longer moves the lead to Quotation by
--     itself: it flags "Mark as Quotation?" (contacts.quote_suggested_at)
--     for staff to confirm. Saved-reply phrases still move automatically.
-- (4) Chats not matched yet: staff match them to a lead, add them as a new
--     lead, or mark them "not a lead" (messenger_threads.ignored_at).
-- (5) Follow-ups for leads without an email: staff send them in Messenger
--     from a ready-made list (list_due_messenger_follow_ups()) and mark
--     them sent, which logs a messages row with channel 'messenger'. Meta
--     only lets a Page message someone within 7 days of their last
--     message, so these sequences have 2 steps (day 1, day 4).
-- (6) A customer writing in Messenger restarts the follow-up clock, and a
--     customer who wrote after the last follow-up is never moved to Lost.
--
-- Replaces list_due_follow_ups(), close_unconverted_follow_ups(),
-- record_messenger_inbound(), record_messenger_staff_message(),
-- unlink_messenger_thread() and contacts_set_stage_changed_at() from the
-- lead_follow_ups and meta_stage_sync migrations.

-- ============================================================================
-- (1) Messenger-only leads
-- ============================================================================
alter table contacts drop constraint contacts_email_or_phone;
alter table contacts
  add constraint contacts_email_or_phone_or_messenger check (
    nullif(trim(coalesce(email, '')), '') is not null
    or nullif(trim(coalesce(phone, '')), '') is not null
    or messenger_psid is not null
  );

-- Unlinking would leave a Messenger-only lead with no way to reach them.
create or replace function public.unlink_messenger_thread(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'can_edit_crm') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if exists (
    select 1 from contacts
    where id = p_contact_id
      and nullif(trim(coalesce(email, '')), '') is null
      and nullif(trim(coalesce(phone, '')), '') is null
  ) then
    raise exception 'needs email or phone' using errcode = 'P0001',
      hint = 'Add an email or phone to this lead before unlinking its only chat.';
  end if;
  update messenger_threads set contact_id = null where contact_id = p_contact_id;
  update contacts set messenger_psid = null where id = p_contact_id;
end;
$$;

-- ============================================================================
-- (3) quote_suggested_at + chat bookkeeping columns
-- ============================================================================
alter table contacts add column quote_suggested_at timestamptz;

alter table messenger_threads
  add column ignored_at timestamptz,
  add column last_outbound_at timestamptz;

-- Any stage change answers the suggestion (confirmed, or moved elsewhere).
-- A caller may date the change itself (stage_changed_at in the same
-- update): the Messenger check does, with the message's time, because it
-- reads messages in 15-minute batches -- a reply and the staff picture
-- that followed it must keep their real order.
create or replace function public.contacts_set_stage_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.stage is distinct from old.stage
     or new.client_type is distinct from old.client_type then
    if new.stage_changed_at is not distinct from old.stage_changed_at then
      new.stage_changed_at := now();
    end if;
    new.quote_suggested_at := null;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- (2) record_messenger_inbound() -- now also fills a lead's missing email /
-- phone from the message (only when exactly one is found and no other
-- contact already has it).
-- ============================================================================
create or replace function public.fill_contact_details_from_chat(
  p_contact_id uuid,
  p_emails text[],
  p_phone_keys text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if coalesce(array_length(p_emails, 1), 0) = 1 then
    v_email := lower(trim(p_emails[1]));
    update contacts c
    set email = v_email
    where c.id = p_contact_id
      and nullif(trim(coalesce(c.email, '')), '') is null
      and not exists (select 1 from contacts o where o.email = v_email);
  end if;

  if coalesce(array_length(p_phone_keys, 1), 0) = 1 then
    update contacts c
    set phone = '0' || p_phone_keys[1]
    where c.id = p_contact_id
      and nullif(trim(coalesce(c.phone, '')), '') is null;
  end if;
end;
$$;

revoke execute on function public.fill_contact_details_from_chat(uuid, text[], text[])
  from public, anon, authenticated;

create or replace function public.record_messenger_inbound(
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
      perform public.fill_contact_details_from_chat(v_candidates[1], p_emails, p_phone_keys);
      return query select v_candidates[1], true, null::text;
      return;
    end if;

    return query select null::uuid, false, null::text;
    return;
  end if;

  perform public.fill_contact_details_from_chat(v_contact_id, p_emails, p_phone_keys);

  select c.stage, c.client_type, c.stage_changed_at
  into v_stage, v_type, v_stage_changed_at
  from contacts c where c.id = v_contact_id;

  if v_type = 'b2c' and v_stage in ('new', 'lost') and p_sent_at > v_stage_changed_at then
    update contacts set stage = 'inquiry', stage_changed_at = p_sent_at where id = v_contact_id;
    return query select v_contact_id, false, 'inquiry'::text;
    return;
  end if;

  return query select v_contact_id, false, null::text;
end;
$$;

-- ============================================================================
-- (3) record_messenger_staff_message() -- a picture now flags "Mark as
-- Quotation?" instead of moving. Returns 'quotation' when a phrase moved
-- the lead, 'suggested' when a picture flagged it, else null.
-- ============================================================================
create or replace function public.record_messenger_staff_message(
  p_psid text,
  p_name text,
  p_text text,
  p_chat_link text default null,
  p_sent_at timestamptz default now(),
  p_has_image boolean default false
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
  insert into messenger_threads (psid, name, chat_link, last_outbound_at)
  values (p_psid, nullif(trim(p_name), ''), p_chat_link, p_sent_at)
  on conflict (psid) do update
  set name = coalesce(nullif(trim(excluded.name), ''), messenger_threads.name),
      chat_link = coalesce(excluded.chat_link, messenger_threads.chat_link),
      last_outbound_at = greatest(excluded.last_outbound_at, messenger_threads.last_outbound_at);

  select c.id, c.stage, c.client_type, c.stage_changed_at
  into v_contact_id, v_stage, v_type, v_stage_changed_at
  from contacts c where c.messenger_psid = p_psid;

  if v_contact_id is null or v_type <> 'b2c' or p_sent_at <= v_stage_changed_at then
    return null;
  end if;

  select p.stage into v_target
  from messenger_stage_phrases p
  where position(public.normalize_chat_text(p.phrase) in public.normalize_chat_text(p_text)) > 0
  order by array_position(v_order, p.stage) desc
  limit 1;

  if v_target is not null
     and (v_stage = 'lost'
          or array_position(v_order, v_stage) < array_position(v_order, v_target)) then
    update contacts set stage = v_target, stage_changed_at = p_sent_at where id = v_contact_id;
    return v_target;
  end if;

  if p_has_image and v_stage in ('new', 'inquiry', 'lost') then
    update contacts
    set quote_suggested_at = greatest(quote_suggested_at, p_sent_at)
    where id = v_contact_id;
    return 'suggested';
  end if;

  return null;
end;
$$;

-- ============================================================================
-- (4) Chats not matched yet: add as a new lead / not a lead.
-- ============================================================================
create function public.add_lead_from_chat(p_psid text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread messenger_threads%rowtype;
  v_contact_id uuid;
  v_staff_name text;
begin
  if not public.has_permission(auth.uid(), 'can_edit_crm') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_thread from messenger_threads where psid = p_psid for update;
  if not found or v_thread.contact_id is not null
     or exists (select 1 from contacts where messenger_psid = p_psid) then
    return null;
  end if;

  select name into v_staff_name from profiles where id = auth.uid();

  -- They wrote to us, so they start at Inquiry.
  insert into contacts (name, client_type, stage, messenger_psid, tags, created_by, created_by_name)
  values (
    coalesce(nullif(trim(v_thread.name), ''), 'Messenger lead'),
    'b2c',
    'inquiry',
    p_psid,
    array['Messenger'],
    auth.uid(),
    v_staff_name
  )
  returning id into v_contact_id;

  update messenger_threads set contact_id = v_contact_id, ignored_at = null where psid = p_psid;

  if v_thread.pending_stage is not null then
    begin
      update contacts set stage = v_thread.pending_stage where id = v_contact_id;
    exception when check_violation then
      null;
    end;
    update messenger_threads set pending_stage = null where psid = p_psid;
  end if;

  return v_contact_id;
end;
$$;

revoke execute on function public.add_lead_from_chat(text) from public, anon;
grant execute on function public.add_lead_from_chat(text) to authenticated;

create function public.set_messenger_thread_ignored(p_psid text, p_ignored boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'can_edit_crm') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update messenger_threads
  set ignored_at = case when p_ignored then now() else null end
  where psid = p_psid and contact_id is null;
end;
$$;

revoke execute on function public.set_messenger_thread_ignored(text, boolean) from public, anon;
grant execute on function public.set_messenger_thread_ignored(text, boolean) to authenticated;

-- ============================================================================
-- (5) Messenger follow-ups (sent by staff)
-- ============================================================================
alter table messages drop constraint messages_channel_check;
alter table messages
  add constraint messages_channel_check check (channel in ('email', 'sms', 'messenger'));

-- B2C leads at New or Quotation with a linked chat but no email (so no
-- automatic emails), who haven't clicked, whose next step is due -- and
-- whose last message to us is recent enough that Meta still lets the Page
-- reply (p_window_days, Meta's 7-day limit). The clock runs from the later
-- of: entering the stage, the last follow-up, their last message.
create function public.list_due_messenger_follow_ups(
  p_gap_days integer[],
  p_window_days integer default 7
)
returns table (
  contact_id uuid,
  name text,
  sequence text,
  next_step integer,
  chat_link text,
  last_inbound_at timestamptz,
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
    fp.sequence,
    fp.sent_count + 1,
    t.chat_link,
    t.last_inbound_at,
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
  join messenger_threads t on t.psid = c.messenger_psid
  where c.client_type = 'b2c'
    and c.stage in ('new', 'quotation')
    and c.opted_out = false
    and nullif(trim(coalesce(c.email, '')), '') is null
    and fp.clicked = false
    and fp.sent_count < coalesce(array_length(p_gap_days, 1), 0)
    and t.last_inbound_at > now() - make_interval(days => p_window_days)
    and greatest(
          coalesce(fp.last_sent_at, c.stage_changed_at),
          c.stage_changed_at,
          t.last_inbound_at
        )
      <= now() - make_interval(days => p_gap_days[fp.sent_count + 1])
         + interval '12 hours'
  order by t.last_inbound_at desc;
$$;

revoke execute on function public.list_due_messenger_follow_ups(integer[], integer) from public, anon;
grant execute on function public.list_due_messenger_follow_ups(integer[], integer)
  to authenticated, service_role;

-- ============================================================================
-- (6) Email follow-ups: a Messenger message from the customer restarts the
-- clock (they're talking to us).
-- ============================================================================
create or replace function public.list_due_follow_ups(
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
  left join messenger_threads t on t.psid = c.messenger_psid
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
    and greatest(
          coalesce(fp.last_sent_at, c.stage_changed_at),
          coalesce(t.last_inbound_at, '-infinity'::timestamptz)
        )
      <= now() - make_interval(days => p_gap_days[fp.sent_count + 1])
         + interval '12 hours'
    and not exists (
      select 1 from messages m
      where m.contact_id = c.id
        and m.created_at > now() - interval '1 day'
    )
    and not exists (
      select 1 from contact_logs l
      where l.contact_id = c.id
        and l.contacted_at > now() - interval '1 day'
    )
  order by c.stage_changed_at desc
  limit p_limit;
$$;

-- Lost after the whole sequence: 4 follow-ups for leads with an email,
-- p_messenger_step_count (2) for leads reached only on Messenger. Never
-- for a lead who wrote to us after the last follow-up.
drop function public.close_unconverted_follow_ups(integer, integer);

create function public.close_unconverted_follow_ups(
  p_step_count integer,
  p_grace_days integer,
  p_messenger_step_count integer default 2
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  with due as (
    select c.id, fp.sequence, fp.sent_count
    from contacts c
    join follow_up_progress fp on fp.contact_id = c.id
    left join messenger_threads t on t.psid = c.messenger_psid
    where c.client_type = 'b2c'
      and c.stage in ('new', 'quotation')
      and fp.clicked = false
      and fp.sent_count >= case
        when nullif(trim(coalesce(c.email, '')), '') is null then p_messenger_step_count
        else p_step_count
      end
      and fp.last_sent_at
        <= now() - make_interval(days => p_grace_days) + interval '12 hours'
      and (t.last_inbound_at is null or t.last_inbound_at <= fp.last_sent_at)
  ),
  closed as (
    insert into follow_up_closures (contact_id, sequence, follow_ups_sent)
    select id, sequence, sent_count from due
    returning contact_id
  )
  update contacts c
  set stage = 'lost'
  from closed
  where c.id = closed.contact_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.close_unconverted_follow_ups(integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.close_unconverted_follow_ups(integer, integer, integer)
  to service_role;
