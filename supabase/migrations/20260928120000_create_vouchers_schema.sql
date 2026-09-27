-- Vouchers: e-vouchers and physical vouchers, from brand partners or
-- TravelSentro itself, tracked in one polymorphic table (type discriminates
-- digital vs physical, mirroring partners.partner_type's established
-- single-table-with-discriminator shape).
--
-- (1) `voucher_partners` -- deliberately minimal (id + name only) so
--     vouchers.partner_id has something to reference now. Full CRM-side
--     "add partner" management (contact info, notes, etc.) is an explicit
--     separate-session product decision -- not built here. Distinct from
--     the existing `partners` table (20260727075208), which is homepage
--     logo display only and has no name column to reuse.
-- (2) `vouchers` -- one row per physical or digital voucher instance.
--     contact_id is nullable and never auto-set by any trigger -- vouchers
--     may stay unassigned ("loose") inventory indefinitely, per explicit
--     product decision, not just transiently before assignment.
--     No value/discount modeling (percent/fixed/etc.) -- D-01/PROJECT.md:
--     no on-site checkout, so nothing ever applies a voucher's value
--     programmatically; value_label is a free-text display string only
--     (e.g. "10% off", "Free breakfast").
--     image_storage_path follows the existing *_storage_path convention
--     (R2 object key, resolved via lib/storage/r2.ts's getPublicImageUrl)
--     -- no Supabase Storage bucket, per the R2 cutover
--     (20260808150000_drop_supabase_storage_buckets.sql).
--     No DELETE policy -- status='void' is this table's soft-delete,
--     matching packages' soft-delete-only precedent, so redemption history
--     is never lost to an accidental delete.
-- (3) `can_manage_vouchers` permission column on profiles + has_permission()
--     case branch -- vouchers get their own toggle, independent of
--     can_edit_crm/can_manage_packages, per explicit product decision.
--
-- RLS on both tables is fully can_manage_vouchers-gated (read included) --
-- unlike contacts/inquiries, vouchers have no CRM-03-style "all staff can
-- read" requirement, so this defaults to least-privilege.

-- ============================================================================
-- (1) voucher_partners
-- ============================================================================
create table voucher_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table voucher_partners enable row level security;

create policy "can_manage_vouchers can read voucher_partners" on voucher_partners
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_vouchers'));

create policy "can_manage_vouchers can insert voucher_partners" on voucher_partners
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_vouchers'));

create policy "can_manage_vouchers can update voucher_partners" on voucher_partners
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_vouchers'))
  with check (public.has_permission(auth.uid(), 'can_manage_vouchers'));

-- ============================================================================
-- (2) vouchers
-- ============================================================================
create table vouchers (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('digital', 'physical')),
  partner_id uuid references voucher_partners(id),
  title text not null,
  value_label text not null,
  code text unique,
  image_storage_path text,
  status text not null default 'available' check (status in ('available', 'assigned', 'redeemed', 'expired', 'void')),
  contact_id uuid references contacts(id),
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table vouchers enable row level security;

create index vouchers_contact_id_idx on vouchers(contact_id);
create index vouchers_partner_id_idx on vouchers(partner_id);
create index vouchers_status_idx on vouchers(status);

create policy "can_manage_vouchers can read vouchers" on vouchers
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_vouchers'));

create policy "can_manage_vouchers can insert vouchers" on vouchers
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_vouchers'));

create policy "can_manage_vouchers can update vouchers" on vouchers
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_vouchers'))
  with check (public.has_permission(auth.uid(), 'can_manage_vouchers'));

-- ============================================================================
-- (3) can_manage_vouchers permission
-- ============================================================================
alter table profiles add column can_manage_vouchers boolean not null default false;

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
  insert into public.profiles (id, email, role, is_active, can_message_customers, can_manage_packages, can_edit_crm, can_manage_vouchers)
  values (new.id, new.email, 'staff', true, false, false, false, false);
  return new;
end;
$$;
