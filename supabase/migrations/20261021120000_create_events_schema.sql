-- Events -- admin-managed TravelSentro events (sponsorships, exhibits,
-- booths) shown on /events, /events/<slug> and, when featured, the homepage.
--
-- Purely additive: creates two new tables and their policies, and changes
-- nothing that already exists (staging and production share this project).
--
-- RLS mirrors visa_services (20261009120000_create_visa_services_schema.sql):
-- public read is scoped to published events (and photos of published
-- events) in the policy itself, plus can_manage_packages-scoped
-- authenticated SELECT/INSERT/UPDATE/DELETE via has_permission().
create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  event_type text not null,
  start_date date not null,
  end_date date,
  venue text not null,
  summary text,
  description text,
  cover_storage_path text,
  link_url text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  constraint events_name_not_blank check (length(trim(name)) > 0),
  constraint events_venue_not_blank check (length(trim(venue)) > 0),
  constraint events_event_type_valid check (
    event_type in ('sponsorship', 'exhibit', 'booth', 'other')
  ),
  constraint events_end_after_start check (end_date is null or end_date >= start_date),
  constraint events_link_url_http check (link_url is null or link_url ~* '^https?://'),
  constraint events_published_has_cover check (
    not is_published or cover_storage_path is not null
  )
);

create index events_start_date_idx on events (start_date);

create table event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  storage_path text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index event_photos_event_order_idx on event_photos (event_id, display_order);

alter table events enable row level security;
alter table event_photos enable row level security;

-- events

create policy "public read" on events
  for select using (is_published = true);

create policy "manage_packages can read all events" on events
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert events" on events
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update events" on events
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete events" on events
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- event_photos

create policy "public read" on event_photos
  for select using (
    exists (select 1 from events e where e.id = event_id and e.is_published)
  );

create policy "manage_packages can read all event_photos" on event_photos
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert event_photos" on event_photos
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update event_photos" on event_photos
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete event_photos" on event_photos
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));
