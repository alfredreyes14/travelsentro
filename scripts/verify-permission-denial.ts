/**
 * Live-HTTP verification for AUTH-05's permission-denial gap closure
 * (02-09-PLAN.md). Proves -- via real HTTP requests carrying a real
 * zero-permission Staff session cookie against a running server -- that
 * /admin/packages, /admin/packages/new, and /admin/users return a graceful
 * HTTP 200 denial page (never a 500 crash page) for an under-permissioned
 * session, and that a real Admin session's identical requests still return
 * real page content (no regression).
 *
 * Per 02-VERIFICATION.md's explicit lesson from the prior failed closure
 * attempt: a clean `npm run build` and a source-level grep for the denial
 * copy string BOTH passed on a still-broken implementation. This script is
 * the only acceptable proof -- run it against both a live `npm run dev`
 * server AND a live `npm run build && npm run start` production server.
 *
 * Run via `npm run verify:permission-denial` (-> `tsx --env-file=.env.local
 * scripts/verify-permission-denial.ts`), with BASE_URL optionally overriding
 * the default http://localhost:3100 target.
 *
 * SECURITY: this script uses the Supabase service-role key (mirroring
 * scripts/seed-admin.ts's existing safeguard) -- constructed inline here
 * only, never exported, never imported from app/ or components/. Always
 * deletes its disposable test account in a finally block, regardless of
 * pass/fail, so repeated runs never accumulate throwaway accounts.
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../types/database";

/**
 * Node 20 has no native global WebSocket (added in Node 22); @supabase/supabase-js
 * always constructs a RealtimeClient, which requires one even though this
 * script never uses realtime features. Polyfill from `undici` (already
 * present via Next.js's dependency tree) rather than adding a new dependency.
 * Mirrors scripts/seed-admin.ts's identical polyfill.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

// Prefer the server-only SUPABASE_URL; fall back to NEXT_PUBLIC_SUPABASE_URL
// since both point at the same project and only the key differs in
// privilege -- mirrors scripts/seed-admin.ts's identical fallback.
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

const DENIAL_COPY =
  "You don't have permission to do that. Contact an Admin if you think this is a mistake.";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:permission-denial`."
  );
}

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:permission-denial`."
  );
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "Missing ADMIN_EMAIL or ADMIN_PASSWORD in the environment. " +
      "Set both in .env.local (see .env.local.example) before running `npm run verify:permission-denial`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

/**
 * Signs in against an in-memory cookie jar (a plain Map) using the same
 * @supabase/ssr createServerClient cookie-callback shape lib/supabase/server.ts
 * uses with Next's cookies() API, then reads back whatever the jar's setAll
 * callback captured -- producing a real session cookie header string usable
 * against a live HTTP request, without needing a browser or Next runtime.
 */
async function signInAndGetCookieHeader(
  email: string,
  password: string
): Promise<string> {
  const jar = new Map<string, string>();

  const supabase = createServerClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return Array.from(jar.entries()).map(([name, value]) => ({
            name,
            value,
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => jar.set(name, value));
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  }

  if (jar.size === 0) {
    throw new Error(
      `signInWithPassword for ${email} succeeded but no cookies were captured by the in-memory jar.`
    );
  }

  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function verifyDeniedRoute(
  path: string,
  cookieHeader: string
): Promise<CheckResult> {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "follow",
    headers: { cookie: cookieHeader },
  });
  const body = await res.text();

  const statusOk = res.status === 200;
  const urlOk = res.url.endsWith("/admin/forbidden");
  const copyOk = body.includes(DENIAL_COPY);
  const noCrashMarker = !body.includes("__next_error__");

  const pass = statusOk && urlOk && copyOk && noCrashMarker;
  const detail = pass
    ? `status=${res.status} url=${res.url} denial-copy=present crash-marker=absent`
    : `status=${res.status} (want 200) url=${res.url} (want ends with /admin/forbidden) denial-copy=${copyOk ? "present" : "MISSING"} crash-marker=${noCrashMarker ? "absent" : "PRESENT"}`;

  return { name: `Staff denied: ${path}`, pass, detail };
}

async function verifyPositiveControl(cookieHeader: string): Promise<CheckResult> {
  const path = "/admin/packages/new";
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "follow",
    headers: { cookie: cookieHeader },
  });
  const body = await res.text();

  const statusOk = res.status === 200;
  const contentOk = body.includes("New Package");
  const pass = statusOk && contentOk;
  const detail = pass
    ? `status=${res.status} body-contains-"New Package"=true`
    : `status=${res.status} (want 200) body-contains-"New Package"=${contentOk}`;

  return { name: `Admin positive control: ${path}`, pass, detail };
}

async function main() {
  await ensureWebSocketPolyfill();

  const serviceRoleClient = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const disposableEmail = `verify-permission-denial-${Date.now()}@travelsentro.test`;
  const disposablePassword = `Verify-${Math.random().toString(36).slice(2)}!Aa1`;

  let disposableUserId: string | undefined;
  const results: CheckResult[] = [];

  try {
    // (1) Disposable zero-permission Staff account. The on_auth_user_created
    // trigger (02-01) auto-creates a role='staff', is_active=true,
    // all-three-permissions-false profiles row -- no separate update needed.
    const { data: created, error: createError } =
      await serviceRoleClient.auth.admin.createUser({
        email: disposableEmail,
        password: disposablePassword,
        email_confirm: true,
      });

    if (createError || !created.user) {
      throw new Error(
        `Failed to create disposable Staff auth user: ${createError?.message ?? "no user returned"}`
      );
    }
    disposableUserId = created.user.id;

    // (2) Real session cookies for both the disposable Staff account and the
    // bootstrap Admin account (positive control).
    const staffCookieHeader = await signInAndGetCookieHeader(
      disposableEmail,
      disposablePassword
    );
    const adminCookieHeader = await signInAndGetCookieHeader(
      ADMIN_EMAIL as string,
      ADMIN_PASSWORD as string
    );

    // (3) Denied routes for the zero-permission Staff session.
    results.push(await verifyDeniedRoute("/admin/packages", staffCookieHeader));
    results.push(
      await verifyDeniedRoute("/admin/packages/new", staffCookieHeader)
    );
    results.push(await verifyDeniedRoute("/admin/users", staffCookieHeader));

    // (4) Positive control -- Admin session still gets real content.
    results.push(await verifyPositiveControl(adminCookieHeader));
  } finally {
    // (6) Always clean up the disposable account, pass or fail.
    if (disposableUserId) {
      const { error: deleteError } =
        await serviceRoleClient.auth.admin.deleteUser(disposableUserId);
      if (deleteError) {
        console.error(
          `WARNING: failed to delete disposable user ${disposableUserId}: ${deleteError.message}`
        );
      }
    }
  }

  // (5) Structured pass/fail summary.
  console.log(`\nverify-permission-denial -- BASE_URL=${BASE_URL}\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`);

  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify-permission-denial failed:", err);
  process.exit(1);
});
