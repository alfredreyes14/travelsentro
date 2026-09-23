-- Upsell popup catalog -- the public-site popup shows an admin-picked set
-- of packages, once per visitor session, shuffled into a random order on
-- every appearance (client-side, see components/upsell/upsell-popup.tsx --
-- never stored here).
--
-- upsell_items links to existing packages only -- no custom headline/
-- image/link fields like hero_slides' promo variant, since the popup
-- always renders live package data (name/photo/price). No sort_order
-- column and no update policy: the only mutations are add (insert) and
-- remove (delete), and nothing else on the row is ever edited.
--
-- RLS mirrors hero_slides' shape exactly
-- (20260727075208_create_homepage_content_schema.sql): unconditional
-- public SELECT, can_manage_packages-scoped authenticated INSERT/DELETE
-- via the existing has_permission() SECURITY DEFINER helper. Purely
-- additive -- does not modify has_permission(), packages, or any earlier
-- table/policy.
create table upsell_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (package_id)
);

alter table upsell_items enable row level security;

create policy "public read" on upsell_items
  for select using (true);

create policy "manage_packages can read all upsell_items" on upsell_items
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert upsell_items" on upsell_items
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete upsell_items" on upsell_items
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));
