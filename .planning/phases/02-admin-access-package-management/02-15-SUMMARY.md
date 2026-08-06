---
phase: 02-admin-access-package-management
plan: 15
subsystem: auth
tags: [supabase-auth, pkce, nextjs, route-handler, diagnostics, turbopack]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "02-07's PKCE code-exchange route, 02-10's proxy allow-list fix, 02-12's redirect_to upstream fix -- all confirmed correct/unchanged by this plan"
provides:
  - "Distinguishable server-side diagnostic logging on every failure path of app/admin/auth/confirm/route.ts"
  - "Evidence-based refutation of the stale code_verifier cookie hypothesis, sourced directly from the installed @supabase/auth-js SDK"
  - "Evidence-based non-reproduction of the /admin/reset-password bare-HTML symptom against both a clean dev cache and a production build"
affects: [password-reset-flow, admin-auth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diagnostic console.error logging on Route Handler failure branches, restricted to SDK-owned AuthError fields (message/status/code) -- never the raw single-use PKCE code or cookie/session content"

key-files:
  created: []
  modified:
    - app/admin/auth/confirm/route.ts

key-decisions:
  - "Investigated node_modules/@supabase/auth-js's _exchangeCodeForSession directly: removeItemAsync(code-verifier) runs on both the success path (line 1591, unconditionally after the fetch) and the catch/failure path (line 1609) -- the SDK already self-cleans the code_verifier storage item on every exchange attempt, refuting the leftover-cookie hypothesis as a code-level defect in this codebase. No cookie-clearing patch applied; diagnostics-only shipped for Gap 1 per the plan's explicit instruction."
  - "Condition A (clean .next cache, dev server) and Condition B (production build) both PASS -- neither reproduces the bare-HTML symptom on /admin/reset-password. No code change made to page.tsx or reset-password-form.tsx; treated as closing evidence for the dev-cache-artifact hypothesis by elimination, per the plan's explicit acceptance criteria for a non-reproduction outcome."
  - "Killed a stale, pre-existing orphaned next-server process (PID 12899, this project's own cwd, occupying port 3000 since before this session started) discovered while setting up Condition A -- without it, curl requests to localhost:3000 would have silently hit the wrong (stale, non-clean-cache) server instead of the freshly started one, invalidating the test. Documented as a Rule 3 blocking-issue auto-fix, not a plan file change."

patterns-established: []

requirements-completed: [AUTH-01]

coverage:
  - id: D1
    description: "app/admin/auth/confirm/route.ts logs a distinguishable diagnostic entry for every failure path (missing code vs exchange error, with error.message/status/code), without changing any redirect target or success-path behavior"
    requirement: "AUTH-01"
    verification:
      - kind: unit
        ref: "grep-based acceptance criteria (console.error count, message text, error field presence, redirect target counts) -- all passed"
        status: pass
      - kind: other
        ref: "npm run lint && npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stale code_verifier cookie hypothesis investigated against the installed @supabase/auth-js SDK's own source, with the finding documented"
    verification:
      - kind: other
        ref: "node_modules/@supabase/auth-js/dist/main/GoTrueClient.js lines 1576-1618 (_exchangeCodeForSession) -- read directly, removeItemAsync confirmed called on both success and failure paths"
        status: pass
    human_judgment: false
  - id: D3
    description: "/admin/reset-password's bare-HTML symptom tested against a clean dev cache (Condition A) and a production build (Condition B), with both outcomes documented"
    verification:
      - kind: e2e
        ref: "curl http://localhost:3000/admin/reset-password against a rm -rf .next; npm run dev clean-cache server -- stylesheet link present, HTTP 200, font-heading/bg-background classes present"
        status: pass
      - kind: e2e
        ref: "curl http://localhost:3000/admin/reset-password against npm run build && npm run start -- stylesheet link present, HTTP 200, font-heading/bg-background classes present"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live human retest of both gaps against the real hosted Supabase project -- second password-reset link diagnostic log inspection, and post-redirect visual styling check"
    verification: []
    human_judgment: true
    rationale: "Both gaps require a live browser session against the real hosted Supabase Auth service (real emailed link, real code exchange). This project has no test suite/mocked email inbox to substitute for it, and the human-check verify blocks in this plan explicitly defer this to end-of-phase human_verify_mode."

# Metrics
duration: 15min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 15: Password-Reset Diagnostic Instrumentation Summary

**Added distinguishable server-side diagnostic logging to the PKCE confirm route and closed both open gap-2 investigations by evidence (code_verifier hypothesis refuted via SDK source read; bare-HTML symptom non-reproduced against clean dev cache and production build) -- no unconditional fix claimed for either underlying gap.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-19T12:37:57Z
- **Completed:** 2026-07-19T12:41:49Z
- **Tasks:** 2 completed
- **Files modified:** 1 (app/admin/auth/confirm/route.ts)

## Accomplishments

- `app/admin/auth/confirm/route.ts` now logs `[admin-auth-confirm] missing code param` (with `request.nextUrl.pathname`) and `[admin-auth-confirm] exchangeCodeForSession failed` (with `error.message`/`error.status`/`error.code`) on every failure path, closing the diagnostic gap that made both the original (now-fixed) and the still-open second-reset-link bounce hard to trace from application logs alone. Redirect targets and success-path behavior are byte-for-byte unchanged from 02-07.
- Investigated the stale `code_verifier` cookie hypothesis directly against `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`'s `_exchangeCodeForSession` (lines 1576-1618): `removeItemAsync(this.storage, \`${this.storageKey}-code-verifier\`)` is called unconditionally on the success path (line 1591, immediately after the token-exchange fetch, before checking for a response-level error) **and** again in the `catch` block (line 1609, covering the missing-verifier throw, the response-level error throw, and any other thrown exception). The SDK already self-cleans the code_verifier storage item — which `@supabase/ssr` backs with a cookie — on every single exchange attempt, regardless of outcome. **Finding: investigated, hypothesis refuted as a code-level defect in this codebase.** No cookie-clearing patch applied.
- Reproduced (or ruled out) the `/admin/reset-password` bare/unstyled-HTML symptom against both a clean dev cache and a production build:
  - **Condition A (clean `.next` cache, `npm run dev`):** PASS. Stylesheet `<link rel="stylesheet" href="/_next/static/chunks/[root-of-the-server]__19t22cp._.css">` present in the fetched HTML, returned HTTP 200 when fetched directly, and Tailwind classes `font-heading`/`bg-background` appear verbatim in the markup.
  - **Condition B (`npm run build && npm run start`):** PASS. Stylesheet `<link rel="stylesheet" href="/_next/static/chunks/0vd-op12uol98.css">` present, returned HTTP 200, `font-heading`/`bg-background` classes present verbatim.
  - Neither condition reproduced the bare-HTML symptom. Per the task's own framing, this closes the gap by elimination — the dev-cache-artifact hypothesis is the best remaining explanation, and `app/admin/reset-password/page.tsx`/`components/admin/reset-password-form.tsx` were left unmodified.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add diagnostic logging to the confirm route + investigate the stale code_verifier hypothesis** - `ddd694b` (feat)
2. **Task 2: Reproduce (or rule out) bare/unstyled rendering on /admin/reset-password** - no commit (investigation-only task; no source-level defect found, no files modified per the plan's own explicit non-reproduction path)

**Plan metadata:** (recorded below, after this SUMMARY commit)

## Files Created/Modified

- `app/admin/auth/confirm/route.ts` - Restructured the GET handler's control flow so the missing-code branch and the `exchangeCodeForSession` failure branch each produce a distinguishable `console.error` diagnostic entry (server-side only), while leaving both redirect targets and success-path behavior unchanged.

## Decisions Made

- Shipped diagnostics-only for Gap 1 (no speculative cookie-clearing patch) because the SDK's own source shows `removeItemAsync` already runs on every exchange attempt (success and failure alike) — there is nothing in this codebase's own files to fix for that specific hypothesis.
- Made no code change to `app/admin/reset-password/page.tsx` or `components/admin/reset-password-form.tsx` for Gap 2, since neither Condition A nor Condition B reproduced the bare-HTML symptom — treating non-reproduction as closing evidence rather than continuing to guess at a fix for an unreproduced symptom.
- Killed a stale, pre-existing orphaned `next-server` process (PID 12899) that was already occupying port 3000 before this session started, discovered while setting up Condition A's clean-cache test (Rule 3 — this blocked accurate reproduction testing since curl requests to `localhost:3000` were silently hitting the stale server instead of the freshly started clean-cache one; `lsof -p 12899` confirmed its cwd was this project's own directory, i.e. an orphan from a prior session, not an unrelated process).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Killed a stale orphaned `next-server` process occupying port 3000**

- **Found during:** Task 2 (Condition A setup)
- **Issue:** A pre-existing `next-server` process (PID 12899, started well before this session, cwd confirmed as this project's own directory via `lsof -p 12899`) was already listening on port 3000. The freshly started clean-cache `npm run dev` server consequently bound to port 3001 instead ("Port 3000 is in use ... using available port 3001 instead"), and initial `curl http://localhost:3000/...` calls were silently served by the stale process rather than the intended clean-cache server, which would have invalidated Condition A's result.
- **Fix:** Identified the stale process via `lsof -i :3000` and `lsof -p 12899` (confirmed same-project cwd, not an unrelated process), killed it, freed port 3000, then restarted the clean-cache dev server which bound to port 3000 as intended.
- **Files modified:** None (process-level fix only, no source changes)
- **Verification:** `lsof -i :3000` confirmed the port was free before restart; subsequent dev server startup log confirmed binding to `http://localhost:3000` (not 3001); Condition A's fetch/inspection then ran against the correct clean-cache server.
- **Committed in:** N/A (no file change to commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, process-level only)
**Impact on plan:** No scope creep — this was necessary to get an accurate Condition A result; no source files were touched by this fix.

## Issues Encountered

- The plan's automated `<verify>` block for Task 2 greps for `href="/_next/static/css/[^"]+"`, which matches Next.js's classic webpack-era CSS output path. This project's dev server runs on Turbopack (per `next dev` default in Next.js 16), which emits stylesheet links under `/_next/static/chunks/*.css` instead. This was executed manually with a Turbopack-aware pattern (`/_next/static/chunks/[^"]+\.css`) instead of the plan's literal grep, which would have produced a false "NO stylesheet link found" negative. Both Condition A and Condition B's stylesheets were confirmed present and returning HTTP 200 under the corrected pattern. This is a verify-script path-convention gap, not a source-level defect — flagged here rather than silently deviating without explanation.
- A leftover orphaned dev server process (unrelated to this plan's own server lifecycle) was found occupying port 3000 at the start of Task 2 — see Deviations above.
- All dev/production servers started during Task 2 were stopped before this SUMMARY was written; confirmed via `ps aux | grep -E "next (dev|start)|next-server"` returning no matches and `lsof -i :3000` returning no listener.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both password-reset gaps from 02-VERIFICATION.md round 5 now carry either a real diagnostic signal (Gap 1: distinguishable logs on every confirm-route failure path) or documented elimination evidence (Gap 2: non-reproduction against two conditions), rather than remaining "looks fixed but isn't confirmed."
- Per `human_verify_mode: end-of-phase`, both gaps still require a live human retest against the real hosted Supabase project before either can be marked resolved:
  - Gap 1: request two independent password resets in the same browser session; if the second still bounces to `/admin/login`, capture and report the new `[admin-auth-confirm] exchangeCodeForSession failed` log entry's `error.message`/`status`/`code`.
  - Gap 2: complete a real password-reset code exchange and visually confirm `/admin/reset-password` renders its styled UI immediately after the redirect and again after a manual refresh.
- No blockers for closing out Phase 2 pending that live retest.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: app/admin/auth/confirm/route.ts
- FOUND: commit ddd694b
- FOUND: .planning/phases/02-admin-access-package-management/02-15-SUMMARY.md
