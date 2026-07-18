---
phase: 02-admin-access-package-management
plan: 07
subsystem: auth
tags: [nextjs-app-router, error-boundary, supabase-auth, pkce, server-actions]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: lib/auth/dal.ts's requirePermission()/requireAdmin() gate, actions/{users,packages,package-photos}.ts's Server Actions, actions/auth.ts's password-reset flow, and the 4 optimistic-UI client components (users-table, package-list-row, sortable-package-list, photo-manager)
provides:
  - "Route-segment error.tsx under app/admin/(dashboard)/ that renders 02-UI-SPEC.md's fixed permission-denied copy instead of an unhandled 500"
  - "try/catch (or .catch()) wrapping around every permission-gated Server Action call in the 4 identified optimistic-UI components, reverting state and toasting a generic error on thrown exceptions"
  - "app/admin/auth/confirm/route.ts — a PKCE code-exchange Route Handler that establishes a session from the emailed reset link's code before the user reaches /admin/reset-password"
affects: [phase-02-code-review, phase-02-verification, any-future-phase-touching-admin-error-handling-or-password-reset]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next.js App Router error.tsx route-segment boundary for permission-gate throws (Client Component, useEffect console.error, fixed copy, never renders error.message/digest)"
    - "PKCE code-exchange Route Handler pattern: GET reads ?code, calls supabase.auth.exchangeCodeForSession(), redirects to a hardcoded internal path (never a query-supplied one) on success or failure"

key-files:
  created:
    - "app/admin/(dashboard)/error.tsx"
    - "app/admin/auth/confirm/route.ts"
  modified:
    - "components/admin/users-table.tsx"
    - "components/admin/package-list-row.tsx"
    - "components/admin/sortable-package-list.tsx"
    - "components/admin/photo-manager.tsx"
    - "actions/auth.ts"

key-decisions:
  - "error.tsx renders the fixed UI-SPEC denial copy unconditionally (no branching on error content) since every render-time throw currently reachable under app/admin/(dashboard)/** is exclusively a permission-gate Forbidden throw"
  - "GENERIC_ERROR_MESSAGE declared as a local per-file constant in users-table.tsx, package-list-row.tsx, and sortable-package-list.tsx (matching this codebase's existing convention), not hoisted to a shared module (that consolidation is 02-REVIEW.md's IN-01, out of scope here)"
  - "photo-manager.tsx's handleDragEnd uses .catch() on its existing .then() chain rather than converting to async/await, minimizing the diff"
  - "app/admin/auth/confirm/route.ts's two redirect targets (/admin/reset-password, /admin/login) are both hardcoded from request.url, never from a query-supplied value, closing the open-redirect surface flagged in the threat model (T-02-09)"

patterns-established:
  - "Permission-denied UX: route-segment error.tsx boundaries under gated app/ segments, rather than per-page try/catch, catch render-time Forbidden throws"
  - "Optimistic-UI Server Action calls always wrap the awaited (or .then()-chained) call in try/catch, reverting to a captured pre-mutation value and toasting GENERIC_ERROR_MESSAGE on thrown exceptions"

requirements-completed: [AUTH-05, AUTH-01]

coverage:
  - id: D1
    description: "An authenticated Staff session without the required permission that requests a permission-gated dashboard page sees the fixed 'You don't have permission to do that. Contact an Admin if you think this is a mistake.' denial copy instead of an unhandled 500"
    requirement: "AUTH-05"
    verification:
      - kind: manual_procedural
        ref: "Visit /admin/packages/new (or /admin/users) with a disposable Staff session lacking can_manage_packages / not role=admin; observe the error.tsx boundary's fixed copy renders instead of a 500"
        status: unknown
    human_judgment: true
    rationale: "Requires a live disposable Staff session against the real Supabase project (per 02-VERIFICATION.md's live-verification pattern) to trigger the render-time throw end-to-end; not exercised by automated tests in this plan"
  - id: D2
    description: "A thrown exception from deactivateAccount/publishPackage/featurePackage/softDeletePackage/reorderPackages/reorderPhotos is caught client-side, optimistic UI state is reverted where applicable, and a generic toast is shown instead of an unhandled promise rejection"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "npm run build (compiles cleanly with all 4 components wrapped) + grep -c GENERIC_ERROR_MESSAGE counts matching plan's acceptance criteria exactly (2/4/2/3 across users-table, package-list-row, sortable-package-list, photo-manager)"
        status: pass
    human_judgment: true
    rationale: "Static verification (build + grep) confirms the catch/revert/toast wiring is present and compiles, but exercising an actual mid-session permission revocation to observe the toast+revert live is a manual/live-session scenario per 02-REVIEW.md WR-06's own verification note"
  - id: D3
    description: "A real password-reset email link (PKCE code) establishes a session at /admin/auth/confirm before the user reaches the reset-password form, so updatePassword() succeeds instead of failing with no active session"
    requirement: "AUTH-01"
    verification:
      - kind: other
        ref: "npm run build (new /admin/auth/confirm route registered, compiles cleanly) + grep verification of exchangeCodeForSession usage and hardcoded-only redirect targets"
        status: pass
    human_judgment: true
    rationale: "Full end-to-end confirmation requires a real Supabase-sent reset email and clicking the live link (per this plan's own <verification> section) — not exercised by automated tests in this session"

