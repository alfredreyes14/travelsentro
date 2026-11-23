import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { createElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { FollowUpEmail } from "@/components/email/follow-up-email";
import { applyNameTemplate } from "@/lib/crm/messages";
import { fromWithName, sendBatchEmails, type BatchEmailResult } from "@/lib/resend";
import { sendSingleSms } from "@/lib/sms/semaphore";
import { signContactId } from "@/lib/unsubscribe-token";

import { buildTrackedUrl } from "./links";
import { toFollowUpSequence, type FollowUpSequence } from "./templates";

/**
 * The one send path for follow-ups, shared by staff actions
 * (actions/follow-ups.ts) and the daily automation (run-automation.ts).
 *
 * Each recipient gets their own tracking token, so every email/SMS is sent
 * and logged per contact, tagged with its sequence and step. After
 * logging, mark_follow_ups_sent() applies any stage move a send causes
 * (today: B2B New/Contacted -> Follow-up).
 */

export type FollowUpSender = { id: string | null; name: string | null };

export type FollowUpSummary = {
  sent: number;
  failed: number;
  total: number;
  /** Why the first failed send failed, for staff-facing errors. */
  error?: string;
};

export type FollowUpEmailItem = {
  contactId: string;
  name: string;
  email: string;
  sequence: FollowUpSequence;
  step: number;
  /** May contain {{name}}. */
  subject: string;
  /** May contain {{name}}. */
  body: string;
};

export type FollowUpSmsItem = {
  contactId: string;
  name: string;
  phone: string;
  sequence: FollowUpSequence;
  step: number;
  /** May contain {{name}}. The tracked link is appended. */
  body: string;
};

type MessageRow = {
  /** Not stored: why the send failed, for logs and the summary. */
  failure_reason?: string;

  contact_id: string;
  channel: "email" | "sms";
  subject: string | null;
  body: string;
  status: "sent" | "failed";
  provider_message_id: string | null;
  batch_id: string | null;
  sent_by: string | null;
  sent_by_name: string | null;
  kind: "follow_up";
  follow_up_sequence: FollowUpSequence;
  follow_up_step: number;
  tracking_token: string;
};

/** Every follow-up email, staff or automated, comes from the same person. */
export const FOLLOW_UP_FROM_NAME = "Almira from TravelSentro";

// Parallel Semaphore calls per bulk SMS follow-up.
const SMS_CONCURRENCY = 5;

function newTrackingToken(): string {
  return randomBytes(12).toString("base64url");
}

export type NextFollowUp = { sequence: FollowUpSequence; step: number };

/**
 * Each contact's current sequence and the number of its next follow-up,
 * from the follow_up_progress view (counts only this sequence, since the
 * contact entered its current stage).
 */
export async function nextFollowUps(
  supabase: SupabaseClient,
  contactIds: string[]
): Promise<Map<string, NextFollowUp>> {
  const next = new Map<string, NextFollowUp>();
  if (contactIds.length === 0) return next;

  const { data, error } = await supabase
    .from("follow_up_progress")
    .select("contact_id, sequence, sent_count")
    .in("contact_id", contactIds);

  if (error) console.error("nextFollowUps failed:", error.message);
  for (const row of data ?? []) {
    next.set(row.contact_id, {
      sequence: toFollowUpSequence(row.sequence),
      step: (row.sent_count ?? 0) + 1,
    });
  }
  return next;
}

/** A contact missing from nextFollowUps()' result: start of no_reply. */
export const FIRST_FOLLOW_UP: NextFollowUp = { sequence: "no_reply", step: 1 };

/** Each contact's most recent inquired package name, if any. */
export async function latestPackageNames(
  supabase: SupabaseClient,
  contactIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (contactIds.length === 0) return names;

  const { data, error } = await supabase
    .from("inquiries")
    .select("contact_id, created_at, packages(name)")
    .in("contact_id", contactIds)
    .not("package_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) console.error("latestPackageNames failed:", error.message);
  for (const row of (data ?? []) as unknown as {
    contact_id: string;
    packages: { name: string } | null;
  }[]) {
    if (!names.has(row.contact_id) && row.packages?.name) {
      names.set(row.contact_id, row.packages.name);
    }
  }
  return names;
}

function toStoredRow(row: MessageRow): Omit<MessageRow, "failure_reason"> {
  const stored = { ...row };
  delete stored.failure_reason;
  return stored;
}

async function logAndAdvance(
  supabase: SupabaseClient,
  rows: MessageRow[]
): Promise<FollowUpSummary> {
  const failures = rows.filter((r) => r.status === "failed");
  const summary: FollowUpSummary = {
    sent: rows.length - failures.length,
    failed: failures.length,
    total: rows.length,
    error: failures.find((r) => r.failure_reason)?.failure_reason,
  };
  if (rows.length === 0) return summary;

  for (const row of failures) {
    console.error(
      `Follow-up ${row.channel} to contact ${row.contact_id} failed:`,
      row.failure_reason ?? "unknown reason"
    );
  }

  const { data, error } = await supabase
    .from("messages")
    .insert(rows.map(toStoredRow))
    .select("id, status");
  if (error) {
    // The messages went out; only the log failed. Clicks on their links
    // still reach the chat (the route redirects unknown tokens too).
    console.error("Follow-up message log failed:", error.message);
    return summary;
  }

  const sentIds = (data ?? [])
    .filter((row) => row.status === "sent")
    .map((row) => row.id as string);
  if (sentIds.length > 0) {
    const { error: stageError } = await supabase.rpc("mark_follow_ups_sent", {
      p_message_ids: sentIds,
    });
    if (stageError) {
      console.error("mark_follow_ups_sent failed:", stageError.message);
    }
  }

  return summary;
}

export async function sendFollowUpEmails({
  supabase,
  items,
  sender,
  origin,
}: {
  supabase: SupabaseClient;
  items: FollowUpEmailItem[];
  sender: FollowUpSender;
  origin: string;
}): Promise<FollowUpSummary> {
  if (items.length === 0) return { sent: 0, failed: 0, total: 0 };


  const batchId = items.length > 1 ? randomUUID() : null;
  const prepared = items.map((item) => ({
    ...item,
    token: newTrackingToken(),
    subject: applyNameTemplate(item.subject, item.name),
    body: applyNameTemplate(item.body, item.name),
  }));

  let results: BatchEmailResult[];
  try {
    results = await sendBatchEmails(
      prepared.map((p) => ({
        from: fromWithName(FOLLOW_UP_FROM_NAME),
        to: p.email,
        subject: p.subject,
        react: createElement(FollowUpEmail, {
          name: p.name,
          body: p.body,
          messengerUrl: buildTrackedUrl(origin, p.token, "messenger"),
          whatsappUrl: buildTrackedUrl(origin, p.token, "whatsapp"),
          unsubscribeUrl: `${origin}/unsubscribe?cid=${p.contactId}&sig=${signContactId(p.contactId)}`,
        }),
      }))
    );
  } catch (error) {
    // e.g. UNSUBSCRIBE_TOKEN_SECRET unset (signContactId throws in
    // production) or a render failure: nothing went out.
    const reason = error instanceof Error ? error.message : String(error);
    results = prepared.map(() => ({ id: null, error: reason }));
  }

  return logAndAdvance(
    supabase,
    prepared.map((p, i) => ({
      contact_id: p.contactId,
      channel: "email",
      subject: p.subject,
      body: p.body,
      status: results[i]?.error || !results[i] ? "failed" : "sent",
      failure_reason: results[i] ? (results[i].error ?? undefined) : "no result from Resend",
      provider_message_id: results[i]?.id ?? null,
      batch_id: batchId,
      sent_by: sender.id,
      sent_by_name: sender.name,
      kind: "follow_up",
      follow_up_sequence: p.sequence,
      follow_up_step: p.step,
      tracking_token: p.token,
    }))
  );
}

/**
 * One Semaphore call per recipient: each text carries its own link, and
 * Semaphore's bulk endpoint can only send one shared message. The link is
 * the full site domain -- Smart drops texts with link-shortener URLs.
 */
export async function sendFollowUpSms({
  supabase,
  items,
  sender,
  origin,
}: {
  supabase: SupabaseClient;
  items: FollowUpSmsItem[];
  sender: FollowUpSender;
  origin: string;
}): Promise<FollowUpSummary> {
  if (items.length === 0) return { sent: 0, failed: 0, total: 0 };

  const batchId = items.length > 1 ? randomUUID() : null;
  const rows: MessageRow[] = new Array(items.length);

  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      const token = newTrackingToken();
      const text = `${applyNameTemplate(item.body, item.name).trim()} ${buildTrackedUrl(origin, token)}`;

      let status: "sent" | "failed" = "failed";
      let providerId: string | null = null;
      let failureReason: string | undefined;
      try {
        const result = await sendSingleSms(item.phone, text);
        status =
          result?.status === "Failed" || result?.status === "Refunded"
            ? "failed"
            : "sent";
        providerId = result?.message_id ?? null;
        if (status === "failed") failureReason = `Semaphore status ${result?.status}`;
      } catch (error) {
        failureReason = error instanceof Error ? error.message : String(error);
      }

      rows[i] = {
        contact_id: item.contactId,
        channel: "sms",
        subject: null,
        body: text,
        status,
        provider_message_id: providerId,
        batch_id: batchId,
        sent_by: sender.id,
        sent_by_name: sender.name,
        kind: "follow_up",
        follow_up_sequence: item.sequence,
        follow_up_step: item.step,
        tracking_token: token,
        failure_reason: failureReason,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SMS_CONCURRENCY, items.length) }, worker)
  );

  return logAndAdvance(supabase, rows);
}
