import type { SupabaseClient } from "@supabase/supabase-js";

import { FACEBOOK_PAGE_ID } from "../constants";
import { getPageAccessToken, listFormLeads, listLeadForms } from "./graph";
import { parseMetaLead, type ParsedMetaLead } from "./lead";
import { recordMetaLead } from "./record";

/**
 * Pulls leads from every lead form on the TravelSentro Page into the CRM.
 * Shared by the daily cron (app/api/cron/meta-leads) and
 * scripts/import-meta-leads.ts. Safe to re-run: record_meta_lead() is keyed
 * on Meta's lead ID, so leads already saved come back as "existing".
 *
 * No "server-only" import, for the same reason as ./graph.
 */

export type LeadOutcome = {
  parsed: ParsedMetaLead;
  formName: string | null;
  /** "dry-run": no client given, nothing written. */
  status: "added" | "existing" | "no-contact" | "failed" | "dry-run";
  contactId?: string;
  error?: string;
};

export type SyncSummary = {
  forms: number;
  /** Leads Meta returned: added + existing + noContact + failed. */
  pulled: number;
  added: number;
  existing: number;
  /** Leads with neither email nor phone; the CRM can't store them. */
  noContact: number;
  failed: number;
};

/**
 * A run that stopped part-way: Meta or the token couldn't be reached.
 * `step` says what the sync was doing; `summary` counts the leads handled
 * before it stopped (they are saved).
 */
export class MetaLeadSyncError extends Error {
  constructor(
    readonly step: string,
    readonly cause: unknown,
    readonly summary: SyncSummary
  ) {
    super(`Meta lead sync failed while ${step}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "MetaLeadSyncError";
  }
}

// Leads saved at once. Each save is a round trip to the database, so doing
// them one by one made a busy week of leads run past the 60 s time limit.
const SAVE_CONCURRENCY = 5;

// Leads looked up per "already in the CRM?" query (keeps the URL short).
const LOOKUP_CHUNK = 100;

/** Runs `fn` over `items`, at most `limit` at a time. */
async function forEachConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Source details already stored for each of these Meta lead IDs. A lead
 * missing from the map isn't in the CRM yet.
 */
async function findSavedLeads(
  supabase: SupabaseClient,
  leadgenIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const saved = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < leadgenIds.length; i += LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from("inquiries")
      .select("external_id, source_details")
      .in("external_id", leadgenIds.slice(i, i + LOOKUP_CHUNK));
    if (error) throw new Error(`Couldn't check which leads are already saved: ${error.message}`);
    for (const row of (data ?? []) as { external_id: string; source_details: Record<string, unknown> | null }[]) {
      saved.set(row.external_id, row.source_details ?? {});
    }
  }
  return saved;
}

/**
 * True when record_meta_lead() would have nothing to do for a lead already
 * saved: every source detail Meta sent is already stored (it only fills in
 * missing keys, never overwrites).
 */
function hasAllDetails(stored: Record<string, unknown>, parsed: ParsedMetaLead): boolean {
  return Object.keys(parsed.details).every((key) => key in stored);
}

export async function syncMetaLeads(options: {
  /** Service-role client. null = dry run. */
  supabase: SupabaseClient | null;
  /** Only leads created at or after this time. Omit for every lead Meta still has (~90 days). */
  since?: Date;
  onLead?: (outcome: LeadOutcome) => void;
}): Promise<SyncSummary> {
  const { supabase, since, onLead } = options;
  const summary: SyncSummary = { forms: 0, pulled: 0, added: 0, existing: 0, noContact: 0, failed: 0 };

  async function step<T>(description: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new MetaLeadSyncError(description, err, { ...summary });
    }
  }

  const token = await step("getting the Facebook Page access token", () =>
    getPageAccessToken(FACEBOOK_PAGE_ID)
  );
  const forms = await step("listing the Page's lead forms", () =>
    listLeadForms(FACEBOOK_PAGE_ID, token)
  );
  summary.forms = forms.length;

  for (const form of forms) {
    const formName = form.name ?? null;
    const leads = await step(`reading leads from the form "${formName ?? form.id}"`, () =>
      listFormLeads(form.id, token, since)
    );
    summary.pulled += leads.length;

    const parsedLeads = leads.map((lead) => parseMetaLead(lead, formName));
    const toSave: ParsedMetaLead[] = [];

    for (const parsed of parsedLeads) {
      if (!parsed.email && !parsed.phone) {
        summary.noContact++;
        onLead?.({ parsed, formName, status: "no-contact" });
      } else if (!supabase) {
        onLead?.({ parsed, formName, status: "dry-run" });
      } else {
        toSave.push(parsed);
      }
    }
    if (!supabase || toSave.length === 0) continue;

    // Most leads in the lookback window were saved by an earlier run. One
    // query finds them, so only new leads (or ones still missing ad
    // details) cost a save.
    const saved = await step(`checking which leads from "${formName ?? form.id}" are already in the CRM`, () =>
      findSavedLeads(supabase, toSave.map((parsed) => parsed.leadgenId))
    );

    await forEachConcurrent(toSave, SAVE_CONCURRENCY, async (parsed) => {
      const stored = saved.get(parsed.leadgenId);
      if (stored && hasAllDetails(stored, parsed)) {
        summary.existing++;
        onLead?.({ parsed, formName, status: "existing" });
        return;
      }

      let outcome: LeadOutcome;
      try {
        const result = await recordMetaLead(supabase, parsed);
        if (result.isNew) summary.added++;
        else summary.existing++;
        outcome = {
          parsed,
          formName,
          status: result.isNew ? "added" : "existing",
          contactId: result.contactId,
        };
      } catch (err) {
        summary.failed++;
        outcome = {
          parsed,
          formName,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      onLead?.(outcome);
    });
  }

  return summary;
}
