# Upsell Popup — Design

## Purpose

Show visitors an admin-curated set of tour packages in a popup shortly
after their first page load on the public site, to surface packages they
might not otherwise browse to. Content (which packages, how many) is fully
admin-controlled, mirroring the existing `hero_slides` / `testimonials` /
`partners` admin-content pattern. No on-site checkout is involved — the
popup's only action is linking through to a package's detail page, same as
every other public CTA in this codebase.

## Scope

- New `upsell_items` table + RLS (additive migration, no existing tables
  touched).
- New "Upsell Popup" tab on `/admin/content` for adding/removing which
  packages appear.
- New client-side popup component mounted in the shared `(public)/layout.tsx`
  so it appears on every public route, not just the homepage.
- Out of scope: exit-intent or any other re-trigger mechanism, custom
  (non-package) promo content, scheduling/date-ranged campaigns, a
  site-wide on/off toggle (the feature is simply invisible when zero items
  are configured — same convention as the hero carousel's empty state).

## Data model

```sql
create table upsell_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (package_id)
);

alter table upsell_items enable row level security;

create policy "public read" on upsell_items
  for select using (true);

create policy "manage_packages can read all upsell_items" on upsell_items
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert upsell_items" on upsell_items
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete upsell_items" on upsell_items
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));
```

No `update` policy — the only mutations are insert (add a package) and
delete (remove one); there's nothing else on the row to edit. No
`sort_order` column: the public popup always shuffles items into a random
order on every appearance (client-side, see below), so a stored display
order would never be respected and isn't worth maintaining. `unique
(package_id)` prevents adding the same package twice.

This exactly mirrors `hero_slides`' RLS shape (unconditional public
`select`, `can_manage_packages`-gated writes via the existing
`has_permission()` helper) — purely additive, no changes to
`has_permission()` or any Phase 1–6 table/policy.

## Admin UI

New tab, **"Upsell Popup"**, added to the existing `Tabs` on
`app/admin/(dashboard)/content/page.tsx`, alongside Hero Slides and
Testimonials. The page's server component adds a third parallel query
(`upsell_items` joined with `packages(id, name, package_photos(...))`,
ordered by `created_at`) to the existing `Promise.all`, and a query for
published package options not already in the list (for the add-item
picker), reusing the same eligibility filter as the hero-slide package
picker (`is_published = true`, `deleted_at is null`).

`components/admin/content/upsell-items-list.tsx` (`UpsellItemsList`):
plain list (no drag-reorder — nothing depends on stored order), each row
showing the package's thumbnail/name/price, with a "Remove" button using
the existing `AlertDialog` delete-confirmation pattern. An "Add Item"
button opens a `Dialog` containing just a package `Select` (filtered to
published packages not already in the list) and a submit button — no
multi-field form needed, since there's nothing to fill in beyond which
package.

`actions/upsell-items.ts`, mirroring `actions/hero-slides.ts`'s shape:

- `addUpsellItem(packageId: string)` — `requirePermission("can_manage_packages")`,
  insert, `revalidatePath("/", "layout")` + `revalidatePath("/admin/content")`.
- `removeUpsellItem(id: string)` — same guard, delete, same two revalidates.

The `revalidatePath("/", "layout")` (not `revalidatePath("/")`) is
required because the popup renders in the shared public layout, not a
single page — layout-type revalidation busts every route under it in one
call, so an admin's add/remove is reflected across the whole public site
immediately rather than only on `/`.

## Public popup

### Data fetching

`app/(public)/layout.tsx` becomes an async Server Component with
`export const revalidate = 60`, matching the homepage's ISR/`createPublicClient()`
convention (cookie-free client so the route group stays statically
cacheable). It queries:

```
supabase
  .from("upsell_items")
  .select("id, packages(id, slug, name, duration_label, price_per_pax, discount_amount, is_published, deleted_at, package_photos(storage_path, display_order))")
  .order("created_at", { ascending: true })
```

then filters out any row whose `packages` came back `null` — the same
RLS-null-filtering pattern the homepage already uses for package-linked
hero slides, since `upsell_items` has unconditional public read but
`packages` does not, so an unpublished/soft-deleted package's row comes
back with `packages: null` under RLS and must be dropped before render.
Maps the result to a plain `UpsellItemDisplay[]` (id, slug, name,
photoUrl, durationLabel, pricePerPax, discountAmount) and renders
`<UpsellPopup items={...} />` once, alongside `<SiteHeader />` and
`{children}`.

### Trigger & session persistence

`components/upsell/upsell-popup.tsx` (`"use client"`):

- If `items.length === 0`, renders nothing (no popup for an empty
  catalog, no separate on/off flag needed).
- On mount: reads `sessionStorage.getItem("ts-upsell-seen")`. If already
  set, does nothing — the popup only ever shows once per browser session,
  full stop, regardless of how it was previously closed. If unset, starts
  a ~1.5s `setTimeout`, then on fire: shuffles `items` (Fisher–Yates) into
  local state, sets the sessionStorage flag, and opens the dialog. The
  `setTimeout` is cleared on unmount, so React Strict Mode's dev-only
  double-mount doesn't double-fire it.
- No re-trigger mechanism of any kind (no exit-intent, no random
  mid-session reappearance) — confirmed as the simplest, least-intrusive
  option during design.
- Because `(public)/layout.tsx` persists across client-side navigations
  in the App Router, the effect only re-runs on a full page load (new tab,
  hard refresh) — exactly "once per session," not once per route visited.

### Content & pagination

Built on the existing `components/ui/dialog.tsx` (Base UI-based —
focus-trap, Escape-to-close, and the close (X) button all come for free).
`DialogTitle` reads "You Might Also Like" (soft framing, not literal
"Upsell"). Each page shows one package: photo (`next/image`), name,
`duration_label`, and price — reusing a small new shared helper (e.g.
`lib/packages/format-price.ts`, extracted from `PackageCard`'s existing
inline discount-strikethrough logic so it isn't duplicated a second time)
— plus a "View Package" button linking to `/packages/${slug}`.

Prev/Next controls: ghost icon buttons (`ChevronLeft`/`ChevronRight` from
`lucide-react`, matching the icon style already used elsewhere in this
codebase) with a "{index + 1} / {items.length}" indicator between them.
Both controls are omitted entirely when `items.length <= 1`; otherwise
they're disabled (not looping) at the first/last item — manual
arrow-driven pagination, not an autoplaying carousel.

## Testing / rollout

No existing UI test-script convention to extend in this codebase (`scripts/verify-*.ts`
covers backend/webhook logic only) — verification is manual, via the dev
server, per this project's standard practice for frontend changes:

- Admin can add/remove packages in the new tab; popup reflects changes
  immediately across multiple public routes (not just `/`) after the
  `revalidatePath("/", "layout")` call.
- Fresh session: popup opens ~1.5s after first load, on any public route
  (home, packages list, package detail, contact).
- Does **not** reopen on client-side `Link` navigation within the same
  session; does reopen in a new tab / after clearing sessionStorage.
- Arrow pagination behaves correctly at both ends; controls hidden when
  only one item is configured; empty catalog renders no popup at all.
- Keyboard-only (Tab, Escape) and basic screen-reader pass via the
  existing Dialog primitives.
- No `prefers-reduced-motion` branch needed (no autoplay involved, unlike
  the hero carousel).
- Package photos already covered by `next.config.ts`'s existing remote
  image patterns — no config changes needed.
