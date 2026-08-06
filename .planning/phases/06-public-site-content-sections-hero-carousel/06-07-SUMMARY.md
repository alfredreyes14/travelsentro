---
phase: 06-public-site-content-sections-hero-carousel
plan: 07
subsystem: homepage-integration
tags: [server-component, supabase, homepage, data-fetching]
dependency-graph:
  requires:
    - "06-03: HeroCarousel, WhyChooseUs, FeaturedPackagesGrid"
    - "06-04: TestimonialsSection, BrandPartners, CorporateClients"
tech-stack:
  added: []
  patterns:
    - "orphan-skip filter for package-linked hero slides (slide.slide_type === \"promo\" || slide.packages !== null)"
    - "two fully independent partner_type queries/counts for Brand Partners vs Corporate Clients"
    - "InquiryForm reused with zero props for the homepage's general inquiry section"
key-files:
  created: []
  modified:
    - "app/(public)/page.tsx"
    - "next.config.ts"
provides:
  - "app/(public)/page.tsx -- async Server Component composing all 7 homepage sections, fetching all 6 datasets server-side with pre-resolved image URLs"
affects:
  - "app/(public)/page.tsx is the phase's final integration point -- no downstream consumers"
decisions:
  - "[Phase 06-07]: Added a second next.config.ts remotePatterns entry for the site-content Storage bucket (Rule 2) -- promo hero slides, testimonial photos, and partner/client logos all resolve URLs from this bucket and render via next/image in already-built components/homepage/* components; without this the Image Optimizer would 400 on every such image at request time. Scoped identically (same bucket-path-restricted pattern, same Pitfall 3 rationale) as the existing package-photos entry."
  - "[Phase 06-07]: Wrote .from(\"partners\").select(\"*\") on a single line for both the brand_partner and corporate_client queries so the plan's own acceptance-criteria grep for 'from(\"partners\").select' (a single-line literal) matched -- purely a formatting choice, no behavioral difference from a multi-line chain."
metrics:
  duration: "12 min"
  completed: "2026-07-27"
status: complete
---

# Phase 6 Plan 7: Homepage Integration (Data Fetching + Composition) Summary

Rewrote `app/(public)/page.tsx` from its static 2-paragraph placeholder into the phase's final integration point: an `async` Server Component that fetches all 6 new homepage datasets, resolves every Storage image URL server-side, and composes all 7 sections (6 new components plus the existing `<InquiryForm />`) in the exact order specified by `06-UI-SPEC.md`.

## What Was Built

- **`app/(public)/page.tsx`** (REWRITTEN) — `async function HomePage()`:
  - **Hero slides**: `supabase.from("hero_slides").select("*, packages(id, slug, name, is_published, deleted_at, package_photos(storage_path, display_order))")`, ordered by `sort_order`. Applies the orphan-skip filter (`slide.slide_type === "promo" || slide.packages !== null`) before mapping to `HeroSlideDisplay` — package-type slides resolve `headline`/`ctaHref`/`imageUrl` from the joined package's name/slug/first-photo; promo-type slides resolve from `slide.headline`/`slide.cta_label`/`slide.image_storage_path` (via the `site-content` bucket), with the CTA button omitted entirely when `cta_label` is empty.
  - **Value props**: `supabase.from("value_props").select("*")`, ordered by `sort_order`, mapped to `{ id, title, description }`.
  - **Featured packages**: byte-identical query shape to `app/(public)/packages/page.tsx`, with `.eq("is_featured", true)` and `.limit(6)` added — zero new curation code (D-04). Each row paired with its first-photo URL (`package-photos` bucket), matching `FeaturedPackagesGrid`'s `{ pkg, photoUrl }` prop shape.
  - **Testimonials**: `supabase.from("testimonials").select("*")`, ordered by `sort_order`, `photoUrl` resolved from `photo_storage_path` (`site-content` bucket) when set, else `null`.
  - **Brand Partners** / **Corporate Clients**: two fully independent queries (`eq("partner_type", "brand_partner")` and `eq("partner_type", "corporate_client")`) against the same `partners` table — never a combined "any partner" check (D-07 / RESEARCH.md Pitfall 3). Both resolve `logoUrl` from `logo_storage_path` via the `site-content` bucket.
  - Every query logs its error server-side via `console.error` and falls back to an empty array rather than crashing the whole page — matching `app/(public)/packages/page.tsx`'s existing pattern; every downstream component already handles an empty array by returning `null`.
  - Renders sections in UI-SPEC's exact order: `<HeroCarousel>` → `<WhyChooseUs>` → `<FeaturedPackagesGrid>` → `<TestimonialsSection>` → a `"Get in Touch"` section wrapping `<InquiryForm />` (imported from `@/components/inquiry/inquiry-form`, called with **zero props** — `packageName`/`packageId` both stay `undefined`, byte-identical to `app/(public)/contact/page.tsx`'s existing usage, D-05/HOME-07) → `<BrandPartners>` → `<CorporateClients>`.
  - Added a `Metadata` export (title/description) for the homepage, matching the existing pattern on `/packages` and `/contact`.

