import type { Metadata } from "next";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  MetaLeadSyncLog,
  type SyncRunItem,
  type SyncRunStatus,
} from "@/components/admin/meta-lead-sync-log";
import { isMetaLeadSyncEnabled } from "@/lib/meta-leads/run-sync";

export const metadata: Metadata = {
  title: "Meta Lead Sync Log | TravelSentro Admin",
};

// Covers the "Sync Meta leads" Server Action (same limit as the cron route).
export const maxDuration = 60;

const RUN_LIMIT = 100;

// A run gets at most 60 s (maxDuration). One still 'running' well past that
// was killed before it could record its result.
const STALE_RUN_MS = 5 * 60 * 1000;

function toStatus(status: string, startedAt: string, now: number): SyncRunStatus {
  if (status === "success" || status === "partial" || status === "failed") return status;
  return now - new Date(startedAt).getTime() > STALE_RUN_MS ? "timed_out" : "running";
}

/** Every Meta lead sync run (nightly cron and the "Sync Meta leads" button). */
export default async function MetaLeadSyncLogPage() {
  // Read access matches the Leads page: any signed-in staff member.
  const profile = await getProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meta_lead_sync_runs")
    .select(
      "id, trigger, triggered_by_name, status, started_at, finished_at, lookback_days, forms, pulled, added, existing, no_contact, failed, error, error_detail, lead_errors"
    )
    .order("started_at", { ascending: false })
    .limit(RUN_LIMIT);

  if (error) {
    console.error("Failed to load the Meta lead sync log:", error.message);
  }

  const now = new Date().getTime();
  const runs: SyncRunItem[] = (data ?? []).map((run) => ({
    id: run.id,
    trigger: run.trigger === "manual" ? "manual" : "cron",
    triggeredByName: run.triggered_by_name,
    status: toStatus(run.status, run.started_at, now),
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    lookbackDays: run.lookback_days,
    forms: run.forms,
    pulled: run.pulled,
    added: run.added,
    existing: run.existing,
    noContact: run.no_contact,
    failed: run.failed,
    error: run.error,
    errorDetail: run.error_detail,
    leadErrors: Array.isArray(run.lead_errors)
      ? (run.lead_errors as { leadgen_id?: string; form_name?: string | null; error?: string }[]).map(
          (leadError) => ({
            leadgenId: leadError.leadgen_id ?? "",
            formName: leadError.form_name ?? null,
            error: leadError.error ?? "",
          })
        )
      : [],
  }));

  return (
    <MetaLeadSyncLog
      runs={runs}
      loadError={error ? "Couldn't load the sync log. Please refresh the page." : null}
      canSync={profile.role === "admin" || profile.can_edit_crm}
      syncEnabled={isMetaLeadSyncEnabled()}
    />
  );
}
