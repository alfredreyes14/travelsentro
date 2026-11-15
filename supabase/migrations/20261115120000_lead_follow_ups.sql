-- Lead follow-ups: tracked "chat with us" emails/texts that move leads
-- through the funnel.
--
-- (1) B2C pipeline gains a `follow_up` stage between New and Inquiry
--     (lib/crm/stage.ts mirrors this list -- change both together).
-- (2) messages gains follow-up columns: kind, step, a per-message tracking
--     token (the capability inside the email/SMS link) and click counters.
-- (3) message_clicks -- one row per recorded click on a follow-up link.
-- (4) advance_stage_for_follow_up() -- internal, forward-only stage move.
-- (5) mark_follow_ups_sent() -- staff/cron call after a send: moves each
--     contact that got a follow-up to Follow-up.
-- (6) record_follow_up_click() -- the public /go/<token> route's only write
--     path (anon). Moves the contact to Inquiry (B2C) / Discovery (B2B).
-- (7) list_due_follow_ups() -- the daily automation's work list
--     (service_role only).

-- ============================================================================
-- (1) B2C follow_up stage
-- ============================================================================
alter table contacts drop constraint contacts_stage_matches_type;

alter table contacts
  add constraint contacts_stage_matches_type check (
    (client_type = 'b2c' and stage in
      ('new', 'follow_up', 'inquiry', 'quotation', 'confirmation', 'lost'))
    or
    (client_type = 'b2b' and stage in
      ('new', 'contacted', 'follow_up', 'discovery', 'contract_review', 'won', 'lost'))
  );

-- ============================================================================
-- (2) messages follow-up columns
-- ============================================================================
alter table messages
  add column kind text not null default 'message'
    check (kind in ('message', 'follow_up')),
  add column follow_up_step smallint
    check (follow_up_step is null or follow_up_step > 0),
  add column tracking_token text unique,
  add column click_count integer not null default 0,
  add column first_clicked_at timestamptz,
  add column last_clicked_at timestamptz,
  add constraint messages_follow_up_fields check (
    kind = 'follow_up' or (follow_up_step is null and tracking_token is null)
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
-- (4) advance_stage_for_follow_up() -- forward-only
--
-- p_event 'sent':    B2C new -> follow_up;  B2B new/contacted -> follow_up
-- p_event 'clicked': B2C new/follow_up/lost -> inquiry;
--                    B2B new/contacted/follow_up/lost -> discovery
--
-- Never moves a contact backwards, and never touches a closed deal
-- (confirmation / won). A click revives a Lost lead: they asked to chat.
-- Internal: no grants.
-- ============================================================================
create function public.advance_stage_for_follow_up(p_contact_id uuid, p_event text)
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
    v_order := array['new', 'follow_up', 'inquiry', 'quotation', 'confirmation'];
    v_target := case p_event when 'sent' then 'follow_up' when 'clicked' then 'inquiry' end;
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

revoke execute on function public.advance_stage_for_follow_up(uuid, text)
  from public, anon, authenticated;

-- ============================================================================
-- (5) mark_follow_ups_sent()
--
-- Called right after follow-up messages are logged. Only messages that are
-- really sent follow-ups move anything, so the permission it needs is the
-- sender's (can_message_customers), not can_edit_crm.
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
-- (6) record_follow_up_click()
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

    perform public.advance_stage_for_follow_up(v_message.contact_id, 'clicked');
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
-- (7) list_due_follow_ups()
--
-- B2C leads (at least one inquiry) still at New / Follow-up, with an email,
-- not opted out, who never clicked a follow-up, and whose next step is due.
-- p_gap_days[n] = days to wait before step n, counted from the previous
-- sent follow-up (or from when the lead came in, for step 1). Half a day of
-- slack lets a once-a-day run catch leads that came in later in the day.
-- Skips contacts staff messaged in the last day, and gives up on a contact
-- after 3 failed sends. Newest leads first.
-- ============================================================================
create function public.list_due_follow_ups(
  p_gap_days integer[],
  p_max_lead_age_days integer,
  p_limit integer
)
returns table (
  contact_id uuid,
  name text,
  email text,
  next_step integer,
  package_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with fu as (
    select
      m.contact_id,
      count(*) filter (where m.status = 'sent') as sent_count,
      count(*) filter (where m.status = 'failed') as failed_count,
      max(m.created_at) filter (where m.status = 'sent') as last_sent_at,
      bool_or(m.click_count > 0) as clicked
    from messages m
    where m.kind = 'follow_up'
    group by m.contact_id
  ),
  last_message as (
    select m.contact_id, max(m.created_at) as last_at
    from messages m
    group by m.contact_id
  )
  select
    c.id,
    c.name,
    c.email,
    (coalesce(fu.sent_count, 0) + 1)::integer,
    (
      select p.name
      from inquiries i
      join packages p on p.id = i.package_id
      where i.contact_id = c.id
      order by i.created_at desc
      limit 1
    )
  from contacts c
  left join fu on fu.contact_id = c.id
  left join last_message lm on lm.contact_id = c.id
  where c.client_type = 'b2c'
    and c.stage in ('new', 'follow_up')
    and c.opted_out = false
    and nullif(trim(coalesce(c.email, '')), '') is not null
    and c.created_at >= now() - make_interval(days => p_max_lead_age_days)
    and exists (select 1 from inquiries i where i.contact_id = c.id)
    and coalesce(fu.clicked, false) = false
    and coalesce(fu.failed_count, 0) < 3
    and coalesce(fu.sent_count, 0) < coalesce(array_length(p_gap_days, 1), 0)
    and coalesce(fu.last_sent_at, c.created_at)
      <= now() - make_interval(days => p_gap_days[coalesce(fu.sent_count, 0) + 1])
         + interval '12 hours'
    and (lm.last_at is null or lm.last_at <= now() - interval '1 day')
  order by c.created_at desc
  limit p_limit;
$$;

revoke execute on function public.list_due_follow_ups(integer[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_due_follow_ups(integer[], integer, integer)
  to service_role;
