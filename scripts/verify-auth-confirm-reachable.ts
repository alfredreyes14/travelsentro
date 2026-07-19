/**
 * Live-HTTP verification that `/admin/auth/confirm` is reachable through
 * `lib/supabase/proxy.ts`'s `updateSession()` gate for an unauthenticated
 * visitor (02-REVIEW.md CR-01, D-06, AUTH-01's password-reset sub-flow).
 *
 * `app/admin/auth/confirm/route.ts` exports only `GET`, and Next.js's Route
 * Handler convention returns `405 Method Not Allowed` for any unsupported
 * method (node_modules/next/dist/docs/01-app/01-getting-started/
 * 15-route-handlers.md). `lib/supabase/proxy.ts`'s `updateSession()` gate,
 * by contrast, never inspects `request.method` and always redirects
 * unauthenticated `/admin/*` requests with a `307` to `/admin/login`. So an
 * unauthenticated `POST` to `/admin/auth/confirm` returns `405`
 * if-and-only-if the proxy lets it through to Next.js's routing layer, and
 * `307` to `/admin/login` if-and-only-if the proxy still blocks it -- a
 * clean, PKCE-independent, email-independent reachability signal.
 *
 * A synthetic-code GET request cannot be used for this check: the route
 * handler's own fallback on any invalid/missing/unpaired code is also a
 * redirect to `/admin/login`, producing an identical response whether the
 * proxy blocks the request or the route handler correctly rejects it. The
 * full real-email PKCE round trip remains a human_verification item for the
 * end-of-phase pass (see 02-10-PLAN.md's objective and this project's
 * human_verify_mode: end-of-phase) -- this script proves reachability only.
 *
 * This is a pure HTTP status-code differential check: no Supabase client of
 * any kind is constructed, and no environment variables beyond an optional
 * BASE_URL override are required.
 *
 * Run via `npm run verify:auth-confirm` (-> `tsx --env-file=.env.local
 * scripts/verify-auth-confirm-reachable.ts`), with BASE_URL optionally
 * overriding the default http://localhost:3100 target.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

type CheckResult = { name: string; pass: boolean; detail: string };

/**
 * Confirms `/admin/auth/confirm` is reachable through the proxy: an
 * unauthenticated POST (no cookie) must return 405 (Next.js's routing
 * dispatched to the route.ts, which exports only GET), never 307 to
 * /admin/login (which would mean the proxy intercepted the request first).
 */
async function verifyAuthConfirmReachable(): Promise<CheckResult> {
  const path = "/admin/auth/confirm";
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    redirect: "manual",
  });

  const pass = res.status === 405;
  const location = res.headers.get("location");
  const detail = pass
    ? `status=${res.status} (want 405 -- proxy let the request through to Next.js's routing)`
    : res.status === 307
      ? `status=307 (want 405) location=${location} -- lib/supabase/proxy.ts's updateSession() is still intercepting this path before Next.js's routing ever sees it`
      : `status=${res.status} (want 405) location=${location ?? "none"} -- unexpected status`;

  return { name: `POST ${path} -> 405 (reachable)`, pass, detail };
}

/**
 * Control: /admin/packages must remain gated for an unauthenticated
 * visitor -- proves lib/supabase/proxy.ts's block mechanism still functions
 * for paths that should stay gated (no unrelated regression), and that this
 * script's method-based differential methodology is sound (if this control
 * ever also returned 405, the test technique itself would be broken, not
 * the target fix).
 */
async function verifyGatedControl(): Promise<CheckResult> {
  const path = "/admin/packages";
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    redirect: "manual",
  });

  const location = res.headers.get("location");
  const statusOk = res.status === 307;
  const locationOk = location?.endsWith("/admin/login") ?? false;
  const pass = statusOk && locationOk;
  const detail = pass
    ? `status=${res.status} location=${location} (still gated, as expected)`
    : `status=${res.status} (want 307) location=${location ?? "none"} (want ends with /admin/login)`;

  return { name: `POST ${path} -> 307 to /admin/login (control)`, pass, detail };
}

async function main() {
  console.log(`\nverify-auth-confirm-reachable -- BASE_URL=${BASE_URL}\n`);

  const results: CheckResult[] = [
    await verifyAuthConfirmReachable(),
    await verifyGatedControl(),
  ];

  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify-auth-confirm-reachable failed:", err);
  process.exit(1);
});
