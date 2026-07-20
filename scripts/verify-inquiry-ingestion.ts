/**
 * Live-HTTP verification for app/api/inquiries/route.ts (03-02-PLAN.md),
 * proving -- via real HTTP requests against a running server -- the four
 * guarantees the Route Handler exists to provide: idempotency (AUTO-03),
 * silent honeypot drop, anon RLS scope (Pitfall 2/T-03-03), and graceful
 * handling of a stale/invalid package_id (Pitfall 6/T-03-06).
 *
 * Run via `npx tsx --env-file=.env.local scripts/verify-inquiry-ingestion.ts`
 * against a live `npm run dev` server, with BASE_URL optionally overriding
 * the default http://localhost:3100 -- mirrors
 * scripts/verify-permission-denial.ts's exact precedent. Deliberately NOT
 * registered as a package.json script this plan, so it never conflicts with
 * 03-04's parallel same-wave dependency install.
 *
 * SECURITY: this script uses the Supabase service-role key (mirroring
 * scripts/seed.ts/scripts/verify-permission-denial.ts's existing safeguard)
 * -- constructed inline here only, never exported, never imported from app/
 * or components/. Always deletes every disposable contacts row it created,
 * pass or fail, so repeated runs never accumulate test data (on delete
 * cascade removes the associated inquiries rows automatically).
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Node 20 has no native global WebSocket (added in Node 22); @supabase/supabase-js
 * always constructs a RealtimeClient, which requires one even though this
 * script never uses realtime features. Polyfill from `undici` (already
 * present via Next.js's dependency tree) rather than adding a new
 * dependency. Mirrors scripts/seed.ts/scripts/verify-permission-denial.ts's
 * identical polyfill.
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
// privilege -- mirrors scripts/seed.ts's identical fallback.
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npx tsx --env-file=.env.local scripts/verify-inquiry-ingestion.ts`."
  );
}

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npx tsx --env-file=.env.local scripts/verify-inquiry-ingestion.ts`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

type InquiryPostBody = {
  requestId: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  packageId?: string | null;
  packageName?: string;
  _gotcha?: string;
};

async function postInquiry(body: InquiryPostBody) {
  const res = await fetch(`${BASE_URL}/api/inquiries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

function basePayload(email: string): InquiryPostBody {
  return {
    requestId: crypto.randomUUID(),
    name: "Verify Script",
    email,
    phone: "09171234567",
    message: "Live verification test inquiry -- safe to ignore/delete.",
  };
}

/**
 * (1) Idempotency (AUTO-03): identical requestId POSTed twice never creates
 * a second contact/inquiry row, and the second response is still 200/ok.
 */
async function checkIdempotency(
  serviceRoleClient: ReturnType<typeof createServiceRoleClient<Database>>,
  disposableEmails: string[]
): Promise<CheckResult> {
  const email = `verify-inquiry-idempotency-${Date.now()}@travelsentro.test`;
  disposableEmails.push(email);
  const payload = basePayload(email);

  const first = await postInquiry(payload);
  const second = await postInquiry(payload); // identical requestId + payload

  const bothOk =
    first.res.ok &&
    first.json?.ok === true &&
    second.res.ok &&
    second.json?.ok === true;

  const { data: contacts } = await serviceRoleClient
    .from("contacts")
    .select("id")
    .eq("email", email);
  const { data: inquiries } = await serviceRoleClient
    .from("inquiries")
    .select("id")
    .eq("request_id", payload.requestId);

  const contactCountOk = (contacts?.length ?? 0) === 1;
  const inquiryCountOk = (inquiries?.length ?? 0) === 1;

  const pass = bothOk && contactCountOk && inquiryCountOk;
  const detail = pass
    ? `both requests ok=true, contacts=${contacts?.length}, inquiries=${inquiries?.length}`
    : `first.ok=${first.res.ok}/${first.json?.ok} second.ok=${second.res.ok}/${second.json?.ok} contacts=${contacts?.length} (want 1) inquiries=${inquiries?.length} (want 1)`;

  return { name: "Idempotency (AUTO-03)", pass, detail };
}

/**
 * (2) Honeypot silent-drop: a filled _gotcha field gets a fake-success 200
 * response but writes no row.
 */
async function checkHoneypot(
  serviceRoleClient: ReturnType<typeof createServiceRoleClient<Database>>,
  disposableEmails: string[]
): Promise<CheckResult> {
  const email = `verify-inquiry-honeypot-${Date.now()}@travelsentro.test`;
  disposableEmails.push(email);
  const payload = { ...basePayload(email), _gotcha: "i-am-a-bot" };

  const { res, json } = await postInquiry(payload);
  const responseOk = res.ok && json?.ok === true;

  const { data: contacts } = await serviceRoleClient
    .from("contacts")
    .select("id")
    .eq("email", email);
  const noRowWritten = (contacts?.length ?? 0) === 0;

  const pass = responseOk && noRowWritten;
  const detail = pass
    ? `res.ok=${res.ok} body.ok=${json?.ok} contacts=0`
    : `res.ok=${res.ok} body.ok=${json?.ok} contacts=${contacts?.length} (want 0)`;

  return { name: "Honeypot silent-drop", pass, detail };
}

