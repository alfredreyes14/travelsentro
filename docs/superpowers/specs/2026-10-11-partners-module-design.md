# Partners Module — Design

## Purpose

Let staff manage the homepage's **Brand Partners** and **Corporate Clients**
logos from the admin panel instead of from files in the repo, and let each
logo carry a link so a visitor who clicks it lands on that partner's
official website.

Today both groups are read straight out of `public/logos/brand-partners`
and `public/logos/corporate partners` by `lib/logos/read-logo-folder.ts`.
Adding, removing or reordering a logo needs a code change and a deploy, and
there is nowhere to store a link.

Success looks like: a staff member with the "manage packages" permission
opens **Partners** in the admin sidebar, adds a logo with a name and a
website link under either tab, and within a minute the logo is on the
homepage and clicking it opens the partner's site in a new tab.

## Scope

- New admin page `/admin/partners` with two tabs, Brand Partners and
  Corporate Clients: add, edit, reorder, show/hide, delete.
- Additive migration on the existing `partners` table.
- Homepage reads these two groups from the database and renders linked
  logos as anchors.
- One-off seed script that moves the 4 logos currently on the site into
  R2 and the table.

Out of scope:

- **Airlines** and **Travel Partners** — they keep reading from
  `public/logos/airlines` and `public/logos/operators` exactly as today.
- Click tracking on partner logos.
- Deleting the R2 object when a partner row is deleted (same accepted
  orphan limit documented in `actions/site-content-uploads.ts`).
