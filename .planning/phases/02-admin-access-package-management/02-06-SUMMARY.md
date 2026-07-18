---
phase: 02-admin-access-package-management
plan: 06
subsystem: admin
tags: [nextjs, server-actions, supabase-storage, dnd-kit, photo-management]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management (plan 05)
    provides: "components/admin/package-form.tsx (tabbed create/edit form with Photos-tab placeholder), app/admin/(dashboard)/packages/[id]/page.tsx edit route with a real package_id"
provides:
  - "actions/package-photos.ts — uploadPhotos()/deletePhoto()/reorderPhotos() Server Actions"
  - "components/admin/photo-manager.tsx — multi-upload + drag-reorder + inline delete UI"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side FileReader.readAsDataURL() -> base64 payload sent to a Server Action, decoded server-side via Buffer.from(base64, 'base64') before the Supabase Storage upload — avoids a separate upload API route"
    - "uploadPhotos returns the newly-inserted package_photos rows (ActionResult & { photos? }) so the client can append to local state directly, matching createPackage's ActionResult & { id? } convention, rather than refetching or router.refresh()"
    - "PhotoManager's local useState for optimistic drag-reorder/delete, matching sortable-package-list.tsx's established Pattern 6 usage in this phase"

key-files:
  created:
    - actions/package-photos.ts
    - components/admin/photo-manager.tsx
  modified:
    - components/admin/package-form.tsx
    - "app/admin/(dashboard)/packages/[id]/page.tsx"

key-decisions:
  - "uploadPhotos/deletePhoto/reorderPhotos each independently look up the package's slug (or the photo's package_id -> slug) before revalidatePath, rather than trusting a client-supplied slug — keeps the untrusted-input boundary consistent with actions/packages.ts's existing actions"
  - "Delete and reorder update PhotoManager's local state directly from the Server Action's own result (optimistic local state + rollback on !result.ok), avoiding any need to re-fetch the package or call router.refresh() after every mutation"
  - "Reused the exact 44px flex size-11 button + Tooltip wrapper pattern from package-list-row.tsx's drag handle for both the drag handle and the delete icon on each photo thumbnail, for visual/interaction consistency with the existing admin package list"

patterns-established:
  - "Server Actions that mutate a package's child data independently resolve packages.slug for revalidatePath, rather than accepting a slug as an untrusted parameter"

requirements-completed: [PKG-01, PKG-02, AUTH-05]

coverage:
  - id: D1
    description: "actions/package-photos.ts exports uploadPhotos, deletePhoto, reorderPhotos, each calling requirePermission('can_manage_packages') before any Storage/DB write"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "grep -c 'requirePermission(\"can_manage_packages\")' actions/package-photos.ts returns 3; npm run build and npm run lint both pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "uploadPhotos calls supabase.storage.from('package-photos').upload; deletePhoto calls both .storage.from('package-photos').remove and a package_photos row delete"
    requirement: "PKG-01"
    verification:
      - kind: other
        ref: "Manual code inspection of actions/package-photos.ts (lines ~80-92 upload, ~150-165 remove+delete); npm run build type-checks cleanly against the generated Supabase types"
        status: pass
    human_judgment: false
  - id: D3
    description: "photo-manager.tsx imports DndContext/SortableContext from @dnd-kit/core/@dnd-kit/sortable; package-form.tsx imports and renders PhotoManager conditionally on packageId being defined; photo delete has no alert-dialog wrapper"
    requirement: "PKG-01"
    verification:
      - kind: other
        ref: "grep -c DndContext components/admin/photo-manager.tsx returns 3; grep -c PhotoManager components/admin/package-form.tsx returns 4; no AlertDialog import/usage in photo-manager.tsx (plain button + Tooltip only); npm run build and npm run lint both pass"
        status: pass
    human_judgment: false
  - id: D4
    description: "A Staff session without can_manage_packages cannot call uploadPhotos/deletePhoto/reorderPhotos even with a direct request"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "Code inspection: all 3 actions call requirePermission('can_manage_packages') as their first statement, throwing before any Storage/DB access is reached; backed by 02-01's storage.objects and package_photos RLS policies (supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql) as an independent second layer"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full browser flow: create a package (redirects to its edit page), upload 2-3 photos, drag-reorder them, delete one, publish the package, and confirm the public detail page gallery reflects the final photo set in order"
    requirement: "PKG-02"
    verification: []
    human_judgment: true
    rationale: "File upload, drag-reorder, and cross-page gallery reflection require a real authenticated browser session with real image files — config.json's human_verify_mode is end-of-phase (consistent with 02-04's D4 and 02-05's D5 deferrals), so this is deferred to end-of-phase human verification, not skipped. Automated coverage so far: build/typecheck/lint pass, all grep-based acceptance criteria pass, and the requirePermission gate is confirmed present in all 3 actions by direct code inspection."

