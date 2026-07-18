---
phase: 02-admin-access-package-management
verified: 2026-07-19T20:10:00Z
status: gaps_found
score: "8/9 must-haves verified (1 failed: password-reset PKCE flow still non-functional end-to-end — new proxy-level regression, not the AUTH-05 item this round targeted)"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "4/5 (this-round truths; 1 failed — AUTH-05 permission-denied crash)"
  gaps_closed:
    - "AUTH-05 (permission-denied graceful UX): 02-09-PLAN.md's redirect()-based requirePermissionOrRedirect()/requireAdminOrRedirect() guards, wired to all 4 gated dashboard pages (packages/page.tsx, packages/new/page.tsx, packages/[id]/page.tsx, users/page.tsx) plus a new app/admin/(dashboard)/forbidden/page.tsx, INDEPENDENTLY re-proven in THIS verification pass — not merely trusted from 02-09-SUMMARY.md. I personally started a live `npm run dev` server, created a disposable zero-permission Staff session via scripts/verify-permission-denial.ts, and confirmed all 4 checks (3 denied routes + 1 Admin positive control) PASS (HTTP 200, /admin/forbidden, exact UI-SPEC denial copy present, no __next_error__ crash marker). I then independently repeated the exact same live test against a freshly built `npm run build && npm run start` production server — also 4/4 PASS. This is the third closure attempt for this exact defect class and the first to survive independent live re-verification in both modes."
  gaps_remaining: []
  regressions:
    - "NEW (not a regression to a previously-VERIFIED must-have, but a newly surfaced defect in the same D-06/AUTH-01 password-reset flow this phase has now attempted to fix three separate times): lib/supabase/proxy.ts's UNGATED_ADMIN_PATHS allow-list omits /admin/auth/confirm. First flagged by 02-REVIEW.md's CR-01 (this review pass, not carried from a prior round) and independently reproduced live by this verifier — see gaps below."
gaps:
  - truth: "A real password-reset email link's PKCE `code` establishes a session at /admin/auth/confirm before the user reaches /admin/reset-password, so requestPasswordReset() → click link → updatePassword() succeeds end-to-end (D-06; 02-02-PLAN.md must-have truth #5 'A logged-in user can request a password reset email and set a new password end-to-end (D-06)'; 02-07-PLAN.md must-have truth #3, the exact CR-01 closure target)"
    status: failed
    reason: >
      Live-reproduced independently by this verifier against both a running `npm run dev` server and a
      clean `npm run build && npm run start` production server: `curl` (redirect not followed) against
      `/admin/auth/confirm?code=<any-value>` with NO session cookie attached (the real state of an
      unauthenticated visitor who just clicked the emailed link) returns `HTTP 307` redirecting to
      `/admin/login` in both modes — the request never reaches `app/admin/auth/confirm/route.ts`'s
      `GET` handler, so `exchangeCodeForSession(code)` never runs and no session is ever established.
      Root cause, confirmed by direct source read: `lib/supabase/proxy.ts`'s `UNGATED_ADMIN_PATHS`
      array (lines 4-8) contains only `/admin/login`, `/admin/forgot-password`, and
      `/admin/reset-password` — `/admin/auth/confirm` is absent. `updateSession()`'s guard clause
      (lines 50-56) evaluates `!user && pathname.startsWith("/admin") && !isUngatedAdminPath` as true
      for this path (an unauthenticated visitor by definition has no session yet), so the proxy redirects
      to `/admin/login` before Next.js's routing ever hands the request to the Route Handler. This is
      the exact same class of "looks fixed but isn't" defect 02-VERIFICATION.md's prior round documented
      for AUTH-05 (a clean build and a source-grep for the fix both pass while the live behavior is still
      broken) — `npm run build` compiles this route as `ƒ /admin/auth/confirm` in the output and the
      route.ts file itself is textually correct (verified: exchanges `code` via `exchangeCodeForSession`,
      redirects to hardcoded `/admin/reset-password` on success / `/admin/login` on failure, no
      open-redirect surface), but the proxy sitting in front of it never lets the request through. The
      underlying `code`-exchange logic and its `supabase/config.toml` remote-Auth allow-list entry
      (`additional_redirect_urls`, confirmed live via `supabase config push --yes` in the prior
      verification round) are both genuinely correct — this is a separate, local Next.js proxy gate that
      was simply never updated to match when `app/admin/auth/confirm/route.ts` was introduced in
      02-07-PLAN.md.
    artifacts:
      - path: "lib/supabase/proxy.ts"
        issue: "UNGATED_ADMIN_PATHS (lines 4-8) does not include \"/admin/auth/confirm\", so updateSession()'s unauthenticated-visitor redirect fires for this path before app/admin/auth/confirm/route.ts's GET handler ever executes."
      - path: "app/admin/auth/confirm/route.ts"
        issue: "Textually correct and unreachable by design flaw elsewhere — not itself broken, but never invoked for the realistic case (an unauthenticated visitor with a fresh PKCE code and no existing session cookie) because the proxy intercepts the request first."
    missing:
      - "Add \"/admin/auth/confirm\" to lib/supabase/proxy.ts's UNGATED_ADMIN_PATHS array (the one-line fix 02-REVIEW.md's CR-01 already proposes), then re-verify with a LIVE unauthenticated request (not just a build or grep) — e.g. curl -sI \"$BASE_URL/admin/auth/confirm?code=test\" with no cookie header, against both a dev server and a production build, asserting the response is NOT a redirect to /admin/login. A full real-email round trip (request reset -> click emailed link -> land authenticated on /admin/reset-password -> set new password -> log in with it) should also be exercised at least once before this is considered closed, since scripts/verify-permission-denial.ts does not cover this route."