/**
 * (3) Anon RLS scope (Pitfall 2/T-03-03): the plain anon-key client can
 * never SELECT real contacts data, and can never UPDATE a contact --
 * proving record_inquiry()'s SECURITY DEFINER design does not leak a
 * table-level anon UPDATE grant.
 */
async function checkAnonRlsScope(
  serviceRoleClient: ReturnType<typeof createServiceRoleClient<Database>>,
  anonClient: ReturnType<typeof createAnonClient<Database>>,
  disposableEmails: string[]
): Promise<CheckResult> {
  // Reuse the idempotency check's contact as the tamper target -- create a
  // fresh one here instead, so this check is independent/order-agnostic.
  const email = `verify-inquiry-rls-${Date.now()}@travelsentro.test`;
  disposableEmails.push(email);
  const payload = basePayload(email);
  await postInquiry(payload);

  const { data: contact } = await serviceRoleClient
    .from("contacts")
    .select("id, name")
    .eq("email", email)
    .single();

  if (!contact) {
    return {
      name: "Anon RLS scope (Pitfall 2)",
      pass: false,
      detail: "setup failed: no contact row found to test against",
    };
  }

  const { data: selectRows, error: selectError } = await anonClient
    .from("contacts")
    .select("*")
    .limit(1);
  const selectBlocked = !!selectError || (selectRows?.length ?? 0) === 0;

  const { data: updateRows, error: updateError } = await anonClient
    .from("contacts")
    .update({ name: "tampered" })
    .eq("id", contact.id)
    .select();
  const updateBlocked = !!updateError || (updateRows?.length ?? 0) === 0;

  const { data: verifyContact } = await serviceRoleClient
    .from("contacts")
    .select("name")
    .eq("id", contact.id)
    .single();
  const nameUnchanged = verifyContact?.name === contact.name;

  const pass = selectBlocked && updateBlocked && nameUnchanged;
  const detail = pass
    ? `anon SELECT blocked=true, anon UPDATE blocked=true, name unchanged=true`
    : `anon SELECT blocked=${selectBlocked} (rows=${selectRows?.length}) anon UPDATE blocked=${updateBlocked} (rows=${updateRows?.length}) name unchanged=${nameUnchanged}`;

  return { name: "Anon RLS scope (Pitfall 2)", pass, detail };
}

/**
 * (4) Stale package_id (Pitfall 6/T-03-06): a syntactically valid but
 * nonexistent packageId never fails the request, and record_inquiry()
 * silently nulls the inquiry's package_id rather than erroring.
 */
async function checkStalePackageId(
  serviceRoleClient: ReturnType<typeof createServiceRoleClient<Database>>,
  disposableEmails: string[]
): Promise<CheckResult> {
  const email = `verify-inquiry-stale-pkg-${Date.now()}@travelsentro.test`;
  disposableEmails.push(email);
  const payload: InquiryPostBody = {
    ...basePayload(email),
    packageId: "00000000-0000-0000-0000-000000000000",
  };

  const { res, json } = await postInquiry(payload);
  const responseOk = res.ok && json?.ok === true;

  const { data: inquiry } = await serviceRoleClient
    .from("inquiries")
    .select("package_id")
    .eq("request_id", payload.requestId)
    .single();
  const packageIdNulled = inquiry?.package_id === null;

  const pass = responseOk && packageIdNulled;
  const detail = pass
    ? `res.ok=${res.ok} body.ok=${json?.ok} inquiry.package_id=null`
    : `res.ok=${res.ok} body.ok=${json?.ok} inquiry.package_id=${inquiry?.package_id} (want null)`;

  return { name: "Stale package_id (Pitfall 6)", pass, detail };
}

async function main() {
  await ensureWebSocketPolyfill();

  const serviceRoleClient = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const anonClient = createAnonClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false } }
  );

  const disposableEmails: string[] = [];
  const results: CheckResult[] = [];

  try {
    results.push(await checkIdempotency(serviceRoleClient, disposableEmails));
    results.push(await checkHoneypot(serviceRoleClient, disposableEmails));
    results.push(
      await checkAnonRlsScope(serviceRoleClient, anonClient, disposableEmails)
    );
    results.push(
      await checkStalePackageId(serviceRoleClient, disposableEmails)
    );
  } finally {
    // Always clean up every disposable contact created during this run,
    // pass or fail -- `on delete cascade` on inquiries.contact_id removes
    // the associated inquiries rows automatically.
    if (disposableEmails.length > 0) {
      const { error: deleteError } = await serviceRoleClient
        .from("contacts")
        .delete()
        .in("email", disposableEmails);
      if (deleteError) {
        console.error(
          `WARNING: failed to delete disposable contacts (${disposableEmails.join(", ")}): ${deleteError.message}`
        );
      }
    }
  }

  console.log(`\nverify-inquiry-ingestion -- BASE_URL=${BASE_URL}\n`);
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
  console.error("verify-inquiry-ingestion failed:", err);
  process.exit(1);
});
