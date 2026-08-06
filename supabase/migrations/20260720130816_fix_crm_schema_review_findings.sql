-- Fixes for 03-REVIEW.md critical findings against 20260720121436_create_crm_schema.sql:
--
-- CR-01: contacts.email was never case/whitespace-normalized before the
--   `on conflict (email)` dedup, so the same person submitting
--   "Jane@Gmail.com" then "jane@gmail.com" ended up as two separate
--   contacts rows. Fixed by normalizing p_email at the top of
--   record_inquiry() -- the only insert path for contacts.email, so this is
--   the single place normalization needs to happen.
--
-- CR-02: the ON CONFLICT branch unconditionally overwrote contacts.name/
--   phone on every repeat inquiry, silently reverting a staff correction
--   made via updateContact() (CRM-07) -- and since the overwrite comes from
--   an anonymous submitter, contacts.updated_by is NULL, so the CRM UI shows
--   no trace it happened. Fixed by only filling name/phone from the
--   submission when the existing value is null/empty (contact creation, or
--   a legacy/blank row) -- once any real value exists, only a staff edit via
--   updateContact() can change it. This also closes a spoofing angle: an
--   anonymous caller who merely knows/guesses an existing contact's email
--   could otherwise overwrite that contact's real name/phone with fake
--   values on every resubmission.
--
-- CR-03: the anon/authenticated INSERT policies on contacts/inquiries were
--   dead code -- record_inquiry() is SECURITY DEFINER and bypasses RLS
--   entirely, so no code path ever needed direct-table inserts. Their only
--   effect was giving anyone with the public anon key unauthenticated,
--   unvalidated direct PostgREST write access to both tables (bypassing the
--   Route Handler's Zod validation, honeypot, and any future rate
--   limiting). Dropped; record_inquiry() remains the sole write path.

-- ============================================================================
-- CR-01 + CR-02: record_inquiry() -- normalize email, don't clobber
-- existing name/phone once set.
-- ============================================================================
create or replace function public.record_inquiry(
  p_request_id uuid,
  p_email text,
  p_name text,
  p_phone text,
  p_message text,
  p_package_id uuid default null
) returns table (contact_id uuid, inquiry_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_inquiry_id uuid;
  v_caller_name text;
  v_package_id uuid;
begin
  -- CR-01: normalize the identity key so casing/whitespace variations of
  -- the same address always resolve to one contacts row.
  p_email := lower(trim(p_email));

  if auth.uid() is not null then
    select name into v_caller_name from profiles where id = auth.uid();
  end if;

  -- Pitfall 6: existence check only, deliberately ignores is_published/
  -- deleted_at (SECURITY DEFINER bypasses packages' public-read RLS filter
  -- here) -- the FK just needs the row to exist. A stale/tampered ID is
  -- silently nulled, never fails the request.
  if p_package_id is not null and exists (select 1 from packages where id = p_package_id) then
    v_package_id := p_package_id;
  else
    v_package_id := null;
  end if;

  -- D-04/D-05: the ON CONFLICT branch intentionally omits created_by/
  -- created_by_name so they are never overwritten on a repeat inquiry.
  -- CR-02: name/phone only fill in when the existing value is blank --
  -- once a real value exists (from creation or a staff edit), only
  -- updateContact() can change it. This fires the contacts_set_updated_by
  -- trigger automatically since Postgres treats this as an UPDATE.
  insert into contacts (email, name, phone, created_by, created_by_name)
  values (p_email, p_name, p_phone, auth.uid(), v_caller_name)
  on conflict (email) do update
    set name = case when coalesce(contacts.name, '') = '' then excluded.name else contacts.name end,
        phone = case when coalesce(contacts.phone, '') = '' then excluded.phone else contacts.phone end
  returning id into v_contact_id;

  insert into inquiries (contact_id, request_id, message, package_id)
  values (v_contact_id, p_request_id, p_message, v_package_id)
  on conflict (request_id) do nothing
  returning id into v_inquiry_id;

  return query select v_contact_id, v_inquiry_id, (v_inquiry_id is not null);
end;
$$;

-- ============================================================================
-- CR-03: drop the unused, unauthenticated public write policies. The RPC
-- above is SECURITY DEFINER and remains the only write path for both
-- tables -- these policies were never required for the app to function.
-- ============================================================================
drop policy "anyone can create a contact via inquiry" on contacts;
drop policy "anyone can create an inquiry" on inquiries;
