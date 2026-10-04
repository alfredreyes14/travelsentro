-- Quotes: customer-specific itinerary quotations, rendered through the same
-- PDF template as a package's "Download Full Itinerary"
-- (docs/superpowers/specs/2026-10-04-quotation-generator-design.md).
--
-- (1) `quotes` -- one row per quote. Deliberately NOT child tables like
--     packages' itinerary_days/package_inclusions/package_travel_dates: a
--     quote is a frozen document written as one row in one statement, so
--     its itinerary content lives in jsonb columns whose shape is enforced
--     by quoteFormSchema (components/admin/quote-form-schema.ts) on every
--     write and re-parsed on every read (lib/quotes/quote-row.ts). jsonb
--     keys use the form's camelCase shape so values round-trip unchanged.
--     contact_id/source_package_id are optional links, `on delete set null`
--     so removing a contact or package never removes a quote.
-- (2) quote_no -- TSQ-000001, same sequence+trigger shape as packages'
--     generate_package_code() (20260807180000_package_fields_rework.sql):
--     any client-supplied value is overwritten. The column's '' default
--     exists only so the generated Insert type marks it optional.
-- (3) `can_manage_quotes` permission column + has_permission() branch +
--     handle_new_user() default -- same wiring as can_manage_vouchers
--     (20260928120000_create_vouchers_schema.sql).
--
-- RLS is fully can_manage_quotes-gated, read included (least privilege,
-- like vouchers). Hard delete is allowed: quotes carry no history any other
-- record depends on.

-- ============================================================================
-- (3, first) can_manage_quotes permission -- the RLS policies below call
-- has_permission(..., 'can_manage_quotes'), so wire it before them.
-- ============================================================================
alter table profiles add column can_manage_quotes boolean not null default false;

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  select
    is_active and (role = 'admin' or
      case perm
        when 'can_manage_packages' then can_manage_packages
        when 'can_message_customers' then can_message_customers
        when 'can_edit_crm' then can_edit_crm
        when 'can_manage_vouchers' then can_manage_vouchers
        when 'can_manage_quotes' then can_manage_quotes
        else false
      end)
  into result
  from profiles
  where id = uid;

  return coalesce(result, false);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, is_active, can_message_customers, can_manage_packages, can_edit_crm, can_manage_vouchers, can_manage_quotes)
  values (new.id, new.email, 'staff', true, false, false, false, false, false);
  return new;
end;
$$;

-- ============================================================================
-- (1) quotes
-- ============================================================================
create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique not null default '',
  title text not null,
  customer_name text,
  contact_id uuid references contacts(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'flyer', 'package')),
  source_package_id uuid references packages(id) on delete set null,
  price_per_pax integer not null check (price_per_pax > 0),
  discount_amount numeric check (discount_amount is null or discount_amount > 0),
  duration_label text not null,
  remarks text,
  travel_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(travel_dates) = 'array'),
  itinerary jsonb not null default '[]'::jsonb check (jsonb_typeof(itinerary) = 'array'),
  inclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(inclusions) = 'array'),
  exclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusions) = 'array'),
  bring_items jsonb not null default '[]'::jsonb check (jsonb_typeof(bring_items) = 'array'),
  -- set null, not restrict: deleting a staff account must never be blocked
  -- by (or delete) the quotes they made.
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotes enable row level security;

create index quotes_updated_at_idx on quotes(updated_at desc);

create policy "can_manage_quotes can read quotes" on quotes
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can insert quotes" on quotes
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can update quotes" on quotes
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_quotes'))
  with check (public.has_permission(auth.uid(), 'can_manage_quotes'));

create policy "can_manage_quotes can delete quotes" on quotes
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_quotes'));

-- ============================================================================
-- (2) quote_no generation
-- ============================================================================
create sequence quote_no_seq start 1;

grant usage, select on sequence quote_no_seq to authenticated;

create function public.generate_quote_no()
returns trigger
language plpgsql
as $$
begin
  new.quote_no := 'TSQ-' || lpad(nextval('quote_no_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger quotes_set_quote_no
  before insert on quotes
  for each row
  execute function public.generate_quote_no();
