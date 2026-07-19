---
phase: 02-admin-access-package-management
plan: 11
subsystem: ui
tags: [react-hook-form, zod, base-ui, tabs, forms, package-form]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "PackageForm tabbed create/edit UI and createPackage/updatePackage Server Actions from 02-05/02-08"
provides:
  - "Visible validation feedback (toast + auto-tab-switch) on package-create/edit form submission failure"
  - "All 4 PackageForm tabs pre-mounted (keepMounted) so error text on any tab is always reachable"
affects: [package-form, admin-packages, uat-test-5, uat-test-6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "onInvalid handler mapped from a declarative tab-to-field lookup table (TAB_FIELD_MAP), searched in declaration order for the first tab containing an errored field"
    - "Controlled Base UI Tabs (value/onValueChange) driven programmatically from form-validation state, not just user clicks"

key-files:
  created: []
  modified:
    - components/admin/package-form.tsx

key-decisions:
  - "Declared TAB_FIELD_MAP as a module-scope array of {tab, fields} instead of a plain object, so onInvalid's tab-selection order is explicit and matches visual tab order (details -> itinerary -> inclusions)"
  - "photos tab intentionally excluded from TAB_FIELD_MAP since it has no schema-backed PackageFormValues fields"

patterns-established:
  - "Pattern: form.handleSubmit(onSubmit, onInvalid) is the required wiring for any react-hook-form usage in this codebase where the form has multiple tabs/sections -- a success-only handleSubmit call produces zero feedback on validation failure"

requirements-completed: [PKG-01]

coverage:
  - id: D1
    description: "Submitting the package-create form with a required field left empty on a non-active tab shows a toast and auto-switches to the tab containing the error"
    requirement: "PKG-01"
    verification:
      - kind: automated_ui
        ref: "grep-based acceptance criteria (source-level) + npm run lint/build; live-browser retest deferred to end-of-phase human_verification per human_verify_mode: end-of-phase"
        status: pass
    human_judgment: true
    rationale: "This phase's own debug session (create-package-button-noop.md) found that source-level checks alone had missed a live-behavior gap before; the plan's own verify block requires a real-browser retest of 02-UAT.md Test 5 (and the newly-unblocked Test 6) before this can be considered fully proven, per human_verify_mode: end-of-phase."
  - id: D2
    description: "A fully-valid package-create form submission still creates the package and redirects to its edit page, unchanged"
    requirement: "PKG-01"
    verification:
      - kind: other
        ref: "onSubmit body, create/update branching, and package-form-schema.ts were not modified by this plan -- confirmed via diff review"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 11: Package-Create Validation Feedback Summary

**Wired `form.handleSubmit(onSubmit, onInvalid)` plus a controlled, keepMounted Tabs setup so a failed package-create/edit validation now shows a toast and auto-switches to the offending tab instead of silently doing nothing.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-19T13:52:00+08:00 (approx.)
- **Completed:** 2026-07-19T14:06:39+08:00
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Closed 02-UAT.md Test 5 (major): "nothing happens" on package-create submit now surfaces a toast ("Please fix the highlighted fields before submitting.") and automatically switches to the tab containing the first invalid field
- All 4 `TabsContent` panels now render with `keepMounted`, so a required field on an unvisited tab (e.g. `bestTimeToGo`/`groupSize` on Inclusions & FAQ) always has its `FormMessage` error text present in the DOM, reachable the moment `onInvalid` switches to that tab
- Unblocks 02-UAT.md Test 6 (photo upload/reorder/delete) for retest, since a package can now actually be created
- Zero changes to `package-form-schema.ts` validation rules or `onSubmit`'s create/update persistence logic -- confirmed already-correct by the prior debug session, untouched here

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire onInvalid feedback + auto-tab-switch + keepMounted** - `96c8a5e` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/admin/package-form.tsx` - Added `TAB_FIELD_MAP`, `activeTab` state, `onInvalid` handler, controlled `<Tabs value={activeTab} onValueChange=...>`, and `keepMounted` on all 4 `TabsContent` instances

## Decisions Made
- `TAB_FIELD_MAP` declared as an ordered array (not object) so the tab search order for `onInvalid` explicitly matches the visual left-to-right tab order
- `photos` tab excluded from the map (no schema-backed fields render there)

## Deviations from Plan

None - plan executed exactly as written. All 5 acceptance-criteria grep counts matched exactly (1x `form.handleSubmit(onSubmit, onInvalid)`, 1x `function onInvalid`, 1x `value={activeTab}`, 4x `keepMounted`, 4x `toast.error(`), and both `npm run lint` and `npm run build` passed with no new errors.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

This plan's own `<verify><human-check>` requires a live-browser retest of 02-UAT.md Test 5 (validation feedback) and the newly-unblocked Test 6 (photo upload/reorder/delete), per this project's `human_verify_mode: end-of-phase` config. That retest is carried forward as an end-of-phase human verification item alongside 02-12 and 02-13's own outstanding items -- not performed as part of this plan's automated execution.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: components/admin/package-form.tsx
- FOUND: 96c8a5e
