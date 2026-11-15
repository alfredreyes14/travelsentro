-- Lead data hardening. Closes four gaps in who can reach customer data:
--
-- (1) Staff-only reads. Every CRM read policy used `using (true)`, which lets
--     ANY signed-in account read all leads -- including an account someone
--     made for themselves through public sign-up, or a deactivated staff
--     member calling the API directly (getProfile() only guards the admin
--     UI). Reads now require an active profile via is_staff().
--
-- (2) New accounts start inactive. handle_new_user() used to create every
--     new auth user as an active staff member. A self-made account would
--     therefore pass is_staff(). New profiles now start inactive; only an
--     admin (actions/users.ts createAccount) or the seed script turns them on.
--
-- (3) No more public-key shortcuts. record_inquiry(),
--     get_notification_recipients() and set_contact_opted_out() were callable
--     by anyone holding the public anon key, which let a caller:
--       - write leads while skipping the form's validation and spam checks,
--       - list every staff email address,
--       - unsubscribe any contact by id without the signed link.
--     They are now callable by the service role only; the server code that
--     uses them does its checks first.
--
-- Data is untouched. Existing profiles keep their current is_active value.

-- ============================================================================
-- (1) is_staff() + staff-only read policies
-- ============================================================================
-- plpgsql + SECURITY DEFINER for the same reason as has_permission(): reads
-- profiles without tripping profiles' own RLS.
create or replace function public.is_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  select is_active into result from profiles where id = auth.uid();
  return coalesce(result, false);
end;
$$;

revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

drop policy "authenticated staff can read all contacts" on contacts;
create policy "active staff can read all contacts" on contacts
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read all inquiries" on inquiries;
create policy "active staff can read all inquiries" on inquiries
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read all messages" on messages;
create policy "active staff can read all messages" on messages
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read contact documents" on contact_documents;
create policy "active staff can read contact documents" on contact_documents
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read contact logs" on contact_logs;
create policy "active staff can read contact logs" on contact_logs
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read message clicks" on message_clicks;
create policy "active staff can read message clicks" on message_clicks
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read follow-up settings" on follow_up_settings;
create policy "active staff can read follow-up settings" on follow_up_settings
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read messenger threads" on messenger_threads;
create policy "active staff can read messenger threads" on messenger_threads
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read stage phrases" on messenger_stage_phrases;
create policy "active staff can read stage phrases" on messenger_stage_phrases
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read messenger sync state" on messenger_sync_state;
create policy "active staff can read messenger sync state" on messenger_sync_state
  for select to authenticated using (public.is_staff());

drop policy "authenticated staff can read meta lead sync runs" on meta_lead_sync_runs;
create policy "active staff can read meta lead sync runs" on meta_lead_sync_runs
  for select to authenticated using (public.is_staff());

-- ============================================================================
-- (2) New accounts start inactive
-- ============================================================================
alter table profiles alter column is_active set default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, is_active, can_message_customers, can_manage_packages, can_edit_crm, can_manage_vouchers, can_manage_quotes)
  values (new.id, new.email, 'staff', false, false, false, false, false, false);
  return new;
end;
$$;

-- ============================================================================
-- (3) Service-role-only RPCs
-- ============================================================================
revoke execute on function public.record_inquiry(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_inquiry(uuid, text, text, text, text, uuid)
  to service_role;

revoke execute on function public.get_notification_recipients()
  from public, anon, authenticated;
grant execute on function public.get_notification_recipients()
  to service_role;

revoke execute on function public.set_contact_opted_out(uuid)
  from public, anon, authenticated;
grant execute on function public.set_contact_opted_out(uuid)
  to service_role;
