-- Statements of Account (SOA).
--
-- (1) `statements` -- one row per SOA, of one of two kinds:
--     * 'generated': built in the SOA maker. Line items, discounts and
--       payments live in jsonb columns whose shape is enforced by
--       soaFormSchema (components/admin/soa/soa-form-schema.ts) on every
--       write and re-parsed on every read (lib/soa/soa-row.ts), same
--       frozen-document shape as quotes.
--     * 'previous': an SOA issued before this system (or outside it),
--       entered so its amount is on record. No line items; its amounts are
--       typed in, and the original document can be attached as a file.
--     total_amount / amount_paid are stored for both kinds so amounts can
--     be listed and summed without re-reading jsonb. For generated SOAs
--     the server recomputes them from the rows on every save
--     (lib/soa/totals.ts); they are never taken from the browser. balance
--     is derived, so it can't drift. A negative balance means overpaid.
--     contact_id links the SOA to a CRM contact (B2C or B2B); it is
--     optional, so an SOA can be saved before the customer is in the CRM
--     and linked later.
--     file_* columns describe an attached file in the private R2 bucket
--     (same bucket and rules as contact_documents); all four are set
--     together or not at all.
-- (2) soa_no -- SOA-000001, same sequence+trigger shape as quote_no. A
--     previous SOA also gets one; its own number goes in original_no.
-- (3) `statement_emails` -- append-only log of every email send of an SOA.
--
-- No new permission: SOAs are gated by can_manage_quotes (quotes and SOAs
-- are the same staff's job). RLS mirrors quotes, read included. Hard
-- delete is allowed; the email log goes with the statement.

-- ============================================================================
-- (1) statements
-- ============================================================================
create table statements (
  id uuid primary key default gen_random_uuid(),
  soa_no text unique not null default '',
  kind text not null default 'generated' check (kind in ('generated', 'previous')),
  original_no text,
  bill_to_name text not null,
  bill_to_details text,
  contact_id uuid references contacts(id) on delete set null,
  reference text,
  issue_date date not null default current_date,
  due_date date,
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  discounts jsonb not null default '[]'::jsonb check (jsonb_typeof(discounts) = 'array'),
  payments jsonb not null default '[]'::jsonb check (jsonb_typeof(payments) = 'array'),
  notes text,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  balance numeric(12, 2) generated always as (total_amount - amount_paid) stored,
  file_storage_key text unique,
  file_name text,
  file_content_type text,
  file_size_bytes integer check (file_size_bytes is null or file_size_bytes > 0),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint statements_file_all_or_nothing check (
    (file_storage_key is null) = (file_name is null)
    and (file_storage_key is null) = (file_content_type is null)
    and (file_storage_key is null) = (file_size_bytes is null)
  ),
  constraint statements_due_after_issue check (due_date is null or due_date >= issue_date)
);

alter table statements enable row level security;

create index statements_updated_at_idx on statements(updated_at desc);
create index statements_contact_id_idx on statements(contact_id);

create policy "can_manage_quotes can read statements" on statements
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can insert statements" on statements
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can update statements" on statements
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_quotes'))
  with check (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can delete statements" on statements
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_quotes'));

-- ============================================================================
-- (2) soa_no generation
-- ============================================================================
create sequence soa_no_seq start 1;

grant usage, select on sequence soa_no_seq to authenticated;

create function public.generate_soa_no()
returns trigger
language plpgsql
as $$
begin
  new.soa_no := 'SOA-' || lpad(nextval('soa_no_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger statements_set_soa_no
  before insert on statements
  for each row
  execute function public.generate_soa_no();

-- ============================================================================
-- (3) statement_emails
-- ============================================================================
create table statement_emails (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references statements(id) on delete cascade,
  sent_to text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  sent_by uuid references profiles(id) on delete set null default auth.uid(),
  sent_by_name text,
  created_at timestamptz not null default now()
);

alter table statement_emails enable row level security;

create index statement_emails_statement_id_idx on statement_emails(statement_id, created_at desc);

create policy "can_manage_quotes can read statement_emails" on statement_emails
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can insert statement_emails" on statement_emails
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_quotes'));
