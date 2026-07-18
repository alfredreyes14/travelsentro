---
phase: 02-admin-access-package-management
plan: 09
subsystem: auth
tags: [nextjs, redirect, permission-gate, supabase-auth, verification-script]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management (02-01, 02-07)
    provides: "lib/auth/dal.ts's verifySession()/getProfile() redirect() pattern, and the throw-based requirePermission()/requireAdmin() + error.tsx mechanism this plan supersedes for page renders only"
provides:
  - "requirePermissionOrRedirect()/requireAdminOrRedirect() in lib/auth/dal.ts -- redirect()-based permission gates for Server Component page renders"
  - "app/admin/(dashboard)/forbidden/page.tsx rendering the UI-SPEC denial copy inside the dashboard shell"
  - "scripts/verify-permission-denial.ts -- repeatable, self-cleaning live-HTTP regression check for this exact defect class"
affects: [phase-03-crm-messaging, any future phase adding new gated /admin pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "redirect()-based permission gate for Server Component page renders (mirrors verifySession()/getProfile()'s existing redirect(\"/admin/login\") pattern), kept separate from the throw-based requirePermission()/requireAdmin() still used by Server Actions"
    - "Live-HTTP verification script pattern (disposable service-role-created test account + @supabase/ssr in-memory cookie jar + fetch against a running server) as the required proof standard for auth-gate fixes, not build success or source grep alone"

key-files:
  created:
    - "app/admin/(dashboard)/forbidden/page.tsx"
    - "scripts/verify-permission-denial.ts"
  modified:
    - "lib/auth/dal.ts"
    - "app/admin/(dashboard)/packages/page.tsx"
    - "app/admin/(dashboard)/packages/new/page.tsx"
    - "app/admin/(dashboard)/packages/[id]/page.tsx"
    - "app/admin/(dashboard)/users/page.tsx"
    - "package.json"

key-decisions:
  - "Replaced the permission check used by Server Component page renders with redirect(\"/admin/forbidden\") instead of retrying the throw + error.tsx mechanism, since 02-VERIFICATION.md proved via live HTTP requests (dev and production build) that this Next.js 16.2.10 build does not invoke the segment error boundary for a render-time throw on initial navigation"
  - "Left requirePermission()/requireAdmin() and error.tsx completely untouched -- Server Actions (actions/{packages,users,package-photos}.ts) and 02-07's already-verified client-side try/catch still depend on the throw-based mechanism"
  - "Verification proof standard: a live HTTP request with a real zero-permission session cookie against both a running npm run dev server AND a clean npm run build && npm run start production server -- per the explicit lesson that a clean build and source grep both passed on the prior still-broken 02-07 implementation"

patterns-established:
  - "New permission-gated dashboard pages should call requirePermissionOrRedirect()/requireAdminOrRedirect() (not the throw-based requirePermission()/requireAdmin()) as their first statement, since only the redirect-based path is confirmed to render the denial page correctly on initial navigation"
  - "scripts/verify-permission-denial.ts is re-runnable for future regression checks against this exact defect class -- run via npm run verify:permission-denial with BASE_URL pointed at a live server"

requirements-completed: [AUTH-05]

coverage:
  - id: D1
    description: "requirePermissionOrRedirect()/requireAdminOrRedirect() added to lib/auth/dal.ts, redirecting to /admin/forbidden on denial instead of throwing; all 4 gated dashboard pages (packages list, packages/new, packages/[id], users) call the new guards as their first statement"
    requirement: "AUTH-05"
    verification:
      - kind: unit
        ref: "grep -c 'new Error(\"Forbidden\")' lib/auth/dal.ts == 2 (throw-based guards unchanged); grep -L for old guard calls across the 4 page files returns empty"
        status: pass
      - kind: integration
        ref: "npm run build -- compiles cleanly, /admin/forbidden route present in output"
        status: pass
    human_judgment: false
  - id: D2
    description: "A zero-permission Staff session requesting /admin/packages, /admin/packages/new, or /admin/users receives a graceful HTTP 200 denial page (never a 500 crash) containing the exact UI-SPEC copy, proven via a real session cookie against both a live dev server and a live production build; a real Admin session's identical request still returns 200 with real content (no regression)"
    requirement: "AUTH-05"
    verification:
      - kind: e2e
        ref: "scripts/verify-permission-denial.ts run against npm run dev (port 3100) -- 4/4 checks PASS, exit 0"
        status: pass
      - kind: e2e
        ref: "scripts/verify-permission-denial.ts run against npm run build && npm run start (port 3100) -- 4/4 checks PASS, exit 0"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-19
status: complete
---

# Phase 2 Plan 9: Redirect-Based Permission Gate for Gated Dashboard Pages Summary

**Replaced the throw+error.tsx permission-denial mechanism with a redirect()-based gate for Server Component page renders, closing AUTH-05 via a live-HTTP-verified fix against both dev and a production build.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-19T02:19:00+08:00 (approx, from prior commit timestamp)
- **Completed:** 2026-07-19T02:27:33+08:00
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Added `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` to `lib/auth/dal.ts`, mirroring `getProfile()`'s existing, confirmed-working `redirect("/admin/login")` pattern instead of retrying the throw + `error.tsx` mechanism that 02-VERIFICATION.md proved does not reliably invoke the segment error boundary in this Next.js 16.2.10 build
- Wired all 4 permission-gated dashboard pages (`packages/page.tsx`, `packages/new/page.tsx`, `packages/[id]/page.tsx`, `users/page.tsx`) to the new redirect-based guards as their first statement, replacing the throw-based call at each site
- Created `app/admin/(dashboard)/forbidden/page.tsx` rendering 02-UI-SPEC.md's exact denial copy inside the dashboard shell
- Built `scripts/verify-permission-denial.ts`, a repeatable, self-cleaning live-HTTP verification script that creates a disposable zero-permission Staff account, obtains a real session cookie via `@supabase/ssr`'s `createServerClient` with an in-memory cookie jar, and asserts the denial behavior against a running server
- Ran the verification script against both a live `npm run dev` server and a live `npm run build && npm run start` production server -- both reported PASS for all 4 checks (3 denied routes + 1 Admin positive control), the specific dual-mode proof the prior 02-07 closure attempt lacked
- Confirmed zero leftover disposable test accounts in Supabase Auth after both runs

## Task Commits

Each task was committed atomically:

1. **Task 1: Redirect-based permission gate for gated dashboard pages + /admin/forbidden** - `343b6f1` (feat)
2. **Task 2: Live-HTTP verification -- disposable zero-permission session vs. positive control, dev AND production build** - `0817b45` (test)

**Plan metadata:** (final commit -- see completion output)

## Files Created/Modified

- `lib/auth/dal.ts` - Added `requirePermissionOrRedirect()`/`requireAdminOrRedirect()`, redirect-based counterparts to the existing throw-based `requirePermission()`/`requireAdmin()` (unchanged)
- `app/admin/(dashboard)/packages/page.tsx` - Calls `requirePermissionOrRedirect("can_manage_packages")` instead of the throw-based guard
- `app/admin/(dashboard)/packages/new/page.tsx` - Same guard swap
- `app/admin/(dashboard)/packages/[id]/page.tsx` - Same guard swap
- `app/admin/(dashboard)/users/page.tsx` - Calls `requireAdminOrRedirect()` instead of `requireAdmin()`
- `app/admin/(dashboard)/forbidden/page.tsx` - New redirect target rendering the UI-SPEC denial copy, no permission check of its own
- `scripts/verify-permission-denial.ts` - New live-HTTP verification script (disposable Staff account, in-memory cookie jar session, positive control, self-cleaning)
- `package.json` - Added `"verify:permission-denial"` script entry

## Decisions Made

- Chose the `redirect()`-based mechanism over retrying throw + `error.tsx` or Next 16's `forbidden()`/`forbidden.tsx` experimental primitive, because `redirect()` is the pattern already proven to work reliably in this exact codebase (`verifySession()`/`getProfile()`'s `redirect("/admin/login")`), while the throw + error boundary path was independently proven broken at runtime by 02-VERIFICATION.md's live reproduction, and the experimental `forbidden()` primitive would have required enabling `experimental.authInterrupts` -- a broader, riskier config change not justified when a known-working pattern already exists in the same file.
- Left `requirePermission()`/`requireAdmin()` and `error.tsx` completely untouched to avoid any regression to Server Actions (`actions/{packages,users,package-photos}.ts`) and 02-07's already-verified client-side try/catch behavior, both of which depend on the throw being a catchable rejected promise.
- Proof standard for this plan's "done" state is a live HTTP request with a real zero-permission session cookie against both a dev server and a production build -- not a build-success or source-grep check -- per the explicit lesson documented in 02-VERIFICATION.md from the prior failed 02-07 attempt.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were met without requiring any Rule 1-4 fixes.

## Issues Encountered

None. The redirect-based mechanism worked correctly on the first implementation attempt for both dev and production-build modes -- no debugging cycle was needed, unlike the prior 02-07 attempt's throw+error.tsx approach.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AUTH-05 is now fully closed: a zero-permission Staff session is blocked from gated dashboard pages both in the UI (graceful `/admin/forbidden` denial page, confirmed live) and at the API/data layer (RLS + the still-throwing Server Action guards, unchanged and previously verified).
- This was the last remaining item from 02-VERIFICATION.md's re-verification round -- Phase 2 has no other known open gaps.
- `scripts/verify-permission-denial.ts` is available as a standing regression check for any future change that touches `lib/auth/dal.ts`'s permission gates or the 4 gated dashboard pages.
- Any future phase that adds a new permission-gated Server Component page under `app/admin/(dashboard)/**` should call `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` (not the throw-based guards) as its first statement, per the pattern established here.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: app/admin/(dashboard)/forbidden/page.tsx
- FOUND: scripts/verify-permission-denial.ts
- FOUND: commit 343b6f1 (Task 1)
- FOUND: commit 0817b45 (Task 2)