duration: 15min
completed: 2026-07-18
status: complete
---

# Phase 2 Plan 7: Permission-Denied UX and Password-Reset PKCE Gap Closure Summary

**Route-segment error.tsx boundary for graceful permission-denied UX, try/catch hardening across 4 optimistic-UI components, and a PKCE code-exchange Route Handler fixing the previously-broken password-reset flow**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-18T17:00:00Z (approx.)
- **Completed:** 2026-07-18T17:09:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added `app/admin/(dashboard)/error.tsx`, a Client Component route-segment error boundary that catches `requirePermission()`/`requireAdmin()`'s bare `Error("Forbidden")` throws and renders 02-UI-SPEC.md's exact denial copy, never leaking `error.message`/`error.digest`
- Hardened all 4 identified optimistic-UI client components (`users-table.tsx`, `package-list-row.tsx`, `sortable-package-list.tsx`, `photo-manager.tsx`) to catch thrown Server Action exceptions, revert optimistic state, and toast a generic error instead of an unhandled promise rejection
- Created `app/admin/auth/confirm/route.ts`, a PKCE code-exchange Route Handler, and repointed `actions/auth.ts`'s `requestPasswordReset()` redirectTo at it — closing the previously totally-broken password-reset round trip (every real reset attempt failed silently before this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Graceful permission-denied error boundary** - `4853b59` (feat)
2. **Task 2: Catch Server-Action exceptions in optimistic-UI components** - `eb55c35` (feat)
3. **Task 3: Fix password-reset PKCE code exchange** - `c4fe3ff` (fix)

**Plan metadata:** _pending_ (docs: complete plan — this commit)

## Files Created/Modified
- `app/admin/(dashboard)/error.tsx` - Route-segment error boundary rendering the fixed permission-denied copy
- `app/admin/auth/confirm/route.ts` - PKCE code-exchange Route Handler; exchanges `code` for a session, redirects to hardcoded `/admin/reset-password` or `/admin/login`
- `actions/auth.ts` - `requestPasswordReset()`'s `redirectTo` now points at `/admin/auth/confirm` instead of directly at `/admin/reset-password`
- `components/admin/users-table.tsx` - `handleDeactivate` wrapped in try/catch with `GENERIC_ERROR_MESSAGE` toast
- `components/admin/package-list-row.tsx` - `handlePublishChange`/`handleFeatureChange`/`handleDelete` wrapped in try/catch, reverting `isPublished`/`isFeatured` on exception
- `components/admin/sortable-package-list.tsx` - `handleDragEnd` wrapped in try/catch, reverting to `previousItems` on exception
- `components/admin/photo-manager.tsx` - `handleDragEnd`'s `.then()` chain gained a `.catch()`, reverting to `previousPhotos`; reused the file's existing `GENERIC_ERROR_MESSAGE` constant

## Decisions Made
- `error.tsx` renders the fixed denial copy unconditionally rather than branching on error content, since every render-time throw currently reachable under this segment is a permission-gate throw — this also prevents leaking *why* access was denied
- `GENERIC_ERROR_MESSAGE` kept as a per-file local constant (matching existing codebase convention), not hoisted to a shared module — that consolidation is explicitly 02-REVIEW.md's IN-01, deferred
- `photo-manager.tsx`'s `handleDragEnd` got a `.catch()` on its existing `.then()` chain rather than an async/await rewrite, minimizing the diff and matching the file's own style
- Both `app/admin/auth/confirm/route.ts` redirect targets are hardcoded from `request.url`, never from a query parameter, to close the open-redirect threat surface (T-02-09)

## Deviations from Plan

None - plan executed exactly as written. All acceptance-criteria grep counts matched on first implementation; no auto-fixes were required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (The Supabase Auth email template/redirect URL allowlist for `/admin/auth/confirm` should be confirmed in the Supabase dashboard's Auth → URL Configuration before relying on a real email round-trip in production, but no code-level setup is needed.)

## Next Phase Readiness

- All three gap-closure items scoped for this plan (graceful permission-denied UX, optimistic-UI exception handling, PKCE password-reset exchange) are closed and build-verified
- 02-08-PLAN.md (package CRUD data-integrity / CR-02) remains a separate, not-yet-executed gap-closure plan
- 02-REVIEW.md's other warnings (WR-01 through WR-05, WR-07, WR-08, IN-01 through IN-03) remain explicitly deferred to a future `/gsd-code-review 02 --fix` run per developer decision
- Full end-to-end live verification (disposable under-permissioned Staff session hitting a gated page; real Supabase password-reset email round trip) was not performed in this session — flagged as `human_judgment: true` in this SUMMARY's coverage block for the verifier to route to UAT

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-18*
