/**
 * Proves upsell_items' RLS actually blocks anonymous writes (and allows
 * anonymous reads), not just that the policy SQL parses. Mirrors
 * scripts/verify-unsubscribe-token-secret.ts's CheckResult/PASS-FAIL
 * console-summary structure. Uses only the anon key -- no service role --
 * since the whole point is proving what an unauthenticated visitor's
 * client can and can't do.
 *
 * Run via `npm run verify:upsell-rls`. Point NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY at whichever project has the
 * upsell_items migration applied (the local stack, until it's pushed
 * elsewhere) -- `.env.local` defaults to a remote project that won't
 * have this table yet.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CheckResult = { name: string; pass: boolean; detail: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment. " +
      "Point these at a project with the upsell_items migration applied, then run " +
      "`npm run verify:upsell-rls`."
  );
}

/**
 * Node 20 has no native global WebSocket (added in Node 22); @supabase/supabase-js
 * always constructs a RealtimeClient, which requires one even though this
 * script never uses realtime features. Polyfill from `undici` (already
 * present via Next.js's dependency tree) rather than adding a new
 * dependency. Mirrors scripts/verify-permission-denial.ts's identical
 * polyfill.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type AnonClient = ReturnType<typeof createClient<Database>>;

async function checkAnonReadSucceeds(anon: AnonClient): Promise<CheckResult> {
  const { error } = await anon.from("upsell_items").select("id").limit(1);
  const pass = !error;
  return {
    name: "Anonymous SELECT on upsell_items succeeds (public read policy)",
    pass,
    detail: pass ? "no error" : `unexpected error: ${error?.message}`,
  };
}

async function checkAnonInsertRejected(anon: AnonClient): Promise<CheckResult> {
  const { data: pkg, error: pkgError } = await anon
    .from("packages")
    .select("id")
    .eq("is_published", true)
    .limit(1)
    .single();

  if (pkgError || !pkg) {
    return {
      name: "Anonymous INSERT on upsell_items is rejected by RLS",
      pass: false,
      detail: `could not find a published package to test against: ${pkgError?.message ?? "no rows"}`,
    };
  }

  const { error } = await anon
    .from("upsell_items")
    .insert({ package_id: pkg.id });

  const pass = !!error;
  return {
    name: "Anonymous INSERT on upsell_items is rejected by RLS",
    pass,
    detail: pass
      ? `insert rejected as expected: ${error?.message}`
      : "insert unexpectedly succeeded -- RLS is not blocking anonymous writes",
  };
}

async function main() {
  await ensureWebSocketPolyfill();

  const anon = createClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false } }
  );

  const results: CheckResult[] = [
    await checkAnonReadSucceeds(anon),
    await checkAnonInsertRejected(anon),
  ];

  console.log(`\nverify-upsell-rls\n`);
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
  console.error("verify-upsell-rls failed:", err);
  process.exit(1);
});
