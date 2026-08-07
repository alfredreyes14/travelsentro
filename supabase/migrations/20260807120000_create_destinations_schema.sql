-- Destinations catalog (admin-managed, Local/International), and a nullable
-- packages.destination_id FK linking packages to a destination.
--
-- RLS mirrors hero_slides' shape (20260727075208_create_homepage_content_schema.sql)
-- with one difference: public read is scoped to `is_active = true` directly
-- in the policy (not `using (true)`), matching the is_published fix already
-- applied to packages (20260718140000_fix_public_read_rls_is_published.sql)
-- -- RLS itself is the authorization boundary, not just the app's
-- query-layer filter.
--
-- Business rule: an admin cannot disable (is_active: true -> false) a
-- destination while at least one active (is_published, not soft-deleted)
-- package still references it -- enforced by a BEFORE UPDATE trigger so the
-- rule holds regardless of entry point, not just the admin UI. Hard delete
-- needs no special code: packages.destination_id's default (RESTRICT) FK
-- behavior already blocks deleting a destination referenced by any package.

-- ============================================================================
-- destinations
-- ============================================================================
create table destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  region text not null check (region in ('local', 'international')),
  photo_storage_path text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table destinations enable row level security;

create policy "public read" on destinations
  for select using (is_active = true);

create policy "manage_packages can read all destinations" on destinations
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert destinations" on destinations
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update destinations" on destinations
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete destinations" on destinations
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- packages.destination_id -- nullable FK, default (RESTRICT) delete behavior
-- ============================================================================
alter table packages add column destination_id uuid references destinations(id);

-- ============================================================================
-- Disable guard: block is_active true -> false while an active package
-- still references this destination. SECURITY INVOKER (not DEFINER, mirrors
-- write_package_children's rationale in
-- 20260718171228_atomic_package_children_write.sql): the calling admin's own
-- RLS-scoped visibility is sufficient here since the packages this counts
-- (is_published = true) are also covered by packages' own public-read policy.
-- ============================================================================
create or replace function public.prevent_disable_destination_with_active_packages()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active_count integer;
begin
  if old.is_active = true and new.is_active = false then
    select count(*) into v_active_count
    from packages
    where destination_id = old.id
      and is_published = true
      and deleted_at is null;

    if v_active_count > 0 then
      raise exception 'Cannot disable "%" — % active package(s) still use this destination.', old.name, v_active_count;
    end if;
  end if;

  return new;
end;
$$;

create trigger destinations_prevent_disable_with_active_packages
  before update on destinations
  for each row
  execute function public.prevent_disable_destination_with_active_packages();
