---
phase: 02-admin-access-package-management
plan: 04
subsystem: admin
tags: [nextjs, server-actions, supabase, dnd-kit, shadcn, revalidatePath]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management (plan 02)
    provides: "lib/auth/dal.ts (requirePermission), lib/action-result.ts (ActionResult), shadcn switch/table/alert-dialog/dropdown-menu/tooltip components, permission-aware dashboard shell"
provides:
  - "actions/packages.ts — softDeletePackage/publishPackage/featurePackage/reorderPackages Server Actions, each permission-gated and revalidating the public site"
  - "app/admin/(dashboard)/packages/page.tsx — admin package list Server Component (drafts + published, excludes soft-deleted)"
  - "components/admin/sortable-package-list.tsx, components/admin/package-list-row.tsx — drag-reorder list with inline publish/feature switches and soft-delete"
affects: [02-05, 02-06]

# Tech tracking
tech-stack:
  added: ["@dnd-kit/core@6.3.1", "@dnd-kit/sortable@10.0.0", "@dnd-kit/utilities@3.2.2"]
  patterns:
    - "Optimistic local useState reorder (arrayMove) with server persistence via a Server Action, reverting to the previous items on error (no Redux, per CLAUDE.md)"
    - "Every package lifecycle Server Action calls requirePermission('can_manage_packages') first, then revalidatePath('/packages'), revalidatePath('/packages/{slug}'), and revalidatePath('/admin/packages') so Phase 1's public pages and the admin list reflect changes without a redeploy"
    - "Soft-delete sets deleted_at AND is_published=false atomically in one update call — defense in depth alongside 02-01's RLS-layer exclusion"

