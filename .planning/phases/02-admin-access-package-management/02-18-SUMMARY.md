---
phase: 02-admin-access-package-management
plan: 18
subsystem: auth
tags: [nextjs, supabase-auth, route-handler, diagnostics, pkce]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management (plan 15)
    provides: "Existing diagnostic logging in app/admin/auth/confirm/route.ts (missing-code and exchange-failure console.error calls); refuted the stale code_verifier-cookie hypothesis for the second-reset-link bounce"
provides:
  - "User-Agent capture on all 3 code paths of /admin/auth/confirm (success, missing-code, exchange-failure), enabling a future live retest to correlate a successful exchange's client against a subsequent failed one"
affects: [password-reset-flow, admin-auth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diagnostic logging additions to Route Handlers use console.error for failure paths and console.log for a distinguishable success-path signal, both server-side only, never logging raw single-use secrets or cookie/session content"

key-files:
  created: []
  modified:
    - app/admin/auth/confirm/route.ts

key-decisions:
  - "This is a hypothesis-testing diagnostic addition only, NOT a confirmed fix -- the second-reset-link bounce (02-VERIFICATION.md round 6 gap 1) remains open and unresolved"
  - "Tests a new, previously-uninvestigated hypothesis (automated email-link scanner/prefetcher consuming the single-use PKCE code before a human click) distinct from 02-15's refuted code_verifier-cookie hypothesis and 02-12's already-fixed redirect_to-stripping defect"
  - "userAgent added via request.headers.get(\"user-agent\") as an additional field on both existing console.error calls, plus one new console.log immediately before the success-path redirect -- zero changes to redirect targets, exchangeCodeForSession invocation, or any other control flow"

patterns-established: []

requirements-completed: [AUTH-01]

coverage:
  - id: D1
    description: "app/admin/auth/confirm/route.ts logs userAgent on all 3 code paths (success, missing-code, exchange-failure), additive to 02-15's diagnostics with zero behavior change"
    requirement: "AUTH-01"
    verification:
      - kind: other
        ref: "grep -c 'userAgent' app/admin/auth/confirm/route.ts == 3; grep -c 'request.headers.get(\"user-agent\")' == 3; grep -c success-log-string == 1; console.error count == 2; console.log count == 1; redirect-target counts unchanged"
        status: pass
      - kind: other
        ref: "npm run lint"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live retest against the real hosted Supabase project to determine whether email-link-prefetching actually causes the second-reset-link bounce, using the new userAgent signal to correlate a successful exchange against a subsequent failed one"
    verification: []
    human_judgment: true
    rationale: "This class of defect does not reproduce locally/mocked (per 02-15); requires a real browser, real email delivery, and the real hosted Supabase project. Deferred per this project's human_verify_mode: end-of-phase. This plan's own SUMMARY cannot confirm or refute the underlying hypothesis -- only a live retest can."

duration: 4min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 18: Admin Auth Confirm User-Agent Diagnostic Summary

**Added User-Agent capture to all three code paths of /admin/auth/confirm's diagnostic logging (success, missing-code, exchange-failure) -- a hypothesis-testing addition only, not a fix, for the still-open second-password-reset-link bounce.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-19T15:15:10Z
- **Completed:** 2026-07-19T15:16:04Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `userAgent: request.headers.get("user-agent")` to both existing 02-15 `console.error` calls (missing-code branch, exchange-failure branch)
- Added one new `console.log("[admin-auth-confirm] exchangeCodeForSession succeeded", { userAgent, timestamp })` immediately before the existing success-path redirect
- Verified zero change to redirect targets (`/admin/login` x2, `/admin/reset-password` x1), `exchangeCodeForSession` invocation, or any other control flow
- Confirmed the raw single-use PKCE `code` value is still never logged (only `error.code`, the SDK's own AuthError field, is logged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add User-Agent capture to app/admin/auth/confirm/route.ts's diagnostic logging (all 3 code paths)** - `1de689b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/admin/auth/confirm/route.ts` - Added `userAgent` field to both existing failure-path `console.error` calls and one new success-path `console.log`, all server-side only

## Decisions Made
- This plan is strictly diagnostic and additive -- it does NOT fix, diagnose, or even confirm the root cause of 02-VERIFICATION.md round 6 gap 1 (second, independently-requested password-reset link bouncing to `/admin/login`). That defect's root cause remains unknown.
- The new logging tests one specific, previously-uninvestigated hypothesis: that an automated email-link scanner or prefetcher (e.g. Gmail/Outlook link-safety scanning, or a corporate email gateway's URL-rewriting proxy) silently consumes the single-use PKCE `code` before a human manually clicks the emailed link. This is distinct from and not ruled out by 02-15's refuted code_verifier-cookie hypothesis or 02-12's already-fixed `redirect_to`-stripping defect.
- Whether email-link-prefetching is actually the cause can only be confirmed by a live retest against the real hosted Supabase project (this plan's own execution cannot perform that retest) -- this is carried forward as an end-of-phase human-verification item (see D2 in coverage above and the Next Phase Readiness section).

## Deviations from Plan

None - plan executed exactly as written. All acceptance-criteria grep counts matched on first implementation; `npm run lint` and `npm run build` both passed with no new errors.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Outstanding human-verification item (carried forward, per `human_verify_mode: end-of-phase`):**

In a real browser against the real hosted Supabase project: request a password reset from `/admin/forgot-password`, complete it successfully (set new password, log in). Then, in the SAME browser session, immediately request a SECOND, independent password reset and click the new email's link. If it still bounces to `/admin/login`, check the server's console/logs for:
1. Any `"[admin-auth-confirm] exchangeCodeForSession succeeded"` entry logged shortly before the failure whose `userAgent` does not look like the browser actually used (a possible sign a bot/scanner consumed the code first)
2. The failure log's own `userAgent` field, to see whether it matches the browser that was actually clicked

Report the exact `userAgent` values and timestamps from both log entries. This is the new signal this plan exists to produce -- it does not itself confirm or refute the email-link-prefetching hypothesis. If the second reset now succeeds, report that too (would suggest the bounce is intermittent/environmental rather than deterministic).

This item, plus the still-unresolved `/admin/reset-password` bare-HTML styling finding from 02-12 (STATE.md Blockers/Concerns), remain the two open auth findings for this phase pending a real-email live retest.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: app/admin/auth/confirm/route.ts
- FOUND: commit 1de689b (Task 1)
- FOUND: commit 96ceec4 (SUMMARY.md)
- FOUND: .planning/phases/02-admin-access-package-management/02-18-SUMMARY.md
