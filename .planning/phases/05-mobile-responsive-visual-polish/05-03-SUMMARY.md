---
phase: 05-mobile-responsive-visual-polish
plan: 03
subsystem: ui
tags: [nextjs, react, tailwind, dnd-kit, shadcn, admin-panel]

# Dependency graph
requires:
  - phase: 05-01
    provides: mobile-responsive foundation patterns (twin-markup hidden md:block / md:hidden breakpoint convention)
  - phase: 02-08
    provides: publishPackage/featurePackage/softDeletePackage/reorderPackages Server Actions and existing PackageListRow drag-reorder table
provides:
  - "PackageListCard component: card-mode render of a package list item with drag handle, thumbnail, Published/Featured switches, and Edit/Delete dropdown"
  - "sortable-package-list.tsx twin-markup breakpoint: Table (hidden md:block) + Card list (md:hidden), sharing one sensors/handleDragEnd/items state across two DndContext instances"
  - "app/admin/(dashboard)/packages/loading.tsx route-level Suspense skeleton"
affects: [05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Twin-markup responsive breakpoint (hidden md:block / md:hidden) applied to a dnd-kit drag-reorder list: two DndContext/SortableContext pairs sharing the same sensors/handleDragEnd/items state, only the CSS-visible one receives pointer/keyboard events"
    - "useSortable() hook wiring is markup-agnostic — copied verbatim from a <TableRow> ref target to a <Card> ref target with no changes to drag logic"

key-files:
  created:
    - components/admin/package-list-card.tsx
    - app/admin/(dashboard)/packages/loading.tsx
  modified:
    - components/admin/sortable-package-list.tsx

key-decisions:
  - "Card mode reuses the identical publishPackage/featurePackage/softDeletePackage Server Action imports from @/actions/packages already used by PackageListRow — no new call sites, no new wrapper functions (closes T-05-04)"
  - "package-list-row.tsx left completely untouched — PackageListCard is a new, standalone file copying the row's pattern rather than an edit to the row component"
  - "Drag-handle button in PackageListCard gains hover/focus-visible/active state classes (hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-muted rounded-md) that package-list-row.tsx's source pattern lacks, per D-07 and the ring-ring/50 convention already used in checkbox.tsx/switch.tsx"
  - "Confirmed (not rebuilt): packages/page.tsx's existing items.length === 0 'No packages yet' empty state already short-circuits before SortablePackageList renders, so it covers card mode uniformly at every breakpoint without any new empty-state code (D-07)"

patterns-established:
  - "Loading skeleton row height bumped to h-14 (vs crm/loading.tsx's h-10) to loosely hint at the thumbnail+switches row shape, without over-engineering exact column widths"

requirements-completed: []

coverage:
  - id: D1
    description: "Below 768px, /admin/packages renders packages as stacked, drag-reorderable Cards (drag handle, thumbnail, name, Published/Featured switches, Edit/Delete menu) instead of the raw table; at/above 768px the existing Table renders unchanged"
    verification:
      - kind: other
        ref: "npm run build (TypeScript + route compile) + grep gates: PackageListCard export, @dnd-kit/sortable import, @/actions/packages import, hidden md:block / md:hidden twin markup in sortable-package-list.tsx"
        status: pass
    human_judgment: true
    rationale: "Visual drag-reorder interaction and breakpoint rendering require a live browser check (resize to <768px, drag a card, toggle switches) — not verifiable from static grep/build alone"
  - id: D2
    description: "Navigating to /admin/packages shows a skeleton placeholder instead of a blank flash while the initial Supabase query resolves"
    verification:
      - kind: other
        ref: "test -f app/admin/(dashboard)/packages/loading.tsx && grep -c Skeleton (>=2) + npm run build"
        status: pass
    human_judgment: true
    rationale: "The blank-flash-vs-skeleton behavior is a Suspense-boundary timing effect only observable in a real page load, not from static file checks"
  - id: D3
    description: "The card's drag-handle button shows hover/focus-visible/active feedback; Switch/DropdownMenu controls keep their existing shadcn hover/focus/active defaults"
    verification:
      - kind: other
        ref: "grep -c 'focus-visible:ring-2' components/admin/package-list-card.tsx (>=1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The existing page-level 'No packages yet' empty state already covers card mode since it renders in place of SortablePackageList regardless of breakpoint — confirmed, not rebuilt"
    verification:
      - kind: other
        ref: "grep -c 'No packages yet' app/admin/(dashboard)/packages/page.tsx (>=1); page.tsx read in full, items.length === 0 branch confirmed unmodified and short-circuits before SortablePackageList"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-24
status: complete
---

# Phase 5 Plan 3: Packages Admin List Card-Mode Retrofit Summary

**Packages admin list renders as stacked drag-reorderable Cards below 768px (new PackageListCard sharing PackageListRow's exact Server Actions and dnd-kit wiring) and gained a route-level loading skeleton, closing D-03 and D-07's confirmed gap.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-24T15:22:00Z
- **Completed:** 2026-07-24T15:37:54Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Below 768px, `/admin/packages` now renders packages as stacked, drag-reorderable `Card`s with working Published/Featured switches, Edit/Delete menu, and drag-reorder persisted via `reorderPackages` — the existing `Table` still renders unchanged at/above 768px
- Added `app/admin/(dashboard)/packages/loading.tsx`, replacing the prior blank-white flash with a skeleton while the initial Supabase query resolves
- Confirmed (via direct code read, not assumption) that `packages/page.tsx`'s existing `items.length === 0` empty state already covers card mode uniformly, since it short-circuits before `SortablePackageList` renders at all

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract PackageListCard + wire card-mode branch into SortablePackageList** - `9646d33` (feat)
2. **Task 2: Add app/admin/(dashboard)/packages/loading.tsx skeleton** - `e6e4b2f` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/admin/package-list-card.tsx` - New client component: card-mode render of a package list item, reusing `useSortable()`, `publishPackage`/`featurePackage`/`softDeletePackage` Server Actions, and the `DropdownMenu`/`AlertDialog` delete-confirmation flow verbatim from `package-list-row.tsx`
- `components/admin/sortable-package-list.tsx` - Wrapped the existing `Table` (with its `DndContext`/`SortableContext`) in `hidden md:block`; added a sibling `md:hidden` `DndContext`/`SortableContext` rendering a `flex flex-col gap-3` list of `PackageListCard`s, sharing the same `sensors`/`handleDragEnd`/`items` state
- `app/admin/(dashboard)/packages/loading.tsx` - New route-level Suspense fallback: title skeleton + six `h-14` row skeletons, mirroring `crm/loading.tsx`'s structure

## Decisions Made
- Card mode calls the identical `publishPackage`/`featurePackage`/`softDeletePackage` Server Action imports already used by `PackageListRow` — no new call sites, verified via grep gate on the `@/actions/packages` import path (closes threat T-05-04)
- `package-list-row.tsx` was read as the source pattern but left completely untouched, per the plan's explicit instruction
- Drag-handle button in the new card gets `hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-muted rounded-md` appended to its className — state feedback that `package-list-row.tsx`'s own drag-handle lacks — reusing the `ring-ring/50` focus-visible convention already established in `checkbox.tsx`/`switch.tsx` rather than inventing a new token
- Confirmed via direct read of `app/admin/(dashboard)/packages/page.tsx` that its `items.length === 0` "No packages yet" card (matching the CRM empty-state pattern) renders in place of `SortablePackageList` before either the table or new card branch is ever reached — no new empty-state code needed for D-07

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Packages admin list now has full mobile card-mode parity with the CRM/users tables from 05-02, ready for 05-04/05-05's remaining mobile-polish plans
- Live drag-reorder and switch-toggle interaction below 768px, plus the loading-skeleton flash fix, are flagged for end-of-phase human UAT per `workflow.human_verify_mode: end-of-phase` (coverage D1/D2 above) — no blockers, just deferred verification per existing project convention

---
*Phase: 05-mobile-responsive-visual-polish*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: components/admin/package-list-card.tsx
- FOUND: app/admin/(dashboard)/packages/loading.tsx
- FOUND: components/admin/sortable-package-list.tsx
- FOUND commit: 9646d33
- FOUND commit: e6e4b2f
