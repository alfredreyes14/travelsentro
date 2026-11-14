import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { SITE_URL } from "@/lib/constants";
import { sendInternalNotificationEmails } from "@/lib/crm/notify-staff";
import { createServiceClient } from "@/lib/supabase/service";

import { describeLeadFailures, describeSyncError } from "./errors";
import { MetaLeadSyncError, syncMetaLeads, type LeadOutcome, type SyncSummary } from "./sync";

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

// Keeps one bad run from bloating its log row.
const MAX_LOGGED_LEAD_ERRORS = 50;

export type MetaLeadSyncResult = SyncSummary & {
  lookbackDays: number;
  alertsSkipped: number;
  status: MetaLeadSyncStatus;
  /** Plain-language reason, when status is "partial" or "failed". */
  error: string | null;
};

/**
 * success: every lead pulled was handled.
 * partial: some leads were saved (or already in the CRM), some failed.
 * failed: nothing could be saved -- Meta was unreachable or every lead failed.
 */
export type MetaLeadSyncStatus = "success" | "partial" | "failed";

function statusFor(summary: SyncSummary, hadFailure: boolean): MetaLeadSyncStatus {
  if (!hadFailure) return "success";
  return summary.added + summary.existing > 0 ? "partial" : "failed";
}

/** Who started a run, for the sync log (meta_lead_sync_runs). */
export type MetaLeadSyncTrigger =
  | { kind: "cron" }
  | { kind: "manual"; userId: string; userName: string };

type LeadError = { leadgen_id: string; form_name: string | null; error: string };

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

/** Inserts the 'running' log row. Logging never blocks the sync itself. */
async function startLog(
  supabase: SupabaseClient,
  trigger: MetaLeadSyncTrigger,
  days: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from("meta_lead_sync_runs")
    .insert({
      trigger: trigger.kind,
      triggered_by: trigger.kind === "manual" ? trigger.userId : null,
      triggered_by_name: trigger.kind === "manual" ? trigger.userName : null,
      lookback_days: days,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Meta lead sync: couldn't write the sync log", error?.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function finishLog(
  supabase: SupabaseClient,
  runId: string | null,
  fields: {
    status: MetaLeadSyncStatus;
    summary: SyncSummary;
    error?: string | null;
    errorDetail?: string | null;
    leadErrors: LeadError[];
  }
): Promise<void> {
  if (!runId) return;
  const { summary } = fields;
  const { error } = await supabase
    .from("meta_lead_sync_runs")
    .update({
      status: fields.status,
      finished_at: new Date().toISOString(),
      // A run that failed before listing the forms never learned how many there are.
      forms: fields.status !== "success" && summary.forms === 0 ? null : summary.forms,
      pulled: summary.pulled,
      added: summary.added,
      existing: summary.existing,
      no_contact: summary.noContact,
      failed: summary.failed,
      error: fields.error ?? null,
      error_detail: fields.errorDetail ?? null,
      lead_errors: fields.leadErrors.slice(0, MAX_LOGGED_LEAD_ERRORS),
    })
    .eq("id", runId);
  if (error) {
    console.error("Meta lead sync: couldn't update the sync log", error.message);
  }
}

/**
 * Runs the sync and records it in meta_lead_sync_runs. A run where some
 * leads couldn't be saved resolves with status "partial" or "failed"; one
 * that stopped part-way (Meta unreachable) rejects, with the reason already
 * logged. Either way
 * the thrown/returned error is written for staff (see ./errors).
 */
export async function runMetaLeadSync(
  trigger: MetaLeadSyncTrigger
): Promise<MetaLeadSyncResult> {
  if (!isMetaLeadSyncEnabled()) {
    throw new Error("Meta lead sync only runs on the production deployment");
  }

  const days = lookbackDays();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const supabase = createServiceClient();
  const runId = await startLog(supabase, trigger, days);
  const added: LeadOutcome[] = [];
  const leadErrors: LeadError[] = [];

  let summary: SyncSummary;
  try {
    summary = await syncMetaLeads({
      supabase,
      since,
      onLead: (outcome) => {
        if (outcome.status === "added") added.push(outcome);
        if (outcome.status === "failed") {
          leadErrors.push({
            leadgen_id: outcome.parsed.leadgenId,
            form_name: outcome.formName,
            error: outcome.error ?? "unknown error",
          });
          console.error("Meta lead save failed", {
            leadgenId: outcome.parsed.leadgenId,
            error: outcome.error,
          });
        }
      },
    });
  } catch (err) {
    const described = describeSyncError(err);
    const partialSummary =
      err instanceof MetaLeadSyncError
        ? err.summary
        : { forms: 0, pulled: 0, added: 0, existing: 0, noContact: 0, failed: 0 };
    const status = partialSummary.added + partialSummary.existing > 0 ? "partial" : "failed";
    await finishLog(supabase, runId, {
      status,
      summary: partialSummary,
      error: described.message,
      errorDetail: described.detail,
      leadErrors,
    });
    throw new MetaLeadSyncRunError(described.message, status, err);
  }

  // sendInternalNotificationEmails logs its own failures and never throws.
  for (const outcome of added.slice(0, MAX_ALERTS_PER_RUN)) {
    await notifyStaff(outcome);
  }
  const alertsSkipped = Math.max(0, added.length - MAX_ALERTS_PER_RUN);
  if (alertsSkipped > 0) {
    console.warn(`Meta lead sync: ${alertsSkipped} new lead(s) saved without a staff email`);
  }

  const described = leadErrors.length > 0 ? describeLeadFailures(leadErrors, summary.pulled) : null;
  const status = statusFor(summary, described !== null);
  await finishLog(supabase, runId, {
    status,
    summary,
    error: described?.message,
    errorDetail: described?.detail,
    leadErrors,
  });

  const result: MetaLeadSyncResult = {
    ...summary,
    lookbackDays: days,
    alertsSkipped,
    status,
    error: described?.message ?? null,
  };
  console.log("Meta lead sync:", result);
  return result;
}

/** A run that stopped part-way; `message` is written for staff. */
export class MetaLeadSyncRunError extends Error {
  constructor(
    message: string,
    /** "partial" when some leads were saved before it stopped. */
    readonly status: Exclude<MetaLeadSyncStatus, "success">,
    readonly cause: unknown
  ) {
    super(message);
    this.name = "MetaLeadSyncRunError";
  }
}
