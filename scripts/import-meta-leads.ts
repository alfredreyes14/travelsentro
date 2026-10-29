/**
 * Pulls leads from every lead form on the TravelSentro Page into the CRM.
 * Use it once after setup (to bring in leads collected before the webhook
 * existed) and any time the webhook may have missed some (e.g. while the
 * token was expired). Safe to re-run: leads already in the CRM are
 * skipped, and no staff emails are sent for imported leads.
 *
 * Meta's API only returns leads from roughly the last 90 days. Older ones
 * must be exported as CSV from Meta Business Suite.
 *
 *   npm run import:meta-leads                     # all forms, all leads
 *   npm run import:meta-leads -- --since=2026-09-01
 *   npm run import:meta-leads -- --dry-run        # list only, write nothing
 *
 * .env.local points at the live database that production uses, so a real
 * run writes to production's CRM.
 */
import { createClient } from "@supabase/supabase-js";

import { FACEBOOK_PAGE_ID } from "../lib/constants";
import { getLeadsAccessToken, listFormLeads, listLeadForms } from "../lib/meta-leads/graph";
import { parseMetaLead } from "../lib/meta-leads/lead";
import { recordMetaLead } from "../lib/meta-leads/record";

// supabase-js needs a global WebSocket, which Node 20 lacks (same fix as
// scripts/verify-inquiry-ingestion.ts).
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const sinceArg = argv.find((a) => a.startsWith("--since="))?.slice("--since=".length);
  let since: Date | undefined;
  if (sinceArg) {
    since = new Date(sinceArg);
    if (Number.isNaN(since.getTime())) {
      throw new Error(`--since must be a date like 2026-09-01, got "${sinceArg}"`);
    }
  }
  return { dryRun, since };
}

async function main() {
  const { dryRun, since } = parseArgs(process.argv.slice(2));
  const token = getLeadsAccessToken();
  await ensureWebSocketPolyfill();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !key)) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local).");
  }
  const supabase = dryRun ? null : createClient(url!, key!, { auth: { persistSession: false } });

  const forms = await listLeadForms(FACEBOOK_PAGE_ID, token);
  console.log(`Found ${forms.length} lead form(s) on page ${FACEBOOK_PAGE_ID}.`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const form of forms) {
    const leads = await listFormLeads(form.id, token, since);
    console.log(`\n${form.name ?? form.id} [${form.status ?? "?"}]: ${leads.length} lead(s)`);

    for (const lead of leads) {
      const parsed = parseMetaLead(lead, form.name);
      const who = parsed.name ?? parsed.email ?? parsed.phone ?? parsed.leadgenId;

      if (!parsed.email && !parsed.phone) {
        console.log(`  - ${who}: skipped, no email or phone on the lead`);
        failed++;
        continue;
      }
      if (!supabase) {
        console.log(`  - ${who} (${parsed.createdAt ?? "no date"})`);
        continue;
      }
      try {
        const result = await recordMetaLead(supabase, parsed);
        if (result.isNew) added++;
        else skipped++;
        console.log(`  - ${who}: ${result.isNew ? "added" : "already in CRM"}`);
      } catch (err) {
        failed++;
        console.error(`  - ${who}: FAILED`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(
    dryRun
      ? "\nDry run: nothing written."
      : `\nDone. Added ${added}, already in CRM ${skipped}, failed ${failed}.`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
