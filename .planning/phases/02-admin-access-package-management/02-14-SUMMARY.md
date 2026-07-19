---
phase: 02-admin-access-package-management
plan: 14
subsystem: ui
tags: [react, nextjs, admin-panel, package-management, client-state]

requires:
  - phase: 02-admin-access-package-management
    provides: "SortablePackageList/PackageListRow client components (02-04), softDeletePackage server action (02-08/02-09)"
provides:
  - "Admin package list deletes rows from local render state immediately on success, instead of relying on router.refresh() re-hydrating an already-mounted child"
affects: [admin-package-management, gap-closure]

tech-stack:
  added: []
  patterns:
    - "Optimistic-on-success local state removal after a server action succeeds (mirrors photo-manager.tsx's handleDelete pattern) instead of depending on router.refresh() to re-seed useState(initialItems) in an already-mounted child component"

key-files:
  created: []
  modified:
    - components/admin/package-list-row.tsx
    - components/admin/sortable-package-list.tsx

key-decisions:
  - "Added a dedicated onDeleted(id) callback (separate from onMutated()) so publish/feature toggles keep their existing router.refresh()-based revalidation path completely untouched, per the plan's explicit isolation requirement"

patterns-established:
  - "Delete-success client state pattern: filter the deleted item out of the parent's local useState array directly in the success branch, rather than calling router.refresh() and expecting an already-mounted child to re-consume a fresh initialItems prop (which React does not do after first mount)"

requirements-completed: [PKG-03]

coverage:
  - id: D1
    description: "Deleting a package removes its row from the admin package list immediately, without a page reload, matching the delete-confirmation dialog's own promised copy"
    requirement: "PKG-03"
    verification:
      - kind: automated_ui
        ref: "grep-based acceptance criteria (exact-count checks on onDeleted prop type, onDeleted(item.id) call site, handleDeleted function, filter expression, and prop wiring) — all passed"
        status: pass
      - kind: other
        ref: "npm run lint"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: true
    rationale: "Live browser verification of the delete interaction (row disappears immediately, no reload, publish/feature/drag-reorder unaffected) is deferred per this project's human_verify_mode: end-of-phase config setting -- source-level and build-level checks pass, but the phase's own repeated lesson is that live-behavior gaps have been missed by source inspection alone before."

duration: 6min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 14: Package Delete Local-State Fix Summary

**Fixed admin package list to filter deleted packages from local `useState` directly (mirroring `photo-manager.tsx`'s existing pattern), instead of relying on `router.refresh()` to re-hydrate an already-mounted `SortablePackageList`'s stale `items` state.**

## Performance

- **Duration:** 6 min
- **Completed:** 2026-07-19T12:36:15Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `PackageListRow` now accepts an `onDeleted(id: string) => void` callback, called from `handleDelete()`'s success branch in place of `onMutated()`
- `SortablePackageList` gained `handleDeleted(id)`, which filters the deleted package out of its own `items` state via `setItems((current) => current.filter((item) => item.id !== id))`
- Publish/unpublish and feature-toggle handlers, and the drag-reorder `router.refresh()` path, are completely unchanged -- `onMutated`/`handleMutated` still exist and are still wired for those two toggles

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace router.refresh()-only delete path with direct local-state filtering** - `9f4b8ed` (fix)

**Plan metadata:** _pending (this commit)_

## Files Created/Modified
- `components/admin/package-list-row.tsx` - Added `onDeleted: (id: string) => void` prop; `handleDelete()`'s success branch now calls `onDeleted(item.id)` instead of `onMutated()`. `handlePublishChange`/`handleFeatureChange` untouched (still call `onMutated()`).
- `components/admin/sortable-package-list.tsx` - Added `handleDeleted(id)` which filters the deleted item out of local `items` state; passed as `onDeleted={handleDeleted}` to each `<PackageListRow>` alongside the existing `onMutated={handleMutated}`.

## Decisions Made
- Kept `onDeleted` as a distinct callback from `onMutated` (not a shared/overloaded prop) so the fix's blast radius is scoped exactly to the delete path, leaving publish/feature/drag-reorder's `router.refresh()`-based revalidation completely untouched, per the plan's explicit non-regression requirement.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All acceptance-criteria grep checks passed on first attempt, `npm run lint` was clean, and `npm run build` succeeded with no new errors (Node 20 deprecation warnings from `@supabase/supabase-js` are pre-existing and unrelated to this change).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PKG-03's "delete a tour package" gap (02-VERIFICATION.md round 5 gap 3 / 02-REVIEW.md CR-01) is closed at the source level; live browser re-verification is deferred to this project's end-of-phase human_verify_mode pass, along with the phase's other outstanding human-verify items.
- No new blockers introduced. The two unrelated findings flagged during 02-12 (bare-HTML `/admin/reset-password` styling; second freshly-requested reset link bouncing to `/admin/login`) remain open and are out of scope for this plan, per 02-13's carried-forward note -- this plan's own STATE.md session note ("Phase 02: two unresolved auth findings...") already tracks them for a separate `/gsd-debug` session.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: components/admin/package-list-row.tsx
- FOUND: components/admin/sortable-package-list.tsx
- FOUND: .planning/phases/02-admin-access-package-management/02-14-SUMMARY.md
- FOUND: 9f4b8ed (commit)
