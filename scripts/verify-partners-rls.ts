/**
 * Proves the partners table behaves as the Partners module needs, against
 * a real database -- not just that the migration SQL parses:
 * anonymous visitors read published rows only and cannot write, and the
 * database itself rejects a non-web link or a blank name. Mirrors
 * scripts/verify-upsell-rls.ts's CheckResult/PASS-FAIL structure.
 *
 * Run via `npm run verify:partners-rls` with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY pointed at a
 * project that has 20261011120000_partners_module.sql applied (the local
 * stack, until it's pushed elsewhere). It inserts and then deletes its own
 * rows, all named with a unique prefix.
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
      "Point these at a project with the partners module migration applied, then run " +
      "`npm run verify:partners-rls`."
  );
}

/**
 * Node 20 has no native global WebSocket; @supabase/supabase-js always
 * constructs a RealtimeClient, which requires one. Mirrors
 * scripts/verify-upsell-rls.ts's identical polyfill.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type Client = ReturnType<typeof createClient<Database>>;

const PREFIX = `__verify_partners_${Date.now()}`;
const VISIBLE_NAME = `${PREFIX} visible`;
const HIDDEN_NAME = `${PREFIX} hidden`;

async function checkAnonSeesPublishedOnly(anon: Client): Promise<CheckResult> {
  const { data, error } = await anon
    .from("partners")
    .select("name")
    .like("name", `${PREFIX}%`);
  const names = (data ?? []).map((row) => row.name).sort();
  const pass = !error && names.length === 1 && names[0] === VISIBLE_NAME;
  return {
    name: "Anonymous SELECT returns the published row and not the hidden one",
    pass,
    detail: error ? `error: ${error.message}` : `rows=${JSON.stringify(names)}`,
  };
}

async function checkAnonInsertRejected(anon: Client): Promise<CheckResult> {
  const { error } = await anon.from("partners").insert({
    partner_type: "brand_partner",
    name: `${PREFIX} anon`,
    logo_storage_path: "partners/verify-anon.svg",
  });
  return {
    name: "Anonymous INSERT is rejected by RLS",
    pass: error !== null,
    detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
  };
}

async function checkNonWebLinkRejected(service: Client): Promise<CheckResult> {
  const { error } = await service.from("partners").insert({
    partner_type: "brand_partner",
    name: `${PREFIX} bad link`,
    logo_storage_path: "partners/verify-bad-link.svg",
    link_url: "javascript:alert(1)",
  });
  const pass = error?.code === "23514";
  return {
    name: "A javascript: link is rejected by the partners_link_url_http constraint",
    pass,
    detail: error ? `code=${error.code} ${error.message}` : "insert unexpectedly succeeded",
  };
}

async function checkBlankNameRejected(service: Client): Promise<CheckResult> {
  const { error } = await service.from("partners").insert({
    partner_type: "corporate_client",
    name: "   ",
    logo_storage_path: `partners/${PREFIX}-blank.svg`,
  });
  const pass = error?.code === "23514";
  // If the insert got through, remove it by its unique storage path (its
  // blank name wouldn't match the prefix cleanup in main()).
  if (!error) {
    await service
      .from("partners")
      .delete()
      .eq("logo_storage_path", `partners/${PREFIX}-blank.svg`);
  }
  return {
    name: "A blank name is rejected by the partners_name_not_blank constraint",
    pass,
    detail: error ? `code=${error.code} ${error.message}` : "insert unexpectedly succeeded",
  };
}

async function main() {
  await ensureWebSocketPolyfill();
  console.log(`\nverify-partners-rls -> ${new URL(SUPABASE_URL!).host}\n`);

  const options = { auth: { persistSession: false } };
  const anon = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, options);
  const service = createClient<Database>(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!,
    options
  );

  const results: CheckResult[] = [];
  try {
    const { error: seedError } = await service.from("partners").insert([
      {
        partner_type: "brand_partner",
        name: VISIBLE_NAME,
        logo_storage_path: "partners/verify-visible.svg",
        link_url: "https://example.com",
        is_published: true,
      },
      {
        partner_type: "corporate_client",
        name: HIDDEN_NAME,
        logo_storage_path: "partners/verify-hidden.svg",
        is_published: false,
      },
    ]);
    if (seedError) {
      throw new Error(`could not insert fixture rows: ${seedError.message}`);
    }

    results.push(await checkAnonSeesPublishedOnly(anon));
    results.push(await checkAnonInsertRejected(anon));
    results.push(await checkNonWebLinkRejected(service));
    results.push(await checkBlankNameRejected(service));
  } finally {
    await service.from("partners").delete().like("name", `${PREFIX}%`);
  }

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
  console.error("verify-partners-rls failed:", err);
  process.exit(1);
});