# Metrics
duration: 20min
completed: 2026-07-18
status: complete
---

# Phase 2 Plan 06: Package Photo Management Summary

**Multi-upload + drag-reorder + inline-delete photo manager wired into `package-form.tsx`'s Photos tab, backed by three permission-gated Server Actions (`uploadPhotos`/`deletePhoto`/`reorderPhotos`) that read/write the `package-photos` Storage bucket and the `package_photos` table.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-18T15:51:00Z (approx.)
- **Completed:** 2026-07-18T16:11:03Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `actions/package-photos.ts`: `uploadPhotos(packageId, files)` — permission-gates first, resolves the package's slug, uploads each file's decoded base64 buffer to `package-photos` Storage at a unique `${packageId}/photo-${timestamp}-${index}.${ext}` path, inserts a `package_photos` row per file (`display_order` continuing from the current max), and returns the newly-created rows so the client can update its local state without a refetch. `deletePhoto(photoId)` — permission-gates, looks up the photo's storage path and package slug, removes the Storage object, deletes the row, revalidates. `reorderPhotos(packageId, order)` — permission-gates once, updates each row's `display_order` via `Promise.all`, revalidates.
- `components/admin/photo-manager.tsx`: `"use client"` component accepting `{ packageId, initialPhotos }`. Renders a file input (multiple, `accept="image/*"`) that reads selected files as base64 client-side via `FileReader.readAsDataURL` and calls `uploadPhotos`; renders existing/new photos as a `DndContext`/`SortableContext` grid of thumbnails (each resolved to a public URL via `supabase.storage.from("package-photos").getPublicUrl`, same call the public site already uses), each thumbnail carrying a 44px drag handle and a 44px inline delete button (no `alert-dialog`, per UI-SPEC's explicit no-confirmation note) wrapped in `Tooltip` for accessibility. Drag-end computes the new order via `arrayMove` (optimistic local state) and persists via `reorderPhotos`; delete removes from local state optimistically and rolls back on failure.
- `components/admin/package-form.tsx`: Photos tab now renders `<PhotoManager packageId={packageId} initialPhotos={initialPhotos} />` when `packageId` is defined (edit mode); the "Save the package details first, then add photos here" note is preserved unchanged for create mode (no `packageId` yet).
- `app/admin/(dashboard)/packages/[id]/page.tsx`: query now also selects `package_photos(id, storage_path, display_order, alt_text)`, maps the joined rows into `PhotoManagerPhoto`-shaped objects, and passes them to `<PackageForm initialPhotos={photos} />`.

## Task Commits

1. **Task 1: Photo Server Actions (upload/delete/reorder)** - `b727f52` (feat)
2. **Task 2: Photo manager UI wired into package-form.tsx** - `2b84818` (feat)

**Plan metadata:** committed in this same SUMMARY.md commit

## Files Created/Modified

- `actions/package-photos.ts` — `uploadPhotos()`, `deletePhoto()`, `reorderPhotos()`
- `components/admin/photo-manager.tsx` — `PhotoManager` multi-upload/drag-reorder/delete component
- `components/admin/package-form.tsx` — Photos tab now renders `PhotoManager`
- `app/admin/(dashboard)/packages/[id]/page.tsx` — fetches and passes `initialPhotos`

## Decisions Made

- Each Server Action independently resolves the package's `slug` (via `packageId` or the photo's `package_id`) before calling `revalidatePath`, rather than accepting a client-supplied slug — keeps the untrusted-input boundary consistent with `actions/packages.ts`'s existing actions.
- `uploadPhotos` returns the newly-inserted `package_photos` rows in its `ActionResult`, and `PhotoManager` appends them directly to local state — avoids a refetch or `router.refresh()` round trip after every upload, matching `createPackage`'s existing `ActionResult & { id? }` convention of returning extra data alongside `ok: true`.
- Delete and reorder use optimistic local state updates with rollback on failure (same pattern as `sortable-package-list.tsx`'s existing `reorderPackages` usage), rather than reloading the photo list from the server after each mutation.
- Reused the exact 44px `flex size-11` button + `Tooltip` wrapper pattern from `package-list-row.tsx`'s drag handle for both the drag handle and delete icon on each photo thumbnail, for visual/interaction consistency with the existing admin package list.

## Deviations from Plan

None — plan executed as written. (Note: the plan's illustrative `<verify>` grep patterns use single-quoted string literals, e.g. `requirePermission('can_manage_packages')`; this codebase's established convention — per 02-04/02-05's own documented deviations — uses double-quoted string literals throughout `actions/*.ts`. The equivalent double-quoted greps were used instead and confirm the same counts; this is not a new deviation, just a continuation of the already-accepted double-quote convention.)

## Issues Encountered

One build-time TypeScript error during Task 2 (Rule 1 — bug, fixed inline before commit): `reorderPhotos` in `photo-manager.tsx`'s `handleDragEnd` was initially called with only the `order` argument, omitting the required `packageId` first argument. Caught immediately by `npm run build`'s type check; fixed by passing `packageId` as the first argument. No separate commit — fixed before the Task 2 commit was made, so the committed code never contained the error.

`npm run build` and `npm run lint` both pass cleanly with zero errors/warnings.

## User Setup Required

None — no external service configuration required. Storage bucket and its RLS policies (public-read + `can_manage_packages`-scoped write) already exist from the 02-01 migration.

## Next Phase Readiness

**PKG-01/02/AUTH-05 fully complete for this phase.** All package CRUD, publish/feature/reorder, and now photo upload/reorder/delete are implemented and permission-gated. What's deferred to end-of-phase human verification (per `config.json`'s `human_verify_mode: end-of-phase`, consistent with 02-04's D4 and 02-05's D5 deferrals):

- Full browser click-through: create a package, upload 2-3 real photos, drag-reorder them, delete one, publish, and confirm the public detail page gallery reflects the final set in the saved order.
- Confirming a Staff session without `can_manage_packages` is rejected by the live UI when attempting a direct request to any of the 3 photo actions (server-side code-level enforcement is already confirmed; the authenticated-but-unauthorized case needs a real Staff login, same deferral pattern as prior plans in this phase).

What's already confirmed:
- `npm run build` and `npm run lint` pass with zero errors.
- All plan-specified grep-based acceptance criteria pass (see Coverage above).
- Code inspection confirms all 3 new Server Actions call `requirePermission("can_manage_packages")` as their first statement.

This closes out Phase 2's package-management slice (PKG-01, PKG-02, D-11) — the phase is ready for end-of-phase human verification across all 6 plans.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: actions/package-photos.ts
- FOUND: components/admin/photo-manager.tsx
- FOUND: components/admin/package-form.tsx
- FOUND: app/admin/(dashboard)/packages/[id]/page.tsx
- FOUND commit: b727f52 (Task 1)
- FOUND commit: 2b84818 (Task 2)
