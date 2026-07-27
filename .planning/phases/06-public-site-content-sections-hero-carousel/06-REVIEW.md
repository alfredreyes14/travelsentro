---
phase: 06-public-site-content-sections-hero-carousel
reviewed: 2026-07-27T12:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - actions/hero-slides.ts
  - actions/partners.ts
  - actions/site-content-uploads.ts
  - actions/testimonials.ts
  - actions/value-props.ts
  - app/(public)/page.tsx
  - app/admin/(dashboard)/content/page.tsx
  - app/admin/(dashboard)/layout.tsx
  - components/admin/content/hero-slide-form-schema.ts
  - components/admin/content/hero-slide-form.tsx
  - components/admin/content/hero-slides-list.tsx
  - components/admin/content/partner-form-schema.ts
  - components/admin/content/partner-form.tsx
  - components/admin/content/partners-list.tsx
  - components/admin/content/star-rating-input.tsx
  - components/admin/content/testimonial-form-schema.ts
  - components/admin/content/testimonial-form.tsx
  - components/admin/content/testimonials-list.tsx
  - components/admin/content/value-prop-form-schema.ts
  - components/admin/content/value-prop-form.tsx
  - components/admin/content/value-props-list.tsx
  - components/homepage/brand-partners.tsx
  - components/homepage/corporate-clients.tsx
  - components/homepage/featured-packages-grid.tsx
  - components/homepage/hero-carousel.tsx
  - components/homepage/testimonials-section.tsx
  - components/homepage/why-choose-us.tsx
  - components/ui/avatar.tsx
  - lib/read-file-as-base64.ts
  - supabase/migrations/20260727075208_create_homepage_content_schema.sql
  - types/database.ts
findings:
  critical: 0
  critical_fixed: 2
  warning: 5
  info: 3
  info_fixed: 1
  total: 11
status: fixed
---

> **Post-review fix (2026-07-27, commit `1a7b70e`):** CR-01 and CR-02 (both BLOCKER) and IN-04 were fixed directly by the orchestrator before phase verification, since they broke core admin functionality (promo hero slides could never save; all 4 admin content lists silently failed to show new/edited items without a hard reload). See "Fixed" notes inline below. WR-01 through WR-05, IN-01, IN-02, IN-03 remain open as non-blocking advisories.

# Phase 6: Code Review Report

**Reviewed:** 2026-07-27T12:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Reviewed the hero carousel + 4 new admin-editable homepage content types (hero slides, value props, testimonials, brand partners/corporate clients), their shared upload utility, the new `hero_slides`/`value_props`/`testimonials`/`partners` schema + RLS + `site-content` Storage bucket migration, and the public homepage assembly.

The already-flagged `hero-carousel.tsx` ref-during-render bug (commit `2ed6ad5`) is fixed correctly — `useState(() => Autoplay(...))` with a lazy initializer, read during render, is the right pattern, and no equivalent `useRef`-read-during-render pattern exists elsewhere in the new files. RLS is correctly public-read / `can_manage_packages`-gated write on all 4 new tables, and Brand Partners vs. Corporate Clients are genuinely two independent queries/components with separate empty-state checks (no shared "any partner" check) as required.

However, two BLOCKER-level defects were found that break core admin functionality: (1) creating or editing a **promo**-type hero slide will always fail at the database layer because the empty-string `packageId` default is never coalesced away before being sent to a `uuid` column with a `NOT NULL`-shape `CHECK` constraint, and (2) the Hero Slides / Value Props / Testimonials / Partners admin lists rely on `router.refresh()` to reflect newly created/edited rows, but since their `items` are held in local `useState(initialItems)` (only read, never re-synced to updated props), a successful create/edit shows a success toast while the new/changed row silently fails to appear until a hard page reload. Partners additionally never calls `router.refresh()` at all.

## Critical Issues

### CR-01: Promo-type hero slides can never be created or edited — `packageId` empty string violates the `uuid` column's shape constraint

**FIXED** (commit `1a7b70e`): `createSlide`/`updateSlide` now use `values.packageId || null` instead of `?? null`.

