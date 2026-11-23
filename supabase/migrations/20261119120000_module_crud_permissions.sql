-- Per-module read / create / update / delete permissions.
--
-- Replaces the five can_* booleans on profiles with one `permissions` jsonb:
--   {"packages": {"read": true, "create": true, "update": false, "delete": false}, ...}
-- Modules match the admin nav (plus "messages" for sending email/SMS):
--   leads, messages, quotes, soa, vouchers, packages, destinations, content,
--   events, partners.
-- A missing module or action means "no". Admins (role = 'admin') bypass every
-- check, so their permissions stay '{}'. Users stays admin-only.
--
-- Generated from the live policy list: every policy that called
-- has_permission() (plus the "any signed-in staff can read" lead policies) is
-- dropped and recreated against has_module_permission(). Public-read policies
-- are untouched.
--
-- Cross-module rules:
--   * contacts are readable with leads, quotes or soa read (the quote and SOA
--     forms pick a customer).
--   * packages: delete is a soft delete (an UPDATE), and create alone can
--     finish a never-saved draft (destination_id still null), children included.
--   * event photos: events create or update.
--   * lead notes, documents, saved replies: adding needs leads update,
--     removing needs leads delete.

-- ============================================================================
-- (1) permissions column + helpers
-- ============================================================================
alter table public.profiles
  add column permissions jsonb not null default '{}'::jsonb
  check (jsonb_typeof(permissions) = 'object');

