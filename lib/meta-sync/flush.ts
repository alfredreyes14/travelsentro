import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

import { buildCapiBody, isFreshEnough, type CapiStageEvent } from "./capi";
import {
  addLabelToChat,
  capiConfig,
  createPageLabel,
  labelsOnChat,
  listPageLabels,
  pageTokenOrNull,
  removeLabelFromChat,
  sendCapiEvents,
} from "./graph";
import { isStageLabel, metaStageName } from "./stages";

/**
 * Sends what the database queued in meta_outbox (see the meta_stage_sync
 * migration): Conversions API stage events and Messenger inbox labels.
 * Safe to run from several places at once -- claim_meta_outbox() hands each
 * job to one sender. A job that fails is retried on later runs, up to 5
 * tries. A part that isn't set up (no dataset, no Page token, or
 * META_INBOX_LABELS_ENABLED=false) marks its jobs skipped.
 */

export type MetaSyncResult = {
  capiSent: number;
  capiSkipped: number;
  labelsSynced: number;
  labelsSkipped: number;
  failed: number;
};

type OutboxRow = {
  id: number;
  kind: "capi_event" | "inbox_label";
  contact_id: string;
  payload: Record<string, unknown>;
};

const BATCH = 200;

function inboxLabelsEnabled(): boolean {
  return process.env.META_INBOX_LABELS_ENABLED !== "false";
}

export async function flushMetaOutbox(): Promise<MetaSyncResult> {
  const supabase = createServiceClient();
  const result: MetaSyncResult = {
    capiSent: 0,
    capiSkipped: 0,
    labelsSynced: 0,
    labelsSkipped: 0,
    failed: 0,
  };

  const { data, error } = await supabase.rpc("claim_meta_outbox", { p_limit: BATCH });
  if (error) throw new Error(`claim_meta_outbox failed: ${error.message}`);
  const rows = (data ?? []) as OutboxRow[];
  if (rows.length === 0) return result;

  async function finish(ids: number[], lastError: string | null) {
    if (ids.length === 0) return;
    const { error: updateError } = await supabase
      .from("meta_outbox")
      .update({ sent_at: new Date().toISOString(), last_error: lastError })
      .in("id", ids);
    if (updateError) console.error("meta_outbox update failed:", updateError.message);
  }

  async function fail(ids: number[], message: string) {
    result.failed += ids.length;
    // Leave sent_at empty so a later run retries (until 5 attempts).
    await supabase
      .from("meta_outbox")
      .update({ last_error: message.slice(0, 500), claimed_at: null })
      .in("id", ids);
  }

  // ------------------------------------------------ Conversions API events
  const capiRows = rows.filter((r) => r.kind === "capi_event");
  if (capiRows.length > 0) {
    const config = capiConfig();
    if (!config) {
      result.capiSkipped += capiRows.length;
      await finish(capiRows.map((r) => r.id), "skipped: Conversions API not configured");
    } else {
      const stale = capiRows.filter((r) => !isFreshEnough(Number(r.payload.event_time)));
      const fresh = capiRows.filter((r) => isFreshEnough(Number(r.payload.event_time)));
      result.capiSkipped += stale.length;
      await finish(stale.map((r) => r.id), "skipped: older than 7 days");

      if (fresh.length > 0) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, email, phone")
          .in("id", [...new Set(fresh.map((r) => r.contact_id))]);
        const byId = new Map((contacts ?? []).map((c) => [c.id as string, c]));

        const events: CapiStageEvent[] = fresh.map((r) => ({
          leadId: String(r.payload.lead_id),
          stage: String(r.payload.stage),
          eventTime: Number(r.payload.event_time),
          email: byId.get(r.contact_id)?.email ?? null,
          phone: byId.get(r.contact_id)?.phone ?? null,
        }));

        try {
          await sendCapiEvents(config, buildCapiBody(events, config.testEventCode));
          result.capiSent += fresh.length;
          await finish(fresh.map((r) => r.id), null);
        } catch (err) {
          console.error("Conversions API send failed:", err);
          await fail(fresh.map((r) => r.id), String(err));
        }
      }
    }
  }

  // ------------------------------------------------ Messenger inbox labels
  const labelRows = rows.filter((r) => r.kind === "inbox_label");
  if (labelRows.length > 0) {
    const token = inboxLabelsEnabled() ? await pageTokenOrNull() : null;
    if (!token) {
      result.labelsSkipped += labelRows.length;
      await finish(labelRows.map((r) => r.id), "skipped: inbox labels not configured");
    } else {
      // Only the newest job per chat matters; older ones are superseded.
      const newestByPsid = new Map<string, OutboxRow>();
      for (const row of labelRows) {
        const psid = String(row.payload.psid);
        const current = newestByPsid.get(psid);
        if (!current || row.id > current.id) newestByPsid.set(psid, row);
      }
      const superseded = labelRows.filter((r) => newestByPsid.get(String(r.payload.psid)) !== r);
      await finish(superseded.map((r) => r.id), "superseded");

      let pageLabels: Map<string, string> | null = null;
      async function labelId(name: string): Promise<string> {
        if (!pageLabels) {
          pageLabels = new Map((await listPageLabels(token!)).map((l) => [l.page_label_name, l.id]));
        }
        const existing = pageLabels.get(name);
        if (existing) return existing;
        const created = await createPageLabel(token!, name);
        pageLabels.set(name, created);
        return created;
      }

      for (const [psid, row] of newestByPsid) {
        try {
          const target = metaStageName(String(row.payload.stage));
          const targetId = await labelId(target);
          const current = await labelsOnChat(token, psid);
          for (const label of current) {
            if (label.id !== targetId && isStageLabel(label.page_label_name)) {
              await removeLabelFromChat(token, label.id, psid);
            }
          }
          if (!current.some((l) => l.id === targetId)) {
            await addLabelToChat(token, targetId, psid);
          }
          result.labelsSynced += 1;
          await finish([row.id], null);
        } catch (err) {
          console.error("Inbox label sync failed:", err);
          await fail([row.id], String(err));
        }
      }
    }
  }

  console.log("Meta stage sync:", result);
  return result;
}