**File:** `actions/hero-slides.ts:39-52` (createSlide), `actions/hero-slides.ts:76-89` (updateSlide)
**Issue:**
`hero_slides.package_id` is a `uuid` column with `constraint hero_slides_package_shape check ((slide_type = 'package' and package_id is not null) or (slide_type = 'promo' and package_id is null))` (see `supabase/migrations/20260727075208_create_homepage_content_schema.sql:32-35`).

`createSlide`/`updateSlide` compute `package_id: values.packageId ?? null`. The `??` operator only coalesces `null`/`undefined` — it does **not** coalesce an empty string.

The form always supplies `packageId: ""` as a default for both create (`components/admin/content/hero-slide-form.tsx:102-110`, `CreateHeroSlideForm`'s `defaultValues`) and edit (`components/admin/content/hero-slide-form.tsx:141-151`, `EditHeroSlideForm`'s `defaultValues: { ...packageId: slide.packageId ?? "" }`). When `slideType === "promo"`, the `packageId` field is never rendered (`hero-slide-form.tsx:267-291` only renders the package `Select` when `slideType === "package"`), so its react-hook-form value is never changed away from `""`.

Consequently, submitting a promo slide (create or edit — including re-saving an *existing* promo slide untouched) sends `package_id: ""` to Postgres. `""` is not a valid `uuid` literal, so Postgres will reject the insert/update with an `invalid input syntax for type uuid` error before the CHECK constraint is even evaluated. The action then returns the generic `{ ok: false, error: GENERIC_ERROR_MESSAGE }`, so every promo-slide create/edit will visibly fail with no useful diagnostic — this is not an edge case, it is the default/only path for the "Promo" slide type.

**Fix:**
```ts
// actions/hero-slides.ts
package_id: values.packageId || null,   // "" is falsy too, so this coalesces it
```
or more explicitly:
```ts
package_id: values.packageId ? values.packageId : null,
```
Apply the same fix to both `createSlide` and `updateSlide`.

### CR-02: Admin content lists don't reflect newly created/edited items without a hard page reload

**FIXED** (commit `1a7b70e`): All 4 lists now adjust `items` state during render when `initialItems`/`initialSlides` changes (React's documented "adjusting state when a prop changes" pattern — a `useEffect`-based sync was tried first but rejected by this project's `react-hooks/set-state-in-effect` lint rule). `partners-list.tsx` also gained the missing `router.refresh()` call in `handleMutationSuccess`.

**File:**
`components/admin/content/hero-slides-list.tsx:83,101-105`,
`components/admin/content/testimonials-list.tsx:56,66-70`,
`components/admin/content/value-props-list.tsx:53,63-67`,
`components/admin/content/partners-list.tsx:98,106-109`

**Issue:**
Each of these lists initializes `const [items, setItems] = useState(initialItems)` and renders from `items`, never from the `initialItems`/`initialBrandPartners`/etc. prop directly. `useState`'s initializer argument is only consumed on the component's first mount — React does not re-run it when the parent passes a new prop value on a later render.

On create/edit success, each list's `handleMutationSuccess` only closes the dialog and calls `router.refresh()` (which re-runs the Server Component and passes fresh `initialItems` as a **new prop**, per Next.js's documented "refetch without losing client state" behavior). Because client state is explicitly *not* reset by `router.refresh()`, the already-mounted list component keeps its stale `items` state — the new prop value is never copied into `items`. The result: after adding a hero slide/value prop/testimonial/partner, the success toast fires, the dialog closes, but the new item does not appear in the list until the browser is fully reloaded (a real navigation that remounts the component). The same applies to edits — an edited row's title/description/rating/logo will keep showing the pre-edit values.

