-- Visa services: readable URLs and a last-edited timestamp.
--
--   slug        /visa/<slug> (e.g. /visa/japan) instead of /visa/<uuid>.
--               Filled from `country` on insert and never changed after, so
--               a shared link keeps working even if the country is renamed.
--               Old /visa/<uuid> links redirect to the slug URL in the app.
--   updated_at  Bumped when public content changes (not on reorder or
--               publish toggles); used as the sitemap's lastModified.
--
-- Existing rows are backfilled below: slug from country (oldest row wins a
-- duplicate name, later ones get -2, -3, ...), updated_at from created_at.

create extension if not exists unaccent with schema extensions;

-- "Curaçao" -> "curacao", "Bosnia & Herzegovina" -> "bosnia-and-herzegovina".
-- Same rules as slugifyName() in lib/packages/package-url.ts.
create or replace function public.slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    replace(lower(extensions.unaccent(value)), '&', ' and '),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

alter table visa_services
  add column slug text,
  add column updated_at timestamptz not null default now();

-- Backfill existing rows.
update visa_services set updated_at = created_at;

with ranked as (
  select
    id,
    coalesce(nullif(public.slugify(country), ''), 'visa') as base,
    row_number() over (
      partition by coalesce(nullif(public.slugify(country), ''), 'visa')
      order by created_at, id
    ) as n
  from visa_services
)
update visa_services v
set slug = case when r.n = 1 then r.base else r.base || '-' || r.n end
from ranked r
where v.id = r.id;

alter table visa_services
  alter column slug set not null,
  add constraint visa_services_slug_unique unique (slug),
  add constraint visa_services_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- New rows: pick the first free slug from the country name.
create or replace function public.set_visa_service_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_candidate text;
  v_n integer := 1;
begin
  if new.slug is not null then
    return new;
  end if;

  v_base := coalesce(nullif(public.slugify(new.country), ''), 'visa');
  v_candidate := v_base;
  while exists (select 1 from public.visa_services where slug = v_candidate) loop
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$$;

create trigger visa_services_set_slug
  before insert on visa_services
  for each row execute procedure public.set_visa_service_slug();

-- Content edits only: reordering and publish toggles don't change the page.
create or replace function public.set_visa_service_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger visa_services_set_updated_at
  before update of country, description, processing_time, price, requirements, photo_storage_path
  on visa_services
  for each row
  when (
    (old.country, old.description, old.processing_time, old.price, old.requirements, old.photo_storage_path)
    is distinct from
    (new.country, new.description, new.processing_time, new.price, new.requirements, new.photo_storage_path)
  )
  execute procedure public.set_visa_service_updated_at();
