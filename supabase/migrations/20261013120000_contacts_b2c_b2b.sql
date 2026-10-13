-- Contacts: B2C and B2B clients
-- (docs/superpowers/specs/2026-10-13-contacts-b2c-b2b-design.md).
--
-- (1) contacts gains client_type and stage (a pipeline per type), the B2C
--     "services availed" fields, and the B2B representative, extra
--     emails/numbers and contract dates.
-- (2) stage is backfilled from the old status column.
-- (3) contacts.status is deliberately KEPT, with its check constraint,
--     and a trigger keeps status and stage aligned in both directions.
--     Staging and production share this database, so this migration runs
--     while production still serves code that reads and writes status.
--     A follow-up migration drops status and the trigger once this
--     release is on master.
-- (4) email becomes optional (a lead from WhatsApp or Facebook may only
--     have a number); email or phone is required.
-- (5) An insert policy, so staff can add a contact by hand. Until now
--     record_inquiry() (SECURITY DEFINER) was the only way a contact was
--     created, and 20260720130816 dropped the direct insert policies.
-- (6) contact_documents -- metadata for files in the private R2 bucket.
-- (7) list_contact_tags() -- the tags in use, for the tag picker.

-- ============================================================================
-- (1) New columns
-- ============================================================================
alter table contacts
  add column client_type text not null default 'b2c'
    check (client_type in ('b2c', 'b2b')),
  add column stage text not null default 'new',
  add column services_availed text[] not null default '{}',
  add column services_other text,
  add column rep_name text,
  add column rep_position text,
  add column other_emails jsonb not null default '[]'::jsonb
    check (jsonb_typeof(other_emails) = 'array'),
  add column other_phones jsonb not null default '[]'::jsonb
    check (jsonb_typeof(other_phones) = 'array'),
  add column contract_start date,
  add column contract_end date;

-- ============================================================================
-- (2) Backfill stage from status. contacts_set_updated_by fires on every
-- UPDATE and would stamp updated_by = null, updated_at = now() on every
-- contact, wiping "last updated by", so it is switched off for the backfill.
-- ============================================================================
alter table contacts disable trigger contacts_set_updated_by;

update contacts
set stage = case status
  when 'contacted' then 'inquiry'
  when 'qualified' then 'quotation'
  when 'won' then 'confirmation'
  else status
end;

alter table contacts enable trigger contacts_set_updated_by;

-- ============================================================================
-- (1, continued) Constraints, added after the backfill so existing rows
-- already satisfy them. The stage lists mirror lib/crm/stage.ts and the
-- service keys mirror lib/crm/services.ts -- change both together.
-- ============================================================================
alter table contacts
  add constraint contacts_stage_matches_type check (
    (client_type = 'b2c' and stage in
      ('new', 'inquiry', 'quotation', 'confirmation', 'lost'))
    or
    (client_type = 'b2b' and stage in
      ('new', 'contacted', 'follow_up', 'discovery', 'contract_review', 'won', 'lost'))
  ),
  add constraint contacts_services_availed_known check (
    services_availed <@ array[
      'tour_package', 'visa_services', 'custom_tour', 'flight_accommodation', 'other'
    ]::text[]
  ),
  add constraint contacts_services_other_needs_other check (
    services_other is null or 'other' = any (services_availed)
  ),
  add constraint contacts_contract_dates_ordered check (
    contract_start is null or contract_end is null or contract_end >= contract_start
  );

-- ============================================================================
-- (4) Optional email. The unique constraint stays: Postgres allows any
-- number of nulls, and record_inquiry()'s `on conflict (email)` is
-- unaffected.
-- ============================================================================
alter table contacts
  alter column email drop not null,
  add constraint contacts_email_or_phone check (
    nullif(trim(coalesce(email, '')), '') is not null
    or nullif(trim(coalesce(phone, '')), '') is not null
  );

-- ============================================================================
-- (3) status <-> stage sync. Fires before the table's check constraints
-- are evaluated, so whichever column the caller did not set is filled in
-- first.
--   * insert, or stage / client_type changed (new code): status follows.
--   * otherwise status changed (production's old code): stage follows,
--     using the row's client type.
-- ============================================================================
create function public.contacts_sync_status_stage()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.stage is distinct from old.stage
     or new.client_type is distinct from old.client_type then
    new.status := case new.stage
      when 'new' then 'new'
      when 'lost' then 'lost'
      when 'inquiry' then 'contacted'
      when 'quotation' then 'qualified'
      when 'confirmation' then 'won'
      when 'contacted' then 'contacted'
      when 'follow_up' then 'contacted'
      when 'discovery' then 'qualified'
      when 'contract_review' then 'qualified'
      when 'won' then 'won'
      else new.status
    end;
  elsif new.status is distinct from old.status then
    new.stage := case
      when new.status in ('new', 'lost') then new.status
      when new.client_type = 'b2b' then
        case new.status
          when 'contacted' then 'contacted'
          when 'qualified' then 'discovery'
          else 'won'
        end
      else
        case new.status
          when 'contacted' then 'inquiry'
          when 'qualified' then 'quotation'
          else 'confirmation'
        end
    end;
  end if;
  return new;
end;
$$;

create trigger contacts_sync_status_stage
  before insert or update on contacts
  for each row execute function public.contacts_sync_status_stage();

-- ============================================================================
-- (5) Manual add
-- ============================================================================
create policy "can_edit_crm can insert contacts" on contacts
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_edit_crm'));

-- ============================================================================
-- (6) contact_documents. Read follows contacts' universal-read rule
-- (CRM-03); writes need can_edit_crm. No update policy: a document is
-- replaced by deleting it and uploading again. No anon policy of any kind.
-- size_bytes' ceiling mirrors MAX_DOCUMENT_BYTES in lib/crm/documents.ts.
-- ============================================================================
create table contact_documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  file_name text not null check (length(trim(file_name)) > 0),
  storage_key text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  -- set null, not restrict: deleting a staff account must never be blocked
  -- by the documents they uploaded.
  uploaded_by uuid references profiles(id) on delete set null default auth.uid(),
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

alter table contact_documents enable row level security;

create index contact_documents_contact_id_idx on contact_documents(contact_id);

create policy "authenticated staff can read contact documents" on contact_documents
  for select to authenticated using (true);

create policy "can_edit_crm can insert contact documents" on contact_documents
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_edit_crm'));

create policy "can_edit_crm can delete contact documents" on contact_documents
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'can_edit_crm'));

-- ============================================================================
-- (7) Tags in use. SECURITY INVOKER: it reads contacts as the caller, so
-- an anonymous caller (no select policy) gets nothing even if it could
-- execute it -- and execute is revoked from anon anyway.
-- ============================================================================
create function public.list_contact_tags()
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select distinct tag
  from contacts, unnest(tags) as tag
  where trim(tag) <> ''
  order by 1;
$$;

revoke execute on function public.list_contact_tags() from public, anon;
grant execute on function public.list_contact_tags() to authenticated, service_role;
