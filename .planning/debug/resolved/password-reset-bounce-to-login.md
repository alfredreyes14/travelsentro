---
status: resolved
trigger: "Investigate issue: password-reset-bounce-to-login. A real password-reset email link, clicked in the same browser that requested the reset, bounces the user back to /admin/login instead of landing them authenticated on /admin/reset-password."
created: 2026-07-19T04:20:00Z
updated: 2026-07-19T06:30:00Z
resolved_by: "02-12-PLAN.md's Management API re-save. Confirmed live by the developer: a real emailed link showed redirect_to=http://localhost:3000/admin/auth/confirm (path intact) and the full reset (new password + login) succeeded end-to-end -- this diagnosed root cause (upstream Supabase redirect_to stripping) is fixed."
caveat: "The SAME visible symptom (bounce to /admin/login) recurred on a second, independently-requested reset link during the same verification session. Root cause of this recurrence is NOT yet diagnosed -- could be a different defect (e.g. session/cookie interference from being already-authenticated) or an incomplete/intermittent fix. Needs its own /gsd-debug session before any further fix attempt. See 02-12-SUMMARY.md and STATE.md for the full account."

## Current Focus

hypothesis: CONFIRMED (see Resolution) — the hosted Supabase Auth project does not honor the app's requested `redirect_to` for password-recovery links; it silently falls back to the bare configured Site URL, so the emailed link never actually targets `/admin/auth/confirm`, and `exchangeCodeForSession()` is never reached.
test: Live-reproduced against the real hosted Supabase project (ref wisesrmizzgfbwlktoxh) via Management API config read + `admin.generateLink`/`admin.createUser` (disposable, cleaned-up test users; no real email sent).
expecting: n/a — root cause confirmed, mode is find_root_cause_only, stopping before fix_and_verify.
next_action: Hand off ROOT CAUSE FOUND. Recommended next diagnostic step for whoever fixes this: capture the FULL raw URL (via "copy link address", not click) of one real received reset email and compare its `redirect_to=` value against `http://localhost:3000/admin/auth/confirm` to confirm the exact same fallback happens for the live `resetPasswordForEmail()` client call (not just the admin-API probes used here, which are architecturally PKCE-incompatible per Supabase's own docs).

## Symptoms

expected: Reset email arrives with a working link; the code-exchange lands the user authenticated on /admin/reset-password (not /admin/login); the new password logs in successfully.
actual: User reported (verbatim): "I received the email but when I click the link, I got bounced back to login page." When asked whether they'd clicked it in the same browser/session, they confirmed: "I clicked the link from the email tab then I got redirected to login" — same browser, not a different one.
errors: None reported by the user (no visible browser error).
reproduction: Test 2 in .planning/phases/02-admin-access-package-management/02-UAT.md — request a password reset from /admin/forgot-password for a real mailbox, in a real browser, then click the link that arrives in email (same browser tab/session).
started: Discovered during UAT immediately after gap-closure plan 02-10 fixed the proxy-level reachability gap (CR-01) for this same flow; 02-VERIFICATION.md round 4 independently confirmed via live curl that unauthenticated POST to /admin/auth/confirm now returns 405 (reachable) in both dev and prod builds.

## Eliminated

- hypothesis: "The hosted Supabase project's Authentication → URL Configuration → Redirect URLs allow-list doesn't include `http://localhost:3000/admin/auth/confirm` because `supabase/config.toml`'s `additional_redirect_urls` is local-only and was never pushed/mirrored to the hosted project (the important_context's suggested primary lead)."
  evidence: "Queried the hosted project's LIVE auth config directly via the Supabase Management API (`GET https://api.supabase.com/v1/projects/wisesrmizzgfbwlktoxh/config/auth`, using the project's own stored `SUPABASE_ACCESS_TOKEN`): `SITE_URL=http://127.0.0.1:3000`, `URI_ALLOW_LIST=https://127.0.0.1:3000,http://localhost:3000/admin/reset-password,http://localhost:3000/admin/auth/confirm` — this is IDENTICAL to `supabase/config.toml`'s `site_url` and `additional_redirect_urls`. The hosted project's declared config already mirrors the local file exactly; someone has already pushed/synced it (or it happened via `supabase link`/prior CLI usage). This is NOT a missing-allow-list-entry problem at the declared-config level."
  timestamp: 2026-07-19T04:30:00Z

- hypothesis: "The code_verifier PKCE cookie is dropped on the top-level navigation from the email client because @supabase/ssr sets `SameSite=Strict` on its auth cookies, and clicking a link from a different origin (the email tab / webmail) is a cross-site top-level navigation that Strict cookies are not sent on."
  evidence: "Read `node_modules/@supabase/ssr/dist/main/utils/constants.js` directly: `DEFAULT_COOKIE_OPTIONS = { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 days }`. The library defaults to `Lax`, not `Strict`, and neither `lib/supabase/server.ts` nor `lib/supabase/client.ts` override `cookieOptions`. `Lax` cookies ARE sent on top-level GET navigations (including clicking a link from an external site), so this mechanism does not block the code_verifier cookie's delivery."
  timestamp: 2026-07-19T04:38:00Z

- hypothesis: "The recovery link uses the OAuth implicit flow (`#access_token=` URL fragment) instead of PKCE (`?code=` query param) for the REAL client-invoked `resetPasswordForEmail()` flow, which would mean `app/admin/auth/confirm/route.ts`'s `code` query-param check always finds nothing (fragments are never sent to the server)."
  evidence: "Live-reproduced this fragment-based (`#access_token=...&type=recovery`) response via `supabase.auth.admin.generateLink({type: 'recovery', ...})` for a disposable test user — but subsequently confirmed via Supabase's own issue tracker (github.com/orgs/supabase/discussions/20937, github.com/supabase/auth-js#767) that `admin.generateLink()` is ARCHITECTURALLY INCOMPATIBLE with PKCE by design: 'even if you set flowType: pkce ... PKCE flow is not used' for admin-generated links, because the code_verifier must be generated client-side at request time, which an admin API call can't provide. This means the implicit-flow response I observed is an artifact of testing via the admin API, not evidence about the real `resetPasswordForEmail()`-initiated flow. Downgraded from a confirmed finding to an unconfirmed, plausible-but-untested hypothesis (see Resolution notes)."
  timestamp: 2026-07-19T04:41:00Z

## Evidence

- timestamp: 2026-07-19T04:22:00Z
  checked: "Project's actual runtime environment — `supabase status` and `supabase projects list`."
  found: "No local Supabase containers running (`supabase status` errors with 'No such container'). `supabase projects list` shows this repo is LINKED to a HOSTED project: ref `wisesrmizzgfbwlktoxh`, name 'staging', region Tokyo. `.env.local` confirms `NEXT_PUBLIC_SUPABASE_URL=https://wisesrmizzgfbwlktoxh.supabase.co` matches this hosted ref."
  implication: "All testing (dev and prod builds alike, per 02-VERIFICATION round 4) runs against the HOSTED Supabase Auth service, not local Inbucket-captured email. `supabase/config.toml` is a local-dev-only file whose `[auth]` section has no automatic effect on the hosted project."

- timestamp: 2026-07-19T04:24:00Z
  checked: "`.env.local` var names (values not read/printed) via `grep -o '^[A-Z_]*=' .env*`."
  found: "`NEXT_PUBLIC_SITE_URL` is NOT set. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` are present."
  implication: "`actions/auth.ts`'s `getSiteOrigin()` cannot use `NEXT_PUBLIC_SITE_URL` (unset) and falls through to deriving origin from the incoming request's `host` header — i.e. whatever host the browser used to load `/admin/forgot-password` (e.g. `localhost:3000`), confirming `redirectTo` is computed dynamically as `${scheme}://${host}/admin/auth/confirm`, not a fixed configured value."

- timestamp: 2026-07-19T04:29:00Z
  checked: "Hosted Supabase project's LIVE auth config via Management API: `GET https://api.supabase.com/v1/projects/wisesrmizzgfbwlktoxh/config/auth` (authenticated with the project's own stored `SUPABASE_ACCESS_TOKEN`, read from env only, never printed)."
  found: "`SITE_URL: http://127.0.0.1:3000`. `URI_ALLOW_LIST: https://127.0.0.1:3000,http://localhost:3000/admin/reset-password,http://localhost:3000/admin/auth/confirm`."
  implication: "The exact redirect URL the app requests (`http://localhost:3000/admin/auth/confirm`) IS present, verbatim, in the hosted project's declared allow-list. The important_context's suggested 'never pushed to hosted' theory is refuted by direct evidence."

- timestamp: 2026-07-19T04:31:00Z
  checked: "Live behavior of the hosted Auth server's redirect_to validation, via `supabase.auth.admin.generateLink({type: 'recovery', email: <disposable test user>, options: {redirect_to: 'http://localhost:3000/admin/auth/confirm'}})` (test user created and deleted via admin API; no email sent to any real inbox)."
  found: "Response's `redirect_to` field and `action_link` both show `http://127.0.0.1:3000` — NOT the requested `http://localhost:3000/admin/auth/confirm`. The path was dropped entirely and the host/scheme silently substituted with the bare SITE_URL."
  implication: "Even though the requested URL exactly matches a configured allow-list entry, the LIVE server does not honor it for recovery links — it falls back to the bare Site URL."

- timestamp: 2026-07-19T04:33:00Z
  checked: "Repeated the same generate_link test with 6 redirect_to variants: exact `/admin/auth/confirm` (localhost and 127.0.0.1 host), exact `/admin/reset-password`, bare `https://127.0.0.1:3000`, bare `http://127.0.0.1:3000` (identical to SITE_URL), and no override at all."
  found: "100% of variants (6/6) resolved to `http://127.0.0.1:3000` — including variants that exactly match individual allow-list entries and even the variant identical to SITE_URL itself (trivially expected to match). No variant with a path survived; every path got stripped."
  implication: "This is not a one-off fluke or a single-entry typo — the live server's redirect_to handling for this project currently discards ALL tested path-bearing redirect targets, regardless of whether the Management API reports them as configured. Reproducible, consistent, live evidence."

- timestamp: 2026-07-19T04:35:00Z
  checked: "Followed the real `action_link` (from `generate_link`) end-to-end with `redirect: manual`, hop by hop, exactly as a browser would when a user clicks the emailed link."
  found: "Hop 0: GoTrue's `/auth/v1/verify` returns `303` with `Location: http://127.0.0.1:3000#access_token=...&refresh_token=...&type=recovery` (implicit-flow tokens in a URL FRAGMENT, not a `?code=` query param). Hop 1: `200` (fragment never sent to any server — this is just documenting where the browser's address bar would end up)."
  implication: "For an ADMIN-generated link specifically, the final redirect lands on the bare origin with implicit-flow tokens in the fragment — never touching `/admin/auth/confirm` at all, and even if it did, the fragment is invisible to `route.ts`'s server-side `code` query-param check. (Caveat: `admin.generateLink()` is confirmed architecturally incapable of PKCE regardless of project settings — see Eliminated — so the fragment-vs-code distinction specifically is NOT proof about the real client flow; the redirect_to/path-stripping behavior is the well-corroborated finding.)"

- timestamp: 2026-07-19T04:44:00Z
  checked: "Web search for upstream Supabase/GoTrue issues matching this exact failure signature, to corroborate or refute whether the redirect_to/SITE_URL-fallback behavior also affects the real `resetPasswordForEmail()` client call (not just the admin API used in this sandbox's tests)."
  found: "Multiple independent, matching upstream reports: supabase/supabase#10534 ('redirectTo not working in Reset Password E-mail'), supabase/supabase#36640 ('Localhost redirect URLs not respected in resetPasswordForEmail', opened June 2025 — 'When calling resetPasswordForEmail with a localhost URL that satisfies the redirect URLs list, the received email uses the site URL instead of the passed redirect URL'), and supabase/supabase#39718 ('Password Reset and Invite Links Use localhost:3000 in Production Environment'). Official Supabase docs (redirect-urls guide) independently confirm the general fallback mechanism: 'Should the redirect parameter not fall in the URL allow list, the Site URL is used.'"
  implication: "This is a known, previously-reported class of Supabase/GoTrue platform behavior — specifically and repeatedly reported for `resetPasswordForEmail()` with localhost-based redirect URLs, i.e. exactly this project's scenario. Not an artifact unique to this codebase or to the admin-API test method."

## Resolution

root_cause: |
  The hosted Supabase Auth project (ref wisesrmizzgfbwlktoxh) does not honor the
  `redirect_to` value `actions/auth.ts`'s `requestPasswordReset()` requests
  (`http://localhost:3000/admin/auth/confirm`) when generating password-recovery
  links, even though that exact URL is present in the project's configured
  Redirect URL allow-list (independently confirmed live via the Supabase
  Management API). Live reproduction against the real hosted Auth server
  (via disposable, cleaned-up test users -- no real email sent) shows every
  tested redirect_to variant, including exact allow-list matches, gets
  silently replaced with the bare Site URL (`http://127.0.0.1:3000`, path
  stripped). Because of this, the emailed reset link's redirect never
  actually targets `/admin/auth/confirm`, so
  `app/admin/auth/confirm/route.ts`'s `exchangeCodeForSession()` call is
  never reached -- the round trip fails before the app's own PKCE-exchange
  code ever runs, which is exactly why 02-10's proxy-reachability script
  (POST -> 405/307 differential) could not have caught this: that script
  never involves a real Supabase-issued redirect at all, only direct HTTP
  calls to the app's own routes.

  This is corroborated as a known class of Supabase/GoTrue platform
  behavior specifically reported for `resetPasswordForEmail()` with
  localhost-based redirect URLs (supabase/supabase#10534, #36640, #39718),
  not something introduced by this codebase's own logic
  (`actions/auth.ts`, `app/admin/auth/confirm/route.ts`, and
  `lib/supabase/proxy.ts` are all unchanged/correct per their own design --
  02-10's proxy fix remains valid and necessary, just not sufficient).

  One open nuance flagged honestly rather than overclaimed: my live tests
  used `supabase.auth.admin.generateLink()` (the only email-free way to
  safely reproduce this without spamming a real inbox in this sandbox),
  which Supabase's own docs/issue tracker confirm is architecturally
  incapable of the PKCE flow "even if flowType: pkce is set" -- so while
  the redirect_to/path-stripping finding is strongly evidenced (live
  reproduction + matching upstream reports specific to the real
  `resetPasswordForEmail()` client call), I could not, from within this
  sandbox (no real receivable inbox), 100% conclusively confirm whether the
  REAL emailed link additionally exhibits the implicit-flow
  (`#access_token=`) vs PKCE (`?code=`) discrepancy I observed via the
  admin API specifically. Either way, the redirect_to fallback alone is
  sufficient to fully explain the reported symptom (the link never reaches
  `/admin/auth/confirm` at all).
fix: ""
verification: ""
files_changed: []
