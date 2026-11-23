/**
 * End-to-end check of the Meta lead sync against a running app and a real
 * (staging) database, with a fake Graph API standing in for Meta so no real
 * customer leads ever reach staging.
 *
 *   1. Start the app with the fake Graph API:
 *        VERCEL_ENV=production CRON_SECRET=e2e-secret META_SYSTEM_USER_TOKEN=fake \
 *        META_GRAPH_API_URL=http://127.0.0.1:4010 RESEND_API_KEY= npx next start -p 3100
 *      (RESEND_API_KEY empty: no staff emails go out during the test.)
 *   2. npm run e2e:meta-lead-sync
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the same
 * staging project the app uses) and ADMIN_EMAIL / ADMIN_PASSWORD for the
 * "Sync Meta leads" button. Every lead, contact and sync log row it creates
 * is deleted at the end. Never point it at production.
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";

import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const GRAPH_PORT = 4010;
const CRON_SECRET = process.env.E2E_CRON_SECRET ?? "e2e-secret";
const LEAD_COUNT = Number(process.env.E2E_LEAD_COUNT ?? 200);
const RUN = `e2e-${Date.now()}`;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---------------------------------------------------------------------------
// Fake Graph API
// ---------------------------------------------------------------------------
type Lead = { id: string; created_time: string; form_id: string; field_data: { name: string; values: string[] }[]; ad_name?: string };

const now = new Date().toISOString().replace("Z", "+0000");
function makeLead(n: number, formId: string): Lead {
  return {
    id: `${RUN}-${n}`,
    created_time: now,
    form_id: formId,
    field_data: [
      { name: "full_name", values: [`E2E Lead ${n}`] },
      { name: "email", values: [`${RUN}-${n}@example.test`] },
      { name: "which_china_package_do_you_want_to_avail?", values: ["Beijing 5D4N"] },
    ],
  };
}

const forms = [
  { id: `${RUN}-form-china`, name: "E2E China Form", leads: [] as Lead[] },
  { id: `${RUN}-form-japan`, name: "E2E Japan Form", leads: [] as Lead[] },
];
let graphMode: "ok" | "token-expired" = "ok";

const graphServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${GRAPH_PORT}`);
  const path = url.pathname.replace(/^\/v[\d.]+\//, "");
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (graphMode === "token-expired") {
    return send(400, {
      error: { message: "Error validating access token: Session has expired", type: "OAuthException", code: 190, error_subcode: 463 },
    });
  }
  if (!path.includes("/")) return send(200, { id: path, access_token: "fake-page-token" });
  if (path.endsWith("/leadgen_forms")) return send(200, { data: forms.map(({ id, name }) => ({ id, name, status: "ACTIVE" })) });
  if (path.endsWith("/leads")) {
    const form = forms.find((f) => f.id === path.split("/")[0]);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const leads = form?.leads ?? [];
    const next = offset + 100 < leads.length ? `http://127.0.0.1:${GRAPH_PORT}${url.pathname}?offset=${offset + 100}` : undefined;
    return send(200, { data: leads.slice(offset, offset + 100), paging: next ? { next } : {} });
  }
  send(404, { error: { message: `unexpected ${path}` } });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const runIds = new Set<string>();

async function cronSync(auth = true) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/cron/meta-leads`, {
    headers: auth ? { authorization: `Bearer ${CRON_SECRET}` } : {},
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body, ms: Date.now() - started };
}

async function latestRun() {
  const { data } = await supabase
    .from("meta_lead_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  if (data) runIds.add(data.id);
  return data as Record<string, unknown> & { id: string };
}

async function savedCount() {
  const { count } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .like("external_id", `${RUN}-%`);
  return count ?? 0;
}

async function cleanup() {
  const { data: inquiries } = await supabase.from("inquiries").select("contact_id").like("external_id", `${RUN}-%`);
  const contactIds = [...new Set((inquiries ?? []).map((i) => i.contact_id as string))];
  await supabase.from("inquiries").delete().like("external_id", `${RUN}-%`);
  for (let i = 0; i < contactIds.length; i += 100) {
    await supabase.from("contacts").delete().in("id", contactIds.slice(i, i + 100)).like("email", `${RUN}-%@example.test`);
  }
  if (runIds.size) await supabase.from("meta_lead_sync_runs").delete().in("id", [...runIds]);
  const left = await savedCount();
  const { count: contactsLeft } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .like("email", `${RUN}-%`);
  console.log(`\nCleanup: ${left} inquiries and ${contactsLeft ?? 0} contacts left, ${runIds.size} log rows removed`);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
async function main() {
  await new Promise<void>((resolve) => graphServer.listen(GRAPH_PORT, "127.0.0.1", resolve));

  // 1. Wrong secret is refused.
  {
    const { status } = await cronSync(false);
    check("Cron route refuses a call without the secret", status === 401, `HTTP ${status}`);
  }

  // 2. A busy week: LEAD_COUNT new leads across two forms (several Graph pages).
  forms[0].leads = Array.from({ length: LEAD_COUNT - 5 }, (_, i) => makeLead(i, forms[0].id));
  forms[1].leads = Array.from({ length: 5 }, (_, i) => makeLead(10_000 + i, forms[1].id));
  {
    const { status, body, ms } = await cronSync();
    const run = await latestRun();
    check(`Cron sync saves ${LEAD_COUNT} new leads`, status === 200 && body.added === LEAD_COUNT && body.status === "success",
      `HTTP ${status}, ${JSON.stringify({ added: body.added, existing: body.existing, failed: body.failed })}, ${ms} ms`);
    check("…well inside the 60 s limit", ms < 30_000, `${ms} ms`);
    check("…and every lead is in the database", (await savedCount()) === LEAD_COUNT, `${await savedCount()} saved`);
    check("Sync log row says SUCCESS with the right counts",
      run.status === "success" && run.trigger === "cron" && run.added === LEAD_COUNT && run.pulled === LEAD_COUNT && run.finished_at !== null,
      JSON.stringify({ status: run.status, pulled: run.pulled, added: run.added }));
  }

  // 3. Nightly re-run with 3 new leads: only those are saved.
  forms[0].leads.push(...[0, 1, 2].map((i) => makeLead(20_000 + i, forms[0].id)));
  {
    const { status, body, ms } = await cronSync();
    check("Re-run saves only the 3 new leads", status === 200 && body.added === 3 && body.existing === LEAD_COUNT,
      `${JSON.stringify({ added: body.added, existing: body.existing })}, ${ms} ms`);
    check("…and is fast (< 10 s)", ms < 10_000, `${ms} ms`);
    await latestRun();
  }

  // 4. Meta starts returning ad details: they're filled in on existing leads.
  forms[0].leads[0] = { ...forms[0].leads[0], ad_name: "E2E Carousel" };
  {
    const { body } = await cronSync();
    await latestRun();
    const { data } = await supabase.from("inquiries").select("source_details").eq("external_id", forms[0].leads[0].id).single();
    check("Ad details Meta returns later are filled in", (data?.source_details as Record<string, unknown>)?.ad_name === "E2E Carousel" && body.added === 0,
      JSON.stringify(data?.source_details));
  }

  // 5. "Sync Meta leads" button in the CRM, as a signed-in admin.
  forms[1].leads.push(makeLead(30_000, forms[1].id));
  {
    const require = createRequire(import.meta.url);
    // Playwright is preinstalled globally in the sandbox, not a project dependency.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = require("playwright") as { chromium: { launch(): Promise<any> } };
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`${BASE_URL}/admin/login`);
      await page.getByPlaceholder("you@example.com").fill(process.env.ADMIN_EMAIL!);
      await page.locator('input[type="password"]').fill(process.env.ADMIN_PASSWORD!);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL((u: URL) => !u.pathname.startsWith("/admin/login"), { timeout: 30_000 });

      await page.goto(`${BASE_URL}/admin/crm`);
      const started = Date.now();
      await page.getByRole("button", { name: "Sync Meta leads" }).click();
      const toast = page.getByText("Meta leads synced");
      await toast.waitFor({ timeout: 60_000 });
      const ms = Date.now() - started;
      const description = await page.locator("[data-sonner-toast]").first().innerText();
      check("Sync button shows success", /1 new/.test(description), `${description.replace(/\s+/g, " ")}, ${ms} ms`);

      const run = await latestRun();
      check("Button run is logged as manual SUCCESS", run.trigger === "manual" && run.status === "success" && run.added === 1,
        JSON.stringify({ trigger: run.trigger, status: run.status, added: run.added, by: run.triggered_by_name }));

      await page.goto(`${BASE_URL}/admin/crm/sync-log`);
      // Wait past the loading skeleton.
      await page.getByText("SUCCESS", { exact: true }).first().waitFor({ timeout: 30_000 });
      const logText = await page.locator("main").innerText();
      check("Sync log page shows the runs", /SUCCESS/.test(logText) && !/FAILED/.test(logText),
        `${(logText.match(/SUCCESS/g) ?? []).length} SUCCESS, ${(logText.match(/FAILED/g) ?? []).length} FAILED`);
      await page.screenshot({ path: process.env.E2E_SCREENSHOT ?? "e2e-sync-log.png", fullPage: true });
    } finally {
      await browser.close();
    }
  }

  // 6. Meta rejects the token: the run fails with a clear reason, not a timeout.
  graphMode = "token-expired";
  {
    const { status } = await cronSync();
    const run = await latestRun();
    check("Expired token: run fails with a readable reason", status === 500 && run.status === "failed" && /expired/.test(String(run.error)),
      `HTTP ${status}, ${String(run.error).slice(0, 120)}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    check("Test run finished without crashing", false, String(err));
  })
  .finally(async () => {
    await cleanup().catch((err) => console.error("Cleanup failed", err));
    graphServer.close();
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
