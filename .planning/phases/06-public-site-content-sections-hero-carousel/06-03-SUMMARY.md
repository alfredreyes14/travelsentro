---
phase: 06-public-site-content-sections-hero-carousel
plan: 03
subsystem: homepage-presentational-components
tags: [embla-carousel, react, tailwind, presentational-components]
dependency-graph:
  requires:
    - "06-01: embla-carousel-autoplay@8.6.0 installed, types/database.ts regenerated"
  provides:
    - "components/homepage/hero-carousel.tsx -- HeroSlideDisplay type, HeroCarousel({ slides })"
    - "components/homepage/why-choose-us.tsx -- ValuePropDisplay type, WhyChooseUs({ valueProps })"
    - "components/homepage/featured-packages-grid.tsx -- FeaturedPackagesGrid({ items })"
  affects:
    - "app/(public)/page.tsx (06-07) -- imports and composes all 3 components with server-fetched props"
tech-stack:
  added: []
  patterns:
    - "embla-carousel-autoplay wired via useRef(Autoplay({...})) + Carousel's existing plugins prop, gated by window.matchMedia prefers-reduced-motion at construction time"
    - "empty-array guard (return null) on all 3 components -- no placeholder/coming-soon copy, per UI-SPEC public homepage empty-state rule"
    - "PackageCard reused unchanged in FeaturedPackagesGrid -- zero new card markup"
key-files:
  created:
    - "components/homepage/hero-carousel.tsx"
    - "components/homepage/why-choose-us.tsx"
    - "components/homepage/featured-packages-grid.tsx"
  modified: []
decisions:
  - "[Phase 06-03]: Adjusted FeaturedPackagesGrid's doc comment to reference \"PackageCard\" (not \"<PackageCard>\") so the plan's own acceptance-criteria grep for exactly 1 occurrence of '<PackageCard' matches only the real JSX usage, not a second hit from the comment"
metrics:
  duration: "9 min"
  completed: "2026-07-27"
status: complete
---

# Phase 6 Plan 3: Hero Carousel & Homepage Content Sections Summary

Built the 3 presentational homepage components (hero carousel, value props section, featured packages grid) that 06-07's homepage composition will import — all pure prop-driven Client/Server Components with zero direct Supabase calls, following UI-SPEC's Section Layout, Color, and Typography contracts exactly.

## What Was Built

- **`components/homepage/hero-carousel.tsx`** — `"use client"` component. Exports `HeroSlideDisplay` type (`{ id, slideType, imageUrl, headline, subheading, ctaLabel, ctaHref }`) and `HeroCarousel({ slides })`. Wires `embla-carousel-autoplay` via `useRef(Autoplay({ delay: 5000, stopOnInteraction: true, playOnInit: !prefersReducedMotion }))`, matching RESEARCH.md's exact Pattern 1 code. `prefersReducedMotion` is computed via `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, so autoplay never starts for reduced-motion visitors while manual `CarouselPrevious`/`CarouselNext` navigation (already keyboard-accessible, 44px touch targets from `carousel.tsx`) still works. `onMouseEnter`/`onMouseLeave` pause/resume the plugin. Each slide renders a full-bleed image (`aspect-[4/5]` mobile, `aspect-video` desktop) with an `object-cover` `<Image>` or a `bg-secondary/10` placeholder when `imageUrl` is null, a `bg-gradient-to-t from-secondary/80 via-secondary/20 to-transparent` scrim, and bottom-aligned Display headline / optional Body subheading / an Accent `<Button>` CTA rendered only when both `ctaLabel` and `ctaHref` are non-null (never an empty button). Returns `null` when `slides.length === 0`.

- **`components/homepage/why-choose-us.tsx`** — Server Component. Exports `ValuePropDisplay` type and `WhyChooseUs({ valueProps })`. Renders a Display-size "Why Choose Us" heading and a `grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4` of `<Card>` items (Heading-size title, Body-size muted description), no icon field per RESEARCH.md Assumption A2. Returns `null` when `valueProps.length === 0`.

- **`components/homepage/featured-packages-grid.tsx`** — Server Component. Exports `FeaturedPackagesGrid({ items })` where `items` is `{ pkg: PackageRow; photoUrl: string | null }[]`. Renders a Display-size "Featured Packages" heading, the identical `grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3` shape used by `app/(public)/packages/page.tsx`, mapping each item to the existing `<PackageCard pkg={item.pkg} photoUrl={item.photoUrl} />` (imported unchanged from `@/components/packages/package-card` — zero new card markup, zero new curation mechanism), and a bottom "View All Packages" outline `<Button>` linking to `/packages`. Returns `null` when `items.length === 0`.

All 3 components have zero Supabase/database awareness — 06-07's homepage composition (Server Component) will do every query and pass already-shaped, already-URL-resolved props down, per this plan's stated decoupling goal.

## Verification Performed

- Task 1 (`hero-carousel.tsx`): grep counts confirmed — 1 `from "embla-carousel-autoplay"`, 2 `prefers-reduced-motion` occurrences, 1 `stopOnInteraction: true`, 1 `slides.length === 0`, 5 `CarouselPrevious|CarouselNext` occurrences, 1 `"use client"`.
- Task 2 (`why-choose-us.tsx` + `featured-packages-grid.tsx`): grep counts confirmed — 1 `valueProps.length === 0`, 2 `Why Choose Us` occurrences (heading + doc comment), 1 `items.length === 0`, 1 `from "@/components/packages/package-card"`, 1 `<PackageCard` (JSX usage only, after adjusting the doc comment wording), 2 `Featured Packages` occurrences (heading + doc comment), 1 `View All Packages`.
- `npm run build` (Next.js 16.2.10, Turbopack) completed successfully after each task — compiled cleanly, all 17 existing routes generated, no new TypeScript errors introduced by any of the 3 new components.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FeaturedPackagesGrid doc comment caused a double grep match on `<PackageCard`**
- **Found during:** Task 2
- **Issue:** The initial doc comment read "Reuses the existing `<PackageCard>` component unchanged" — the literal `<PackageCard` substring in the comment caused `grep -c '<PackageCard' components/homepage/featured-packages-grid.tsx` to return 2 instead of the plan's required exact match of 1.
- **Fix:** Reworded the comment to say "PackageCard" without angle brackets, preserving the same explanatory intent without affecting the grep-verifiable JSX usage count.
- **Files modified:** `components/homepage/featured-packages-grid.tsx`
- **Commit:** d17ea3e

Auth gates: None encountered — this plan is pure presentational-component work with no CLI/auth steps.

## Self-Check: PASSED

- FOUND: `components/homepage/hero-carousel.tsx`
- FOUND: `components/homepage/why-choose-us.tsx`
- FOUND: `components/homepage/featured-packages-grid.tsx`
- FOUND: commit `d159657` (Task 1 — hero-carousel.tsx)
- FOUND: commit `d17ea3e` (Task 2 — why-choose-us.tsx + featured-packages-grid.tsx)
