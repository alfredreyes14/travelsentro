---
phase: 01-public-catalog-inquiry-entry-point
plan: 07
subsystem: ui
tags: [nextjs, tailwind, responsive, shadcn, embla-carousel, mobile]

# Dependency graph
requires:
  - phase: 01-public-catalog-inquiry-entry-point
    provides: "01-01 shadcn/design tokens, 01-04 inquiry form, 01-05 package list/CTAs, 01-06 package detail page — all files audited and refined here"
provides:
  - "Mobile-responsiveness audit confirming PUBL-09 across every public-facing page (nav, package list, package detail, contact)"
  - "Fixed off-screen lightbox carousel navigation buttons on narrow viewports"
  - "Final full-phase human verification confirming all 5 ROADMAP Phase 1 success criteria"
affects: [phase-02-admin-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Responsive icon-button overrides via Tailwind className prop merged with twMerge (e.g. CarouselPrevious/Next `left-2 sm:-left-12` inset-on-mobile, outside-on-desktop pattern) rather than editing the shared shadcn primitive"

key-files:
  created: []
  modified:
    - "components/packages/package-gallery.tsx"

key-decisions:
  - "Audited all 5 originally-scoped files (layout.tsx, packages/page.tsx, packages/[slug]/page.tsx, contact/page.tsx, package-card.tsx) against UI-SPEC breakpoints and found them already compliant from prior plans (01-01/01-04/01-05/01-06) — no changes needed to those files"
  - "Fixed a real bug found during the audit in a file outside the plan's originally-listed 5 files (components/packages/package-gallery.tsx) since it directly serves the package detail page under audit and the bug would have failed the phase's own acceptance checkpoint"

patterns-established:
  - "When overriding shadcn primitive positioning per-usage, pass className to the primitive (twMerge resolves conflicting utility classes) instead of editing components/ui/* directly"

requirements-completed: [PUBL-09]

coverage:
  - id: D1
    description: "Package list, package detail, and Contact Us pages are fully usable at 375px, 768px, and 1024px+ viewport widths"
    requirement: "PUBL-09"
    verification:
      - kind: manual_procedural
        ref: "Task 2 checkpoint:human-verify — user typed 'approved' confirming all 5 ROADMAP Phase 1 criteria passed at all 3 breakpoints"
        status: pass
    human_judgment: true
    rationale: "Visual/interaction responsiveness at real breakpoints requires human judgment; no browser automation tooling (Playwright/Puppeteer) is installed in this project to assert layout geometrically"
  - id: D2
    description: "Icon-only WhatsApp/Facebook CTA buttons meet the 44px minimum touch target on every viewport"
    requirement: "PUBL-09"
    verification:
      - kind: other
        ref: "grep confirmed min-h-11 min-w-11 (44px) classNames present in components/packages/whatsapp-cta.tsx and facebook-cta.tsx, rendered inside package-card.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fixed off-screen lightbox carousel prev/next buttons at narrow viewports"
    verification:
      - kind: other
        ref: "npm run build (Turbopack) — compiled successfully, 6 routes generated, no errors"
        status: pass
      - kind: manual_procedural
        ref: "Task 2 checkpoint — human confirmed gallery lightbox usable at 375px including nav arrows"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 5 ROADMAP Phase 1 success criteria verified against the real running application (npm run dev, localhost:3000)"
    verification:
      - kind: manual_procedural
        ref: "Task 2 checkpoint:human-verify — user response 'approved', all 5 criteria at 375/768/1024px"
        status: pass
    human_judgment: true
    rationale: "Full end-to-end acceptance (package browsing, WhatsApp/Facebook links, Formspree submission with toast, validation errors) requires a human driving a real browser against the live app"

duration: 20min
completed: 2026-07-18
status: complete
---

# Phase 1 Plan 07: Responsive Audit & Full Phase Acceptance Summary

**Closed one real mobile-viewport bug (off-screen lightbox nav arrows) after confirming every other public page already satisfied PUBL-09 from prior plans; human verifier approved all 5 ROADMAP Phase 1 success criteria at 375/768/1024px.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-18T13:00:00Z
- **Completed:** 2026-07-18T13:20:00Z
- **Tasks:** 2 completed (1 auto, 1 checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments
- Audited all 5 public-facing files named in the plan (nav, package list grid, package detail sections, Contact Us page, package card CTAs) against UI-SPEC's declared breakpoints (375px/768px/1024px+) and spacing scale — confirmed all were already mobile-first and compliant from earlier plans (01-01, 01-04, 01-05, 01-06); no edits were needed to those 5 files
- Found and fixed a genuine responsive bug outside the plan's originally-listed files: the package detail photo gallery's lightbox `CarouselPrevious`/`CarouselNext` buttons were positioned `-left-12`/`-right-12` (48px outside the carousel), pushing them off-screen at narrow viewports since the Dialog is only inset ~16px from the viewport edge at 375px width
- Started `npm run dev`, sanity-checked all key routes (`/`, `/packages`, `/contact`, `/packages/[slug]`) return 200, then ran the final blocking human-verify checkpoint
- Human verifier confirmed all 5 ROADMAP Phase 1 success criteria pass at 375px, 768px, and 1024px+: package list photo/name/price, package detail itinerary/inclusions/gallery/trip-facts, WhatsApp/Facebook CTA links with no checkout, Contact Us + per-package inquiry form submission (success toast) and invalid-email validation, and full list→detail→inquiry flow usable at 375px with no horizontal scroll or overlapping elements

## Task Commits

1. **Task 1: Responsive audit and fixes across all public pages** - `59ab0bb` (fix)
2. **Task 2: Full Phase 1 acceptance verification** - checkpoint:human-verify, no code changes (user approved)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `components/packages/package-gallery.tsx` - Overrode `CarouselPrevious`/`CarouselNext` positioning to inset within the image (`left-2`/`right-2`) below the `sm:` breakpoint, restoring the original outside-carousel positioning (`sm:-left-12`/`sm:-right-12`) at `sm:` and up, so the lightbox nav arrows stay on-screen and tappable at 375px

## Decisions Made
- Treated the package-gallery.tsx fix as in-scope despite not being one of the plan's 5 originally-listed files, because it directly serves `app/(public)/packages/[slug]/page.tsx` (the exact page under audit in this same task) and the bug would have visibly failed the phase's own acceptance checkpoint (gallery lightbox usability at every breakpoint) — applied Rule 1 (auto-fix bugs) rather than deferring to a future plan
- Fixed the button positioning via a `className` override passed to the existing `CarouselPrevious`/`CarouselNext` components (resolved through `twMerge`) rather than editing the shared `components/ui/carousel.tsx` shadcn primitive, keeping the change scoped to this project's usage and not altering the vendored component's default (desktop-appropriate) behavior for any future consumer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed off-screen carousel lightbox nav buttons at narrow viewports**
- **Found during:** Task 1 (responsive audit)
- **Issue:** `PackageGallery`'s lightbox rendered `<CarouselPrevious />` / `<CarouselNext />` with the shared component's default `-left-12`/`-right-12` positioning (48px outside the carousel bounds). At 375px viewport width, the Dialog's `max-w-[calc(100%-2rem)]` leaves only ~16px of margin on each side, so the buttons rendered mostly or fully outside the visible viewport — invisible/untappable via mouse or keyboard (touch swipe via Embla still worked, but the visible nav affordance was broken).
- **Fix:** Passed `className="left-2 sm:-left-12"` / `className="right-2 sm:-right-12"` to `CarouselPrevious`/`CarouselNext` in `package-gallery.tsx`, keeping the buttons inset over the image on mobile and restoring outside-of-carousel positioning at `sm:` (640px) and up.
- **Files modified:** `components/packages/package-gallery.tsx`
- **Verification:** `npm run build` passed cleanly; human verifier confirmed gallery lightbox (including nav arrows) usable at 375px during the Task 2 checkpoint.
- **Committed in:** `59ab0bb` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 - bug)
**Impact on plan:** Necessary correctness fix for PUBL-09 mobile usability; no scope creep beyond what the phase's own acceptance checkpoint required. All other 5 originally-scoped files were already compliant and required no edits.

## Issues Encountered
None — the dev environment (`.env.local` with Supabase credentials) was already populated by the user, so `npm run dev` and `npm run build` ran without additional setup.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Phase 1 (public-catalog-inquiry-entry-point) is fully complete: all 9 PUBL requirements (PUBL-01 through PUBL-09) are satisfied and verified against the real running application at all 3 target breakpoints. The public site (package list, package detail, WhatsApp/Facebook CTAs, Formspree-backed inquiry form) is ready as the foundation for Phase 2 (admin panel), which will need to read/write the same `packages`, `package_photos`, `itinerary_days`, `package_inclusions`, and `faq_facts` tables this phase's pages query.

No blockers introduced by this plan. Carried-forward project-level blockers (Formspree webhook cost, Supabase free-tier auto-pause, Vercel Hobby non-commercial ToS) remain open per STATE.md and are unaffected by this plan's presentation-only changes.

---
*Phase: 01-public-catalog-inquiry-entry-point*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: components/packages/package-gallery.tsx
- FOUND: .planning/phases/01-public-catalog-inquiry-entry-point/01-07-SUMMARY.md
- FOUND: commit 59ab0bb