-- SECURITY DEFINER plpgsql (not sql) for the same reason as has_permission():
-- an inlined sql function would lose the definer context and recurse through
-- the profiles RLS policies.
create or replace function public.has_module_permission(uid uuid, module text, action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  select is_active and (role = 'admin' or coalesce(permissions -> module -> action = 'true'::jsonb, false))
  into result
  from profiles
  where id = uid;

  return coalesce(result, false);
end;
$$;

create or replace function public.is_admin(uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  select is_active and role = 'admin' into result from profiles where id = uid;
  return coalesce(result, false);
end;
$$;

-- ============================================================================
-- (2) carry existing staff access over (admins keep '{}': they bypass)
-- ============================================================================
update public.profiles
set permissions = jsonb_strip_nulls(jsonb_build_object(
  -- Every staff account could view leads before this change.
  'leads', case when can_edit_crm then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb else '{"read": true}'::jsonb end,
  'messages', case when can_message_customers then '{"create": true}'::jsonb end,
  'quotes', case when can_manage_quotes then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb end,
  'soa', case when can_manage_quotes then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb end,
  'vouchers', case when can_manage_vouchers then '{"read": true, "create": true, "update": true}'::jsonb end,
  'packages', case when can_manage_packages then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb end,
  'destinations', case when can_manage_packages then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb end,
  'content', case when can_manage_packages then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb end,
  'events', case when can_manage_packages then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb end,
  'partners', case when can_manage_packages then '{"read": true, "create": true, "update": true, "delete": true}'::jsonb end
))
where role <> 'admin';

-- ============================================================================
-- (3) drop the old policies
-- ============================================================================
drop policy "manage_packages can update booking terms" on public.booking_terms;
drop policy "authenticated staff can read contact documents" on public.contact_documents;
drop policy "can_edit_crm can delete contact documents" on public.contact_documents;
drop policy "can_edit_crm can insert contact documents" on public.contact_documents;
drop policy "authenticated staff can read contact logs" on public.contact_logs;
drop policy "can_edit_crm can delete contact logs" on public.contact_logs;
drop policy "can_edit_crm can log contacts" on public.contact_logs;
drop policy "authenticated staff can read all contacts" on public.contacts;
drop policy "can_edit_crm can insert contacts" on public.contacts;
drop policy "can_edit_crm can update contacts" on public.contacts;
drop policy "manage_packages can delete destinations" on public.destinations;
drop policy "manage_packages can insert destinations" on public.destinations;
drop policy "manage_packages can read all destinations" on public.destinations;
drop policy "manage_packages can update destinations" on public.destinations;
drop policy "manage_packages can delete event_photos" on public.event_photos;
drop policy "manage_packages can insert event_photos" on public.event_photos;
drop policy "manage_packages can read all event_photos" on public.event_photos;
drop policy "manage_packages can update event_photos" on public.event_photos;
drop policy "manage_packages can delete events" on public.events;
drop policy "manage_packages can insert events" on public.events;
drop policy "manage_packages can read all events" on public.events;
drop policy "manage_packages can update events" on public.events;
drop policy "manage_packages can delete faqs" on public.faqs;
drop policy "manage_packages can insert faqs" on public.faqs;
drop policy "manage_packages can read all faqs" on public.faqs;
drop policy "manage_packages can update faqs" on public.faqs;
drop policy "authenticated staff can read follow-up settings" on public.follow_up_settings;
drop policy "manage_packages can delete hero_slides" on public.hero_slides;
drop policy "manage_packages can insert hero_slides" on public.hero_slides;
drop policy "manage_packages can read all hero_slides" on public.hero_slides;
drop policy "manage_packages can update hero_slides" on public.hero_slides;
drop policy "authenticated staff can read all inquiries" on public.inquiries;
drop policy "manage_packages can delete itinerary_days" on public.itinerary_days;
drop policy "manage_packages can insert itinerary_days" on public.itinerary_days;
drop policy "manage_packages can read all itinerary_days" on public.itinerary_days;
drop policy "manage_packages can update itinerary_days" on public.itinerary_days;
drop policy "authenticated staff can read message clicks" on public.message_clicks;
drop policy "authenticated staff can read all messages" on public.messages;
drop policy "can_message_customers can insert messages" on public.messages;
drop policy "authenticated staff can read stage phrases" on public.messenger_stage_phrases;
drop policy "can_edit_crm can add stage phrases" on public.messenger_stage_phrases;
drop policy "can_edit_crm can delete stage phrases" on public.messenger_stage_phrases;
drop policy "authenticated staff can read messenger sync state" on public.messenger_sync_state;
drop policy "authenticated staff can read messenger threads" on public.messenger_threads;
drop policy "authenticated staff can read meta lead sync runs" on public.meta_lead_sync_runs;
drop policy "manage_packages can delete package_inclusions" on public.package_inclusions;
drop policy "manage_packages can insert package_inclusions" on public.package_inclusions;
drop policy "manage_packages can read all package_inclusions" on public.package_inclusions;
drop policy "manage_packages can update package_inclusions" on public.package_inclusions;
drop policy "manage_packages can delete package_photos" on public.package_photos;
drop policy "manage_packages can insert package_photos" on public.package_photos;
drop policy "manage_packages can read all package_photos" on public.package_photos;
drop policy "manage_packages can update package_photos" on public.package_photos;
drop policy "manage_packages can delete package_travel_dates" on public.package_travel_dates;
drop policy "manage_packages can insert package_travel_dates" on public.package_travel_dates;
drop policy "manage_packages can read all package_travel_dates" on public.package_travel_dates;
drop policy "manage_packages can update package_travel_dates" on public.package_travel_dates;
drop policy "manage_packages can insert packages" on public.packages;
drop policy "manage_packages can read all packages" on public.packages;
drop policy "manage_packages can update packages" on public.packages;
drop policy "manage_packages can delete partners" on public.partners;
drop policy "manage_packages can insert partners" on public.partners;
drop policy "manage_packages can read all partners" on public.partners;
drop policy "manage_packages can update partners" on public.partners;
drop policy "admin can update profiles" on public.profiles;
drop policy "self or admin can view profiles" on public.profiles;
drop policy "can_manage_quotes can delete quotes" on public.quotes;
drop policy "can_manage_quotes can insert quotes" on public.quotes;
drop policy "can_manage_quotes can read quotes" on public.quotes;
drop policy "can_manage_quotes can update quotes" on public.quotes;
drop policy "can_manage_quotes can insert statement_emails" on public.statement_emails;
drop policy "can_manage_quotes can read statement_emails" on public.statement_emails;
drop policy "can_manage_quotes can delete statements" on public.statements;
drop policy "can_manage_quotes can insert statements" on public.statements;
drop policy "can_manage_quotes can read statements" on public.statements;
drop policy "can_manage_quotes can update statements" on public.statements;
drop policy "manage_packages can delete testimonials" on public.testimonials;
drop policy "manage_packages can insert testimonials" on public.testimonials;
drop policy "manage_packages can read all testimonials" on public.testimonials;
drop policy "manage_packages can update testimonials" on public.testimonials;
drop policy "manage_packages can delete upsell_items" on public.upsell_items;
drop policy "manage_packages can insert upsell_items" on public.upsell_items;
drop policy "manage_packages can read all upsell_items" on public.upsell_items;
drop policy "manage_packages can delete value_props" on public.value_props;
drop policy "manage_packages can insert value_props" on public.value_props;
drop policy "manage_packages can read all value_props" on public.value_props;
drop policy "manage_packages can update value_props" on public.value_props;
drop policy "manage_packages can delete visa_services" on public.visa_services;
drop policy "manage_packages can insert visa_services" on public.visa_services;
drop policy "manage_packages can read all visa_services" on public.visa_services;
drop policy "manage_packages can update visa_services" on public.visa_services;
drop policy "can_manage_vouchers can insert voucher_partners" on public.voucher_partners;
drop policy "can_manage_vouchers can read voucher_partners" on public.voucher_partners;
drop policy "can_manage_vouchers can update voucher_partners" on public.voucher_partners;
drop policy "can_manage_vouchers can insert vouchers" on public.vouchers;
drop policy "can_manage_vouchers can read vouchers" on public.vouchers;
drop policy "can_manage_vouchers can update vouchers" on public.vouchers;

-- ============================================================================
-- (4) recreate them per module and action
-- ============================================================================
create policy "leads, quotes or soa read contacts" on public.contacts
  for select to authenticated
  using ((public.has_module_permission((select auth.uid()), 'leads', 'read') or public.has_module_permission((select auth.uid()), 'quotes', 'read') or public.has_module_permission((select auth.uid()), 'soa', 'read')));

create policy "leads create contacts" on public.contacts
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'leads', 'create'));

