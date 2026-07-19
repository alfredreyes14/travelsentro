---
phase: 02-admin-access-package-management
plan: 12
subsystem: auth
tags: [supabase, auth, password-reset, redirect_to, upstream-platform-defect]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "02-07 (proxy allow-list for /admin/auth/confirm), 02-10 (proxy reachability fix for the confirm route)"
provides:
  - "Confirmation that the hosted Supabase project's redirect_to stripping for password-recovery links (02-UAT.md Test 2, D-06) is resolved for the real client-invoked resetPasswordForEmail() flow, not just the admin-API differential probe"
  - "scripts/verify-password-reset-redirect.ts: repeatable regression check (Management API re-save + disposable-user differential) for this exact defect class"
  - "Two newly-discovered, NOT-yet-fixed findings handed off for separate debug sessions: (1) bare/unstyled UI on /admin/reset-password, not a one-time FOUC; (2) a second, freshly-requested reset link bounces to /admin/login"
affects: [auth, admin-panel, password-reset-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Management API idempotent re-submit (GET then PATCH with the same values) as a low-risk 'force reload' probe for hosted Supabase Auth config staleness"
    - "Disposable-user admin.generateLink() differential testing (create -> generateLink -> inspect redirect_to -> always delete in finally) mirrored from scripts/verify-permission-denial.ts"

key-files:
  created:
    - scripts/verify-password-reset-redirect.ts
  modified:
    - package.json

key-decisions:
  - "Closed Task 2 based on the developer's own real-email test (redirect_to=http://localhost:3000/admin/auth/confirm survived, full reset completed: new password set, login succeeded) rather than re-running any additional automated check, since a real end-to-end client flow is the highest-fidelity evidence available and is strictly better proof than the admin-API differential this plan's Task 1 used."
  - "Did NOT attempt to root-cause or fix the two newly-discovered issues (bare-HTML styling on /admin/reset-password; second reset link bouncing to /admin/login) in this plan -- both are outside this plan's explicit scope (success_criteria: 'No change to actions/auth.ts, app/admin/auth/confirm/route.ts, or lib/supabase/proxy.ts') and neither has a confirmed root cause yet. Recommended a dedicated /gsd-debug session for each rather than guessing a fix, per this phase's own documented history of 'looks fixed but isn't' defects (02-VERIFICATION.md prior rounds)."

requirements-completed: [AUTH-01]

coverage:
  - id: D1
    description: "Hosted Supabase project's redirect_to stripping for password-recovery links is resolved for the real client-invoked flow (not just the admin-API differential probe)"
    requirement: "AUTH-01"
    verification:
      - kind: manual_procedural
        ref: "Developer requested a real password reset from /admin/forgot-password, copied the emailed link's redirect_to=http://localhost:3000/admin/auth/confirm before clicking, then clicked through, set a new password, and logged in successfully"
        status: pass
    human_judgment: true
    rationale: "Only a human with access to a real mailbox can request and receive the actual reset email and report its redirect_to= value and click-through outcome -- this cannot be automated from a CLI/API context (the debug session's admin.generateLink() probe is architecturally PKCE-incompatible and was already known to be an imperfect proxy for the real flow)."
  - id: D2
    description: "scripts/verify-password-reset-redirect.ts: automated Management API re-save + disposable-user differential regression check for this defect class"
    requirement: "AUTH-01"
    verification:
      - kind: other
        ref: "npm run verify:password-reset-redirect (Task 1, commit 54e9bdf) -- Management API PATCH returned 2xx, differential redirect_to check PASSED"
        status: pass
    human_judgment: false

# Metrics
duration: ~15min (Task 1) + human-verification interval (Task 2, real-email round trip)
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 12: Password-Reset redirect_to Upstream Fix Attempt Summary

**Hosted Supabase project's password-recovery redirect_to stripping (02-UAT.md Test 2 / D-06) is CONFIRMED RESOLVED for the real client-invoked flow -- end-to-end reset (new password + login) now succeeds -- but two new, distinct, NOT-yet-fixed defects were discovered during the real-email verification and are handed off for separate debug sessions.**

## Performance

- **Duration:** Task 1 ~15 min automated; Task 2 spanned a human-verification checkpoint (real email round trip performed by the developer directly, outside this agent)
- **Completed:** 2026-07-19
- **Tasks:** 2/2 completed
- **Files modified:** 2 (scripts/verify-password-reset-redirect.ts, package.json)

## Accomplishments

- Automated an idempotent Management API re-save of the hosted Supabase project's SITE_URL/URI_ALLOW_LIST, then re-ran the debug session's own disposable-user `admin.generateLink()` differential check -- both passed (Task 1, commit `54e9bdf`).
- **This plan's specific target defect is CONFIRMED RESOLVED for the real client-invoked flow**, which is stronger evidence than Task 1's admin-API probe alone: the developer requested a genuine password reset from `/admin/forgot-password`, copied the emailed link before clicking, and confirmed `redirect_to=http://localhost:3000/admin/auth/confirm` -- the exact path this plan targeted -- survived intact (not stripped to the bare Site URL). They then clicked through, landed authenticated on `/admin/reset-password`, set a new password, and logged in with it successfully. 02-UAT.md Test 2 is closed.
- Shipped `scripts/verify-password-reset-redirect.ts` (`npm run verify:password-reset-redirect`) as a repeatable regression check for this exact defect class, for future use if the upstream behavior regresses.
- Surfaced two new, independently-confirmed findings during the real-email verification (see "Newly-Discovered Findings — NOT Fixed" below) that are explicitly out of this plan's scope and require their own debug sessions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Automated Management API re-save + disposable-user differential re-test** - `54e9bdf` (feat) -- created `scripts/verify-password-reset-redirect.ts`, added `verify:password-reset-redirect` npm script; PATCH to Management API returned 2xx, differential redirect_to check PASSED against a disposable test user.
2. **Task 2: Manual dashboard re-save fallback + real-email redirect_to confirmation** - no repo commit (verification-only task, no files modified per plan). Closed via the developer's direct real-email test, reported back to this agent as a conversational resume signal ("resolved" -- see Decisions Made below for the exact evidence cited).

**Plan metadata:** (this commit) `docs(02-12): complete plan`

## Files Created/Modified

- `scripts/verify-password-reset-redirect.ts` - Standalone tsx script: re-submits the hosted project's SITE_URL/URI_ALLOW_LIST via the Supabase Management API (idempotent re-save), then re-runs a disposable-user `admin.generateLink()` differential check and reports PASS/FAIL. Never logs `SUPABASE_ACCESS_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY`.
- `package.json` - Added `"verify:password-reset-redirect"` script entry alongside existing `verify:permission-denial`/`verify:auth-confirm` entries.

## Decisions Made

- Closed Task 2 on the strength of the developer's real end-to-end email test rather than requiring a further automated re-check: they reported the emailed link's exact `redirect_to=http://localhost:3000/admin/auth/confirm` value (this plan's specific target defect, confirmed resolved) and confirmed the full reset flow completed (new password set, login succeeded). This is strictly higher-fidelity evidence than Task 1's admin-API differential probe, since the debug session had already flagged the admin API as architecturally PKCE-incompatible and not a perfect proxy for the real `resetPasswordForEmail()` client flow.
- Explicitly did NOT attempt to diagnose or fix the two new issues discovered during that same real-email test (see below) -- both are outside this plan's stated scope ("No change to actions/auth.ts, app/admin/auth/confirm/route.ts, or lib/supabase/proxy.ts") and neither has a confirmed root cause. Guessing a fix without a proper debug session would repeat this phase's own documented pattern of "looks fixed but isn't" defects (see 02-VERIFICATION.md's prior rounds). Both are recommended for `/gsd-debug`.

## Deviations from Plan

None - plan executed exactly as written for both tasks. The two new findings below are NOT deviations from this plan's work (no code was changed for them) -- they are newly-discovered defects surfaced by the human-verification step itself, and are documented here per this plan's own resume instructions rather than silently dropped.

## Newly-Discovered Findings — NOT Fixed (Out of Scope for This Plan)

These two issues were discovered by the developer during Task 2's real-email verification. They are **distinct from this plan's target defect** (which is resolved), have **not been root-caused**, and **no fix was attempted** in this plan per explicit scope boundaries. Both are recommended for a dedicated `/gsd-debug` session before any fix is attempted.

### 1. Bare/unstyled UI on `/admin/reset-password`

- **Observed:** During the successful real-email reset flow, the developer reported "the UI looks like bare html" on `/admin/reset-password`.
- **Ruled out:** A one-time first-compile FOUC (flash of unstyled content) was considered and ruled out -- the developer confirmed the bare-HTML appearance persisted after a page refresh, not just on first load.
- **Plausible but unconfirmed explanation:** The dev server had been running continuously across the 02-11/02-12/02-13 executor sessions, during which multiple live file edits touched `package-form.tsx`, `globals.css`, `checklist.tsx`, and UI-SPEC docs. A stale `.next` dev cache / HMR artifact is plausible but has NOT been confirmed as the root cause.
- **Status:** Open, unconfirmed root cause. Recommend `/gsd-debug` (start with a clean `.next` cache / fresh dev server restart as the first elimination step, then check whether it reproduces on a genuinely cold start or a production build).

### 2. Second, freshly-requested reset link bounces to `/admin/login`

- **Observed:** The developer repeated the flow independently: went back to `/admin/forgot-password`, requested a brand-new reset email (not reusing the first link), clicked the new link, and it bounced back to `/admin/login` instead of succeeding.
- **Significance:** This is a second, independent, CONFIRMED-real defect -- distinct from both this plan's original target (redirect_to stripping, now resolved) and finding #1 above (styling). A fresh, single-use PKCE code should not fail on a second attempt unless something about session/cookie state is interfering -- e.g. `code_verifier` cookie handling on a second request, or the browser already being authenticated from the first successful reset and that state conflicting with a new code exchange.
- **Status:** Open, unconfirmed root cause. Recommend `/gsd-debug` (first elimination step: reproduce in a fresh/incognito session with no prior successful reset in the same browser, to isolate whether prior-session auth state is the interfering factor).

## Issues Encountered

None beyond the two newly-discovered findings documented above, which are tracked as follow-up work rather than issues within this plan's scope.

## User Setup Required

None - no external service configuration required beyond what Task 1 already automated (Management API re-save) and Task 2 already verified (real-email redirect_to).

## Next Phase Readiness

- 02-UAT.md Test 2 (password-reset bounce-to-login, D-06) is closed: the app-code + upstream-config defect this plan targeted is confirmed resolved end-to-end.
- Two new, unresolved findings (bare-HTML styling on `/admin/reset-password`; second-reset-link bounce to `/admin/login`) are carried forward as open items -- NOT blocking this plan's own completion, but should be picked up via `/gsd-debug` before this phase's admin-auth surface is considered fully hardened. See STATE.md Blockers/Concerns for tracking.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*
