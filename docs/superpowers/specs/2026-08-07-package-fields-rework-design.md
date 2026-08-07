# Package Fields Rework & Admin UX Round 2 — Design Spec

**Date:** 2026-08-07
**Status:** Approved by user, pending implementation plan.

## Summary

A batch of changes to the package data model and admin package form: remove Best Time to Go / Group Size, remove Duration (Days) in favor of a required free-text duration label, make Destination required, replace the "From Price" concept with "Price per pax" plus an optional fixed-amount discount, add a plain-text Remarks field, add a repeatable Travel Dates list (each optionally carrying an additional fee), auto-generate a unique `TSP-000001`-style package code that replaces the current human-readable URL slug, and let admins add photos to a brand-new package before filling in the rest of its details. Public site pages (package card, detail page, URLs) are updated to match. A second, broader admin UI/UX polish pass applies the primitives already built in the round-1 forms/tables polish plan across every sidebar-linked admin page.

## Data Model

### `packages` table changes

```sql
alter table packages drop column duration_days;
alter table packages alter column duration_label set not null; -- after backfill, see Migration Notes
alter table packages rename column from_price to price_per_pax;
alter table packages add column discount_amount numeric check (discount_amount is null or discount_amount >= 0);
alter table packages add column remarks text;
alter table packages add constraint packages_destination_required_if_published
  check (not is_published or destination_id is not null);
```

