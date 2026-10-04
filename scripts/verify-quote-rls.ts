/**
 * Proves quotes' RLS is fully can_manage_quotes-gated and that quote_no is
 * always database-assigned. Creates two disposable staff accounts (one
 * without, one with can_manage_quotes), signs each in through the anon key
 * exactly like the browser would, and exercises select/insert/update/delete.
 * Always deletes its disposable rows and accounts in a finally block.
 *
 * Run via `npm run verify:quote-rls` against a project with the quotes
 * migration applied (the local stack -- see the plan's Local Environment
 * Notes; .env.local defaults to a remote project).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CheckResult = { name: string; pass: boolean; detail: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY. " +
      "Point them at a project with the quotes migration applied, then run `npm run verify:quote-rls`."
  );
}

/** Same Node 20 WebSocket polyfill as scripts/verify-upsell-rls.ts. */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type Client = ReturnType<typeof createClient<Database>>;

const QUOTE_FIXTURE = {
  title: "RLS fixture quote",
  price_per_pax: 1000,
  duration_label: "1 day",
};

async function signedInClient(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  return client;
}

async function main() {
  await ensureWebSocketPolyfill();

  const service = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  });

  const results: CheckResult[] = [];
  const userIds: string[] = [];
  const quoteIds: string[] = [];
  const stamp = Date.now();
  const password = `Verify-${stamp}-pw`;

  try {
    const makeUser = async (label: string) => {
      const email = `verify-quote-rls-${label}-${stamp}@example.com`;
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
      userIds.push(data.user.id);
      return { id: data.user.id, email };
    };

    const denied = await makeUser("denied");
    const allowed = await makeUser("allowed");

    // handle_new_user() creates both profiles with every permission false.
    const { error: grantError } = await service
      .from("profiles")
      .update({ can_manage_quotes: true })
      .eq("id", allowed.id);
    if (grantError) throw new Error(`grant can_manage_quotes failed: ${grantError.message}`);

    // A row the denied user must not be able to see/update/delete.
    const { data: seeded, error: seedError } = await service
      .from("quotes")
      .insert({ ...QUOTE_FIXTURE, quote_no: "HACK-1" })
      .select("id, quote_no")
      .single();
    if (seedError || !seeded) throw new Error(`seed insert failed: ${seedError?.message}`);
    quoteIds.push(seeded.id);

    results.push({
      name: "quote_no is database-assigned even when the client supplies one",
      pass: /^TSQ-\d{6}$/.test(seeded.quote_no),
      detail: `quote_no=${seeded.quote_no}`,
    });

    const deniedClient = await signedInClient(denied.email, password);
    const allowedClient = await signedInClient(allowed.email, password);

    const { data: deniedRows, error: deniedSelectError } = await deniedClient
      .from("quotes")
      .select("id")
      .eq("id", seeded.id);
    results.push({
      name: "staff without can_manage_quotes cannot read quotes",
      pass: !deniedSelectError && (deniedRows ?? []).length === 0,
      detail: `rows=${deniedRows?.length ?? "n/a"} error=${deniedSelectError?.message ?? "none"}`,
    });

    const { error: deniedInsertError } = await deniedClient.from("quotes").insert(QUOTE_FIXTURE);
    results.push({
      name: "staff without can_manage_quotes cannot insert quotes",
      pass: !!deniedInsertError,
      detail: deniedInsertError ? `rejected: ${deniedInsertError.message}` : "insert unexpectedly succeeded",
    });

    const { data: deniedUpdated } = await deniedClient
      .from("quotes")
      .update({ title: "hacked" })
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff without can_manage_quotes cannot update quotes",
      pass: (deniedUpdated ?? []).length === 0,
      detail: `updated rows=${deniedUpdated?.length ?? 0}`,
    });

    const { data: deniedDeleted } = await deniedClient
      .from("quotes")
      .delete()
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff without can_manage_quotes cannot delete quotes",
      pass: (deniedDeleted ?? []).length === 0,
      detail: `deleted rows=${deniedDeleted?.length ?? 0}`,
    });

    const { data: allowedInsert, error: allowedInsertError } = await allowedClient
      .from("quotes")
      .insert(QUOTE_FIXTURE)
      .select("id, quote_no, created_by")
      .single();
    if (allowedInsert) quoteIds.push(allowedInsert.id);
    results.push({
      name: "staff with can_manage_quotes can insert, and created_by defaults to them",
      pass: !allowedInsertError && allowedInsert?.created_by === allowed.id,
      detail: allowedInsertError
        ? `error: ${allowedInsertError.message}`
        : `quote_no=${allowedInsert?.quote_no} created_by=${allowedInsert?.created_by}`,
    });

    const { data: allowedRows } = await allowedClient.from("quotes").select("id").eq("id", seeded.id);
    results.push({
      name: "staff with can_manage_quotes can read quotes",
      pass: (allowedRows ?? []).length === 1,
      detail: `rows=${allowedRows?.length ?? 0}`,
    });

    const { data: allowedUpdated } = await allowedClient
      .from("quotes")
      .update({ title: "renamed" })
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff with can_manage_quotes can update quotes",
      pass: (allowedUpdated ?? []).length === 1,
      detail: `updated rows=${allowedUpdated?.length ?? 0}`,
    });

    const { data: allowedDeleted } = await allowedClient
      .from("quotes")
      .delete()
      .eq("id", seeded.id)
      .select("id");
    results.push({
      name: "staff with can_manage_quotes can delete quotes",
      pass: (allowedDeleted ?? []).length === 1,
      detail: `deleted rows=${allowedDeleted?.length ?? 0}`,
    });
  } finally {
    if (quoteIds.length > 0) {
      await service.from("quotes").delete().in("id", quoteIds);
    }
    for (const id of userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.error(`WARNING: failed to delete disposable user ${id}: ${error.message}`);
    }
  }

  console.log("\nverify-quote-rls\n");
  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-quote-rls failed:", err);
  process.exit(1);
});
