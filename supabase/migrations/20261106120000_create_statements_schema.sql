-- Statements of Account (SOA): free-form billing documents rendered to PDF.
--
-- (1) `statements` -- one row per SOA. Same frozen-document shape as quotes
--     (20261004120000_create_quotes_schema.sql): line items, discounts and
--     payments live in jsonb columns whose shape is enforced by
--     soaFormSchema (components/admin/soa/soa-form-schema.ts) on every write
--     and re-parsed on every read (lib/soa/soa-row.ts). Totals are never
--     stored -- they are always recomputed from the rows (lib/soa/totals.ts),
--     so the list, form and PDF can't disagree.
--     discounts[].voucherId is a soft link to vouchers (not an FK: jsonb),
--     kept only so staff can see which voucher was applied. Applying a
--     voucher never changes the voucher's status.
-- (2) soa_no -- SOA-000001, same sequence+trigger shape as quote_no.
--
-- No new permission: SOAs are gated by can_manage_quotes (quotes and SOAs
-- are the same staff's job). RLS mirrors quotes, read included. Hard
-- delete is allowed: nothing else references a statement.

-- ============================================================================
-- (1) statements
-- ============================================================================
create table statements (
  id uuid primary key default gen_random_uuid(),
  soa_no text unique not null default '',
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
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
