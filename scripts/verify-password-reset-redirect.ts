/**
 * Automated re-save + disposable-user differential re-test for 02-UAT.md
 * Test 2 (AUTH-01 password-reset bounce-to-login).
 *
 * The debug session at .planning/debug/password-reset-bounce-to-login.md
 * root-caused this as NOT an application-code defect: actions/auth.ts's
 * requestPasswordReset() already sends redirectTo: `${origin}/admin/auth/confirm`,
 * app/admin/auth/confirm/route.ts already correctly exchanges a PKCE `code`
 * for a session, and lib/supabase/proxy.ts already allow-lists this path
 * (02-10). The failure is upstream: the hosted Supabase Auth project
 * silently replaces every tested redirect_to value -- including exact
 * allow-list matches -- with the bare configured Site URL when generating
 * password-recovery links (supabase/supabase#10534, #36640, #39718).
 *
 * This script does two things, mirroring the debug session's own proven
 * reproduction method:
 *
 *   Step 1 (automated re-save): GET then PATCH the hosted project's
 *   /config/auth via the Supabase Management API, re-submitting the SAME
 *   SITE_URL/URI_ALLOW_LIST values just read back -- an idempotent re-save,
 *   the automated equivalent of clicking "Save" on the dashboard's
 *   Authentication -> URL Configuration page. Rules out simple config
 *   staleness.
 *
 *   Step 2 (differential re-test): create one disposable auth user, call
 *   the Auth Admin API's recovery link generator with the app's real
 *   requested redirectTo, and inspect whether the path survived or was
 *   stripped down to the bare Site URL -- the exact failure signature the
 *   debug session documented. The disposable user is always deleted in a
 *   finally block; no real email is ever sent by this path.
 *
 * Run via `npm run verify:password-reset-redirect` (-> `tsx
 * --env-file=.env.local scripts/verify-password-reset-redirect.ts`).
 *
 * SECURITY: SUPABASE_ACCESS_TOKEN (Management API, project-scoped) and
 * SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) are read only from process.env
 * and never printed, logged, or included in this script's PASS/FAIL
 * summary output. CLI-only -- never imported from app/ or components/,
 * mirroring scripts/seed-admin.ts and scripts/verify-permission-denial.ts.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Node 20 has no native global WebSocket (added in Node 22); @supabase/supabase-js
 * always constructs a RealtimeClient, which requires one even though this
 * script never uses realtime features. Polyfill from `undici` (already
 * present via Next.js's dependency tree) rather than adding a new
 * dependency. Mirrors scripts/seed-admin.ts's identical polyfill.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

// Prefer the server-only SUPABASE_URL; fall back to NEXT_PUBLIC_SUPABASE_URL
// since both point at the same project -- mirrors scripts/seed-admin.ts's
// identical fallback.
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

// The exact redirect target actions/auth.ts's requestPasswordReset() requests
// for local dev (getSiteOrigin() falls back to http://localhost:3000 when
// NEXT_PUBLIC_SITE_URL is unset and no request-scoped host header is
// available, which is this CLI script's situation).
const TARGET_REDIRECT = "http://localhost:3000/admin/auth/confirm";

if (!SUPABASE_URL) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:password-reset-redirect`."
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:password-reset-redirect`."
  );
}

if (!SUPABASE_ACCESS_TOKEN) {
  throw new Error(
    "Missing SUPABASE_ACCESS_TOKEN in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:password-reset-redirect`."
  );
}

if (!SUPABASE_PROJECT_REF) {
  throw new Error(
    "Missing SUPABASE_PROJECT_REF in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:password-reset-redirect`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

/**
 * Step 1: re-submit ("re-save") the hosted project's SITE_URL/URI_ALLOW_LIST
 * via the Management API -- GET the current values, then PATCH the identical
 * endpoint with those SAME values. This never writes a new or different
 * value (T-02-32); it only rules out simple config/server-state staleness,
 * the one action the debug session's `missing` list flags as plausibly
 * fixable without a human.
 */
async function resaveAuthConfig(): Promise<CheckResult> {
  const configUrl = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth`;

  const getRes = await fetch(configUrl, {
    headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
  });

  if (!getRes.ok) {
    return {
      name: "Management API re-save (informational)",
      pass: false,
      detail: `GET ${configUrl} returned ${getRes.status} -- could not read current config, skipping PATCH`,
    };
  }

  const current = (await getRes.json()) as {
    SITE_URL?: string;
    URI_ALLOW_LIST?: string;
  };

  const patchRes = await fetch(configUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      SITE_URL: current.SITE_URL,
      URI_ALLOW_LIST: current.URI_ALLOW_LIST,
    }),
  });

  const pass = patchRes.ok;
  return {
    name: "Management API re-save (informational)",
    pass,
    detail: pass
      ? `PATCH ${configUrl} returned ${patchRes.status} -- re-save succeeded`
      : `PATCH ${configUrl} returned ${patchRes.status} -- re-save failed`,
  };
}

/**
 * Step 2: reproduce the debug session's own disposable-user recovery-link
 * differential check. Always deletes the disposable user in a finally
 * block, pass or fail. No real email is ever sent by this path.
 */
async function differentialRedirectCheck(
  serviceRoleClient: ReturnType<typeof createClient<Database>>
): Promise<CheckResult> {
  const disposableEmail = `verify-password-reset-redirect-${Date.now()}@travelsentro.test`;
  const disposablePassword = `Verify-${Math.random().toString(36).slice(2)}!Aa1`;

  let disposableUserId: string | undefined;

  try {
    const { data: created, error: createError } =
      await serviceRoleClient.auth.admin.createUser({
        email: disposableEmail,
        password: disposablePassword,
        email_confirm: true,
      });

    if (createError || !created.user) {
      throw new Error(
        `Failed to create disposable auth user: ${createError?.message ?? "no user returned"}`
      );
    }
    disposableUserId = created.user.id;

    const { data: linkData, error: linkError } =
      await serviceRoleClient.auth.admin.generateLink({
        type: "recovery",
        email: disposableEmail,
        options: { redirectTo: TARGET_REDIRECT },
      });

    if (linkError || !linkData) {
      throw new Error(
        `Recovery link generation failed: ${linkError?.message ?? "no data returned"}`
      );
    }

    const redirectTo = linkData.properties?.redirect_to ?? "";
    const actionLink = linkData.properties?.action_link ?? "";
    const pass = redirectTo.startsWith(TARGET_REDIRECT);

    return {
      name: "redirect_to differential check",
      pass,
      detail: pass
        ? `redirect_to="${redirectTo}" -- path survived, matches requested target`
        : `redirect_to="${redirectTo}" (want it to start with "${TARGET_REDIRECT}") -- action_link="${actionLink}" -- path was stripped, hosted project still falls back to bare Site URL`,
    };
  } finally {
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
}

async function main() {
  await ensureWebSocketPolyfill();

  const serviceRoleClient = createClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const results: CheckResult[] = [];

  results.push(await resaveAuthConfig());
  results.push(await differentialRedirectCheck(serviceRoleClient));

  console.log(`\nverify-password-reset-redirect -- target=${TARGET_REDIRECT}\n`);
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }

  const differential = results.find((r) => r.name === "redirect_to differential check");
  const gatePass = differential?.pass ?? false;

  console.log(
    `\n${gatePass ? "PASS" : "FAIL"}: redirect_to differential check ${gatePass ? "now honored by the hosted project" : "still stripped upstream -- see Task 2's checkpoint for the remaining manual steps"}\n`
  );

  if (!gatePass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify-password-reset-redirect failed:", err);
  process.exit(1);
});
