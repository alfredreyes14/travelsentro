-- Phase 2 admin RBAC + package write policies (AUTH-05):
--
-- (1) `profiles` table (role + 3 permission booleans + is_active), RLS enabled,
--     auto-populated by a trigger on every new auth.users row.
-- (2) `has_permission(uid, perm)` SECURITY DEFINER plpgsql helper -- avoids RLS
--     self-recursion when used inside a policy defined on profiles itself.
-- (3) Split SELECT/UPDATE policies on profiles (never a single combined policy)
--     so a Staff row can never grant itself role/permission changes.
-- (4) `handle_new_user()` trigger function + on_auth_user_created trigger.
-- (5) `packages.deleted_at` soft-delete column (D-09: soft-delete only, no
--     DELETE RLS policy on packages -- enforced at the database layer).
-- (6) Public-read policies on packages + all 4 child tables updated to also
--     exclude soft-deleted rows (deleted_at is null), not just is_published.
-- (7) manage_packages-scoped write RLS (read all/insert/update[/delete]) on
--     all 5 package-domain tables.
-- (8) manage_packages-scoped storage.objects write RLS for package-photos --
--     table RLS never extends to Storage, this is a separate requirement.

-- ============================================================================
-- (1) profiles table
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  is_active boolean not null default true,
  can_message_customers boolean not null default false,
  can_manage_packages boolean not null default false,
  can_edit_crm boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- ============================================================================
-- (2) has_permission() -- SECURITY DEFINER, MUST be plpgsql (not sql): a plain
-- SQL function gets inlined by the planner, silently dropping the SECURITY
-- DEFINER context and reintroducing infinite recursion when this function is
-- used inside a policy defined on the profiles table itself.
--
-- The literal permission value 'admin_only' intentionally matches none of the
-- case branches below, so has_permission(uid, 'admin_only') reduces to
-- exactly `is_active and role = 'admin'` -- reused for the admin-only checks
-- on profiles instead of writing a second function.
-- ============================================================================
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
        else false
      end)
  into result
  from profiles
  where id = uid;

  return coalesce(result, false);
end;
$$;

-- ============================================================================
-- (3) profiles RLS -- TWO separate policies, not one combined policy.
--
-- SELECT: a user can view their own row, or any row if they're an admin.
-- UPDATE: admin-only, with NO auth.uid() = id clause in USING/WITH CHECK.
-- A self-referential clause on the UPDATE check would let a Staff member
-- modify their own row -- including role and permission columns -- which is
-- a privilege-escalation path (T-02-01). No INSERT/DELETE policy: new rows
-- only ever arrive via the trigger below (SECURITY DEFINER bypasses RLS) or
-- a service-role-backed account-creation path in a later plan; deactivation
-- is an UPDATE (is_active=false), never a DELETE.
-- ============================================================================
create policy "self or admin can view profiles" on profiles
  for select to authenticated
  using (auth.uid() = id or public.has_permission(auth.uid(), 'admin_only'));

create policy "admin can update profiles" on profiles
  for update to authenticated
  using (public.has_permission(auth.uid(), 'admin_only'))
  with check (public.has_permission(auth.uid(), 'admin_only'));

-- ============================================================================
-- (4) auto-create profiles row on new auth.users insert (D-02)
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, is_active, can_message_customers, can_manage_packages, can_edit_crm)
  values (new.id, new.email, 'staff', true, false, false, false);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- (5) packages.deleted_at -- soft-delete only, no DELETE RLS policy on
-- packages anywhere in this migration (D-09). Editing a package deletes and
-- reinserts its own child rows, which is why the children need DELETE
-- policies below but the parent (packages) does not.
-- ============================================================================
alter table packages add column deleted_at timestamptz;

-- ============================================================================
-- (6) public-read policy fixes -- exclude soft-deleted rows, not just
-- unpublished ones (Pitfall 4 / Open Question 1: a soft-deleted-but-still-
-- published package must not remain publicly visible).
-- ============================================================================
drop policy "public read" on packages;
create policy "public read" on packages
  for select using (is_published = true and deleted_at is null);

drop policy "public read" on package_photos;
create policy "public read" on package_photos
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_photos.package_id and p.is_published and p.deleted_at is null
    )
  );

drop policy "public read" on itinerary_days;
create policy "public read" on itinerary_days
  for select using (
    exists (
      select 1 from packages p
      where p.id = itinerary_days.package_id and p.is_published and p.deleted_at is null
    )
  );

drop policy "public read" on package_inclusions;
create policy "public read" on package_inclusions
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_inclusions.package_id and p.is_published and p.deleted_at is null
    )
  );

drop policy "public read" on faq_facts;
create policy "public read" on faq_facts
  for select using (
    exists (
      select 1 from packages p
      where p.id = faq_facts.package_id and p.is_published and p.deleted_at is null
    )
  );

-- ============================================================================
-- (7) manage_packages-scoped write RLS on all 5 package-domain tables.
-- packages intentionally receives no DELETE policy at all so the database
-- itself enforces D-09's soft-delete-only rule regardless of any future
-- application bug (T-02-05).
-- ============================================================================

-- packages
create policy "manage_packages can read all packages" on packages
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert packages" on packages
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update packages" on packages
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

-- package_photos
create policy "manage_packages can read all package_photos" on package_photos
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert package_photos" on package_photos
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update package_photos" on package_photos
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete package_photos" on package_photos
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- itinerary_days
create policy "manage_packages can read all itinerary_days" on itinerary_days
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert itinerary_days" on itinerary_days
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update itinerary_days" on itinerary_days
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete itinerary_days" on itinerary_days
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- package_inclusions
create policy "manage_packages can read all package_inclusions" on package_inclusions
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert package_inclusions" on package_inclusions
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update package_inclusions" on package_inclusions
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete package_inclusions" on package_inclusions
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- faq_facts
create policy "manage_packages can read all faq_facts" on faq_facts
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert faq_facts" on faq_facts
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update faq_facts" on faq_facts
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete faq_facts" on faq_facts
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- (8) storage.objects write RLS for package-photos bucket. Table RLS never
-- extends to Storage -- these are required independently of step (7).
-- ============================================================================
create policy "manage_packages can upload package photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'package-photos' and public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update package photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'package-photos' and public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (bucket_id = 'package-photos' and public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete package photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'package-photos' and public.has_permission(auth.uid(), 'can_manage_packages'));
