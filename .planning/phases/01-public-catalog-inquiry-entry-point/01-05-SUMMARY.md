---
phase: 01-public-catalog-inquiry-entry-point
plan: 05
subsystem: ui
tags: [nextjs, react-server-components, supabase, tailwind, whatsapp, facebook, lucide-react]

requires:
  - phase: 01-public-catalog-inquiry-entry-point (01-03)
    provides: Live seeded Supabase schema (packages, package_photos, itinerary_days, package_inclusions, faq_facts) with 3 placeholder packages and real Storage-hosted photos
provides:
  - Package list page (/packages) as a Server Component with direct Supabase fetch, no API layer
  - buildWhatsAppLink() — per-package wa.me deep link builder with pre-filled message
  - Centralized FACEBOOK_URL constant
  - WhatsAppCta / FacebookCta components (icon-only + icon-label variants, hardcoded brand colors)
  - PackageCard component (photo, name, From-price badge, Featured badge, stretched-link card pattern)
  - Walking Skeleton fully verified end-to-end (scaffold + live DB + real UI + real external contact)
affects: [01-06-package-detail-page, phase-02-admin-panel]

tech-stack:
  added: []
  patterns:
    - "RSC direct-fetch for public catalog data (no API/Route Handler layer) — same pattern as 01-RESEARCH.md Pattern 1"
    - "Stretched-link card pattern (Link with after:absolute after:inset-0 + relative z-10 CTA buttons) to make a whole card clickable while keeping nested outbound CTA <a> elements independently clickable without invalid anchor nesting"
    - "Third-party brand colors (WhatsApp #25D366, Facebook #1877F2) hardcoded via Tailwind arbitrary-value classes (bg-[#25D366]), never added as global theme tokens"

key-files:
  created:
    - lib/whatsapp.ts
    - lib/constants.ts
    - components/packages/whatsapp-cta.tsx
    - components/packages/facebook-cta.tsx
    - components/packages/package-card.tsx
    - app/(public)/packages/page.tsx
  modified: []

key-decisions:
  - "Hand-authored an inline SVG for the Facebook 'f' brand mark instead of importing from lucide-react — the installed lucide-react version (1.25.0) ships no brand/logo icons (Facebook, WhatsApp, etc. were removed from the icon set), so no lucide import exists to use for D-04's Facebook CTA"
  - "Used lucide-react's MessageCircle (plan's own suggested fallback) for the WhatsApp CTA icon, since lucide-react also has no dedicated WhatsApp brand icon"

patterns-established:
  - "Pattern 1: RSC direct-fetch — public catalog pages call `createClient()` then `.from(...).select(...)` directly, no Route Handler proxy"
  - "Pattern 2: wa.me deep link construction centralized in lib/whatsapp.ts, never inlined at call sites"

requirements-completed: [PUBL-01, PUBL-05, PUBL-06]

coverage:
  - id: D1
    description: "/packages renders the 3 real seeded packages, each with a real Storage-hosted photo, name, and \"From ₱X\" price"
    requirement: "PUBL-01"
    verification:
      - kind: manual_procedural
        ref: "Checkpoint Task 2 — human verified all 7 steps, approved"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each package card shows icon-only WhatsApp and Facebook CTAs that open the correct external link, WhatsApp message pre-filled with that specific package's name"
    requirement: "PUBL-05"
    verification:
      - kind: manual_procedural
        ref: "Checkpoint Task 2 — human verified WhatsApp/Facebook CTA clicks, approved"
        status: pass
    human_judgment: false
  - id: D3
    description: "Featured package shows a Featured badge; Walking Skeleton (scaffold + live DB + real UI + real external contact) works end-to-end on desktop and mobile widths"
    requirement: "PUBL-06"
    verification:
      - kind: manual_procedural
        ref: "Checkpoint Task 2 — human verified Featured badge + mobile responsive layout, approved"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-07-18
status: complete
---

# Phase 01 Plan 05: Package List Page & WhatsApp/Facebook CTAs Summary

**Package list page as a Server Component querying live seeded Supabase data directly, with icon-only WhatsApp/Facebook contact CTAs, completing the Walking Skeleton end-to-end.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-18T12:24:00Z
- **Completed:** 2026-07-18T12:48:00Z
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 6

