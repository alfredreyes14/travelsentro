/**
 * Live-HTTP verification for the admin package PDF download route
 * (app/admin/(dashboard)/packages/[id]/pdf/route.ts). Proves:
 *  1. a zero-permission Staff session is redirected to /admin/forbidden
 *     (never served a PDF).
 *  2. a real Admin session gets a valid PDF for the seeded "Palawan Island
 *     Hopping" package.
 *  3. the admin route serves a package even while it's unpublished (a
 *     draft) -- proving no is_published filter, unlike the public route.
 *     The package's publish state is always restored in a finally block.
 *
 * Mirrors scripts/verify-permission-denial.ts's disposable-account +
 * cookie-jar sign-in helper.
 *
 * Requires a running server (`npm run dev -- -p 3100` or
 * `npm run build && npm run start -- -p 3100`) and a seeded database
 * (`npm run seed`). Run via `npm run verify:admin-package-pdf` (-> `tsx
 * --env-file=.env.local scripts/verify-admin-package-pdf.ts`), with
 * BASE_URL optionally overriding the default http://localhost:3100 target.
 *
 * SECURITY: uses the Supabase service-role key (mirroring
 * scripts/seed-admin.ts's existing safeguard) -- constructed inline here
 * only, never exported, never imported from app/ or components/.
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../types/database";

async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:admin-package-pdf`."
  );
}
if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:admin-package-pdf`."
  );
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "Missing ADMIN_EMAIL or ADMIN_PASSWORD in the environment. " +
      "Set both in .env.local before running `npm run verify:admin-package-pdf`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

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

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  }
  if (jar.size === 0) {
    throw new Error(
      `signInWithPassword for ${email} succeeded but no cookies were captured.`
    );
  }

  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function main() {
  await ensureWebSocketPolyfill();

  const serviceRoleClient = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const { data: pkg, error: pkgError } = await serviceRoleClient
    .from("packages")
    .select("id, is_published")
    .eq("name", "Palawan Island Hopping")
    .single();

  if (pkgError || !pkg) {
    throw new Error(
      `Could not find seed package "Palawan Island Hopping" -- run \`npm run seed\` first. (${pkgError?.message ?? "no row"})`
    );
  }

  const disposableEmail = `verify-admin-package-pdf-${Date.now()}@travelsentro.test`;
  const disposablePassword = `Verify-${Math.random().toString(36).slice(2)}!Aa1`;
  let disposableUserId: string | undefined;
  const results: CheckResult[] = [];
  const originalIsPublished = pkg.is_published;

  try {
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

    const staffCookieHeader = await signInAndGetCookieHeader(
      disposableEmail,
      disposablePassword
    );
    const adminCookieHeader = await signInAndGetCookieHeader(
      ADMIN_EMAIL as string,
      ADMIN_PASSWORD as string
    );

    // (1) Zero-permission Staff is redirected, never served a PDF.
    const staffRes = await fetch(`${BASE_URL}/admin/packages/${pkg.id}/pdf`, {
      redirect: "follow",
      headers: { cookie: staffCookieHeader },
    });
    results.push({
      name: "Zero-permission Staff is redirected away from the admin PDF route",
      pass: staffRes.url.endsWith("/admin/forbidden"),
      detail: `final url=${staffRes.url}`,
    });

    // (2) Real Admin gets a valid PDF for the published package.
    const adminRes = await fetch(`${BASE_URL}/admin/packages/${pkg.id}/pdf`, {
      headers: { cookie: adminCookieHeader },
    });
    const adminBuffer = Buffer.from(await adminRes.arrayBuffer());
    results.push({
      name: "Admin gets a well-formed PDF for a published package",
      pass:
        adminRes.status === 200 &&
        adminRes.headers.get("content-type") === "application/pdf" &&
        adminBuffer.subarray(0, 5).toString("ascii") === "%PDF-",
      detail: `status=${adminRes.status} content-type=${adminRes.headers.get("content-type")} signature=${JSON.stringify(adminBuffer.subarray(0, 5).toString("ascii"))}`,
    });

    // (3) Admin still gets a valid PDF once the package is a draft.
    const { error: unpublishError } = await serviceRoleClient
      .from("packages")
      .update({ is_published: false })
      .eq("id", pkg.id);
    if (unpublishError) {
      throw new Error(`Failed to unpublish package for test: ${unpublishError.message}`);
    }

    const draftRes = await fetch(`${BASE_URL}/admin/packages/${pkg.id}/pdf`, {
      headers: { cookie: adminCookieHeader },
    });
    const draftBuffer = Buffer.from(await draftRes.arrayBuffer());
    results.push({
      name: "Admin gets a well-formed PDF for an unpublished (draft) package",
      pass:
        draftRes.status === 200 &&
        draftBuffer.subarray(0, 5).toString("ascii") === "%PDF-",
      detail: `status=${draftRes.status} signature=${JSON.stringify(draftBuffer.subarray(0, 5).toString("ascii"))}`,
    });
  } finally {
    const { error: restoreError } = await serviceRoleClient
      .from("packages")
      .update({ is_published: originalIsPublished })
      .eq("id", pkg.id);
    if (restoreError) {
      console.error(
        `WARNING: failed to restore is_published=${originalIsPublished} on package ${pkg.id}: ${restoreError.message}`
      );
    }
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

  console.log(`\nverify-admin-package-pdf -- BASE_URL=${BASE_URL}\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-admin-package-pdf failed:", err);
  process.exit(1);
});
