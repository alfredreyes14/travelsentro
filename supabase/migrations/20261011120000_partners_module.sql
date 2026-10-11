-- Partners module -- makes the existing `partners` table
-- (20260727075208_create_homepage_content_schema.sql) the admin-managed
-- source for the homepage's Brand Partners and Corporate Clients logos,
-- replacing the public/logos/brand-partners and "corporate partners"
-- folders. Adds a display name, a published flag (public read becomes
-- published-only, mirroring visa_services), and a database-level guarantee
-- that a stored link is always an http(s) URL -- it is rendered as an href
-- on the public homepage.
--
-- The four can_manage_packages-gated authenticated policies are unchanged.

alter table partners
  add column name text,
  add column is_published boolean not null default true;

-- Rows may survive from before the homepage switched to folder-based
-- logos. They get a placeholder name and are hidden rather than deleted,
-- so nothing stale appears on the homepage and staff can review them in
-- the admin.
update partners set name = 'Untitled partner', is_published = false;

-- A pre-existing link that fails the new check below would abort the
-- migration, so clear any first.
update partners set link_url = null
  where link_url is not null and link_url !~* '^https?://';

alter table partners
  alter column name set not null,
  add constraint partners_name_not_blank check (length(trim(name)) > 0),
  add constraint partners_link_url_http check (
    link_url is null or link_url ~* '^https?://'
  );

drop policy "public read" on partners;

create policy "public read" on partners
  for select using (is_published = true);

create index partners_type_sort_idx on partners (partner_type, sort_order);
