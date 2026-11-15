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

    for (const lead of leads) {
      const parsed = parseMetaLead(lead, formName);
      let outcome: LeadOutcome;

      if (!parsed.email && !parsed.phone) {
        summary.noContact++;
        outcome = { parsed, formName, status: "no-contact" };
      } else if (!supabase) {
        outcome = { parsed, formName, status: "dry-run" };
      } else {
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
      }
      onLead?.(outcome);
    }
  }

  return summary;
}
