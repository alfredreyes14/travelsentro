import "server-only";

import { SITE_URL } from "@/lib/constants";
import { sendInternalNotificationEmails } from "@/lib/crm/notify-staff";
import { createServiceClient } from "@/lib/supabase/service";

import { syncMetaLeads, type LeadOutcome, type SyncSummary } from "./sync";

/**
 * One Meta lead sync run, shared by the nightly cron
 * (app/api/cron/meta-leads) and the CRM's "Sync Meta leads" button
 * (actions/meta-leads.ts).
 *
 * Re-reads the last META_LEADS_LOOKBACK_DAYS (default 7) days of leads and
 * saves the new ones, so no "last synced" state is kept and a missed run is
 * caught up by the next one. For gaps longer than the lookback, run
 * `npm run import:meta-leads`.
 */

const DEFAULT_LOOKBACK_DAYS = 7;

// Each alert is one Resend send, and the free tier allows 100/day across
// all email. A large run (e.g. after a long outage) still saves every lead;
// it just stops emailing staff past this count.
const MAX_ALERTS_PER_RUN = 20;

export type MetaLeadSyncResult = SyncSummary & {
  lookbackDays: number;
  alertsSkipped: number;
};

/**
 * Production only. Staging has its own database, which must stay free of
 * real customer leads, so preview/staging deployments and local dev never
 * sync. Vercel only runs crons on production anyway.
 */
export function isMetaLeadSyncEnabled(): boolean {
  return process.env.VERCEL_ENV === "production";
}

function lookbackDays(): number {
  const days = Number(process.env.META_LEADS_LOOKBACK_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_LOOKBACK_DAYS;
}

async function notifyStaff(outcome: LeadOutcome): Promise<void> {
  const { parsed, formName, contactId } = outcome;
  const source = `Meta lead ad${formName ? ` (${formName})` : ""}`;
  await sendInternalNotificationEmails({
    name: parsed.name ?? "Facebook lead",
    email: parsed.email ?? "",
    phone: parsed.phone ?? "",
    message: parsed.message ? `${source}\n\n${parsed.message}` : source,
    crmUrl: `${SITE_URL}/admin/crm/${contactId}`,
  });
}

/** Throws when Meta or the database can't be reached at all. */
export async function runMetaLeadSync(): Promise<MetaLeadSyncResult> {
  if (!isMetaLeadSyncEnabled()) {
    throw new Error("Meta lead sync only runs on the production deployment");
  }

  const days = lookbackDays();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const added: LeadOutcome[] = [];

  const summary = await syncMetaLeads({
    supabase: createServiceClient(),
    since,
    onLead: (outcome) => {
      if (outcome.status === "added") added.push(outcome);
      if (outcome.status === "failed") {
        console.error("Meta lead save failed", {
          leadgenId: outcome.parsed.leadgenId,
          error: outcome.error,
        });
      }
    },
  });

  // sendInternalNotificationEmails logs its own failures and never throws.
  for (const outcome of added.slice(0, MAX_ALERTS_PER_RUN)) {
    await notifyStaff(outcome);
  }
  const alertsSkipped = Math.max(0, added.length - MAX_ALERTS_PER_RUN);
  if (alertsSkipped > 0) {
    console.warn(`Meta lead sync: ${alertsSkipped} new lead(s) saved without a staff email`);
  }

  const result = { ...summary, lookbackDays: days, alertsSkipped };
  console.log("Meta lead sync:", result);
  return result;
}