## Accomplishments
- `/packages` renders the 3 real seeded packages (Palawan Island Hopping, Siargao Surf & Island, Banaue Rice Terraces) with real Storage-hosted photos, names, and "From ₱X" prices, queried directly from Supabase in a Server Component (no API layer)
- Package-specific WhatsApp deep links (`buildWhatsAppLink()`) and a centralized Facebook page constant, wired into icon-only CTAs on every card
- Featured badge renders correctly on the one seeded featured package
- Human verification confirmed the full Walking Skeleton (scaffold + live DB + real UI + real external contact) works end-to-end, including mobile responsive layout

## Task Commits

Each task was committed atomically:

1. **Task 1: WhatsApp/Facebook CTA components, package card, list page** - `e8157f7` (feat)
2. **Task 2: Walking Skeleton verification** - checkpoint task, no code changes; human approved all 7 verification steps

**Plan metadata:** (pending — see final commit below)

## Files Created/Modified
- `lib/whatsapp.ts` - `buildWhatsAppLink(packageName)`, D-05 pre-filled wa.me deep link builder
- `lib/constants.ts` - `FACEBOOK_URL` centralized constant (D-04)
- `components/packages/whatsapp-cta.tsx` - `WhatsAppCta({ packageName, variant })`, icon-only/icon-label outbound link, WhatsApp brand green hardcoded
- `components/packages/facebook-cta.tsx` - `FacebookCta({ variant })`, icon-only/icon-label outbound link, Facebook brand blue hardcoded, inline SVG "f" mark
- `components/packages/package-card.tsx` - `PackageCard({ pkg, photoUrl })`, photo/name/From-price badge/Featured badge, stretched-link pattern to `/packages/[slug]`
- `app/(public)/packages/page.tsx` - async Server Component: direct Supabase query (`.eq('is_published', true).order('sort_order')`), resolves first photo per package via `getPublicUrl()`, empty-state fallback copy

## Decisions Made
- Hand-authored an inline SVG for the Facebook brand mark since lucide-react 1.25.0 has no brand/logo icons (see Deviations below)
- Used `MessageCircle` from lucide-react for the WhatsApp CTA icon, per the plan's own suggested fallback
- Followed the codebase's existing double-quote string convention (used throughout `app/`, `components/`, `lib/`) for all new files, rather than the single-quote convention used only in the separate `scripts/seed.ts` dev-tooling file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hand-authored inline SVG for Facebook brand icon**
- **Found during:** Task 1 (Facebook CTA component)
- **Issue:** Plan's `<action>` called for "a Facebook-appropriate lucide icon," but the installed `lucide-react@1.25.0` ships no brand/logo icons at all (Facebook, WhatsApp, etc. were removed from the package) — confirmed via direct inspection of the installed module's exports, no icon named `Facebook` exists.
- **Fix:** Authored a minimal inline SVG (`<svg>` + single `<path>`) of Facebook's standard "f" logo mark directly in `components/packages/facebook-cta.tsx`, matching the same `size-5` sizing lucide icons use elsewhere in the codebase.
- **Files modified:** `components/packages/facebook-cta.tsx`
- **Verification:** `npm run build` and `npm run lint` both pass; visually confirmed in the human verification checkpoint (icon renders correctly on the Facebook CTA)
- **Committed in:** `e8157f7` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — missing icon dependency)
**Impact on plan:** Necessary substitution to satisfy D-04's Facebook CTA requirement; no scope creep, no architectural change.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required (Supabase credentials already configured in `.env.local` from prior plans).

## Next Phase Readiness
- The Walking Skeleton (scaffold → live seeded DB → real UI → real external contact) is fully verified end-to-end — Phase 1's core value proposition works.
- `PackageCard` and list page already link to `/packages/[slug]`, ready for `01-06` to build the package detail page (currently 404s, as expected).
- `WhatsAppCta` and `FacebookCta` support an `icon-label` variant not yet used anywhere — `01-06`'s detail page should use `variant="icon-label"` per UI-SPEC's icon+label-on-detail requirement.

---
*Phase: 01-public-catalog-inquiry-entry-point*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`e8157f7`, `ceff65a`) verified present in git log.
