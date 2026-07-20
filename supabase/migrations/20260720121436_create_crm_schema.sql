-- Phase 3 CRM schema foundation (CRM-01, CRM-03, CRM-06, CRM-07, AUTO-02, AUTO-03):
--
-- (1) `contacts` table -- one row per unique email address, the lead/customer
--     identity record. RLS enabled.
-- (2) `inquiries` table -- one row per inquiry submission (append-only
--     timeline), FK to contacts, request_id-deduped, optional FK to packages.
--     RLS enabled.
-- (3) `set_updated_by()` SECURITY INVOKER trigger function + trigger --
--     captures who/when on every contacts UPDATE (CRM-07), denormalizing
--     updated_by_name as plain text to avoid a cross-table profiles read that
--     Phase 2's "self or admin" profiles SELECT policy would otherwise block
--     for a non-admin Staff viewer.
-- (4) `record_inquiry()` SECURITY DEFINER RPC -- the single idempotent write
--     path every inquiry goes through (D-01/D-03/D-04/D-05). Deliberately
--     SECURITY DEFINER (not the RESEARCH.md-recommended SECURITY INVOKER) so
--     no anon-scoped UPDATE policy on contacts is ever needed -- see this
--     phase's 03-01-PLAN.md objective and T-03-01 for the full rationale.
-- (5) `get_notification_recipients()` SECURITY DEFINER RPC -- least-privilege
--     (email-only) fan-out query for the internal notification automation
--     (AUTO-02, D-06), callable by the anon role (Pitfall 5).
-- (6) RLS policies -- anon+authenticated insert-only on both tables,
--     authenticated read-all (CRM-03), can_edit_crm-scoped update on
--     contacts. Zero anon/public UPDATE or DELETE policy anywhere (Pitfall 2
--     / T-03-03). No update/delete policy on inquiries at all -- immutable
--     append-only log this phase.

-- ============================================================================
-- (1) contacts
-- ============================================================================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  phone text,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  tags text[] not null default '{}',
  created_by uuid references profiles(id),
  created_by_name text,
  updated_by uuid references profiles(id),
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contacts enable row level security;

-- ============================================================================
-- (2) inquiries
-- ============================================================================
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  request_id uuid not null unique,
  message text not null,
  package_id uuid references packages(id),
  created_at timestamptz not null default now()
);

alter table inquiries enable row level security;

create index inquiries_contact_id_idx on inquiries(contact_id);

-- ============================================================================
-- (3) set_updated_by() -- SECURITY INVOKER (matches write_package_children()'s
-- precedent): always runs as whichever role performed the UPDATE. The
-- self-referential `select name from profiles where id = auth.uid()` is
-- always permitted under Phase 2's existing "self or admin can view
-- profiles" policy because it only ever reads the caller's own row.
-- ============================================================================
create or replace function public.set_updated_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is not null then
    select name into v_name from profiles where id = auth.uid();
  end if;

  new.updated_by := auth.uid();
  new.updated_by_name := v_name;
  new.updated_at := now();
  return new;
end;
$$;

create trigger contacts_set_updated_by
  before update on contacts
  for each row execute procedure public.set_updated_by();

-- ============================================================================
-- (4) record_inquiry() -- SECURITY DEFINER (deliberate deviation from
-- RESEARCH.md Pattern 1's SECURITY INVOKER recommendation, see 03-01-PLAN.md
-- objective / T-03-01). Narrowly scoped: only ever touches contacts/
-- inquiries/a read-only packages existence check/a read-only profiles name
-- lookup, never arbitrary SQL. No anon/public UPDATE policy is added on
-- contacts anywhere in this migration -- the ON CONFLICT (email) DO UPDATE
-- branch below is the ONLY way an anon caller can ever cause a contacts
-- UPDATE, and it is narrowly scoped to name/phone on an email match.
-- ============================================================================
create or replace function public.record_inquiry(
  p_request_id uuid,
  p_email text,
  p_name text,
  p_phone text,
  p_message text,
  p_package_id uuid default null
) returns table (contact_id uuid, inquiry_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_inquiry_id uuid;
  v_caller_name text;
  v_package_id uuid;
begin
  if auth.uid() is not null then
    select name into v_caller_name from profiles where id = auth.uid();
  end if;

  -- Pitfall 6: existence check only, deliberately ignores is_published/
  -- deleted_at (SECURITY DEFINER bypasses packages' public-read RLS filter
  -- here) -- the FK just needs the row to exist. A stale/tampered ID is
  -- silently nulled, never fails the request.
  if p_package_id is not null and exists (select 1 from packages where id = p_package_id) then
    v_package_id := p_package_id;
  else
    v_package_id := null;
  end if;

  -- D-04/D-05: the ON CONFLICT branch intentionally omits created_by/
  -- created_by_name so they are never overwritten on a repeat inquiry. This
  -- fires the contacts_set_updated_by trigger automatically since Postgres
  -- treats this as an UPDATE.
  insert into contacts (email, name, phone, created_by, created_by_name)
  values (p_email, p_name, p_phone, auth.uid(), v_caller_name)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_contact_id;

  insert into inquiries (contact_id, request_id, message, package_id)
  values (v_contact_id, p_request_id, p_message, v_package_id)
  on conflict (request_id) do nothing
  returning id into v_inquiry_id;

  return query select v_contact_id, v_inquiry_id, (v_inquiry_id is not null);
end;
$$;

grant execute on function public.record_inquiry(uuid, text, text, text, text, uuid) to anon, authenticated;

-- ============================================================================
-- (5) get_notification_recipients() -- SECURITY DEFINER, deliberately the
-- narrowest possible surface (email column only, no name/role/id/permission
-- booleans exposed) per D-06 and Pitfall 5's explicit least-privilege
-- recommendation. This is the ONLY function this phase grants anon EXECUTE
-- on that reads profiles data.
-- ============================================================================
create or replace function public.get_notification_recipients()
returns table (email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select p.email from profiles p where p.is_active = true and (p.role = 'admin' or p.can_message_customers = true);
end;
$$;

grant execute on function public.get_notification_recipients() to anon, authenticated;

-- ============================================================================
-- (6) RLS policies
-- ============================================================================

-- Public write path (D-01) -- insert only, no read/update/delete for anon.
create policy "anyone can create a contact via inquiry" on contacts
  for insert to anon, authenticated with check (true);

create policy "anyone can create an inquiry" on inquiries
  for insert to anon, authenticated with check (true);

-- CRM-03: read-all for any authenticated Staff (not permission-gated -- read
-- is broader than write per the phase's explicit requirement wording).
create policy "authenticated staff can read all contacts" on contacts
  for select to authenticated using (true);

create policy "authenticated staff can read all inquiries" on inquiries
  for select to authenticated using (true);

-- CRM-03: write gated on can_edit_crm, reusing has_permission() as-is.
-- No DELETE policy on contacts, and no UPDATE/DELETE policy scoped to
-- anon/public -- deliberate closure of Pitfall 2 / T-03-03.
create policy "can_edit_crm can update contacts" on contacts
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_edit_crm'))
  with check (public.has_permission(auth.uid(), 'can_edit_crm'));

-- inquiries: no update or delete policy at all -- immutable append-only log
-- this phase (03-PATTERNS.md: "Soft-delete precedent NOT needed this phase").
