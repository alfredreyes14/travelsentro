-- Lead contact tracking + PARTIAL sync status.
--
-- (1) meta_lead_sync_runs.status gains 'partial': some leads were saved and
--     some failed in the same run.
-- (2) contact_logs -- staff record a contact made outside the admin panel
--     (call, WhatsApp, Messenger, Viber, in person). Emails and SMS sent from
--     the panel are already in messages.
-- (3) contact_last_activity view -- per contact, the latest inquiry and the
--     latest contact (a sent email/SMS or a contact log). Computed, not
--     stored on contacts, so the contacts_set_updated_by trigger never stamps
--     "Last updated by" just because a message went out. security_invoker,
--     so the caller's RLS on every underlying table applies.
--
-- Additive only.

-- ============================================================================
-- (1) partial sync status
-- ============================================================================
alter table meta_lead_sync_runs drop constraint meta_lead_sync_runs_status_check;
alter table meta_lead_sync_runs add constraint meta_lead_sync_runs_status_check
  check (status in ('running', 'success', 'partial', 'failed'));

-- ============================================================================
-- (2) contact_logs
-- ============================================================================
create table contact_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  channel text not null
    check (channel in ('call', 'whatsapp', 'messenger', 'viber', 'in_person', 'other')),
  note text,
  contacted_at timestamptz not null default now(),
  logged_by uuid references profiles (id) on delete set null,
  logged_by_name text,
  created_at timestamptz not null default now()
);

create index contact_logs_contact_id_idx on contact_logs (contact_id, contacted_at desc);

alter table contact_logs enable row level security;

-- Read-all like contacts, inquiries and messages (CRM-03).
create policy "authenticated staff can read contact logs" on contact_logs
  for select to authenticated using (true);

create policy "can_edit_crm can log contacts" on contact_logs
  for insert to authenticated
  with check (
    public.has_permission(auth.uid(), 'can_edit_crm')
    and logged_by = auth.uid()
  );

-- To undo a log entered on the wrong lead.
create policy "can_edit_crm can delete contact logs" on contact_logs
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'can_edit_crm'));

-- ============================================================================
-- (3) contact_last_activity
-- ============================================================================
create view contact_last_activity
with (security_invoker = true) as
select
  c.id as contact_id,
  (select max(i.created_at) from inquiries i where i.contact_id = c.id) as last_inquiry_at,
  -- greatest() ignores nulls.
  greatest(
    (select max(m.created_at) from messages m
      where m.contact_id = c.id and m.status = 'sent'),
    (select max(l.contacted_at) from contact_logs l where l.contact_id = c.id)
  ) as last_contacted_at
from contacts c;

revoke all on contact_last_activity from anon;
grant select on contact_last_activity to authenticated;
