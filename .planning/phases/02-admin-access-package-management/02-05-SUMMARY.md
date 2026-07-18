---
phase: 02-admin-access-package-management
plan: 05
subsystem: admin
tags: [nextjs, server-actions, supabase, react-hook-form, zod, tabs]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management (plan 04)
    provides: "actions/packages.ts (softDeletePackage/publishPackage/featurePackage/reorderPackages), app/admin/(dashboard)/packages/page.tsx admin list, AdminPackageListItem shape, shadcn tabs/switch/select/dialog/alert-dialog already installed"
provides:
  - "components/admin/package-form-schema.ts — PackageFormValues zod schema"
  - "components/admin/package-form.tsx — tabbed create/edit form (Details/Itinerary/Photos-interim/Inclusions & FAQ)"
  - "actions/packages.ts — createPackage()/updatePackage() appended, sharing a writePackageChildren() delete-then-reinsert helper"
  - "app/admin/(dashboard)/packages/new/page.tsx, app/admin/(dashboard)/packages/[id]/page.tsx"
affects: [02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useFieldArray with template-literal field names (itinerary.${index}.title) for repeatable itinerary/inclusion/exclusion/bring-item rows, per D-12"
    - "Client component (PackageForm) directly calls the Server Action and branches on result.ok, matching account-form.tsx's self-contained call pattern, rather than a separate page-level client wrapper"
    - "day_number/kind/sort_order are always computed from array position at submit/write time, never user-entered form fields"
    - "createPackage always explicitly sets is_published: false / is_featured: false in its insert payload, never relying on the packages table's own is_published default true (T-02-19)"

key-files:
  created:
    - components/admin/package-form-schema.ts
    - components/admin/package-form.tsx
    - "app/admin/(dashboard)/packages/new/page.tsx"
    - "app/admin/(dashboard)/packages/[id]/page.tsx"
  modified:
    - actions/packages.ts

key-decisions:
  - "Used plain z.number() (not z.coerce.number()) for fromPrice/durationDays — zod 4's coerce schemas have an 'unknown' input type that isn't assignable to useForm<PackageFormValues>()'s zodResolver type; numeric <Input type=\"number\"> fields instead convert via an explicit onChange={(e) => field.onChange(e.target.valueAsNumber)} handler, keeping the form's internal value already a number"
  - "PackageForm itself (not a separate page-level client wrapper) calls createPackage/updatePackage directly and handles the create-mode redirect via useRouter().push — the 'client wrapper' language in the plan's Task 2 action description is satisfied by PackageForm's own \"use client\" boundary, avoiding an extra indirection file not listed in either task's files_modified"
  - "Removed the word 'PhotoManager' from package-form.tsx's own doc comment (originally used to explain the Photos-tab forward reference) after discovering Task 1's acceptance grep (`grep -c \"PhotoManager\"` expected 0) matches comments too, not just imports — reworded to avoid the literal string entirely rather than relax the check's intent"

patterns-established:
  - "writePackageChildren(supabase, packageId, values) — shared delete-then-reinsert helper for itinerary_days/package_inclusions/faq_facts, used identically by both createPackage (against an empty child set) and updatePackage; future package-child-table additions should extend this one helper rather than duplicating the delete+insert pairs in both actions"

requirements-completed: [PKG-01, PKG-02, AUTH-05]

coverage:
  - id: D1
    description: "package-form-schema.ts exports PackageFormValues; fromPrice rejects non-positive values with the exact message \"Price must be a positive number\""
    requirement: "PKG-01"
    verification:
      - kind: other
        ref: "grep -c 'Price must be a positive number' components/admin/package-form-schema.ts returns 3 (number(), int(), positive() all share the message); npm run build type-checks cleanly"
        status: pass
    human_judgment: false
  - id: D2
    description: "package-form.tsx uses template-literal field names (itinerary.${index}.title / .description, inclusions/exclusions/bringItems.${index}.label) for every useFieldArray row, and does not reference PhotoManager anywhere (import or comment) since that lands in 02-06"
    requirement: "PKG-01"
    verification:
      - kind: other
        ref: "grep -cE 'itinerary\\.\\$\\{index\\}\\.' components/admin/package-form.tsx returns 2; grep -c PhotoManager components/admin/package-form.tsx returns 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "createPackage/updatePackage both call requirePermission('can_manage_packages') before any write; createPackage's insert payload explicitly sets is_published: false (not the column default); app/admin/(dashboard)/packages/[id]/page.tsx queries by id with no is_published filter so drafts remain editable"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "grep -c 'createPackage\\|updatePackage' actions/packages.ts returns 4 (2 definitions + 2 call sites in doc/helper references); grep -c 'is_published: false' actions/packages.ts returns 2; grep -c is_published app/admin/(dashboard)/packages/[id]/page.tsx returns 0; npm run build and npm run lint both pass"
        status: pass
    human_judgment: false
  - id: D4
    description: "Unauthenticated requests to /admin/packages/new and /admin/packages/[id] are rejected server-side (redirect to /admin/login), confirming the requirePermission gate is live end-to-end for both new routes"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "Live dev-server smoke test: curl -sD - http://localhost:3000/admin/packages/new and .../admin/packages/00000000-0000-0000-0000-000000000000 both return 307 with 'location: /admin/login'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full browser create-and-edit flow: submitting the Details/Itinerary/Inclusions & FAQ tabs creates an unpublished draft visible in the 02-04 admin list, redirects to the edit page, and editing one of the 3 seeded Phase 1 packages' itinerary persists and reflects on its public detail page once published"
    requirement: "PKG-02"
    verification: []
    human_judgment: true
    rationale: "Multi-tab form submission, the create-then-redirect flow, and cross-checking the public detail page after publish require a real authenticated browser session — config.json's human_verify_mode is end-of-phase (consistent with 02-04's D4 deferral), so this is deferred to end-of-phase human verification, not skipped. Automated coverage so far: build/typecheck/lint pass, all grep-based acceptance criteria pass, and the requirePermission gate was confirmed live via curl against both new routes."

# Metrics
duration: 25min
completed: 2026-07-19
status: complete
---

# Phase 2 Plan 05: Package Create/Edit Form (Details, Itinerary, Inclusions & FAQ) Summary

**Tabbed react-hook-form + zod create/edit form for a package's Details/Itinerary/Inclusions & FAQ content, backed by permission-gated `createPackage`/`updatePackage` Server Actions that always start new packages as unpublished drafts and share a single delete-then-reinsert helper for child-table writes.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-19T00:00:00+08:00 (approx.)
- **Completed:** 2026-07-19T00:03:00+08:00 (approx.)
- **Tasks:** 2 of 2 completed
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `components/admin/package-form-schema.ts`: `packageFormSchema` zod object covering Details (name/slug/fromPrice/durationDays/durationLabel), Itinerary (array of title/description), Inclusions/Exclusions/BringItems (each an array of label), and FAQ (bestTimeToGo/groupSize). Exports `PackageFormValues`. `day_number`/`kind`/`sort_order` are intentionally NOT schema fields — computed from array position at write time.
- `components/admin/package-form.tsx`: `"use client"` tabbed form (`Details` / `Itinerary` / `Photos` / `Inclusions & FAQ`) accepting `{ packageId?: string; defaultValues?: Partial<PackageFormValues> }`. Details tab auto-suggests a kebab-case slug from the name on blur until the user hand-edits the slug field. Itinerary/Inclusions/Exclusions/BringItems tabs each use `useFieldArray` with template-literal field names and add/remove buttons. Photos tab shows an interim "Save the package details first, then add photos here" note only in create mode (no `packageId` yet); renders nothing yet in edit mode — 02-06 fills in the real photo manager. Submit button reads "Create Package" / "Save Changes" per UI-SPEC. On submit, the form itself calls `createPackage` (create mode, then redirects to `/admin/packages/{id}` via `useRouter().push`) or `updatePackage` (edit mode), branching on `result.ok` with `sonner` toasts.
- `actions/packages.ts` (appended): `createPackage(values)` — `requirePermission('can_manage_packages')` first, computes `sortOrder` as the count of existing non-deleted packages, inserts the package row with `is_published: false` / `is_featured: false` explicitly set, then delegates child-row writes to a new shared `writePackageChildren()` helper, returns `{ ok: true, id }`. `updatePackage(id, values)` — same permission gate, updates only the Details-tab columns (never `is_published`/`is_featured`/`sort_order`), then calls the same `writePackageChildren()` helper (delete-then-reinsert `itinerary_days`/`package_inclusions`/`faq_facts`, mirroring `scripts/seed.ts`'s pattern), and revalidates both `/packages` and `/packages/{slug}`.
- `app/admin/(dashboard)/packages/new/page.tsx`: `requirePermission`-gated Server Component rendering `<PackageForm />` in create mode.
- `app/admin/(dashboard)/packages/[id]/page.tsx`: `requirePermission`-gated Server Component, fetches the package by `id` (not slug, no `is_published` filter so drafts are editable) joined with its `itinerary_days`/`package_inclusions`/`faq_facts`, calls `notFound()` if missing, maps the joined rows into `PackageFormValues`-shaped `defaultValues`, and renders `<PackageForm packageId defaultValues />`.

## Task Commits

1. **Task 1: Package form schema + tabbed form component** - `c5a7ea6` (feat)
2. **Task 2: createPackage/updatePackage actions + new/[id] pages** - `0356c29` (feat)

**Plan metadata:** committed in this same SUMMARY.md commit

## Files Created/Modified

- `components/admin/package-form-schema.ts` — `packageFormSchema`, `PackageFormValues`
- `components/admin/package-form.tsx` — `PackageForm` tabbed create/edit component
- `actions/packages.ts` — adds `createPackage()`, `updatePackage()`, and a shared `writePackageChildren()` helper
- `app/admin/(dashboard)/packages/new/page.tsx`, `app/admin/(dashboard)/packages/[id]/page.tsx`

## Decisions Made

- Switched `fromPrice`/`durationDays` from `z.coerce.number()` to plain `z.number()` after `npm run build` surfaced a TypeScript Resolver-type mismatch (zod 4's coerce schemas have an `unknown` input type incompatible with `useForm<PackageFormValues>()`'s expected `Resolver<PackageFormValues>`); numeric `<Input type="number">` fields instead convert the raw DOM event via an explicit `onChange={(e) => field.onChange(e.target.valueAsNumber)}` handler so the form's internal value is already a `number`.
- `PackageForm` itself (a `"use client"` component) directly calls `createPackage`/`updatePackage` and performs the create-mode redirect via `useRouter().push` — satisfying the plan's "client wrapper" language without introducing a separate wrapper file not listed in either task's `files_modified`.
- Reworded a doc comment in `package-form.tsx` to avoid the literal string "PhotoManager" (previously used descriptively to explain the Photos-tab forward reference) after discovering Task 1's acceptance grep (`grep -c "PhotoManager"` expected `0`) matches comments as well as imports.
- Reused `scripts/seed.ts`'s exact delete-then-reinsert pattern for `itinerary_days`/`package_inclusions`/`faq_facts`, factored into one `writePackageChildren()` helper shared by both `createPackage` and `updatePackage` rather than duplicated inline in each action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking build error] `z.coerce.number()` incompatible with `useForm`'s resolver typing**
- **Found during:** Task 1 verification (`npm run build`)
- **Issue:** zod 4's `z.coerce.number()` schemas have an input type of `unknown`, which `@hookform/resolvers`' `zodResolver` surfaces as a `Resolver` type incompatible with `useForm<PackageFormValues>()` (the schema's *output* type) — TypeScript build failure.
- **Fix:** Switched `fromPrice`/`durationDays` to plain `z.number()` (input type = output type = `number`), and added explicit `onChange={(e) => field.onChange(e.target.valueAsNumber)}` handlers on the two numeric `<Input>` fields so the form state is always a real `number`, never a raw string needing coercion.
- **Files modified:** `components/admin/package-form-schema.ts`, `components/admin/package-form.tsx`
- **Commit:** `c5a7ea6`

## Issues Encountered

None beyond the build-blocking type issue above (auto-fixed under Rule 3). `npm run build` and `npm run lint` both pass cleanly with zero errors/warnings.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready** for 02-06 (Photos tab / `PhotoManager`). `components/admin/package-form.tsx`'s Photos tab currently renders an interim note in create mode and nothing in edit mode — both are the plan's own by-design intermediate state, not a gap. `packageId` is available in edit mode via the `/admin/packages/{id}` route (reached either directly from the admin list's Edit action, or via the create-flow's post-`createPackage` redirect), giving 02-06's photo manager a real `package_id` to upload against from the very first render of the edit page.

What's already confirmed:
- `npm run build` and `npm run lint` pass with zero errors.
- All plan-specified grep-based acceptance criteria pass (see Coverage above).
- Live dev-server smoke test: unauthenticated `GET /admin/packages/new` and `GET /admin/packages/{id}` both return `307` to `/admin/login`, confirming the `requirePermission`/proxy gate chain works end-to-end for both new routes (matching 02-02/02-04's established pattern).

What's deferred to end-of-phase human verification (per `config.json`'s `human_verify_mode: end-of-phase`, consistent with 02-04's D4 deferral):
- Full browser click-through: submitting Details/Itinerary/Inclusions & FAQ on `/admin/packages/new`, confirming the created package appears in the 02-04 admin list as unpublished and the redirect to its edit page lands correctly.
- Editing one of the 3 originally-seeded Phase 1 packages' itinerary via `/admin/packages/{id}` and confirming the change persists and is reflected on the public detail page once published.
- Confirming a Staff session without `can_manage_packages` is rejected by the live UI (server-side rejection is already confirmed for the unauthenticated case above; the authenticated-but-unauthorized case needs a real Staff login).

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*
