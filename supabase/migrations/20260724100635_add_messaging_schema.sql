-- Phase 4 messaging schema foundation (MSG-05, MSG-06, D-01/D-02):
--
-- (1) `contacts.opted_out` -- single combined opt-out flag (no per-channel
--     columns), defaults false. The ONLY way an anon caller can ever flip it
--     to true is set_contact_opted_out() below -- no anon UPDATE policy is
--     added on contacts anywhere in this migration.
-- (2) `messages` table -- one row per sent (or failed) individual/bulk
--     email/SMS, append-only log, FK to contacts. RLS enabled.
-- (3) `set_contact_opted_out()` SECURITY DEFINER RPC -- the single narrowly
--     scoped anon-callable write path the public unsubscribe route (04-04)
--     calls after its own HMAC signature verification succeeds. Mirrors
--     record_inquiry()'s SECURITY DEFINER precedent from
--     20260720121436_create_crm_schema.sql.
-- (4) RLS policies -- authenticated read-all on messages (MSG-06, mirrors
--     CRM-03's contacts/inquiries precedent), can_message_customers-scoped
--     authenticated insert on messages (distinct from can_edit_crm). No
--     update/delete policy on messages -- immutable append-only log, same as
--     inquiries. No anon insert policy on messages -- every message send
--     originates from an authenticated Server Action.
--
-- This migration is purely additive: has_permission(), the existing
-- "can_edit_crm can update contacts" policy, and every Phase 1-3 table/policy
-- are untouched.

-- ============================================================================
-- (1) contacts.opted_out
-- ============================================================================
alter table contacts add column opted_out boolean not null default false;

-- ============================================================================
-- (2) messages
-- ============================================================================
create table messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  subject text,
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider_message_id text,
  batch_id uuid,
  sent_by uuid references profiles(id),
  sent_by_name text,
  created_at timestamptz not null default now()
);

alter table messages enable row level security;

create index messages_contact_id_idx on messages(contact_id);
create index messages_channel_created_at_idx on messages(channel, created_at);

-- ============================================================================
-- (3) set_contact_opted_out() -- SECURITY DEFINER, deliberately the narrowest
-- possible surface: the entire function body is one single-column UPDATE by
-- primary key, no dynamic SQL, fixed search_path. Silently no-ops if the id
-- doesn't match any row -- idempotent by design, clicking an
-- already-processed unsubscribe link twice is harmless.
--
-- The HMAC signature check happens ENTIRELY in the calling Route/page
-- (04-04's app/unsubscribe/page.tsx), BEFORE this RPC is ever invoked -- this
-- RPC trusts its caller completely once invoked, exactly like
-- record_inquiry()'s SECURITY DEFINER precedent.
-- ============================================================================
create or replace function public.set_contact_opted_out(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update contacts set opted_out = true where id = p_contact_id;
end;
$$;

grant execute on function public.set_contact_opted_out(uuid) to anon, authenticated;

-- ============================================================================
-- (4) messages RLS policies
-- ============================================================================

-- MSG-06: read-all for any authenticated Staff/Admin, not permission-scoped --
-- mirrors CRM-03/03-01's universal-read precedent on contacts/inquiries.
create policy "authenticated staff can read all messages" on messages
  for select to authenticated using (true);

-- Write gated on can_message_customers specifically (not can_edit_crm), per
-- MSG-01..MSG-04's exact requirement wording and 04-CONTEXT.md's
-- Claude's-Discretion note. No anon insert policy -- every message send
-- originates from an authenticated Server Action, unlike record_inquiry()
-- there is no anonymous message-send path this phase.
create policy "can_message_customers can insert messages" on messages
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_message_customers'));

-- No update or delete policy on messages at all -- immutable append-only log,
-- same as inquiries.