deferred: []
human_verification:
  - test: "Full browser login click-through: visit /admin/login, log in with ADMIN_EMAIL/ADMIN_PASSWORD, confirm landing on /admin/packages with a visible sidebar (Packages + Users for Admin)."
    expected: "Login succeeds, session persists across a page refresh, sidebar renders per D-13/D-14."
    why_human: "Full redirect + session-cookie behavior across a real browser round-trip; deferred to end-of-phase per human_verify_mode config."
  - test: "Real password-reset email round-trip: request a reset for a real mailbox, click the actual emailed link, set a new password, log in with it — AFTER the proxy.ts gap above is fixed."
    expected: "Reset email arrives with a working link; the code-exchange lands the user authenticated on /admin/reset-password (not /admin/login); the new password logs in successfully."
    why_human: "Real email delivery cannot be verified by curl/grep alone. Note: this item is currently blocked by the gap above — a curl-only proxy check confirms the defect but a full email click-through is the human item that should re-run once the one-line proxy fix lands."
  - test: "Add-Staff-Account dialog: Admin creates a new Staff account, sets name/role/permission toggles, confirms the new account can log in and sees only the nav items its permissions allow."
    expected: "Account created, permission toggles persist, new account's sidebar matches D-13/D-14 exactly."
    why_human: "Multi-step dialog interaction and cross-session verification (new account's own login) not practical to grep-verify."
  - test: "Drag-reorder package list + publish/feature switch interactions in a real browser."
    expected: "Drag-reorder persists new sort_order; switches optimistically update and persist; a simulated failure reverts the switch and shows a toast."
    why_human: "Drag-and-drop and optimistic-UI revert timing require real browser interaction."
  - test: "Multi-tab package create/edit form: itinerary days, inclusions, FAQ facts, price/photos across the full package-form UI."
    expected: "All fields save correctly; package appears/updates on the Phase 1 public site after publish."
    why_human: "Large multi-section form UX and cross-phase (admin -> public site) visual confirmation."
  - test: "Photo upload/reorder/delete flow in photo-manager.tsx."
    expected: "Photos upload, drag-reorder persists display_order, delete removes the Storage object and DB row."
    why_human: "File upload and drag interactions require a real browser; WR-08/WR-09/WR-10 in 02-REVIEW.md flag known edge-case gaps here worth exercising manually."
  - test: "Full visual/styling pass across the admin panel against 02-UI-SPEC.md (sidebar colors, typography, spacing, the new /admin/forbidden page's visual parity with error.tsx)."
    expected: "Admin panel matches TravelSentro brand tokens (teal/orange sidebar, Prata/Inter typography) consistently across all screens."
    why_human: "Visual/brand-fidelity judgment is not greppable."
---

# Phase 2: Admin Access & Package Management — Verification Report (Round 3)

