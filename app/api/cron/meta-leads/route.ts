import { timingSafeEqual } from "node:crypto";

import { sendInternalNotificationEmails } from "@/lib/crm/notify-staff";
import { syncMetaLeads, type LeadOutcome } from "@/lib/meta-leads/sync";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Daily Meta lead ads -> CRM sync, run by Vercel Cron (vercel.json:
 * 22:00 UTC = 06:00 Asia/Manila; Hobby allows one run a day).
 *
 * Re-reads the last META_LEADS_LOOKBACK_DAYS (default 7) days of leads on
 * every run and saves the new ones, so no "last synced" state is kept and a
 * missed run is caught up by the next one. For gaps longer than the
 * lookback, run `npm run import:meta-leads`.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` with each cron call;
 * anything else is refused, as is any deployment other than production.
 */
export const maxDuration = 60;

const DEFAULT_LOOKBACK_DAYS = 7;

// Each alert is one Resend send, and the free tier allows 100/day across
// all email. A large first run (or a run after a long outage) still saves
// every lead; it just stops emailing staff past this count.
const MAX_ALERTS_PER_RUN = 20;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function lookbackDays(): number {
  const days = Number(process.env.META_LEADS_LOOKBACK_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_LOOKBACK_DAYS;
}

async function notifyStaff(outcome: LeadOutcome, origin: string): Promise<void> {
  const { parsed, formName, contactId } = outcome;
  const source = `Meta lead ad${formName ? ` (${formName})` : ""}`;
  await sendInternalNotificationEmails({
    name: parsed.name ?? "Facebook lead",
    email: parsed.email ?? "",
    phone: parsed.phone ?? "",
    message: parsed.message ? `${source}\n\n${parsed.message}` : source,
    crmUrl: `${origin}/admin/crm/${contactId}`,
  });
}

export async function GET(request: Request) {
  // Production only. Staging has its own database, which must stay free of
  // real customer leads, so a manual call on a staging/preview deployment
  // (or locally) is refused even with the right secret. Vercel only runs
  // crons on production anyway.
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json(
      { error: "Meta lead sync only runs on the production deployment" },
      { status: 403 }
    );
  }
  if (!process.env.CRON_SECRET) {
    console.error("Meta lead sync: CRON_SECRET is not set");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = lookbackDays();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const added: LeadOutcome[] = [];

  try {
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
    const origin = new URL(request.url).origin;
    for (const outcome of added.slice(0, MAX_ALERTS_PER_RUN)) {
      await notifyStaff(outcome, origin);
    }
    const alertsSkipped = Math.max(0, added.length - MAX_ALERTS_PER_RUN);
    if (alertsSkipped > 0) {
      console.warn(`Meta lead sync: ${alertsSkipped} new lead(s) saved without a staff email`);
    }

    console.log("Meta lead sync:", { lookbackDays: days, ...summary });
    return Response.json(
      { lookbackDays: days, ...summary, alertsSkipped },
      { status: summary.failed > 0 ? 500 : 200 }
    );
  } catch (err) {
    console.error("Meta lead sync failed", err);
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
