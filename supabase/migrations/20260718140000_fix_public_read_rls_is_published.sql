-- Gap fix (Phase 1 code review CR-01 / VERIFICATION.md): the original "public read"
-- RLS policies were unconditional (`using (true)`), so only the app's query-layer
-- `.eq("is_published", true)` filter hid draft packages -- not the database itself.
-- Anyone holding the public anon key could read unpublished packages and all their
-- child data directly via the Supabase REST API. Scope every policy to the
-- package's is_published state so RLS is the actual authorization boundary.

-- ============================================================================
-- packages: filter directly
-- ============================================================================
drop policy "public read" on packages;
create policy "public read" on packages
  for select using (is_published = true);

-- ============================================================================
-- child tables: filter via parent's is_published
-- ============================================================================
drop policy "public read" on package_photos;
create policy "public read" on package_photos
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_photos.package_id and p.is_published
    )
  );

drop policy "public read" on itinerary_days;
create policy "public read" on itinerary_days
  for select using (
    exists (
      select 1 from packages p
      where p.id = itinerary_days.package_id and p.is_published
    )
  );

drop policy "public read" on package_inclusions;
create policy "public read" on package_inclusions
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_inclusions.package_id and p.is_published
    )
  );

drop policy "public read" on faq_facts;
create policy "public read" on faq_facts
  for select using (
    exists (
      select 1 from packages p
      where p.id = faq_facts.package_id and p.is_published
    )
  );
