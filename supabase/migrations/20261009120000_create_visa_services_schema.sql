-- Visa services -- admin-managed visa assistance offerings (one row per
-- country) shown on the homepage below Featured Packages.
--
-- RLS mirrors faqs' shape (20261007120000_create_faqs_schema.sql): public
-- read is scoped to `is_published = true` in the policy itself, plus
-- can_manage_packages-scoped authenticated SELECT/INSERT/UPDATE/DELETE via
-- the existing has_permission() SECURITY DEFINER helper. Purely additive.
create table visa_services (
  id uuid primary key default gen_random_uuid(),
  country text not null check (length(trim(country)) > 0),
  description text,
  processing_time text,
  price integer check (price is null or price > 0),
  requirements text,
  photo_storage_path text,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table visa_services enable row level security;

create policy "public read" on visa_services
  for select using (is_published = true);

create policy "manage_packages can read all visa_services" on visa_services
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert visa_services" on visa_services
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update visa_services" on visa_services
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete visa_services" on visa_services
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));