- `voucher_partners` (the Vouchers module's own partner list) — unrelated
  and untouched.
- A new permission toggle — the module reuses `can_manage_packages`, the
  same permission that gates `/admin/content`.

## Data model

The `partners` table already exists
(`20260727075208_create_homepage_content_schema.sql`) with
`partner_type in ('brand_partner', 'corporate_client')`,
`logo_storage_path`, `link_url`, `sort_order`, and
`can_manage_packages`-gated write policies. Nothing has read it since the
homepage switched to folder-based logos. It is reused, not replaced.

New migration `supabase/migrations/20261011120000_partners_module.sql`:

```sql
-- Rows may survive from before the homepage switched to folder-based
-- logos. They get a placeholder name and are hidden rather than deleted,
-- so nothing stale appears on the homepage and staff can review them in
-- the admin.
alter table partners
  add column name text,
  add column is_published boolean not null default true;

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
```

The four authenticated policies (read-all/insert/update/delete for
`can_manage_packages`) are unchanged.

`link_url` stays nullable: the link is optional. The `^https?://` check is
the database-level guarantee that a stored link can never be a
`javascript:` or other non-web URL, independent of any application code.

`sort_order` is scoped per `partner_type` — each tab orders its own rows
from 0.

`types/database.ts` is updated to match (`name`, `is_published` on
`partners` Row/Insert/Update).

## Link handling

One pure helper, `lib/partners/link.ts`:

- `normalizePartnerLink(input: string):
  { ok: true; url: string | null } | { ok: false }` — trims the input.
  An empty string is valid and yields `url: null`. Input with no scheme
  gets `https://` prepended (so `paynamics.com` becomes
  `https://paynamics.com`). The result is `ok: true` only if it parses
  with `new URL()`, its protocol is `http:` or `https:`, and its hostname
  contains a dot; anything else (including `javascript:` and `mailto:`
  links) is `ok: false`.

It is used in two places so the rule lives once:

- the form schema (client-side validation message: "Enter a valid website
  address, e.g. https://example.com"),
- the server action, which re-validates because Server Action arguments
  are not type-checked at the network boundary.

## Admin UI

### Navigation and page

- `components/admin/admin-nav.tsx`: new item `{ href: "/admin/partners",
  label: "Partners", icon: HandshakeIcon, show: canManagePackages }`,
  placed after Destinations. No new prop — it reuses `canManagePackages`.
- `app/admin/(dashboard)/partners/page.tsx`: server component. Calls
  `requirePermissionOrRedirect("can_manage_packages")`, loads all
  `partners` rows ordered by `sort_order`, splits them by `partner_type`,
  and renders a `PageHeader` ("Partners" / "Manage the Brand Partners and
  Corporate Clients logos shown on the homepage, and where each one
  links.") over a two-tab `Tabs` (tab values are the partner types,
  `brand_partner` default), each tab holding one `PartnersList`. Tabs use
  `keepMounted` like `/admin/content`.
- `app/admin/(dashboard)/partners/loading.tsx`: skeleton, matching the
  other module pages.

### Components (`components/admin/partners/`)

- `partner-form-schema.ts` — zod schema:
  - `name`: trimmed, required ("Please enter a name").
  - `logoStoragePath`: required ("Please upload a logo"). The form
    rejects files that are not SVG/PNG/JPG/WebP or are over 2 MB before
    uploading.
  - `linkUrl`: optional string, validated through `normalizePartnerLink`.
  - `isPublished`: boolean.
- `partner-form.tsx` — `PartnerForm`, one component for both add and edit
  (an optional `partner` prop means edit). Takes `partnerType` as a prop (the tab decides
  the type; it is not a user-editable field). Fields in order: Name, Logo
  (file input, `accept="image/svg+xml,image/png,image/jpeg,image/webp"`,
  preview thumbnail with `object-contain` on a white tile so transparent
  logos stay legible), Website link (optional, `type="url"`,
  placeholder `https://example.com`, description "Visitors who click the
  logo are taken here. Leave blank for a logo that isn't clickable."),
  and a "Show on the homepage" switch.
- `partners-list.tsx` — `PartnersList({ partnerType, initialItems })`,
  same composition as `visa-services-list.tsx`: Dialog-wrapped add/edit
  form, dnd-kit drag-reorder, per-row optimistic visibility `Switch`,
  `AlertDialog`-confirmed delete. Each row shows the logo thumbnail, the
  name, and the link (as muted text, or "No link" when blank). Copy
  (button labels, empty state, delete confirmation) is driven by a small
  per-type label map so the two tabs read "Brand Partner" / "Corporate
  Client" correctly.

### Server actions (`actions/partners.ts`)

Mirrors `actions/visa-services.ts`. Every action starts with
`requirePermission("can_manage_packages")` and ends with
`revalidatePath("/")` + `revalidatePath("/admin/partners")`.

- `createPartner(partnerType, values)` — validates `partnerType` against
  the two allowed values and `values` against the schema, normalizes the
  link, appends at that partner type's highest `sort_order` + 1 (not a
  row count, so adding after a delete cannot collide).
- `updatePartner(id, values)` — same validation; does not change
  `partner_type`.
- `togglePartnerPublished(id, isPublished)`.
- `deletePartner(id)`.
- `reorderPartners(order)` — persists a client-computed order for one tab.

Failures return the same generic `ActionResult` error message the other
content actions use.

### Uploads

`actions/site-content-uploads.ts`:

- Add `"partners"` to `ALLOWED_FOLDERS`.
- Fix `extensionFromMimeType` so `image/svg+xml` yields `svg` (today it
  would yield `svg+xml`). This matters beyond tidiness: `next/image` only
  auto-applies `unoptimized` when the `src` ends in `.svg`, and without
  that an SVG served from R2 is rejected by the image optimizer.

SVGs are only ever rendered through `<img>` (via `next/image`), where
embedded scripts do not run. Uploads are limited to authenticated users
with `can_manage_packages`. No SVG sanitizing is added.

## Public homepage

`app/(public)/page.tsx`:

- Add one query to the existing `Promise.all`:
  `partners` → `select("id, partner_type, name, logo_storage_path,
  link_url")`, ordered by `sort_order`. The anon client's RLS policy
  already limits it to published rows.
- Map rows to the logo display shape and split by `partner_type`. An
  error is logged and treated as an empty list, like the other sections.
- Remove the `readLogoFolder("brand-partners")` and
  `readLogoFolder("corporate partners")` calls. Airlines and operators
  keep theirs.

Display shape — `LogoFile` in `lib/logos/read-logo-folder.ts` gains an
optional `href?: string`:

- `id` = row id, `src` = `getPublicImageUrl(logo_storage_path)`,
  `alt` = `name`, `href` = `link_url ?? undefined`.

New `components/homepage/partner-logo.tsx` — `PartnerLogo({ logo })`:
renders the existing `FadeImage` (same sizes and classes as today), and
when `logo.href` is set wraps it in

```tsx
<a
  href={logo.href}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={`Visit ${logo.alt}'s website (opens in a new tab)`}
>
```

with a visible focus ring and a subtle hover opacity change. A logo
without a link renders exactly as it does now.

`PartnerLogo` replaces the inline `FadeImage` in two places: the
non-marquee branch of `LogoGroup` in `partner-affiliations.tsx` (Brand
Partners) and the grid in `corporate-clients.tsx`. `logo-marquee.tsx` is
untouched. Section headings, layout and the "coming soon" placeholders are
unchanged.

Caching: the homepage keeps `revalidate = 60`; every partner action also
calls `revalidatePath("/")`, so admin changes show up immediately.

Clean-up: `public/logos/brand-partners` and `public/logos/corporate
partners` are deleted. `next.config.ts`'s `outputFileTracingIncludes`
stays (Airlines and Travel Partners still need it); its comment and the
doc comments in `read-logo-folder.ts`, `partner-affiliations.tsx` and
`corporate-clients.tsx` are updated to say which groups are folder-based
and which are admin-managed.

## Seeding the existing logos

`scripts/seed-partner-logos.ts`, run with `npm run seed:partners`
(`tsx --env-file=.env.local scripts/seed-partner-logos.ts`), following
`scripts/seed.ts`'s conventions (service-role client, WebSocket polyfill,
`uploadObject` from `lib/storage/r2-client.ts`).

Source files are copied to `supabase/seed-assets/partner-logos/` so the
script does not depend on `public/`:

| File | Type | Name |
|------|------|------|
| `brand-partners/dna.svg` | `brand_partner` | DNA |
| `brand-partners/fl.svg` | `brand_partner` | FL |
| `corporate-clients/sga.svg` | `corporate_client` | SGA |
| `corporate-clients/paynamics.png` | `corporate_client` | Paynamics |

For each entry: skip if a row already has its storage key, or the same
`partner_type` and `name` (so the script is safe to re-run, including
after staff rename a seeded partner); otherwise upload to the fixed key
`partners/seed-<type>-<basename>` in R2 and insert the row with
`link_url` null, `is_published` true and `sort_order` after the type's
current last row. The script
prints the Supabase host it is about to write to before doing anything.

Names are derived from the filenames; staff rename them and add the
website links in the admin afterwards.

## Rollout

Migrations are pushed by `.github/workflows/supabase-migrations.yml` on
push to `staging`/`master`, at the same moment Vercel deploys. To avoid
the two sections showing their "coming soon" placeholder in between, the
work ships as two pushes per environment:

1. **Push A** — migration, types, actions, admin page, nav item, upload
   changes, seed script and seed assets. The homepage still reads the
   folders, so nothing changes publicly.
2. Run `npm run seed:partners` against that environment.
3. **Push B** — homepage reads from the database; the two `public/logos`
   folders are deleted.

## Error handling

- Admin mutations: generic toast on failure, optimistic changes (toggle,
  reorder) rolled back, matching `visa-services-list.tsx`.
- Homepage: a failed `partners` query logs and renders both groups as
  empty (placeholder message), never a page error.
- A logo whose link is blank or was cleared is simply not clickable.

## Verification

The repo has no test runner, so verification is `npm run lint`,
`npm run build`, and a browser pass on a scratch copy served on port 3100
(the user's own dev server stays on 3000):

- In each tab: add with and without a link, edit, drag-reorder, hide,
  delete; confirm the other tab is unaffected.
- A link typed as `example.com` is saved as `https://example.com`; a
  `javascript:` link is rejected by the form, and by the action when
  called directly.
- An SVG and a PNG logo both render on the homepage.
- A linked logo opens the partner site in a new tab; an unlinked logo is
  not an anchor.
- A hidden partner is absent from the homepage.
- A Staff user without `can_manage_packages` does not see the nav item
  and is redirected to `/admin/forbidden` from `/admin/partners`.
- Airlines and Travel Partners marquees still render.
- `npm run seed:partners` creates 4 rows on first run and 0 on the second.
