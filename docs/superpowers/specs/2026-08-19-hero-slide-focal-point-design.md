# Hero Slide Automatic Focal Point — Design Spec

**Date:** 2026-08-19
**Status:** Approved by user, pending implementation plan.

## Summary

Promo-type hero slide images (`hero_slides.image_storage_path`) are rendered with `object-cover` at multiple aspect ratios (tall `aspect-[4/5]` on mobile, `aspect-video` on desktop). A single center crop doesn't reliably frame an arbitrary admin-uploaded photo well at every breakpoint. This adds an automatic, content-aware focal point — computed once at upload time via a local saliency algorithm (no external API, no cost) — stored on the `hero_slides` row and applied as CSS `object-position` at render time.

Scope is deliberately narrow: **promo-type hero slides only**. Package-linked hero slides (which source their image from `package_photos` via the linked package) are out of scope — they keep the current default-center crop. `package_photos`, destination photos, partner logos, and testimonial photos are untouched.

## Architecture

**Algorithm:** `smartcrop-sharp` (built on the already-transitively-installed `sharp`). Given an image buffer, `smartcrop.crop(buffer, { width: 100, height: 100 })` returns the single most "interesting" region as a `{ x, y, width, height }` box in source pixels. The box's center point, normalized to the image's actual dimensions, becomes `(focal_x, focal_y)` — one point in `[0, 1] × [0, 1]` applied uniformly across every breakpoint via `object-position`, rather than computing a separate crop per aspect ratio. This is the same technique used by Contentful/Netlify CMS-style focal-point pickers, just computed instead of manually set.

`sharp` moves from a transitive to a direct dependency (imported directly by our code, not relied on implicitly through Next.js's image optimizer). `smartcrop-sharp` is a new dependency.

## Data Model

New migration, additive only, both columns nullable (`null` = no focal point yet, render falls back to CSS default center — i.e. current behavior, so every existing row keeps working unchanged until backfilled):

```sql
alter table hero_slides
  add column focal_x numeric,
  add column focal_y numeric;

comment on column hero_slides.focal_x is
  'Normalized [0,1] horizontal focal point for object-position cropping of image_storage_path. Null = default center crop.';
comment on column hero_slides.focal_y is
  'Normalized [0,1] vertical focal point for object-position cropping of image_storage_path. Null = default center crop.';
```

No `check` constraint enforcing the `[0,1]` range — these are only ever written by our own computed-value code path (upload action, backfill script), never user-entered.

## Components Touched

- **`lib/image/focal-point.ts`** (new) — one function, `computeFocalPoint(buffer: Buffer): Promise<{ x: number; y: number } | null>`, wrapping `smartcrop-sharp`. Returns `null` (never throws) if analysis fails on a malformed/unsupported image — callers treat this as "no focal point available," not an error.
- **`actions/site-content-uploads.ts`** — `uploadSiteContentImage()` calls `computeFocalPoint(buffer)` when `folder === "hero-slides"` (skipped for `testimonials`/`partners`/`destinations`, matching the approved scope), in parallel with the existing `uploadObject()` R2 call via `Promise.all`. Return type gains optional `focalX`/`focalY` fields, present only for the hero-slides folder and only when analysis succeeded.
- **`components/admin/content/hero-slide-form.tsx`** — `handleImageChange`'s `onUploaded` callback gains `focalX`/`focalY` params, stored in the form's existing state alongside the storage path, submitted through to `createSlide`/`updateSlide`.
- **`actions/hero-slides.ts`** — `HeroSlideValues` gains optional `focalX`/`focalY: number`; `createSlide`/`updateSlide` persist them as `focal_x`/`focal_y` on insert/update. Removing an image (replace/clear in the form) clears both back to `null`.
- **`app/(public)/page.tsx`** — `HeroSlideDisplay` gains `focalX: number | null` / `focalY: number | null`. Populated from the `hero_slides` row for `slideType === "promo"` only; `slideType === "package"` entries always get `null` (out of scope, per Design approval).
- **`components/homepage/hero-carousel.tsx`** — the `<Image>` for each slide gets `style={{ objectPosition: slide.focalX != null && slide.focalY != null ? \`${slide.focalX * 100}% ${slide.focalY * 100}%\` : undefined }}`. `undefined` leaves Tailwind's `object-cover` at its CSS default (`50% 50%`), i.e. today's behavior — no visual change for rows without a computed focal point.

## Backfill

`scripts/backfill-hero-slide-focal-points.ts`, following this repo's existing `scripts/verify-*.ts` convention (plain script, run via `tsx --env-file=.env.local`, added as an npm script `backfill:hero-focal-points`):

1. Query `hero_slides` where `slide_type = 'promo'`, `image_storage_path is not null`, `focal_x is null`.
2. For each row, fetch the image from its public R2 URL (`getPublicImageUrl(image_storage_path)`), run `computeFocalPoint`, and `update` the row if a focal point was found.
3. Log a summary (rows processed / updated / skipped-due-to-analysis-failure) — no silent partial failures.

Run once against the real Supabase project after the migration is applied, per user approval; safe to re-run (idempotent — only touches rows still missing a focal point).

## Error Handling

- Focal point computation is best-effort everywhere it runs (upload action and backfill): a failure never blocks the upload or crashes the backfill loop, it just leaves `focal_x`/`focal_y` as `null` for that image.
- No new user-facing error states — this is an invisible quality improvement, not a feature the admin interacts with directly.

## Testing

No test framework exists in this repo (project convention is manual `verify:*` scripts). Verification plan:
- Manual: upload a new promo hero slide with an off-center subject in the admin panel, confirm the public homepage crops sensibly at mobile and desktop widths.
- Run the backfill script against real data and spot-check a few existing promo slides before/after.
- `computeFocalPoint`'s pure normalization math (box → normalized center point) is simple enough to sanity-check via a short one-off script rather than a full test suite, consistent with this repo's existing testing posture.