**Phase Goal:** Admin and Staff can securely log into an admin panel, and manage the tour package catalog according to their individually-assigned permissions.
**Mode:** mvp (user story: "As a TravelSentro Admin or Staff member, I want to securely log into an admin panel and manage the tour package catalog according to my individually-assigned permissions, so that the business can keep its live package catalog accurate and control exactly who can change it, without needing a developer for every update.")
**Verified:** 2026-07-19
**Status:** gaps_found
**Re-verification:** Yes — third round, after gap-closure plan 02-09 (AUTH-05 redirect-based permission gate) and a fresh code-review pass (02-REVIEW.md) that surfaced one new critical finding (CR-01: proxy-level allow-list gap)

## Methodology — this was not a source-only or SUMMARY-trusting pass

Per this task's explicit instruction, neither 02-09-SUMMARY.md's PASS claims nor 02-REVIEW.md's CR-01 finding were accepted on their own. This verifier independently:

1. Started a live `npm run dev` server on port 3100 and ran `scripts/verify-permission-denial.ts` against it — a script that creates a real disposable zero-permission Staff auth user via the Supabase service-role client, signs in for a real session cookie, and fetches the 3 gated routes plus 1 Admin positive control over real HTTP. Result: **4/4 PASS**.
2. Ran `npm run build` (clean compile, 0 type errors, `/admin/auth/confirm` and `/admin/forbidden` both present in the route output) then started `npm run start` on port 3100 and re-ran the identical live script against the production build. Result: **4/4 PASS**.
3. Independently read `lib/supabase/proxy.ts` and confirmed by direct source inspection (not by trusting 02-REVIEW.md's text) that `/admin/auth/confirm` is absent from `UNGATED_ADMIN_PATHS`.
4. Independently reproduced the CR-01 defect live with `curl` against both the dev server and the production server: an unauthenticated request to `/admin/auth/confirm?code=<value>` returns `HTTP 307` to `/admin/login` in both modes, confirming the Route Handler is unreachable for the realistic unauthenticated-visitor case.
5. Cross-referenced 02-02-PLAN.md and 02-07-PLAN.md frontmatter to confirm the password-reset end-to-end flow is an explicit `must_haves.truths` entry for this phase (not merely a code-quality nice-to-have), so this is scored as a phase-goal gap, not a warning.
6. Spot-checked for regressions: Server Actions (`actions/{packages,users,package-photos}.ts`) still call the throw-based `requirePermission()`/`requireAdmin()` (unchanged, 2 occurrences of `new Error("Forbidden")` in `lib/auth/dal.ts`); `write_package_children()` RPC wiring, `error.tsx`'s defense-in-depth boundary, and the 4 optimistic-UI try/catch fixes are all still present with no debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) in any file touched by 02-09.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A zero-permission Staff session that requests a gated dashboard page (`/admin/packages`, `/admin/packages/new`, `/admin/users`) sees a graceful HTTP 200 denial page with the UI-SPEC's exact copy, not an HTTP 500 crash (AUTH-05, 02-09-PLAN.md truth #1) | ✓ **VERIFIED** | Independently re-run live by this verifier: `scripts/verify-permission-denial.ts` against `npm run dev` → 4/4 PASS; against `npm run build && npm run start` → 4/4 PASS. All 3 denied routes: status 200, final URL ends `/admin/forbidden`, body contains "You don't have permission to do that. Contact an Admin if you think this is a mistake.", zero occurrences of `__next_error__`. |
| 2 | The identical routes, requested with a real Admin session, continue to return HTTP 200 with real content — no regression (02-09-PLAN.md truth #2) | ✓ **VERIFIED** | Same live runs: positive control against `/admin/packages/new` with the bootstrap Admin session returned `status=200 body-contains-"New Package"=true` in both dev and prod. |
| 3 | A real password-reset email link's PKCE `code` establishes a session at `/admin/auth/confirm` before the user reaches `/admin/reset-password` (D-06; 02-02-PLAN.md truth #5, 02-07-PLAN.md truth #3, CR-01) | ✗ **FAILED** | `curl` (no cookie, `redirect: manual`) against `/admin/auth/confirm?code=<value>` on both a live dev server and a live production build returns `HTTP 307` to `/admin/login` — the Route Handler is never reached. Root cause: `lib/supabase/proxy.ts`'s `UNGATED_ADMIN_PATHS` omits `/admin/auth/confirm`. See Gaps. |
| 4 | Submitting valid `ADMIN_EMAIL`/`ADMIN_PASSWORD` on `/admin/login` logs in and lands on `/admin/packages` (02-02-PLAN.md truth #2, D-15) | ✓ VERIFIED (carried, regression-checked) | `actions/auth.ts`'s `login()` unchanged this round; `verifyDeniedRoute`/`verifyPositiveControl`'s own sign-in step in this round's live script succeeded for both the disposable Staff account and the real Admin account against the running server, confirming the underlying `signInWithPassword` + session-cookie path still works end-to-end. No source changes to this path since the prior round. |
| 5 | Submitting wrong credentials shows the exact inline error without a redirect (02-02-PLAN.md truth #3) | ✓ VERIFIED (carried, unaffected by this round) | `actions/auth.ts` unchanged this round; previously confirmed via source + human-check deferral, no regression risk (file not in 02-09's `files_modified`). |
| 6 | Deactivating a session (`is_active=false`) blocks the very next request, not just the next login (D-05) | ✓ VERIFIED (carried, unaffected) | `getProfile()` in `lib/auth/dal.ts` (unchanged by 02-09 — 02-09 only *added* `requirePermissionOrRedirect`/`requireAdminOrRedirect` after it) still re-queries `is_active` and `redirect()`s on every call. |
| 7 | Admin can create/edit/deactivate Admin/Staff accounts and toggle per-staff permissions (AUTH-02/03/04) | ✓ VERIFIED (carried, unaffected) | `actions/users.ts` untouched by 02-09; still calls throw-based `requireAdmin()` (confirmed by direct grep this round, 3 call sites). |
| 8 | Admin/Staff with `can_manage_packages` can create, edit, delete, publish/unpublish, feature, and reorder packages, reflected on the public site (PKG-01 through PKG-06), and package-children edits are atomic (CR-02) | ✓ VERIFIED (carried, regression-checked) | `actions/packages.ts` still calls throw-based `requirePermission("can_manage_packages")` at all 6 call sites (grep-confirmed this round); `writePackageChildren()` still calls `supabase.rpc("write_package_children", ...)` exactly once with zero occurrences of the old delete-then-insert pattern; the atomic-write migration file is still present. |
| 9 | A Server Action thrown exception in an optimistic-UI component is caught client-side, reverts state, and shows a generic toast (02-REVIEW.md WR-06, 02-07-PLAN.md truth #2) | ✓ VERIFIED (carried, source-level, unaffected) | `GENERIC_ERROR_MESSAGE` occurrence counts in the 4 components unchanged from the prior verified round; none of these 4 files are in 02-09's `files_modified`. |

**Score:** 8/9 truths verified. 1 failed — the password-reset end-to-end flow, which is a distinct must-have from the AUTH-05 item this round's plan (02-09) targeted and closed successfully.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/auth/dal.ts` | `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` added; throw-based guards unchanged | ✓ VERIFIED, WIRED, LIVE | Both new functions present, call `redirect("/admin/forbidden")` as a bare statement (not in try/catch); `new Error("Forbidden")` still occurs exactly twice (throw-based guards byte-for-byte preserved). |
| `app/admin/(dashboard)/{packages/page.tsx,packages/new/page.tsx,packages/[id]/page.tsx,users/page.tsx}` | First statement calls the new redirect-based guard | ✓ VERIFIED, WIRED | Grep-confirmed: all 4 files import and call `requirePermissionOrRedirect`/`requireAdminOrRedirect`; none call the throw-based guards anymore. |
| `app/admin/(dashboard)/forbidden/page.tsx` | Renders UI-SPEC denial copy inside the dashboard shell | ✓ VERIFIED, WIRED, LIVE | Source read confirms exact copy; live HTTP responses in both dev and prod render this page's content at the `/admin/forbidden` URL. |
| `scripts/verify-permission-denial.ts` | Repeatable, self-cleaning live-HTTP check | ✓ VERIFIED, LIVE, RE-RUN INDEPENDENTLY | Not just present — actually executed twice by this verifier (dev + prod) with fresh results, both 4/4 PASS; disposable account cleanup confirmed via the script's own finally-block deletion logic. |
| `lib/supabase/proxy.ts` | Gate unauthenticated `/admin/*` visits, allow-listing all pages that must be reachable pre-session | ⚠️ **PRESENT + WIRED, but incomplete allow-list** | `UNGATED_ADMIN_PATHS` correctly gates the dashboard but omits `/admin/auth/confirm`, breaking the password-reset Route Handler's reachability. See Gaps. |
| `app/admin/auth/confirm/route.ts` | PKCE code-exchange Route Handler | ✓ Textually correct, ✗ UNREACHABLE for the real unauthenticated case | Source is correct (verified: `exchangeCodeForSession`, hardcoded redirect targets, no open-redirect surface) but the proxy intercepts the request before this handler ever runs. Data-flow trace (Level 4): the "data" here is the session-establishing side effect of `exchangeCodeForSession` — it never fires because the request never reaches this file. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/admin/(dashboard)/{...}.tsx` | `lib/auth/dal.ts`'s `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` | first-statement call | ✓ WIRED, LIVE | Confirmed both by source grep and live HTTP behavior (dev + prod). |
| `lib/auth/dal.ts`'s `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` | `app/admin/(dashboard)/forbidden/page.tsx` | `redirect("/admin/forbidden")` bare statement | ✓ WIRED, LIVE | Live responses land on `/admin/forbidden` with 200 and the correct copy, in both dev and prod. |
| `actions/auth.ts`'s `requestPasswordReset()` | `app/admin/auth/confirm/route.ts` | `redirectTo` pointing at `/admin/auth/confirm` | ✓ WIRED (redirectTo target correct) | Confirmed by source read: `redirectTo` is `${origin}/admin/auth/confirm`. |
| Browser (unauthenticated, real reset-link click) | `app/admin/auth/confirm/route.ts` | direct navigation via the emailed link's URL | ✗ **NOT REACHABLE** | `lib/supabase/proxy.ts` intercepts and redirects to `/admin/login` before the Route Handler runs — live-confirmed via `curl` in both dev and prod. This is the actual end-to-end link that matters for D-06 and it is broken, even though the `redirectTo` wiring one hop upstream is correct. |
| `actions/{packages,users,package-photos}.ts` | throw-based `requirePermission()`/`requireAdmin()` | direct call | ✓ WIRED (unchanged) | Grep-confirmed, no regression. |
| `actions/packages.ts`'s `writePackageChildren()` | `public.write_package_children()` RPC | `supabase.rpc(...)` | ✓ WIRED, LIVE (carried) | 1 occurrence, migration still present. |

### Behavioral Spot-Checks (live, run by this verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Zero-permission Staff session hits `/admin/packages`, `/admin/packages/new`, `/admin/users` (dev, port 3100) | `scripts/verify-permission-denial.ts` | 4/4 PASS, all denial routes 200 + UI-SPEC copy + no crash marker | ✓ PASS |
| Same, against a clean `npm run build && npm run start` (prod, port 3100) | `scripts/verify-permission-denial.ts` | 4/4 PASS | ✓ PASS |
| Positive control: Admin session hits `/admin/packages/new` (dev + prod) | same script | 200, "New Package" content present in both modes | ✓ PASS |
| Unauthenticated `curl` against `/admin/auth/confirm?code=<value>` (dev, manual redirect) | `curl -sI` | `307` to `/admin/login` | ✗ **FAIL** — confirms CR-01 live |
| Same, against the production build | `curl -sI` | `307` to `/admin/login` | ✗ **FAIL** — confirms CR-01 live, rules out a dev-only artifact |
| `npm run build` | full production build | Compiles cleanly, 0 type errors, 14 routes listed including `/admin/auth/confirm` and `/admin/forbidden` | ✓ PASS |
| Debt-marker scan on all files touched by 02-09 | grep TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | 0 matches | ✓ PASS |
| Server Action guard regression check | grep `requirePermission(`/`requireAdmin(` in `actions/*.ts` | All 12 call sites still present, unchanged | ✓ PASS (no regression) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this repo. SKIPPED (no runnable probe entry points), consistent with prior rounds.

### Requirements Coverage

| Requirement | Status | Evidence |
|--------------|--------|----------|
| AUTH-01 | ⚠️ **PARTIALLY SATISFIED** | Core email/password login (happy path + wrong-credentials path) is sound and unaffected by this round. However, AUTH-01's password-reset sub-flow — explicitly scoped as a must-have under this requirement by both 02-02-PLAN.md (D-06) and 02-07-PLAN.md (the CR-01 closure attempt) — is live-confirmed broken end-to-end via the proxy allow-list gap. Not fully satisfied until that gap closes. |
| AUTH-02 | ✓ SATISFIED | Unaffected by this round. |
| AUTH-03 | ✓ SATISFIED | Unaffected by this round. |
| AUTH-04 | ✓ SATISFIED | Unaffected by this round. |
| AUTH-05 | ✓ **SATISFIED — closed this round** | Independently live-verified by this verifier (not merely trusted from 02-09-SUMMARY.md) against both a dev server and a production build. This closes the original 02-VERIFICATION.md gap and the round-2 re-verification failure. |
| PKG-01 through PKG-06 | ✓ SATISFIED | Unaffected by this round; PKG-02's atomicity strengthened by CR-02 (carried, regression-checked). |

**Documentation hygiene note (informational only, carried forward unchanged):** REQUIREMENTS.md's own Traceability table still lists "AUTH-01 through AUTH-05 | Phase 2 | Pending" and "PKG-01 through PKG-06 | Phase 2 | Pending" despite the individual checkboxes above being checked. Not a functional gap.

### Anti-Patterns Found

None in the files touched by 02-09 (`lib/auth/dal.ts`, the 4 gated page files, `app/admin/(dashboard)/forbidden/page.tsx`, `scripts/verify-permission-denial.ts`, `package.json`) — 0 occurrences of TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER.

`lib/supabase/proxy.ts` (the file with this round's one gap) also contains no debt markers, no stub returns, and no hardcoded empty state — the defect is a logic omission (a missing array entry), not a code-smell pattern grep would catch on its own. This is exactly why this round's proof standard required a live, unauthenticated `curl` request rather than a source-level scan.

## Human Verification Required

7 items deferred per `human_verify_mode: end-of-phase` (6 carried from prior rounds, unchanged in scope, plus the real-email round-trip item explicitly flagged as currently blocked by this round's gap). See frontmatter `human_verification` list for full detail — summary: full browser login click-through; real password-reset email round-trip (blocked until the proxy fix lands); Add-Staff-Account dialog; drag-reorder + switch interactions; multi-tab package form; photo upload/reorder/delete; visual/styling pass against 02-UI-SPEC.md.

## Gaps Summary

**One gap remains, and it is a new discovery in this round, not a leftover from AUTH-05.** 02-09-PLAN.md set out to close exactly one thing — the permission-denied crash — and it succeeded: this verifier independently re-ran the live proof (not the SUMMARY's claims) against both a dev server and a fresh production build, and got 4/4 PASS both times. AUTH-05 is genuinely closed.

However, a fresh code-review pass (02-REVIEW.md, this same session) surfaced a different critical defect in the same D-06 password-reset flow this phase has now touched three times (the original PKCE-exchange-route creation in 02-07, the `supabase/config.toml` allow-list fix in commit `a7c84a6`, and now this proxy-level allow-list gap). This verifier did not accept 02-REVIEW.md's finding on its own — it independently read `lib/supabase/proxy.ts`'s source and then live-reproduced the defect with `curl` against both a running dev server and a running production server, confirming an unauthenticated visitor's request to `/admin/auth/confirm` (the exact URL a real password-reset email link points at) is redirected to `/admin/login` by the proxy before the code-exchange Route Handler ever executes, in both modes.

This is scored as a phase-goal-blocking gap, not a warning, because 02-02-PLAN.md's own `must_haves.truths` explicitly commits to "A logged-in user can request a password reset email and set a new password end-to-end (D-06)" as a phase must-have — and that flow is currently non-functional for the realistic case of a real, unauthenticated user clicking a real emailed link.

**The fix is a one-line addition** (`"/admin/auth/confirm"` to `lib/supabase/proxy.ts`'s `UNGATED_ADMIN_PATHS` array, exactly as 02-REVIEW.md's CR-01 proposes) — but per this phase's own established lesson (three "looks fixed but isn't" findings in a row for different mechanisms protecting this exact flow), the next closure attempt must be verified with a live, unauthenticated HTTP request against both a dev server and a production build — not a build-success check or a source-level grep, both of which would currently pass on a still-broken proxy.ts if the fix were made without re-testing this specific path (the `route.ts` file itself already passes both those checks and still doesn't work end-to-end).

Everything else checks out under this round's independent re-verification: AUTH-05 is genuinely closed (the phase's primary remaining item going into this round), CR-02's atomic package-write RPC and WR-06's client-side exception handling show no regressions, and all Server Action authorization call sites remain unchanged and correctly wired.

---

_Verified: 2026-07-19_
_Verifier: Claude (gsd-verifier)_