key-files:
  created:
    - actions/packages.ts
    - "app/admin/(dashboard)/packages/page.tsx"
    - components/admin/sortable-package-list.tsx
    - components/admin/package-list-row.tsx
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Used double-quoted string literals (requirePermission(\"can_manage_packages\")) consistent with the rest of the codebase's quote convention (lib/auth/dal.ts, actions/users.ts), rather than the plan's illustrative single-quoted grep pattern — functionally identical, verified via an adjusted grep"
  - "Drag handle (not the whole row) carries dnd-kit's listeners/attributes, sized size-11 (44px) per UI-SPEC's touch-target requirement, wrapped in a Tooltip labeled 'Drag to reorder'"
  - "Edit action in the row's dropdown menu links to /admin/packages/{id}, a forward reference to the create/edit form built in 02-05 (same forward-reference pattern the plan explicitly calls out for the empty-state 'Add Package' CTA)"

patterns-established:
  - "AdminPackageListItem (exported from app/admin/(dashboard)/packages/page.tsx) is the shared serializable shape passed from the Server Component down through the client reorder/row components — future admin list-with-photos pages can follow this same server-computes-photoUrl-then-passes-flat-object pattern"

requirements-completed: [PKG-03, PKG-04, PKG-05, PKG-06, AUTH-05]

coverage:
  - id: D1
    description: "actions/packages.ts exports softDeletePackage, publishPackage, featurePackage, reorderPackages — each calls requirePermission('can_manage_packages') before any Supabase write, and softDeletePackage sets both deleted_at and is_published=false atomically"
    requirement: "PKG-03"
    verification:
      - kind: other
        ref: "grep -c 'requirePermission(\"can_manage_packages\")' actions/packages.ts returns 4; npm run build type-checks cleanly"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every lifecycle Server Action calls revalidatePath so Phase 1's public /packages and /packages/{slug} pages, plus the admin list, reflect mutations without a redeploy"
    requirement: "PKG-04"
    verification:
      - kind: other
        ref: "grep -c revalidatePath actions/packages.ts returns 12 (3 calls x 4 functions)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Admin package list (app/admin/(dashboard)/packages/page.tsx) is requirePermission-gated, queries packages filtering .is('deleted_at', null) with no is_published filter (so admin sees drafts), ordered by sort_order, with a UI-SPEC-matching empty state"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "grep checks in this plan's Task 2 acceptance_criteria all pass; npm run build succeeds; curl -I http://localhost:3000/admin/packages while logged out returns 307 to /admin/login (live dev server)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Drag-reorder (sortable-package-list.tsx + package-list-row.tsx) persists sort_order via reorderPackages on drop, with a 44px tooltip-labeled drag handle; Published/Featured switches call publishPackage/featurePackage; delete opens an alert-dialog with the exact UI-SPEC copy and calls softDeletePackage"
    requirement: "PKG-06"
    verification: []
    human_judgment: true
    rationale: "Drag-and-drop interaction, cross-tab public-site reflection, and toggling Published/Featured against the 3 live seeded packages require an actual browser session — config.json's human_verify_mode is end-of-phase (consistent with 02-02's D2/D3/D4 deferrals), so this is deferred to end-of-phase human verification, not skipped. Automated coverage so far: build/typecheck/lint pass, all grep-based acceptance criteria pass, and the requirePermission gate was confirmed live (unauthenticated /admin/packages redirects to /admin/login)."

# Metrics
duration: 25min
completed: 2026-07-18
status: complete
---

# Phase 2 Plan 04: Package Lifecycle Actions & Admin Package List Summary

**Server Actions (`softDeletePackage`/`publishPackage`/`featurePackage`/`reorderPackages`) plus a `@dnd-kit`-powered admin package list with drag-reorder, inline Published/Featured switches, and soft-delete — every mutation permission-gated and reflected on Phase 1's public site via `revalidatePath` with no redeploy.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-18T23:28:00+08:00
- **Completed:** 2026-07-18T23:53:33+08:00
- **Tasks:** 2 of 2 completed
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- `actions/packages.ts`: 4 permission-gated Server Actions — `softDeletePackage` (sets `deleted_at` + `is_published: false` atomically, defense in depth per Pitfall 4/T-02-16), `publishPackage`, `featurePackage`, `reorderPackages` (batched `Promise.all` update, error-checked before returning). Every function calls `revalidatePath` for both `/packages` and the affected package's `/packages/{slug}` (reorder only revalidates the list).
- `app/admin/(dashboard)/packages/page.tsx`: `requirePermission('can_manage_packages')`-gated Server Component querying `packages` + `package_photos` filtered to exclude soft-deleted rows (no `is_published` filter, so drafts are visible to admins), with the exact UI-SPEC empty state and "Add Package" CTA (forward reference to 02-05's create form).
- `components/admin/sortable-package-list.tsx` + `components/admin/package-list-row.tsx`: `@dnd-kit` `DndContext`/`SortableContext` drag-reorder (Pattern 6) with optimistic local `useState` + server persistence via `reorderPackages` and revert-on-error; 44px tooltip-labeled drag handle; `Switch` pairs labeled exactly "Published"/"Featured"; `dropdown-menu` (Edit → forward reference to 02-05, Delete → `alert-dialog` with exact UI-SPEC copy calling `softDeletePackage`).
- Installed `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2` (pre-vetted clean in RESEARCH.md's Package Legitimacy Audit).

## Task Commits

1. **Task 1: Lifecycle Server Actions (delete/publish/feature/reorder)** - `3d72894` (feat)
2. **Task 2: Admin package list — reorder, inline switches, delete** - `758f9ee` (feat)

**Plan metadata:** committed in this same SUMMARY.md commit

## Files Created/Modified
- `actions/packages.ts` — `softDeletePackage()`, `publishPackage()`, `featurePackage()`, `reorderPackages()`
- `app/admin/(dashboard)/packages/page.tsx` — admin package list Server Component, exports `AdminPackageListItem` type
- `components/admin/sortable-package-list.tsx` — `DndContext`/`SortableContext` client wrapper
- `components/admin/package-list-row.tsx` — per-row drag handle, switches, dropdown menu, delete alert-dialog
- `package.json`, `package-lock.json` — added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

## Decisions Made
- Used double-quoted string literals throughout (matching the rest of the codebase's existing convention in `lib/auth/dal.ts`/`actions/users.ts`) rather than the plan's illustrative single-quoted grep pattern; verified functional equivalence with an adjusted grep before proceeding.
- Placed dnd-kit's drag `listeners`/`attributes` on the row's dedicated 44px grip-handle button (not the whole `<TableRow>`), so switches/dropdown menu inside the row remain independently clickable without triggering a drag.
- `Edit` in the row's dropdown menu and the empty-state/header "Add Package" buttons link to `/admin/packages/{id}` and `/admin/packages/new` respectively — both are forward references to the create/edit form built in 02-05 (matching the plan's own explicit callout that this is expected until that plan lands later in the same phase).

## Deviations from Plan

None - plan executed exactly as written, aside from the double-quote convention note above (not a deviation from intent, just from the plan's illustrative grep pattern's quote style).

## Issues Encountered

None. Automated checks (`npm run build`, `npm run lint`) pass cleanly, and a live dev-server smoke test confirmed the unauthenticated `/admin/packages` redirect (`307` → `/admin/login`) matching 02-02's established proxy-gate behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready**, with one known, by-design gap consistent with this phase's wave sequencing: both the row's "Edit" link (`/admin/packages/{id}`) and the "Add Package" CTAs (`/admin/packages/new`) point at routes that don't exist until 02-05 lands. This matches the plan's own explicit note that these are forward references.

Full browser click-through verification of drag-reorder persistence, Published/Featured toggling against the 3 live seeded packages, and cross-tab public-site reflection is deferred to end-of-phase human verification per `config.json`'s `human_verify_mode: end-of-phase` — consistent with 02-02's D2/D3/D4 deferrals. What's already confirmed:
- `npm run build` and `npm run lint` pass with zero errors.
- All plan-specified grep-based acceptance criteria pass (with the double-quote adjustment noted above).
- Live dev-server smoke test: unauthenticated `/admin/packages` returns `307` to `/admin/login`, confirming the `requirePermission`/proxy gate chain works end-to-end for this new route.

What's confirmed ready for 02-05/02-06:
- `actions/packages.ts`'s 4 lifecycle actions are ready to be imported/reused (e.g., a create-package form in 02-05 will add its own `createPackage`/`updatePackage` actions in the same file or a sibling one, following this file's `requirePermission` + `revalidatePath` + generic-error-copy pattern).
- `AdminPackageListItem` (exported from `app/admin/(dashboard)/packages/page.tsx`) is available for 02-05's edit form to reuse if it needs the same flat shape.
- All shadcn components needed for 02-05/02-06 (`tabs`, `switch`, `select`, `dialog`, `alert-dialog`) are already installed (02-02).

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: actions/packages.ts
- FOUND: app/admin/(dashboard)/packages/page.tsx
- FOUND: components/admin/sortable-package-list.tsx
- FOUND: components/admin/package-list-row.tsx
- FOUND: .planning/phases/02-admin-access-package-management/02-04-SUMMARY.md
- FOUND commit: 3d72894 (Task 1)
- FOUND commit: 758f9ee (Task 2)
- FOUND commit: fa171de (Summary)
