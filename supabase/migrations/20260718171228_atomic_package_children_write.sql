-- ============================================================================
-- Atomic package-children write (02-REVIEW.md CR-02)
--
-- actions/packages.ts's writePackageChildren() previously deleted all of a
-- package's itinerary_days/package_inclusions/faq_facts rows first, then
-- reinserted them across 3 independent network calls with no transaction. A
-- failed insert after the delete permanently destroyed the package's
-- pre-existing content, even though the admin only intended to edit it.
--
-- This function wraps the delete+reinsert sequence in a single Postgres
-- function call (one transaction): any error partway through rolls back
-- every statement, so a package's pre-existing content is never left
-- partially deleted.
--
-- Reinsert-before-delete was considered and rejected: faq_facts.package_id
-- carries a UNIQUE constraint, so inserting a new faq_facts row before
-- deleting the old one for the same package_id would violate that
-- constraint. A genuine atomic transaction is the safer, more general fix
-- and also covers itinerary_days/package_inclusions for the same guarantee.
--
-- SECURITY INVOKER (not DEFINER): this function must run with the calling
-- authenticated user's own privileges, so it remains subject to the existing
-- can_manage_packages-scoped RLS policies on itinerary_days/
-- package_inclusions/faq_facts (20260718150801_admin_rbac_and_package_write_
-- policies.sql, section 7) -- the same boundary the calling Server Action's
-- requirePermission("can_manage_packages") check already enforces, never a
-- broader role.
-- ============================================================================
create or replace function public.write_package_children(
  p_package_id uuid,
  p_itinerary jsonb,
  p_inclusions jsonb,
  p_best_time_to_go text,
  p_group_size text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from itinerary_days where package_id = p_package_id;
  delete from package_inclusions where package_id = p_package_id;
  delete from faq_facts where package_id = p_package_id;

  -- jsonb_array_elements() on an empty jsonb array returns zero rows, so no
  -- conditional guards are needed for empty itinerary/inclusions arrays.
  insert into itinerary_days (package_id, day_number, title, description)
  select
    p_package_id,
    (elem->>'day_number')::integer,
    elem->>'title',
    elem->>'description'
  from jsonb_array_elements(p_itinerary) as elem;

  insert into package_inclusions (package_id, kind, label, sort_order)
  select
    p_package_id,
    elem->>'kind',
    elem->>'label',
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_inclusions) as elem;

  insert into faq_facts (package_id, best_time_to_go, group_size)
  values (p_package_id, p_best_time_to_go, p_group_size);
end;
$$;

grant execute on function public.write_package_children(uuid, jsonb, jsonb, text, text) to authenticated;
