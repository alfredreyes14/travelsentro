# Destinations — Design Spec

**Date:** 2026-08-07
**Status:** Approved by user, pending implementation plan.

## Summary

Add an admin-managed catalog of travel destinations (grouped as Local / International), surfaced on the homepage as a new "Destinations" section (placed after Featured Packages, before Testimonials). Clicking a destination tile links to `/packages?destination=<slug>`, which filters the existing packages list. Admins get full CRUD over destinations from the Packages admin area, including a photo, region, and an active/inactive toggle — with a guard that blocks disabling a destination while an active package still references it.

## Data Model

New table `destinations`:

```sql
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
```

`packages` gets one new nullable column:

```sql
alter table packages add column destination_id uuid references destinations(id);
```

Nullable because existing packages need to be backfilled and future packages may be created before a destination exists.

### Backfill

Seed 3 `destinations` rows for the existing packages (Palawan, Siargao, Banaue), all `region = 'local'`, then set each package's `destination_id` accordingly. Also seed placeholder rows with `is_active = true` and zero linked packages: one more local spot (Boracay) and 4 international placeholders (Japan, Thailand, South Korea, Singapore), so the homepage section has content in both groups from day one. Update `scripts/seed.ts` to match.

## Access Control

No new permission. RLS on `destinations` reuses the existing `can_manage_packages` boolean (same permission already gating `packages`, `hero_slides`, `partners`) — consistent with `.claude/CLAUDE.md`'s fixed 2-role/3-permission model, which explicitly says not to expand it.

Policies (mirrors `hero_slides` exactly):
- `"public read"` — `for select using (is_active = true)` — enforced in RLS itself, not just query-layer, matching the fix already applied to `packages` (`20260718140000_fix_public_read_rls_is_published.sql`).
- `"manage_packages can read all destinations"` — authenticated + `has_permission(auth.uid(), 'can_manage_packages')` — so the admin list can show inactive rows too.
- `"manage_packages can insert/update/delete destinations"` — same permission check, insert/update/delete.

## Business Rules

**Disable guard.** A `BEFORE UPDATE` trigger on `destinations` blocks the transition `is_active: true → false` when at least one package with `is_published = true and deleted_at is null` still has `destination_id` pointing at this row. Raises a Postgres exception with a descriptive message; the server action surfaces it as a form error (e.g. "Cannot disable — 2 active packages still use Palawan").

**Delete guard.** No special code needed — `destinations(id)` is referenced by `packages.destination_id` with default (RESTRICT) FK behavior, so Postgres itself blocks a hard delete while *any* package (active or not) still references the row. The server action catches the FK violation and surfaces a friendly error ("Remove or reassign packages using this destination first").

## Storage

Reuse the existing `site-content` bucket (already holds hero/testimonial/partner images per `20260727075208_create_homepage_content_schema.sql`) under a `destinations/` path prefix — no new bucket.

## Admin UI

New page: `app/admin/(dashboard)/packages/destinations/page.tsx`, gated by `requirePermissionOrRedirect("can_manage_packages")` (same as `/admin/packages`). Linked via a "Manage Destinations" button next to "Add Package" on the existing Packages list — no new sidebar entry, since this is package-domain data living alongside packages, not top-level content.

- List: name, region badge, active/inactive toggle, photo thumbnail, edit/delete actions. Mirrors `sortable-package-list.tsx` / `hero-slides-list.tsx` list conventions.
- Form (create + edit, shared component `components/admin/destination-form.tsx`): name, auto-derived slug (editable), region `Select` (Local / International), photo upload, active toggle. Mirrors `components/admin/content/hero-slide-form.tsx` structure (react-hook-form + zod, `Select`/`Controller` pattern).
- Server actions in new `actions/destinations.ts`: `createDestination`, `updateDestination`, `deleteDestination`, `toggleDestinationActive` — same `ActionResult` return shape and `requirePermission("can_manage_packages")` gate as `actions/packages.ts`.

## Package Form Change

`components/admin/package-form.tsx` + `package-form-schema.ts`: replace nothing (no field existed before) — add a `destinationId` optional field rendered as a `Select`, populated from active destinations only, passed into the form as a `destinations: DestinationOption[]` prop (fetched server-side in `app/admin/(dashboard)/packages/new/page.tsx` and `.../packages/[id]/page.tsx`), following the exact pattern `hero-slide-form.tsx` uses for its "Select a package" field. `actions/packages.ts` create/update payloads include `destination_id`.

## Public Site

**Homepage section** — new `components/homepage/destinations-section.tsx`, pure presentational (props: `local: DestinationDisplay[]`, `international: DestinationDisplay[]`), fetched server-side in `app/(public)/page.tsx` (`is_active = true`, ordered by `sort_order`) same as `FeaturedPackagesGrid`/`TestimonialsSection`. Each region group that's empty renders the existing skeleton/"coming soon" placeholder pattern (matches `testimonials-section.tsx`'s empty state). Tiles without a photo fall back to an icon-on-tint placeholder (MapPin icon), not a fake stock photo — matches the site's existing honest-placeholder convention. Section placed after `FeaturedPackagesGrid`, before `TestimonialsSection`.

**Filtering** — `/packages?destination=<slug>` (`app/(public)/packages/page.tsx` reads `searchParams`, joins/filters on `destinations.slug`). When filtered, H1 becomes "Packages in {name}" with a "Clear filter" link back to `/packages`. Zero-match state reuses the exact existing empty-state card already on that page — no new UI.

## Explicit Non-Goals

- No bulk drag-reorder for destinations in v1 (packages has this; destinations' `sort_order` can be set via the form only, added later if the list grows).
- No destination detail/landing page beyond the tile + filtered `/packages` view.