create policy "leads update contacts" on public.contacts
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'leads', 'update'));

create policy "leads read contact_logs" on public.contact_logs
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads update can log contacts" on public.contact_logs
  for insert to authenticated
  with check ((public.has_module_permission((select auth.uid()), 'leads', 'update') and logged_by = (select auth.uid())));

create policy "leads delete contact_logs" on public.contact_logs
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'delete'));

create policy "leads read contact_documents" on public.contact_documents
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads update add contact_documents" on public.contact_documents
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'leads', 'update'));

create policy "leads delete contact_documents" on public.contact_documents
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'delete'));

create policy "leads read messenger_stage_phrases" on public.messenger_stage_phrases
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads update add messenger_stage_phrases" on public.messenger_stage_phrases
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'leads', 'update'));

create policy "leads delete messenger_stage_phrases" on public.messenger_stage_phrases
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'delete'));

create policy "leads read inquiries" on public.inquiries
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads read messages" on public.messages
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads read message_clicks" on public.message_clicks
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads read follow_up_settings" on public.follow_up_settings
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads read messenger_sync_state" on public.messenger_sync_state
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads read messenger_threads" on public.messenger_threads
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "leads read meta_lead_sync_runs" on public.meta_lead_sync_runs
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'leads', 'read'));

create policy "messages create messages" on public.messages
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'messages', 'create'));

create policy "quotes read quotes" on public.quotes
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'quotes', 'read'));

create policy "quotes create quotes" on public.quotes
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'quotes', 'create'));

create policy "quotes update quotes" on public.quotes
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'quotes', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'quotes', 'update'));

create policy "quotes delete quotes" on public.quotes
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'quotes', 'delete'));

