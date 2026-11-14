/**
 * Pulls leads from every lead form on the TravelSentro Page into the CRM.
 * The daily cron (app/api/cron/meta-leads) only looks back a few days; use
 * this once after setup to bring in older leads, and after any outage
 * longer than the cron's lookback (e.g. while the token was revoked). Safe
 * to re-run: leads already in the CRM are skipped, and no staff emails are
 * sent for imported leads.
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
import { syncMetaLeads } from "../lib/meta-leads/sync";

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

const STATUS_LABEL = {
  added: "added",
  existing: "already in CRM",
  "no-contact": "skipped, no email or phone on the lead",
  failed: "FAILED",
} as const;

async function main() {
  const { dryRun, since } = parseArgs(process.argv.slice(2));
  await ensureWebSocketPolyfill();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !key)) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local).");
  }
  const supabase = dryRun ? null : createClient(url!, key!, { auth: { persistSession: false } });

  const summary = await syncMetaLeads({
    supabase,
    since,
    onLead: ({ parsed, formName, status, error }) => {
      const who = parsed.name ?? parsed.email ?? parsed.phone ?? parsed.leadgenId;
      const form = formName ?? parsed.details.form_id ?? "?";
      const result =
        status === "dry-run" ? parsed.createdAt ?? "no date" : STATUS_LABEL[status];
      console.log(`  - [${form}] ${who}: ${result}${error ? ` (${error})` : ""}`);
    },
  });

  console.log(`\nChecked ${summary.forms} lead form(s) on page ${FACEBOOK_PAGE_ID}.`);
  console.log(
    dryRun
      ? "Dry run: nothing written."
      : `Done. Added ${summary.added}, already in CRM ${summary.existing}, ` +
          `no contact info ${summary.noContact}, failed ${summary.failed}.`
  );
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