(Delete works correctly because it uses a local optimistic `setItems((current) => current.filter(...))`, which doesn't depend on the stale-prop issue.)

`components/admin/content/partners-list.tsx` compounds this: it has no `useRouter`/`router.refresh()` call anywhere (unlike its 3 siblings), so even the underlying data refetch never happens — `handleMutationSuccess` (line 106) only closes dialogs.

**Fix:** Sync local state to the prop on every relevant change (or drop the local copy entirely for the non-drag-orderable lists, since only Hero Slides needs local state for drag reordering):
```tsx
useEffect(() => {
  setItems(initialItems);
}, [initialItems]);
```
And for `partners-list.tsx`, add the missing `router.refresh()` call to `handleMutationSuccess`:
```tsx
import { useRouter } from "next/navigation";
// ...
const router = useRouter();
function handleMutationSuccess() {
  setIsCreateOpen(false);
  setEditingItem(null);
  router.refresh();
}
```

## Warnings

### WR-01: Hero slide package picker silently excludes the currently-linked package once it's unfeatured/unpublished

**File:** `app/admin/(dashboard)/content/page.tsx:68`, `components/admin/content/hero-slide-form.tsx:267-291`
**Issue:** The package picker options query (`.eq("is_featured", true).eq("is_published", true).is("deleted_at", null)`) only returns packages that *currently* qualify. If an admin creates a package-type hero slide, then later unfeatures/unpublishes that package, editing the existing slide will render a `Select` with no matching `SelectItem` for the stored `packageId` — the dropdown silently shows the placeholder instead of the actual linked package, misleading the admin about what's actually configured (though the value itself is preserved in form state and won't be lost on submit unless the admin explicitly changes the selection).
**Fix:** Either always include the currently-linked package as an extra option (e.g. a server-side `UNION`/second query keyed on the slide's existing `package_id`s), or surface an explicit "this package is no longer featured/published" notice in the edit form instead of a blank picker.

### WR-02: `HeroCarousel`'s doc comment claims "pauses on hover/focus" but only hover is wired

**File:** `components/homepage/hero-carousel.tsx:27-31,55-56`
**Issue:** The comment states the carousel "autoplays every 5s ... pauses on hover/focus", but only `onMouseEnter`/`onMouseLeave` are attached to `plugin.stop()`/`plugin.reset()`. There is no `onFocus`/`onBlur` handling, so a keyboard user tabbing onto the Previous/Next controls (or any focusable element inside a slide) does not pause autoplay — only mouse hover does. This is both a doc/code mismatch and a partial gap against the WCAG 2.2.2 goal the comment itself cites.
**Fix:** Add `onFocus={() => plugin.stop()}` / `onBlur={() => plugin.reset()}` to the `Carousel` (or its focusable descendants), or correct the comment to say "hover only" if focus-pause is intentionally out of scope.

### WR-03: `uploadSiteContentImage` has no server-side file size or MIME-type validation

**File:** `actions/site-content-uploads.ts:32-53`
**Issue:** The action decodes and uploads whatever `base64`/`type` the client sends, with no cap on decoded buffer size and no allowlist of acceptable image MIME types (the `accept="image/*"` attribute on the `<input type="file">` in the calling forms is a client-side hint only and is trivially bypassed). A permissioned admin (or anyone able to invoke this Server Action directly with a crafted request) could upload arbitrarily large payloads or non-image files (e.g. `image/svg+xml` containing an inline `<script>`) into the public `site-content` bucket with an attacker-controlled `contentType`.
**Fix:** Validate `file.type` against an explicit allowlist (`image/jpeg`, `image/png`, `image/webp`, etc. — excluding `image/svg+xml`) and reject/cap `buffer.length` above a reasonable size (e.g. 5MB) before calling `.upload()`.

### WR-04: `linkUrl`/`externalLink` accept arbitrary non-URL strings

**File:** `components/admin/content/partner-form-schema.ts:12`, `components/admin/content/hero-slide-form-schema.ts:16,31`
**Issue:** Both schemas type these fields as plain `z.string().optional()` with no `.url()` refinement. The forms also set `noValidate` on the `<form>` element (`partner-form.tsx:203`, `hero-slide-form.tsx:243`), which disables the browser's native `type="url"` validation. A user can therefore save `linkUrl`/`externalLink` as non-URL text (e.g. `"asdf"`), and the public homepage will render `<a href="asdf" target="_blank">` for that partner/promo-slide CTA — a broken link with no validation anywhere in the pipeline.
**Fix:** Add `.url("Please enter a valid URL").optional().or(z.literal(""))` (or equivalent) to both schemas.

### WR-05: `uploadSiteContentImage`'s `folder` parameter has no runtime validation

**File:** `actions/site-content-uploads.ts:32-34`
**Issue:** `folder: "hero-slides" | "testimonials" | "partners"` is only a compile-time TypeScript restriction. Server Actions are callable as a direct network RPC, so a client that bypasses the generated TS wrapper can pass any string for `folder`, which is interpolated directly into the storage path (`` `${folder}/${Date.now()}-...` ``) with no runtime allowlist check. Given the caller must already hold `can_manage_packages`, the blast radius is limited to writing into unexpected virtual "folders" within the same public bucket, but there's no defense-in-depth check matching the TS-level restriction.
**Fix:** Validate `folder` against the literal union at runtime, e.g. `z.enum(["hero-slides", "testimonials", "partners"]).parse(folder)`, before building `storagePath`.

## Info

### IN-01: Redundant/dead RLS `SELECT` policies on all 4 new tables

**File:** `supabase/migrations/20260727075208_create_homepage_content_schema.sql:43-44,73-74,105-106,137-138`
**Issue:** Each table gets both `"public read" for select using (true)` (applies to every role, including `authenticated`) and `"manage_packages can read all X" for select to authenticated using (has_permission(...))`. Since Postgres RLS OR's multiple permissive policies for the same command, and `"public read"` is already unconditional, the second `SELECT` policy is entirely redundant — it never grants any access the first policy didn't already grant. (This differs from `packages`, where `"public read"` is scoped to `is_published = true`, making its analogous `"manage_packages can read all packages"` policy meaningful.) Not a security issue, but dead/misleading policy definitions that could confuse future maintainers into thinking read access is more restricted than it is.
**Fix:** Either drop the 4 redundant `SELECT` policies, or scope `"public read"` more narrowly if a future draft/publish workflow is anticipated for these content types.

### IN-02: `deleteSiteContentImage` is exported but never called anywhere

**File:** `actions/site-content-uploads.ts:64-80`
**Issue:** No caller of `deleteSiteContentImage` exists anywhere in `app/`, `components/`, or `actions/`. The doc comment above it acknowledges this ("NOT chained from deleteSlide/deleteTestimonial/deletePartner in this phase"), but as written it's currently unreachable dead code shipped to production.
**Fix:** Either wire it into the admin "replace/remove image" UX it was written for, or remove it until that UX exists.

### IN-03: `extensionFromMimeType` produces malformed extensions for compound MIME subtypes

**File:** `actions/site-content-uploads.ts:16-19`
**Issue:** `type.split("/")[1]` for `"image/svg+xml"` yields `"svg+xml"`, producing a storage path like `hero-slides/171-abcd12.svg+xml`. Harmless today only because WR-03's missing MIME allowlist means such types can even reach this function; fixing WR-03 to reject `image/svg+xml` also fixes this, but the function itself is fragile for any future compound subtype.
**Fix:** Map to an explicit extension table (`{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}`) rather than deriving from the raw MIME subtype.

### IN-04: Optional `text` fields stored as empty string rather than `NULL`

**FIXED** (commit `1a7b70e`): both files now use `|| null` instead of `?? null`.

**File:** `actions/partners.ts:41,73`, `actions/testimonials.ts:44,73`
**Issue:** `link_url: values.linkUrl ?? null` and `photo_storage_path: values.photoStoragePath ?? null` have the same `??`-vs-empty-string gap as CR-01, but since these are nullable `text` columns (no `CHECK`/type constraint forcing `NULL`), the practical effect is just storing `""` instead of `NULL` when the field is left blank — a minor data-quality inconsistency, not a functional break.
**Fix:** Use `values.linkUrl || null` / `values.photoStoragePath || null` for consistency with how `NULL` is meant to represent "no value."

---

_Reviewed: 2026-07-27T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
