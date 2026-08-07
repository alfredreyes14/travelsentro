-- Travel dates become a From/To range instead of a single date, so each
-- entry represents a real departure window (e.g. "Sep 12 - Sep 14") rather
-- than just a start date.
--
-- Existing rows are backfilled as same-day ranges (travel_date_from =
-- travel_date_to = travel_date) before the old column is dropped, so no
-- existing travel date is lost.

alter table package_travel_dates add column travel_date_from date;
alter table package_travel_dates add column travel_date_to date;

update package_travel_dates
set travel_date_from = travel_date, travel_date_to = travel_date;

alter table package_travel_dates alter column travel_date_from set not null;
alter table package_travel_dates alter column travel_date_to set not null;

alter table package_travel_dates
  add constraint package_travel_dates_to_after_from check (travel_date_to >= travel_date_from);

alter table package_travel_dates drop column travel_date;

-- ============================================================================
-- write_package_children() -- signature unchanged (still one p_travel_dates
-- jsonb param), only the body's insert into package_travel_dates changes to
-- read travel_date_from/travel_date_to instead of travel_date. create or
-- replace is sufficient here since the Args don't change.
-- ============================================================================
create or replace function public.write_package_children(
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

  insert into package_travel_dates (package_id, travel_date_from, travel_date_to, additional_fee)
  select
    p_package_id,
    (elem->>'travel_date_from')::date,
    (elem->>'travel_date_to')::date,
    (elem->>'additional_fee')::numeric
  from jsonb_array_elements(p_travel_dates) as elem;
end;
$$;
