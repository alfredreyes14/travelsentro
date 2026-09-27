/**
 * Ad-hoc live-HTTP verification (not committed) that the real Next.js
 * runtime renders /admin/vouchers correctly, mirroring
 * scripts/verify-permission-denial.ts's disposable-account + cookie-jar
 * recipe. Proves against a live `next dev` server pointed at the local
 * Supabase stack:
 *
 * (1) A disposable Staff account without can_manage_vouchers hitting
 *     /admin/vouchers gets redirected to /admin/forbidden with the denial
 *     copy (requirePermissionOrRedirect works for the new permission).
 * (2) The sidebar nav does NOT include a Vouchers link for that session.
 * (3) The same account, after can_manage_vouchers is granted, gets a real
 *     200 page with "Vouchers" heading + "Add Voucher" button, and the
 *     sidebar DOES include a Vouchers link.
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../types/database";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

async function signInAndGetCookieHeader(email: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    cookies: {
      getAll() {
        return Array.from(jar.entries()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => jar.set(name, value));
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  if (jar.size === 0) throw new Error(`no cookies captured for ${email}`);

  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

async function main() {
  await ensureWebSocketPolyfill();

  const serviceRoleClient = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const disposableEmail = `verify-vouchers-http-${Date.now()}@travelsentro.test`;
  const disposablePassword = `Verify-${Math.random().toString(36).slice(2)}!Aa1`;
  let disposableUserId: string | undefined;
  const results: CheckResult[] = [];

  try {
    const { data: created, error: createError } = await serviceRoleClient.auth.admin.createUser({
      email: disposableEmail,
      password: disposablePassword,
      email_confirm: true,
    });
    if (createError || !created.user) {
      throw new Error(`Failed to create disposable Staff auth user: ${createError?.message}`);
    }
    disposableUserId = created.user.id;

    const cookieHeader = await signInAndGetCookieHeader(disposableEmail, disposablePassword);

    // (1) + (2) Denied before granting the permission.
    const deniedRes = await fetch(`${BASE_URL}/admin/vouchers`, {
      redirect: "follow",
      headers: { cookie: cookieHeader },
    });
    const deniedBody = await deniedRes.text();
    results.push({
      name: "No-permission Staff GET /admin/vouchers redirects to /admin/forbidden",
      pass:
        deniedRes.status === 200 &&
        deniedRes.url.endsWith("/admin/forbidden") &&
        deniedBody.includes("You don't have permission to do that"),
      detail: `status=${deniedRes.status} url=${deniedRes.url}`,
    });
    results.push({
      name: "No-permission Staff sidebar has no Vouchers link",
      pass: !deniedBody.includes('href="/admin/vouchers"'),
      detail: deniedBody.includes('href="/admin/vouchers"') ? "link unexpectedly present" : "link absent, as expected",
    });

    // (3) Grant the permission, then re-check.
    const { error: grantError } = await serviceRoleClient
      .from("profiles")
      .update({ can_manage_vouchers: true })
      .eq("id", disposableUserId);
    if (grantError) throw new Error(`Failed to grant can_manage_vouchers: ${grantError.message}`);

    const permittedRes = await fetch(`${BASE_URL}/admin/vouchers`, {
      redirect: "follow",
      headers: { cookie: cookieHeader },
    });
    const permittedBody = await permittedRes.text();
    results.push({
      name: "Permitted Staff GET /admin/vouchers renders real page content",
      pass:
        permittedRes.status === 200 &&
        permittedBody.includes("Vouchers") &&
        permittedBody.includes("Add Voucher") &&
        !permittedBody.includes("__next_error__"),
      detail: `status=${permittedRes.status} url=${permittedRes.url} has-Vouchers=${permittedBody.includes("Vouchers")} has-AddVoucher=${permittedBody.includes("Add Voucher")}`,
    });
    results.push({
      name: "Permitted Staff sidebar includes a Vouchers link",
      pass: permittedBody.includes('href="/admin/vouchers"'),
      detail: permittedBody.includes('href="/admin/vouchers"') ? "link present, as expected" : "link unexpectedly absent",
    });
  } finally {
    if (disposableUserId) {
      const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(disposableUserId);
      if (deleteError) {
        console.error(`WARNING: failed to delete disposable user ${disposableUserId}: ${deleteError.message}`);
      }
    }
  }

  console.log(`\nverify-vouchers-http -- BASE_URL=${BASE_URL}\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-vouchers-http failed:", err);
  process.exit(1);
});
