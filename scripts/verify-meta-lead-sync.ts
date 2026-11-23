/**
 * Checks for lib/meta-leads/sync.ts with a fake Graph API (fetch is
 * replaced) and a fake Supabase client. No network.
 *
 * Covers the fix for syncs failing at the 60 s limit: leads already in the
 * CRM cost no save, new leads are saved a few at a time, and a busy week of
 * leads finishes well inside the limit even with a slow database.
 *
 * Run via `npm run verify:meta-lead-sync`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { MetaLead } from "../lib/meta-leads/lead";
import { MetaLeadSyncError, syncMetaLeads, type LeadOutcome } from "../lib/meta-leads/sync";

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

// ---------------------------------------------------------------------------
// Fake Graph API
// ---------------------------------------------------------------------------
process.env.META_SYSTEM_USER_TOKEN = "fake-system-token";

type FakeGraph = { forms: { id: string; name: string; leads: MetaLead[] }[]; failForm?: string };
let graph: FakeGraph = { forms: [] };

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const path = url.pathname.replace(/^\/v[\d.]+\//, "");
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  if (!path.includes("/")) return json({ access_token: "fake-page-token", id: path });
  if (path.endsWith("/leadgen_forms")) {
    return json({ data: graph.forms.map(({ id, name }) => ({ id, name, status: "ACTIVE" })) });
  }
  if (path.endsWith("/leads")) {
    const formId = path.split("/")[0];
    if (formId === graph.failForm) {
      return json({ error: { message: "Service temporarily unavailable", code: 2 } }, 503);
    }
    const leads = graph.forms.find((f) => f.id === formId)?.leads ?? [];
    // Pages of 100, like Meta.
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const page = leads.slice(offset, offset + 100);
    const next = offset + 100 < leads.length ? `${url.origin}${url.pathname}?offset=${offset + 100}` : undefined;
    return json({ data: page, paging: next ? { next } : {} });
  }
  return json({ error: { message: `unexpected ${path}` } }, 404);
}) as typeof fetch;

function lead(n: number, extra: Partial<MetaLead> = {}): MetaLead {
  return {
    id: `lead-${n}`,
    created_time: "2026-11-20T08:00:00+0000",
    form_id: "form-a",
    field_data: [
      { name: "full_name", values: [`Lead ${n}`] },
      { name: "email", values: [`lead${n}@example.test`] },
      { name: "phone_number", values: ["+639171234567"] },
    ],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Fake Supabase: inquiries lookup + record_meta_lead(), each with a delay
// ---------------------------------------------------------------------------
class FakeDb {
  saved = new Map<string, Record<string, unknown>>();
  rpcCalls = 0;
  lookups = 0;
  inFlight = 0;
  maxInFlight = 0;
  failIds = new Set<string>();
  constructor(readonly delayMs: number) {}

  private wait() {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  client(): SupabaseClient {
    const from = (table: string) => ({
      select: () => ({
        in: async (_column: string, ids: string[]) => {
          if (table !== "inquiries") throw new Error(`unexpected table ${table}`);
          this.lookups++;
          await this.wait();
          return {
            data: ids
              .filter((id) => this.saved.has(id))
              .map((id) => ({ external_id: id, source_details: this.saved.get(id) })),
            error: null,
          };
        },
      }),
    });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (name !== "record_meta_lead") throw new Error(`unexpected rpc ${name}`);
      this.rpcCalls++;
      this.inFlight++;
      this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
      await this.wait();
      this.inFlight--;
      const id = args.p_leadgen_id as string;
      if (this.failIds.has(id)) return { data: null, error: { message: "boom" } };
      const details = args.p_details as Record<string, unknown>;
      const isNew = !this.saved.has(id);
      this.saved.set(id, { ...details, ...(this.saved.get(id) ?? {}) });
      return { data: [{ contact_id: `contact-${id}`, inquiry_id: `inq-${id}`, is_new: isNew }], error: null };
    };
    return { from, rpc } as unknown as SupabaseClient;
  }
}

async function run(db: FakeDb | null) {
  const outcomes: LeadOutcome[] = [];
  const started = Date.now();
  const summary = await syncMetaLeads({
    supabase: db?.client() ?? null,
    since: new Date("2026-11-16T00:00:00Z"),
    onLead: (o) => outcomes.push(o),
  });
  return { summary, outcomes, ms: Date.now() - started };
}

async function main() {
  // A busy week: 250 leads on one form (3 pages), a few on another.
  graph = {
    forms: [
      { id: "form-a", name: "China Inquiry Form", leads: Array.from({ length: 250 }, (_, i) => lead(i)) },
      {
        id: "form-b",
        name: "Japan Form",
        leads: [
          lead(1000, { form_id: "form-b" }),
          { id: "lead-no-contact", form_id: "form-b", field_data: [{ name: "full_name", values: ["No Contact"] }] },
        ],
      },
    ],
  };

  // 150 ms per database call: about a round trip from a US server to the
  // Tokyo database. The old one-at-a-time sync needed ~38 s for this.
  const db = new FakeDb(150);

  {
    const { summary, outcomes, ms } = await run(db);
    check("First run saves every new lead",
      summary.added === 251 && summary.existing === 0 && summary.failed === 0 && summary.noContact === 1 && summary.pulled === 252,
      JSON.stringify(summary));
    check("First run finishes well inside the 60 s limit (< 15 s)", ms < 15_000, `${ms} ms`);
    check("Saves run a few at a time (max 5)", db.maxInFlight > 1 && db.maxInFlight <= 5, `max in flight ${db.maxInFlight}`);
    check("Every lead reported once", outcomes.length === 252 && new Set(outcomes.map((o) => o.parsed.leadgenId)).size === 252,
      `${outcomes.length} outcomes`);
    check("New leads carry their contact ID (for the staff email link)",
      outcomes.filter((o) => o.status === "added").every((o) => o.contactId === `contact-${o.parsed.leadgenId}`), "");
  }

  {
    const before = db.rpcCalls;
    const { summary, ms } = await run(db);
    check("Re-run: leads already in the CRM are counted as existing",
      summary.added === 0 && summary.existing === 251 && summary.failed === 0, JSON.stringify(summary));
    check("Re-run: no save calls for leads already in the CRM", db.rpcCalls === before, `${db.rpcCalls - before} saves`);
    check("Re-run is fast (< 3 s)", ms < 3_000, `${ms} ms`);
  }

  {
    // Meta now also returns ad details for two leads: those two are saved
    // again so record_meta_lead() can fill the details in.
    graph.forms[0].leads[3] = lead(3, { ad_name: "Carousel A", campaign_name: "China Nov" });
    graph.forms[0].leads[7] = lead(7, { ad_name: "Carousel B" });
    const before = db.rpcCalls;
    const { summary } = await run(db);
    check("Leads missing ad details are saved again to fill them in",
      db.rpcCalls - before === 2 && summary.existing === 251 && summary.added === 0,
      `${db.rpcCalls - before} saves, ${JSON.stringify(summary)}`);
    check("Filled-in details are stored", db.saved.get("lead-3")?.ad_name === "Carousel A", JSON.stringify(db.saved.get("lead-3")));
  }

  {
    // One lead fails to save; the others still go through.
    const fresh = new FakeDb(5);
    fresh.failIds.add("lead-10");
    const { summary, outcomes } = await run(fresh);
    const failed = outcomes.filter((o) => o.status === "failed");
    check("A failed save doesn't stop the rest",
      summary.failed === 1 && summary.added === 250 && failed[0]?.parsed.leadgenId === "lead-10" && /boom/.test(failed[0]?.error ?? ""),
      JSON.stringify(summary));
  }

  {
    // Meta errors on the second form: the first form's leads are already saved.
    const fresh = new FakeDb(5);
    graph.failForm = "form-b";
    try {
      await run(fresh);
      check("A Meta error stops the run with the step and partial counts", false, "did not throw");
    } catch (err) {
      check("A Meta error stops the run with the step and partial counts",
        err instanceof MetaLeadSyncError && /Japan Form/.test(err.step) && err.summary.added === 250,
        err instanceof MetaLeadSyncError ? `${err.step}; ${JSON.stringify(err.summary)}` : String(err));
    }
    graph.failForm = undefined;
  }

  {
    const { summary, outcomes } = await run(null);
    check("Dry run writes nothing", summary.added === 0 && outcomes.filter((o) => o.status === "dry-run").length === 251,
      JSON.stringify(summary));
  }

  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
