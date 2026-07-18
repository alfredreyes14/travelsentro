---
phase: 01-public-catalog-inquiry-entry-point
plan: 06
subsystem: ui
tags: [nextjs, react-server-components, supabase, shadcn, base-ui, embla-carousel, tailwind]

# Dependency graph
requires:
  - phase: 01-04
    provides: "InquiryForm({ packageName }) — shared per-package/general inquiry form"
  - phase: 01-05
    provides: "WhatsAppCta/FacebookCta with icon-label variant, PackageCard linking to /packages/[slug]"
provides:
  - "Full package detail page (app/(public)/packages/[slug]/page.tsx) — itinerary, inclusions/exclusions, gallery, trip facts, CTAs, inquiry form"
  - "Checklist component — single shared implementation for inclusions/exclusions/what-to-bring (D-09)"
  - "ItineraryAccordion, TripFacts, PackageGallery components"
affects: [phase-02-package-management-admin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detail-page RSC query with nested joins (package_photos, itinerary_days, package_inclusions, faq_facts) filtered by is_published + slug, single() + notFound() on miss"
    - "Shared Checklist component driven by a kind discriminator instead of three bespoke list components"
    - "Lightbox gallery: thumbnail grid (Client Component) opening a shadcn Dialog+Carousel keyed by selected index to seed Embla's startIndex on open"

key-files:
  created:
    - components/packages/itinerary-accordion.tsx
    - components/packages/checklist.tsx
    - components/packages/trip-facts.tsx
    - components/packages/package-gallery.tsx
    - "app/(public)/packages/[slug]/page.tsx"
  modified: []

key-decisions:
  - "Used @base-ui/react's Accordion primitive as-is (no type=\"single\" collapsible prop exists on this preset, unlike Radix) — items are independently expandable, still satisfies day-by-day and FAQ expand/collapse requirements"
  - "PackageGallery's alt-text fallback (photo.alt_text ?? pkg.name) resolved in the page query, not inside the gallery component, so the component's props stay exactly { photos } per the plan's artifact interface"

patterns-established:
  - "Detail-page joined query pattern for future admin-facing package reads (Phase 2)"

requirements-completed: [PUBL-02, PUBL-03, PUBL-04, PUBL-05, PUBL-06, PUBL-07, PUBL-08]

coverage:
  - id: D1
    description: "Package detail page renders day-by-day itinerary, line-item price/inclusions/exclusions, photo gallery, and trip facts for every seeded package"
    requirement: "PUBL-02"
    verification:
      - kind: manual_procedural
        ref: "curl http://localhost:3000/packages/palawan-island-hopping -> 200; grep confirmed Itinerary/What's Included/Trip Facts sections and seeded content (Hotel accommodation, Airfare to/from Palawan, Reef-safe sunscreen, Best Time to Go, Group Size, What to Bring) all present in rendered HTML"
        status: pass
    human_judgment: false
  - id: D2
    description: "Detail page has icon+label WhatsApp/Facebook CTAs and a working per-package inquiry form"
    requirement: "PUBL-05"
    verification:
      - kind: manual_procedural
        ref: "grep confirmed 'Message us on WhatsApp' and 'Message us on Facebook' (icon-label variant) and 'Send an Inquiry' section with <InquiryForm packageName={pkg.name}> rendered in HTML"
        status: pass
    human_judgment: false
  - id: D3
    description: "Unpublished/nonexistent package slugs return a real 404, not a crash or data leak"
    requirement: "PUBL-04"
    verification:
      - kind: manual_procedural
        ref: "curl http://localhost:3000/packages/does-not-exist -> 404"
        status: pass
    human_judgment: false
  - id: D4
    description: "Inclusions, exclusions, and what-to-bring all render through the same shared Checklist component"
    requirement: "PUBL-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (checklist.tsx exports exactly one Checklist component, kind discriminator) + npm run build succeeded"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-18
status: complete
---

# Phase 1 Plan 06: Package Detail Page Summary

**Full `/packages/[slug]` detail page — day-by-day itinerary accordion, shared Checklist for inclusions/exclusions/what-to-bring, lightbox photo gallery (shadcn Dialog+Carousel), fixed trip-facts accordion, icon+label WhatsApp/Facebook CTAs, and the per-package InquiryForm, all wired into one joined Supabase RSC query with `notFound()` on unpublished/missing slugs.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-18T12:49:59Z
- **Completed:** 2026-07-18T12:55:14Z
- **Tasks:** 3 completed
- **Files modified:** 5 created

## Accomplishments
- Every seeded package (verified against `palawan-island-hopping`) now has a fully-featured detail page: itinerary, inclusions/exclusions, gallery, trip facts, CTAs, inquiry form
- `Checklist` is the single shared list component for inclusions/exclusions/what-to-bring (D-09) — verified only one component exported from `checklist.tsx`
- Unpublished/nonexistent slugs 404 identically (T-01-15) — verified `/packages/does-not-exist` returns HTTP 404
- Gallery lightbox delegates all keyboard/touch/focus-trap/ESC-close behavior to shadcn Dialog + Embla-backed Carousel, no hand-rolled event handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Itinerary accordion, shared checklist, trip facts components** - `39787f8` (feat)
2. **Task 2: Photo gallery lightbox** - `9697bbd` (feat)
3. **Task 3: Assemble the package detail page** - `9604ac6` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/packages/itinerary-accordion.tsx` - `ItineraryAccordion({ days })`, day-by-day accordion sorted by `day_number`
- `components/packages/checklist.tsx` - `Checklist({ items, kind })`, single shared list component (D-09)
- `components/packages/trip-facts.tsx` - `TripFacts({ bestTimeToGo, groupSize, bringItems })`, fixed 3-field FAQ accordion (D-08)
- `components/packages/package-gallery.tsx` - `PackageGallery({ photos })`, Client Component thumbnail grid + Dialog/Carousel lightbox
- `app/(public)/packages/[slug]/page.tsx` - package detail page, RSC with full joined query, composes all sections + InquiryForm

## Decisions Made
- `@base-ui/react`'s installed Accordion primitive has no Radix-style `type="single" collapsible` prop — used the component as-is (independently expandable items), which still satisfies the plan's expand/collapse requirement for both the itinerary and trip-facts sections. Documented inline in `itinerary-accordion.tsx`.
- Resolved the photo `alt` text fallback (`photo.alt_text ?? pkg.name`) in the page's data-mapping step rather than inside `PackageGallery`, keeping the gallery component's prop signature exactly `{ photos }` as specified in the plan's artifact list.

## Deviations from Plan

None — plan executed exactly as written, aside from the Accordion API adaptation noted above (which is a pre-existing project-wide deviation from 01-01, not new to this plan; documented here for this plan's specific usage).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 1's public catalog + inquiry entry point is now feature-complete: browse (`/packages`), detail (`/packages/[slug]`), and inquire (per-package + general Contact Us forms) all work end-to-end against live Supabase data. Phase 2 (package management admin) can build CRUD on top of the same `packages`/`package_photos`/`itinerary_days`/`package_inclusions`/`faq_facts` schema and reuse this detail-page query shape for admin preview/edit views.

---
*Phase: 01-public-catalog-inquiry-entry-point*
*Completed: 2026-07-18*

## Self-Check: PASSED

All 5 created files verified present on disk; all 3 task commit hashes (`39787f8`, `9697bbd`, `9604ac6`) verified present in git log.