create policy "soa read statements" on public.statements
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'soa', 'read'));

create policy "soa create statements" on public.statements
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'soa', 'create'));

create policy "soa update statements" on public.statements
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'soa', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'soa', 'update'));

create policy "soa delete statements" on public.statements
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'soa', 'delete'));

create policy "soa read statement_emails" on public.statement_emails
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'soa', 'read'));

create policy "soa update send statement_emails" on public.statement_emails
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'soa', 'update'));

create policy "vouchers read vouchers" on public.vouchers
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'vouchers', 'read'));

create policy "vouchers create vouchers" on public.vouchers
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'vouchers', 'create'));

create policy "vouchers update vouchers" on public.vouchers
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'vouchers', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'vouchers', 'update'));

create policy "vouchers read voucher_partners" on public.voucher_partners
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'vouchers', 'read'));

create policy "vouchers create or update add voucher_partners" on public.voucher_partners
  for insert to authenticated
  with check ((public.has_module_permission((select auth.uid()), 'vouchers', 'create') or public.has_module_permission((select auth.uid()), 'vouchers', 'update')));

create policy "vouchers update voucher_partners" on public.voucher_partners
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'vouchers', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'vouchers', 'update'));

create policy "packages read packages" on public.packages
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'packages', 'read'));

create policy "packages create packages" on public.packages
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'packages', 'create'));

create policy "packages update, delete or finish draft packages" on public.packages
  for update to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or public.has_module_permission((select auth.uid()), 'packages', 'delete') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and destination_id is null)))
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or public.has_module_permission((select auth.uid()), 'packages', 'delete') or public.has_module_permission((select auth.uid()), 'packages', 'create')));

create policy "packages read itinerary_days" on public.itinerary_days
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'packages', 'read'));

create policy "packages write itinerary_days" on public.itinerary_days
  for insert to authenticated
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = itinerary_days.package_id and p.destination_id is null))));

create policy "packages update itinerary_days" on public.itinerary_days
  for update to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = itinerary_days.package_id and p.destination_id is null))))
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = itinerary_days.package_id and p.destination_id is null))));

create policy "packages delete itinerary_days" on public.itinerary_days
  for delete to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = itinerary_days.package_id and p.destination_id is null))));

create policy "packages read package_inclusions" on public.package_inclusions
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'packages', 'read'));

create policy "packages write package_inclusions" on public.package_inclusions
  for insert to authenticated
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_inclusions.package_id and p.destination_id is null))));

create policy "packages update package_inclusions" on public.package_inclusions
  for update to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_inclusions.package_id and p.destination_id is null))))
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_inclusions.package_id and p.destination_id is null))));

create policy "packages delete package_inclusions" on public.package_inclusions
  for delete to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_inclusions.package_id and p.destination_id is null))));

create policy "packages read package_photos" on public.package_photos
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'packages', 'read'));

create policy "packages write package_photos" on public.package_photos
  for insert to authenticated
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_photos.package_id and p.destination_id is null))));

create policy "packages update package_photos" on public.package_photos
  for update to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_photos.package_id and p.destination_id is null))))
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_photos.package_id and p.destination_id is null))));

create policy "packages delete package_photos" on public.package_photos
  for delete to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_photos.package_id and p.destination_id is null))));

create policy "packages read package_travel_dates" on public.package_travel_dates
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'packages', 'read'));

create policy "packages write package_travel_dates" on public.package_travel_dates
  for insert to authenticated
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_travel_dates.package_id and p.destination_id is null))));

create policy "packages update package_travel_dates" on public.package_travel_dates
  for update to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_travel_dates.package_id and p.destination_id is null))))
  with check ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_travel_dates.package_id and p.destination_id is null))));

create policy "packages delete package_travel_dates" on public.package_travel_dates
  for delete to authenticated
  using ((public.has_module_permission((select auth.uid()), 'packages', 'update') or (public.has_module_permission((select auth.uid()), 'packages', 'create') and exists (select 1 from packages p where p.id = package_travel_dates.package_id and p.destination_id is null))));

