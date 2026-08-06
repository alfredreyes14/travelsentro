-- Phase 6 homepage content schema (HOME-01 through HOME-07):
--
-- (1) hero_slides -- mixed package-linked / promo hero carousel slides
-- (2) value_props -- "why choose us" text-only content
-- (3) testimonials -- customer quote/name/photo/rating
-- (4) partners -- shared table for Brand Partners + Corporate Clients,
--     discriminated by partner_type (mirrors package_inclusions.kind /
--     messages.channel's established single-table-with-discriminator shape)
-- (5) site-content Storage bucket for hero/testimonial/partner images
--
-- All 4 tables get the identical RLS shape already used for `packages`:
-- unconditional public SELECT (using (true) -- no draft/publish workflow
-- requested), plus can_manage_packages-scoped authenticated INSERT/UPDATE/
-- DELETE via the existing has_permission() SECURITY DEFINER helper. This
-- migration is purely additive -- it does not modify has_permission(),
-- packages, or any Phase 1-5 table/policy.

-- ============================================================================
-- (1) hero_slides
-- ============================================================================
create table hero_slides (
  id uuid primary key default gen_random_uuid(),
  slide_type text not null check (slide_type in ('package', 'promo')),
  package_id uuid references packages(id) on delete cascade,
  image_storage_path text,
  headline text,
  subheading text,
  cta_label text,
  external_link text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint hero_slides_package_shape check (
    (slide_type = 'package' and package_id is not null) or
    (slide_type = 'promo' and package_id is null)
  )
);

alter table hero_slides enable row level security;

create policy "public read" on hero_slides
  for select using (true);

create policy "manage_packages can read all hero_slides" on hero_slides
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert hero_slides" on hero_slides
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update hero_slides" on hero_slides
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete hero_slides" on hero_slides
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- (2) value_props
-- ============================================================================
create table value_props (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table value_props enable row level security;

create policy "public read" on value_props
  for select using (true);

create policy "manage_packages can read all value_props" on value_props
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert value_props" on value_props
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update value_props" on value_props
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete value_props" on value_props
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- (3) testimonials
-- ============================================================================
create table testimonials (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  quote text not null,
  rating integer not null check (rating between 1 and 5),
  photo_storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table testimonials enable row level security;

create policy "public read" on testimonials
  for select using (true);

create policy "manage_packages can read all testimonials" on testimonials
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert testimonials" on testimonials
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update testimonials" on testimonials
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete testimonials" on testimonials
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- (4) partners -- shared table for Brand Partners + Corporate Clients,
-- discriminated by partner_type (D-07)
-- ============================================================================
create table partners (
  id uuid primary key default gen_random_uuid(),
  partner_type text not null check (partner_type in ('brand_partner', 'corporate_client')),
  logo_storage_path text not null,
  link_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table partners enable row level security;

create policy "public read" on partners
  for select using (true);

create policy "manage_packages can read all partners" on partners
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert partners" on partners
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update partners" on partners
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete partners" on partners
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- (5) site-content Storage bucket -- entirely independent of the 4 tables'
-- own RLS above; table RLS never extends to Storage (mirrors package-photos
-- bucket's policy shape from 20260718150801_admin_rbac_and_package_write_policies.sql).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('site-content', 'site-content', true)
on conflict (id) do nothing;

create policy "Public read access for site content" on storage.objects
  for select using (bucket_id = 'site-content');

create policy "manage_packages can upload site content" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update site content" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete site content" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'));
