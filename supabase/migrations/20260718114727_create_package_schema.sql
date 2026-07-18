-- Phase 1 package catalog schema: 5 normalized tables, public-read-only RLS,
-- and the public package-photos storage bucket.
--
-- Tables: packages, package_photos, itinerary_days, package_inclusions, faq_facts
-- RLS: enabled on every table, with a single "public read" SELECT policy per
-- table and no INSERT/UPDATE/DELETE policy anywhere -- default-deny covers
-- write paths automatically until Phase 2 adds authenticated write policies.

-- ============================================================================
-- packages
-- ============================================================================
create table packages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  from_price integer not null,
  duration_days integer not null,
  duration_label text,
  is_published boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table packages enable row level security;

create policy "public read" on packages
  for select using (true);

-- ============================================================================
-- package_photos
-- ============================================================================
create table package_photos (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  storage_path text not null,
  display_order integer not null default 0,
  alt_text text
);

alter table package_photos enable row level security;

create policy "public read" on package_photos
  for select using (true);

-- ============================================================================
-- itinerary_days
-- ============================================================================
create table itinerary_days (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  day_number integer not null,
  title text not null,
  description text not null
);

alter table itinerary_days enable row level security;

create policy "public read" on itinerary_days
  for select using (true);

-- ============================================================================
-- package_inclusions
-- ============================================================================
create table package_inclusions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  kind text not null check (kind in ('included', 'excluded', 'bring')),
  label text not null,
  sort_order integer not null default 0
);

alter table package_inclusions enable row level security;

create policy "public read" on package_inclusions
  for select using (true);

-- ============================================================================
-- faq_facts
-- ============================================================================
create table faq_facts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null unique references packages(id) on delete cascade,
  best_time_to_go text not null,
  group_size text not null
);

alter table faq_facts enable row level security;

create policy "public read" on faq_facts
  for select using (true);

-- ============================================================================
-- Storage: package-photos public bucket
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('package-photos', 'package-photos', true)
on conflict (id) do nothing;

create policy "Public read access for package photos" on storage.objects
  for select using (bucket_id = 'package-photos');