create policy "destinations read destinations" on public.destinations
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'destinations', 'read'));

create policy "destinations create destinations" on public.destinations
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'destinations', 'create'));

create policy "destinations update destinations" on public.destinations
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'destinations', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'destinations', 'update'));

create policy "destinations delete destinations" on public.destinations
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'destinations', 'delete'));

create policy "content read hero_slides" on public.hero_slides
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'read'));

create policy "content create hero_slides" on public.hero_slides
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'content', 'create'));

create policy "content update hero_slides" on public.hero_slides
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'content', 'update'));

create policy "content delete hero_slides" on public.hero_slides
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'delete'));

create policy "content read testimonials" on public.testimonials
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'read'));

create policy "content create testimonials" on public.testimonials
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'content', 'create'));

create policy "content update testimonials" on public.testimonials
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'content', 'update'));

create policy "content delete testimonials" on public.testimonials
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'delete'));

create policy "content read faqs" on public.faqs
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'read'));

create policy "content create faqs" on public.faqs
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'content', 'create'));

create policy "content update faqs" on public.faqs
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'content', 'update'));

create policy "content delete faqs" on public.faqs
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'delete'));

create policy "content read visa_services" on public.visa_services
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'read'));

create policy "content create visa_services" on public.visa_services
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'content', 'create'));

create policy "content update visa_services" on public.visa_services
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'content', 'update'));

create policy "content delete visa_services" on public.visa_services
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'delete'));

create policy "content read value_props" on public.value_props
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'read'));

create policy "content create value_props" on public.value_props
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'content', 'create'));

create policy "content update value_props" on public.value_props
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'content', 'update'));

create policy "content delete value_props" on public.value_props
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'delete'));

create policy "content read upsell_items" on public.upsell_items
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'read'));

create policy "content create upsell_items" on public.upsell_items
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'content', 'create'));

create policy "content delete upsell_items" on public.upsell_items
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'delete'));

create policy "content update booking_terms" on public.booking_terms
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'content', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'content', 'update'));

create policy "events read events" on public.events
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'events', 'read'));

create policy "events create events" on public.events
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'events', 'create'));

create policy "events update events" on public.events
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'events', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'events', 'update'));

create policy "events delete events" on public.events
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'events', 'delete'));

create policy "events read event_photos" on public.event_photos
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'events', 'read'));

create policy "events write event_photos" on public.event_photos
  for insert to authenticated
  with check ((public.has_module_permission((select auth.uid()), 'events', 'create') or public.has_module_permission((select auth.uid()), 'events', 'update')));

create policy "events update event_photos" on public.event_photos
  for update to authenticated
  using ((public.has_module_permission((select auth.uid()), 'events', 'create') or public.has_module_permission((select auth.uid()), 'events', 'update')))
  with check ((public.has_module_permission((select auth.uid()), 'events', 'create') or public.has_module_permission((select auth.uid()), 'events', 'update')));

create policy "events delete event_photos" on public.event_photos
  for delete to authenticated
  using ((public.has_module_permission((select auth.uid()), 'events', 'create') or public.has_module_permission((select auth.uid()), 'events', 'update')));

create policy "partners read partners" on public.partners
  for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'partners', 'read'));

create policy "partners create partners" on public.partners
  for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'partners', 'create'));

create policy "partners update partners" on public.partners
  for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'partners', 'update'))
  with check (public.has_module_permission((select auth.uid()), 'partners', 'update'));

create policy "partners delete partners" on public.partners
  for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'partners', 'delete'));

create policy "self or admin can view profiles" on public.profiles
  for select to authenticated
  using (((select auth.uid()) = id or public.is_admin((select auth.uid()))));

create policy "admin can update profiles" on public.profiles
  for update to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- ============================================================================