- **`next.config.ts`** (MODIFIED, Rule 2 auto-fix) — added a second `images.remotePatterns` entry scoping `/storage/v1/object/public/site-content/**`, identical in shape/rationale to the existing `package-photos` entry. Without this, `next/image` would reject every promo-slide image, testimonial photo, and partner/client logo URL at request time (a 400, not a build-time or type error) since `components/homepage/{hero-carousel,brand-partners,corporate-clients}.tsx` (built in 06-03/06-04) already render these via `next/image` unconditionally.

## Verification Performed

- Task 1 (data-fetching layer) grep counts confirmed: 1 orphan-skip filter, 2 `from("partners").select` occurrences, 1 `brand_partner` eq, 1 `corporate_client` eq, 1 `is_featured` eq, 4 `from("site-content")` occurrences, 1 `async function HomePage`.
- Task 2 (JSX composition) grep counts confirmed: 1 each of `<HeroCarousel`, `<WhyChooseUs`, `<FeaturedPackagesGrid`, `<TestimonialsSection`, `<InquiryForm />` (zero props), `<BrandPartners`, `<CorporateClients`, `Get in Touch`; line-number ordering (`grep -n`) confirmed the exact required sequence.
- `npm run build` (Next.js 16.2.10, Turbopack) completed successfully — compiled cleanly, TypeScript passed with no new errors, all 17 existing routes generated (including `/` as a dynamic route, unchanged route count from prior phases).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] site-content Storage bucket not allowlisted for next/image**
- **Found during:** Task 1 (image URL resolution)
- **Issue:** `next.config.ts`'s `images.remotePatterns` only allowlisted the `package-photos` bucket path (from Phase 1). Promo-type hero slide images, testimonial photos, and Brand Partners/Corporate Clients logos all resolve URLs from the `site-content` bucket (created in 06-01's migration) and are already rendered via `next/image` in 06-03/06-04's components — without this entry, every such image request would 400 at runtime (not caught by `npm run build`'s type-check, only surfacing as broken images in the browser).
- **Fix:** Added a second `remotePatterns` entry scoped to `/storage/v1/object/public/site-content/**`, identical shape/rationale to the existing `package-photos` entry (same Pitfall 3 concern: pathname tightly scoped so the Image Optimizer can't proxy-fetch arbitrary Supabase-hosted content).
- **Files modified:** `next.config.ts`
- **Commit:** 9dd45f0

### Formatting adjustment (non-functional)

- `.from("partners").select("*")` written on a single line (rather than the plan's illustrative multi-line chain) for both the brand_partner and corporate_client queries, so the plan's own acceptance-criteria grep for the literal string `from("partners").select` matched. No behavioral difference.

Auth gates: None encountered — this plan is pure Server Component/data-fetching work with no CLI/auth steps.

## Self-Check: PASSED

- FOUND: `app/(public)/page.tsx` (rewritten, all grep/build checks pass)
- FOUND: `next.config.ts` (site-content remotePatterns entry present)
- FOUND: commit `9dd45f0` (Task 1 — data-fetching layer + next.config.ts fix)
- FOUND: commit `8ba388d` (Task 2 — JSX composition)
