-- Package fields rework: remove duration_days/faq_facts fields, add
-- discount_amount/remarks/package_travel_dates, make destination required
-- before publish, and auto-generate the package "code" (replaces the
-- user-editable slug) as TSP-000001-style values.
--
-- Ordering matters: duration_label is backfilled from duration_days BEFORE
-- duration_days is dropped, so no existing package silently loses its
-- duration text.

-- ============================================================================
-- 1. Backfill duration_label, then drop duration_days
-- ============================================================================
update packages
set duration_label = duration_days || ' day' || case when duration_days = 1 then '' else 's' end
where duration_label is null;

alter table packages drop column duration_days;

-- ============================================================================
-- 2. Rename from_price -> price_per_pax; add discount_amount and remarks
-- ============================================================================
alter table packages rename column from_price to price_per_pax;

alter table packages add column discount_amount numeric
  check (discount_amount is null or discount_amount >= 0);

alter table packages add column remarks text;

-- ============================================================================
-- 3. Destination required-to-publish: a package can be drafted without a
-- destination, but can never be published without one. Any already-
-- published package with no destination is unpublished here rather than
-- guessed at -- an admin must assign a real destination and republish.
-- ============================================================================
update packages set is_published = false
where is_published = true and destination_id is null;

alter table packages add constraint packages_destination_required_if_published
  check (not is_published or destination_id is not null);

-- ============================================================================
-- 4. Drop faq_facts entirely -- best_time_to_go/group_size are removed, and
-- those were faq_facts' only two content columns.
-- ============================================================================
drop table faq_facts;

-- ============================================================================
-- 5. package_travel_dates -- at-least-one-row-per-package is enforced at the
-- app layer (write_package_children below), same as itinerary_days always
-- has been -- not a DB constraint, since a freshly auto-created draft
-- package has zero travel dates until its first real save.
-- ============================================================================
create table package_travel_dates (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  travel_date date not null,
  additional_fee numeric check (additional_fee is null or additional_fee >= 0),
  created_at timestamptz not null default now()
);

alter table package_travel_dates enable row level security;

create policy "public read" on package_travel_dates
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_travel_dates.package_id and p.is_published and p.deleted_at is null
    )
  );

create policy "manage_packages can read all package_travel_dates" on package_travel_dates
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert package_travel_dates" on package_travel_dates
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update package_travel_dates" on package_travel_dates
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete package_travel_dates" on package_travel_dates
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- 6. Package code generation -- replaces the user-editable slug. Any
-- client-supplied slug value is overwritten by this trigger; TSP-000001
-- format, globally sequential, assigned once at insert time and never
-- changed again. USAGE on the sequence must be granted explicitly to
-- authenticated -- Postgres does not grant it by default, and this trigger
-- runs with the inserting role's own privileges (no SECURITY DEFINER).
-- ============================================================================
create sequence package_code_seq start 1;

grant usage, select on sequence package_code_seq to authenticated;

create function public.generate_package_code()
returns trigger
language plpgsql
as $$
begin
  new.slug := 'TSP-' || lpad(nextval('package_code_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger packages_set_code
  before insert on packages
  for each row
  execute function public.generate_package_code();

-- ============================================================================
-- 7. write_package_children() -- drop faq_facts params, add travel dates.
-- Same atomic delete+reinsert-in-one-transaction shape as
-- 20260718171228_atomic_package_children_write.sql. The old 5-arg overload
-- is dropped explicitly first since its signature is changing, not just its
-- body (create or replace alone would leave the old overload in place).
-- ============================================================================
drop function public.write_package_children(uuid, jsonb, jsonb, text, text);

create function public.write_package_children(
  p_package_id uuid,
  p_itinerary jsonb,
  p_inclusions jsonb,
  p_travel_dates jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from itinerary_days where package_id = p_package_id;
  delete from package_inclusions where package_id = p_package_id;
  delete from package_travel_dates where package_id = p_package_id;

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

  insert into package_travel_dates (package_id, travel_date, additional_fee)
  select
    p_package_id,
    (elem->>'travel_date')::date,
    (elem->>'additional_fee')::numeric
  from jsonb_array_elements(p_travel_dates) as elem;
end;
$$;

grant execute on function public.write_package_children(uuid, jsonb, jsonb, jsonb) to authenticated;