-- (5) RPCs that checked has_permission() (bodies otherwise unchanged)
-- ============================================================================
-- link_messenger_thread: leads.update
CREATE OR REPLACE FUNCTION public.link_messenger_thread(p_contact_id uuid, p_psid text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_module_permission(auth.uid(), 'leads', 'update') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from messenger_threads where psid = p_psid) then
    return false;
  end if;
  return public.link_messenger_psid(p_contact_id, p_psid);
end;
$function$;

-- unlink_messenger_thread: leads.update
CREATE OR REPLACE FUNCTION public.unlink_messenger_thread(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_module_permission(auth.uid(), 'leads', 'update') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if exists (
    select 1 from contacts
    where id = p_contact_id
      and nullif(trim(coalesce(email, '')), '') is null
      and nullif(trim(coalesce(phone, '')), '') is null
  ) then
    raise exception 'needs email or phone' using errcode = 'P0001',
      hint = 'Add an email or phone to this lead before unlinking its only chat.';
  end if;
  update messenger_threads set contact_id = null where contact_id = p_contact_id;
  update contacts set messenger_psid = null where id = p_contact_id;
end;
$function$;

-- set_messenger_thread_ignored: leads.update
CREATE OR REPLACE FUNCTION public.set_messenger_thread_ignored(p_psid text, p_ignored boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_module_permission(auth.uid(), 'leads', 'update') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update messenger_threads
  set ignored_at = case when p_ignored then now() else null end
  where psid = p_psid and contact_id is null;
end;
$function$;

-- add_lead_from_chat: leads.create
CREATE OR REPLACE FUNCTION public.add_lead_from_chat(p_psid text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_thread messenger_threads%rowtype;
  v_contact_id uuid;
  v_staff_name text;
begin
  if not public.has_module_permission(auth.uid(), 'leads', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into v_thread from messenger_threads where psid = p_psid for update;
  if not found or v_thread.contact_id is not null
     or exists (select 1 from contacts where messenger_psid = p_psid) then
    return null;
  end if;

  select name into v_staff_name from profiles where id = auth.uid();

  -- They wrote to us, so they start at Inquiry.
  insert into contacts (name, client_type, stage, messenger_psid, tags, created_by, created_by_name)
  values (
    coalesce(nullif(trim(v_thread.name), ''), 'Messenger lead'),
    'b2c',
    'inquiry',
    p_psid,
    array['Messenger'],
    auth.uid(),
    v_staff_name
  )
  returning id into v_contact_id;

  update messenger_threads set contact_id = v_contact_id, ignored_at = null where psid = p_psid;

  if v_thread.pending_stage is not null then
    begin
      update contacts set stage = v_thread.pending_stage where id = v_contact_id;
    exception when check_violation then
      null;
    end;
    update messenger_threads set pending_stage = null where psid = p_psid;
  end if;

  return v_contact_id;
end;
$function$;

-- mark_follow_ups_sent: messages.create
CREATE OR REPLACE FUNCTION public.mark_follow_ups_sent(p_message_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contact_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.has_module_permission(auth.uid(), 'messages', 'create') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  for v_contact_id in
    select distinct m.contact_id
    from messages m
    where m.id = any (p_message_ids)
      and m.kind = 'follow_up'
      and m.status = 'sent'
  loop
    perform public.advance_stage_for_follow_up(v_contact_id, 'sent');
  end loop;
end;
$function$;

-- New-inquiry alerts go to admins and anyone who can message customers.
create or replace function public.get_notification_recipients()
returns table(email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select p.email from profiles p
    where p.is_active = true
      and (p.role = 'admin' or coalesce(p.permissions -> 'messages' -> 'create' = 'true'::jsonb, false));
end;
$$;

-- New accounts start as staff with no permissions; an admin grants them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, is_active)
  values (new.id, new.email, 'staff', true);
  return new;
end;
$$;

-- ============================================================================
-- (6) drop the old model
-- ============================================================================
drop function public.has_permission(uuid, text);

alter table public.profiles
  drop column can_message_customers,
  drop column can_manage_packages,
  drop column can_edit_crm,
  drop column can_manage_vouchers,
  drop column can_manage_quotes;
