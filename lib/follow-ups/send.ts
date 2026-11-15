import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { createElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { FollowUpEmail } from "@/components/email/follow-up-email";
import { applyNameTemplate } from "@/lib/crm/messages";
import { sendBatchEmails, type BatchEmailResult } from "@/lib/resend";
import { sendSingleSms } from "@/lib/sms/semaphore";
import { signContactId } from "@/lib/unsubscribe-token";

import { buildTrackedUrl } from "./links";

/**
 * The one send path for follow-ups, shared by staff actions
 * (actions/follow-ups.ts) and the daily automation (run-automation.ts).
 *
 * Each recipient gets their own tracking token, so every email/SMS is sent
 * and logged per contact. After logging, mark_follow_ups_sent() moves each
 * contact that was really reached to Follow-up.
 */

export type FollowUpSender = { id: string | null; name: string | null };

export type FollowUpSummary = { sent: number; failed: number; total: number };

export type FollowUpEmailItem = {
  contactId: string;
  name: string;
  email: string;
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
  step: number;
  /** May contain {{name}}. The tracked link is appended. */
  body: string;
};

type MessageRow = {
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
  follow_up_step: number;
  tracking_token: string;
};

// Parallel Semaphore calls per bulk SMS follow-up.
const SMS_CONCURRENCY = 5;

function newTrackingToken(): string {
  return randomBytes(12).toString("base64url");
}

/** Sent follow-ups per contact, for numbering the next step. */
export async function countSentFollowUps(
  supabase: SupabaseClient,
  contactIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (contactIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("messages")
    .select("contact_id")
    .eq("kind", "follow_up")
    .eq("status", "sent")
    .in("contact_id", contactIds);

  if (error) console.error("countSentFollowUps failed:", error.message);
  for (const row of data ?? []) {
    counts.set(row.contact_id, (counts.get(row.contact_id) ?? 0) + 1);
  }
  return counts;
}

async function logAndAdvance(
  supabase: SupabaseClient,
  rows: MessageRow[]
): Promise<FollowUpSummary> {
  const summary = {
    sent: rows.filter((r) => r.status === "sent").length,
    failed: rows.filter((r) => r.status === "failed").length,
    total: rows.length,
  };
  if (rows.length === 0) return summary;

  const { data, error } = await supabase
    .from("messages")
    .insert(rows)
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
    console.error("Follow-up email send failed:", error);
    results = prepared.map(() => ({ id: null, error: "send threw" }));
  }

  return logAndAdvance(
    supabase,
    prepared.map((p, i) => ({
      contact_id: p.contactId,
      channel: "email",
      subject: p.subject,
      body: p.body,
      status: results[i]?.error || !results[i] ? "failed" : "sent",
      provider_message_id: results[i]?.id ?? null,
      batch_id: batchId,
      sent_by: sender.id,
      sent_by_name: sender.name,
      kind: "follow_up",
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
      try {
        const result = await sendSingleSms(item.phone, text);
        status =
          result?.status === "Failed" || result?.status === "Refunded"
            ? "failed"
            : "sent";
        providerId = result?.message_id ?? null;
      } catch (error) {
        console.error("Follow-up SMS send failed:", error);
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
        follow_up_step: item.step,
        tracking_token: token,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SMS_CONCURRENCY, items.length) }, worker)
  );

  return logAndAdvance(supabase, rows);
}
