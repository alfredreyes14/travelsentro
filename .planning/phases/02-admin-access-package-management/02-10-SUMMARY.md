---
phase: 02-admin-access-package-management
plan: 10
subsystem: auth
tags: [nextjs, proxy, middleware, pkce, supabase-auth, route-handlers]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management (02-07, 02-09)
    provides: app/admin/auth/confirm/route.ts (PKCE code-exchange GET handler) and lib/supabase/proxy.ts's UNGATED_ADMIN_PATHS gate mechanism
provides:
  - "/admin/auth/confirm" allow-listed in lib/supabase/proxy.ts's UNGATED_ADMIN_PATHS, making the password-reset PKCE code-exchange route reachable for unauthenticated visitors
  - scripts/verify-auth-confirm-reachable.ts, a repeatable credential-free live-HTTP regression check for this defect class
affects: [phase-02-verification, phase-02-end-of-phase-human-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Method-based differential live-HTTP verification (POST -> 405 vs 307) for proving proxy-gate reachability independent of PKCE code/verifier validity"]

key-files:
  created: [scripts/verify-auth-confirm-reachable.ts]
  modified: [lib/supabase/proxy.ts, package.json]

key-decisions:
  - "Used a method-based (POST -> 405 vs 307) differential check instead of a synthetic-code GET request, since the route handler's own invalid-code fallback also redirects to /admin/login, making a GET-based comparison unable to distinguish 'proxy blocked' from 'route correctly rejected'"

patterns-established:
  - "Pattern: reachability-only live-HTTP checks (no Supabase client, no session) for proxy allow-list regressions, paired with a control check against a still-gated path to prove the test methodology itself hasn't broken"

requirements-completed: [AUTH-01]

coverage:
  - id: D1
    description: "lib/supabase/proxy.ts's UNGATED_ADMIN_PATHS allow-lists /admin/auth/confirm, making the PKCE code-exchange route reachable for an unauthenticated visitor instead of being redirected to /admin/login by the proxy gate"
    requirement: "AUTH-01"
    verification:
      - kind: e2e
        ref: "scripts/verify-auth-confirm-reachable.ts (npm run verify:auth-confirm) -- POST /admin/auth/confirm -> 405, run against live npm run dev server"
        status: pass
      - kind: e2e
        ref: "scripts/verify-auth-confirm-reachable.ts (npm run verify:auth-confirm) -- POST /admin/auth/confirm -> 405, run against live npm run build && npm run start production server"
        status: pass
    human_judgment: false
  - id: D2
    description: "Control: /admin/packages remains gated (307 to /admin/login) for an unauthenticated visitor in both dev and production build -- no regression to the proxy's block mechanism"
    verification:
      - kind: e2e
        ref: "scripts/verify-auth-confirm-reachable.ts -- POST /admin/packages -> 307 to /admin/login, dev and production build"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full real-email PKCE round trip (request reset -> click link -> land authenticated on /admin/reset-password -> set new password -> log in) -- proves the actual code_verifier-paired exchange succeeds end-to-end, which this plan's reachability script cannot exercise by design"
    requirement: "AUTH-01"
    verification: []
    human_judgment: true
    rationale: "Requires a real emailed link with a genuine PKCE code_verifier cookie pairing that only a browser click-through can produce; per human_verify_mode: end-of-phase this is carried into the phase's end-of-phase human verification pass alongside 02-VERIFICATION.md's other 6 items, not exercised as an automated acceptance criterion of this plan."

# Metrics
duration: 15min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 10: Proxy allow-list fix for /admin/auth/confirm reachability Summary

**Added `/admin/auth/confirm` to `lib/supabase/proxy.ts`'s `UNGATED_ADMIN_PATHS` and proved reachability with a new method-based (POST -> 405 vs 307) differential live-HTTP script run against both `npm run dev` and a production build.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-19T02:58:00Z (approx)
- **Completed:** 2026-07-19T03:12:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `lib/supabase/proxy.ts`'s `UNGATED_ADMIN_PATHS` now includes `/admin/auth/confirm` as its 4th entry, closing CR-01/D-06 -- the proxy no longer redirects unauthenticated password-reset link clicks to `/admin/login` before the PKCE code-exchange route handler can run
- New `scripts/verify-auth-confirm-reachable.ts` proves reachability deterministically via a POST-based 405-vs-307 differential check (credential-free, no Supabase client), plus a control check against `/admin/packages`
- Live-HTTP verification run twice -- once against `npm run dev`, once against a clean `npm run build && npm run start` production server -- both reporting PASS for both checks, per this phase's repeated lesson that a clean build alone was insufficient proof on three prior occasions for this exact flow

## Task Commits

Each task was committed atomically:

1. **Task 1: Add /admin/auth/confirm to the proxy allow-list + create a method-based live-HTTP reachability script** - `dca400a` (fix)
2. **Task 2: Live-HTTP reachability verification -- dev AND production build** - no commit (verification-only task; produced no file changes, both dev and production runs confirmed PASS for both checks)

**Plan metadata:** (recorded below in final commit)

## Files Created/Modified
- `lib/supabase/proxy.ts` - `UNGATED_ADMIN_PATHS` gains a 4th entry, `"/admin/auth/confirm"`; no other line changed
- `scripts/verify-auth-confirm-reachable.ts` - new credential-free live-HTTP reachability + control check, runnable via `npm run verify:auth-confirm`
- `package.json` - adds the `"verify:auth-confirm"` script entry

## Decisions Made
- Used a method-based (POST -> 405 vs 307) differential check instead of a synthetic-code GET request against the route handler, since `app/admin/auth/confirm/route.ts`'s own invalid/missing-code fallback also redirects to `/admin/login` -- a GET-based comparison would be unable to distinguish "proxy blocked" from "route handler correctly rejected an unpaired code," even on correctly-fixed code.

## Deviations from Plan

None - plan executed exactly as written. The plan's own `<verify><automated>` grep pattern (`grep -c '"/admin/'`) also incidentally matches the file's unrelated `NextResponse.redirect(new URL("/admin/login", ...))` line, so its raw count read 5 instead of the intended 4; this is an imprecision in the plan's verification command itself, not in the implementation -- manually confirmed `UNGATED_ADMIN_PATHS` contains exactly 4 double-quoted path literals as required by the acceptance criteria, and no other line in `lib/supabase/proxy.ts` changed.

## Issues Encountered
None. Both the dev-server and production-build live-HTTP runs passed both checks (reachability + control) on the first attempt. Port 3100 was confirmed clear of any orphaned listener after both runs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AUTH-01's password-reset sub-flow (D-06) is now reachable end-to-end at the proxy layer for an unauthenticated visitor -- the specific gap identified by 02-VERIFICATION.md's round-3 report and 02-REVIEW.md's CR-01 is closed
- No regression to AUTH-05 (`lib/auth/dal.ts` and the 4 gated dashboard pages untouched) or to the `supabase/config.toml` redirect allow-list fix (untouched)
- The full real-email PKCE round trip (request reset -> click link -> land authenticated on `/admin/reset-password` -> set new password -> log in) remains an explicit human_verification item for the phase's end-of-phase pass (`human_verify_mode: end-of-phase`), alongside the 6 items already listed in `02-VERIFICATION.md`'s `human_verification` -- not silently dropped
- This closes the last outstanding Phase 2 gap tracked in `02-VERIFICATION.md`/`02-REVIEW.md`; phase is ready for its end-of-phase human verification pass

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: lib/supabase/proxy.ts
- FOUND: scripts/verify-auth-confirm-reachable.ts
- FOUND: .planning/phases/02-admin-access-package-management/02-10-SUMMARY.md
- FOUND commit: dca400a