- `destination_id` stays a **nullable** FK. The new check constraint is what makes destination "required" in practice: a draft (`is_published = false`) may have no destination, but a package can never transition to `is_published = true` without one. This is what allows the auto-created draft (see Photos-Before-Save Flow) to exist before the admin has picked anything.
- `duration_label` becomes the only duration field — free text (e.g. "3 Days 2 Nights"), required at the app/zod layer on every real save. Not made `NOT NULL` at the DB level for the same draft-creation reason as destination, kept simple and consistent with how itinerary/inclusions arrays are already only validated at the app layer.
- `discount_amount` is a fixed PHP amount off `price_per_pax`, optional. Zod validation additionally requires `discount_amount < price_per_pax` when present, so a package can never show a negative or zero effective price.
- `remarks` is plain text (no rich text editor — same as an itinerary day's description field), optional.

### Drop `faq_facts`

The `faq_facts` table (`package_id` 1:1, `best_time_to_go`, `group_size`) is dropped entirely — those were its only two content columns, and both are being removed. `write_package_children()` (the atomic child-write RPC) is updated to stop touching `faq_facts`.

### New `package_travel_dates` table

```sql
create table package_travel_dates (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  travel_date date not null,
  additional_fee numeric check (additional_fee is null or additional_fee >= 0),
  created_at timestamptz not null default now()
);
```

RLS mirrors `package_photos`/`itinerary_days`: public read for rows whose parent package is published and not soft-deleted; write gated by `can_manage_packages`. At-least-one-row-per-package is enforced at the app layer (zod `min(1)` on the form array) and inside `write_package_children()`, the same pattern already used for itinerary days — not a DB constraint, since the same draft-creation exception applies.

`write_package_children()` is extended to atomically replace `package_travel_dates` rows alongside itinerary/inclusions in the same transaction.

### Package code / slug generation

The existing `slug` column (already `unique not null`) stops being user-editable and stops being derived from the package name. A Postgres sequence + trigger generates it at insert time:

```sql
create sequence package_code_seq start 1;

create function generate_package_code() returns trigger as $$
begin
  new.slug := 'TSP-' || lpad(nextval('package_code_seq')::text, 6, '0');
  return new;
end;
$$ language plpgsql;

create trigger packages_set_code before insert on packages
  for each row execute function generate_package_code();
```

Any client-supplied `slug` value is ignored/overwritten by the trigger. This becomes the actual public URL segment (`/packages/TSP-000001`), replacing today's readable slugs (`/packages/boracay-getaway`). Since the site has no indexed public traffic yet, no legacy-URL/redirect handling is planned.

### Destinations seed data

Since `destination_id` is being made required-to-publish, seed real destination rows now (photos left `null` — no real image assets exist yet; uploaded later via the existing Destinations admin page, which already supports an optional photo):

- **Local:** Boracay, El Nido (Palawan), Cebu, Bohol, Baguio, Tagaytay, Siargao, Davao
- **International:** Japan, China, South Korea, Malaysia, Thailand, Singapore, Taiwan, Hong Kong

### Migration notes (data backfill)

- `duration_label`: any existing rows with a null label get backfilled from their (soon-to-be-dropped) `duration_days` value (e.g. `'{n} days'`) before the column drop, so no data is silently lost.
- `destination_id` / publish check: since the `destinations` table and `packages.destination_id` column were only added earlier today with no backfill, most/all existing packages likely have `destination_id = null`. Before adding the publish-check constraint, the migration must verify no currently-*published* package has a null `destination_id` — if any exist, either assign them a real destination (best-effort match) or unpublish them, whichever the actual data at implementation time calls for. This is a data-dependent step to verify during implementation, not a design blocker.

## Photos-Before-Save Flow

Today, the Photos tab only renders once a package has a real id, so new packages must be saved once before photos can be added. Going forward:

- Opening "New Package" immediately creates a draft package server-side — `name: "Untitled Package"`, `is_published: false`, auto-generated slug, `destination_id: null` — then redirects to `/admin/packages/[id]`, the existing edit page.
- This collapses the form down to effectively one flow (`updatePackage`) instead of separate create/update paths — the "New Package" button's job is just to create the draft and redirect; everything after that is editing. Full validation (destination, duration, ≥1 travel date, etc.) applies on every real save from then on.
- Abandoned untouched drafts sit in the packages list as unpublished rows, deletable via the existing soft-delete action — no extra cleanup job.

## Admin UI

`components/admin/package-form.tsx` grows from 4 to 5 tabs:

1. **Details** — name, destination (required `Select`, no longer optional), price per pax, discount (optional), duration (free text, required), remarks (plain `Textarea`). The package code (e.g. "TSP-000001") is shown read-only near the title instead of a slug input.
2. **Travel Dates** (new) — repeatable date + optional-fee rows, same numbered-card / confirm-before-remove pattern the round-1 polish plan already applied to Itinerary. "Add travel date" button; at least one row required.
3. **Itinerary** — unchanged.
4. **Photos** — unchanged, now always usable immediately (draft always has an id).
5. **Inclusions** (renamed from "Inclusions & FAQ") — inclusions/exclusions/what-to-bring only; Best Time to Go and Group Size fields are removed.

`TAB_FIELD_MAP` is updated so validation errors on the new required fields (destination, duration, travel dates) jump to the correct tab.

`components/admin/package-form-schema.ts` changes accordingly: drop `durationDays`, `bestTimeToGo`, `groupSize`; rename `fromPrice` → `pricePerPax`; drop `slug` as a user-editable field; add `discountAmount` (optional, `< pricePerPax`), `remarks` (optional), `destinationId` (now required), `durationLabel` (now required), `travelDates` (array, `min(1)`, each `{ date, additionalFee? }`).

## Public Site

- **Package card & detail page:** "From ₱X" becomes "₱X / pax". When `discount_amount` is set, show the original price struck through next to the discounted price.
- **Detail page:** `TripFacts`'s "Best Time to Go" and "Group Size" accordions are removed. New sections are added: **Remarks** (plain paragraph, preserving line breaks) and **Travel Dates** (list of upcoming dates, calling out any with an additional fee).
- **URLs:** `/packages/[slug]` now resolves `TSP-000001`-style codes instead of readable slugs.
- Destination is not currently rendered anywhere on the detail page (only used for the list-page filter link) — left as-is, no new UI added there, to stay within scope.

## Admin UI/UX Round 2

Scoped to every page reachable from the sidebar (Dashboard, Packages, Destinations, CRM, Content — hero slides/partners/testimonials, Users, Account): apply the primitives already built in the round-1 forms/tables polish plan (`FormSection`, `FormActionBar`, `DataTableToolbar`) plus a shared page-header/spacing wrapper anywhere gaps are currently inconsistent, so every page shares the same visual rhythm. This is separate from, and does not touch, the nav/sidebar rework already in progress (uncommitted) in the working tree.

## Explicit Non-Goals

- No rich text editor for Remarks (reconsidered during design — plain textarea only, matching the itinerary description field).
- No legacy-slug redirect handling for the URL format change (no indexed public traffic yet).
- No new public-facing display of destination beyond the existing list-page filter link.
- No automated cleanup job for abandoned draft packages (manual delete via existing UI is sufficient).
- No changes to the in-progress admin nav/sidebar rework already sitting uncommitted in the working tree.
