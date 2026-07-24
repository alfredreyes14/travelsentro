---
phase: 05-mobile-responsive-visual-polish
plan: 04
subsystem: ui
tags: [nextjs, react, tailwind, admin-panel, responsive]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: users-table.tsx (Admin/Staff account table, deactivateAccount Server Action)
  - phase: 05-mobile-responsive-visual-polish
    provides: crm-table.tsx twin-markup precedent (05-02), crm/loading.tsx skeleton precedent
provides:
  - Card-mode (below 768px) rendering for the Admin/Staff accounts table
  - Viewport-agnostic "No accounts yet" empty state for users-table.tsx
  - app/admin/(dashboard)/users/loading.tsx route-level Suspense skeleton
affects: [05-mobile-responsive-visual-polish (verification/UAT), any future admin/users work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS-only twin-markup table/card breakpoint switch (hidden md:block / md:hidden), no useIsMobile()"

key-files:
  created:
    - app/admin/(dashboard)/users/loading.tsx
  modified:
    - components/admin/users-table.tsx

key-decisions:
  - "Card-mode Edit/Deactivate actions reuse the identical setEditingAccount/setDeactivatingAccount handlers and deactivateAccount Server Action already used by the table -- no new call sites"
  - "Empty state (profiles.length === 0) wraps BOTH the hidden md:block Table and md:hidden Card list so it is viewport-agnostic, matching crm-table.tsx's existing hasNoMatches pattern"

patterns-established:
  - "Twin-markup responsive table/card breakpoint applied a third time (crm-table.tsx, packages, now users-table.tsx) -- consistent CSS-only approach across all three admin tables"

requirements-completed: []

coverage:
  - id: D1
    description: "Below 768px, /admin/users renders accounts as stacked Cards instead of a raw table, with working Edit/Deactivate actions"
    verification:
      - kind: other
        ref: "grep -c 'md:hidden' components/admin/users-table.tsx (>=1); grep -c 'setEditingAccount' (>=2, same setter reused); npm run build (passes)"
        status: pass
    human_judgment: true
    rationale: "Automated checks confirm the markup and handler wiring exist and the build compiles, but actual sub-768px visual rendering and touch interaction require a live browser check (deferred to end-of-phase UAT per workflow.human_verify_mode=end-of-phase)."
  - id: D2
    description: "An empty accounts list renders a 'No accounts yet' card instead of a bare table header, at any breakpoint"
    verification:
      - kind: other
        ref: "grep -c 'No accounts yet' components/admin/users-table.tsx (>=1); grep -c 'profiles.length === 0' (>=1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Navigating to /admin/users shows a skeleton placeholder instead of a blank flash while the initial Supabase query resolves"
    verification:
      - kind: other
        ref: "test -f app/admin/(dashboard)/users/loading.tsx; grep -c Skeleton (>=2); npm run build (passes)"
        status: pass
    human_judgment: true
    rationale: "File existence and build compilation are automatically verified, but the actual loading-flash-vs-skeleton visual behavior on a real navigation requires a live browser check (deferred to end-of-phase UAT)."

duration: 15min
completed: 2026-07-24
status: complete
---

# Phase 5 Plan 4: Users Table Card-Mode + Loading Skeleton Summary

**CSS-only twin-markup table/card breakpoint retrofit for `users-table.tsx` (D-03) plus a new `users/loading.tsx` route skeleton (D-07), both reusing existing Server Actions and shadcn component defaults with zero new state or call sites.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `components/admin/users-table.tsx` now renders Admin/Staff accounts as stacked `Card` components below the 768px `md` breakpoint, and the original `Table` unchanged at/above it, via a pure CSS `hidden md:block` / `md:hidden` twin-markup switch (no `useIsMobile()`, avoiding SSR/hydration flash).
- Card mode reuses the identical `setEditingAccount`/`setDeactivatingAccount` state setters and the existing `deactivateAccount` Server Action already wired to the table's `DropdownMenu` — no new call sites, no new authorization surface.
- Added a genuine D-07 gap fix: `users-table.tsx` previously had no empty-state handling at all. A new `profiles.length === 0` branch (matching `crm-table.tsx`'s `hasNoMatches` visual pattern exactly — same `bg-card`/`ring-foreground/10`/heading classes) now wraps both the table and card branches so an empty accounts list shows a "No accounts yet" card instead of a bare table header, at any viewport.
- Created `app/admin/(dashboard)/users/loading.tsx`, a static Server Component mirroring `crm/loading.tsx`'s structure with `h-14` skeleton rows sized for the users row's badge-heavy layout, closing the blank-white-flash gap on `/admin/users` navigation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CSS-only card-mode branch to users-table.tsx** - `50393e1` (feat)
2. **Task 2: Add app/admin/(dashboard)/users/loading.tsx skeleton** - `dd89744` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/admin/users-table.tsx` - Added `hidden md:block` Table wrap, new `md:hidden` Card list branch reusing existing role/permission/status Badge logic and Edit/Deactivate DropdownMenu, and a new viewport-agnostic `profiles.length === 0` "No accounts yet" empty state
- `app/admin/(dashboard)/users/loading.tsx` - New route-level Suspense fallback skeleton, mirroring `crm/loading.tsx`

## Decisions Made
- Card-mode Edit/Deactivate actions call the exact same `setEditingAccount`/`setDeactivatingAccount` handlers and `deactivateAccount` Server Action already used by the table — zero new call sites, preserving the existing self-/last-admin lockout guard as the sole enforcement path (T-05-06 threat disposition).
- Empty-state branch (`profiles.length === 0`) wraps BOTH the `hidden md:block` Table and `md:hidden` Card list so it renders correctly at every breakpoint, matching `crm-table.tsx`'s existing `hasNoMatches` empty-state pattern (same classes, same copy tone).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Both `users-table.tsx` and its `loading.tsx` are now consistent with the twin-markup pattern already applied to `crm-table.tsx` (05-02) and the packages list (05-03) — all three admin tables now share the same responsive approach. `npm run build` passes with no new TypeScript errors after each task. Live sub-768px visual verification and the loading-skeleton-vs-blank-flash check are deferred to end-of-phase UAT per `workflow.human_verify_mode=end-of-phase`, consistent with prior plans in this phase.

---
*Phase: 05-mobile-responsive-visual-polish*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: components/admin/users-table.tsx
- FOUND: app/admin/(dashboard)/users/loading.tsx
- FOUND commit: 50393e1
- FOUND commit: dd89744
