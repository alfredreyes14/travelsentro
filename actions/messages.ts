"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createElement } from "react";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { FROM_EMAIL, resend, sendBatchEmails } from "@/lib/resend";
import {
  sendSingleSms,
  sendBulkSms as sendBulkSmsProvider,
} from "@/lib/sms/semaphore";
import { applyNameTemplate } from "@/lib/crm/messages";
import { signContactId } from "@/lib/unsubscribe-token";
import { CustomerMessageEmail } from "@/components/email/customer-message-email";
import {
  emailComposeSchema,
  smsComposeSchema,
  recipientIdsSchema,
} from "@/lib/crm/message-schema";
import { getSiteOrigin } from "@/actions/auth";
import type { ActionResult } from "@/lib/action-result";

const SEND_ERROR_MESSAGE = "Couldn't send the message. Please try again.";
const NO_ELIGIBLE_RECIPIENTS_MESSAGE =
  "No eligible contacts to message — all selected contacts are opted out or missing the required contact info.";
const OPT_OUT_ERROR_MESSAGE =
  "Something went wrong updating this contact's opt-out status. Please try again.";

export type BulkSendResult =
  | { ok: true; sent: number; failed: number; total: number }
  | { ok: false; error: string };

/**
 * MSG-01/MSG-06 -- individual email send. Awaited inline, never scheduled
 * as background work (04-RESEARCH.md Pitfall 4, T-04-11): a staff-initiated send
 * must surface a real failure via toast, not a false success. Individual
 * sends are never filtered by opted_out (Open Question 1) and never carry
 * an unsubscribe footer (04-02's design -- that's bulk-only).
 */
export async function sendIndividualEmail(
  contactId: string,
  values: { subject: string; body: string }
): Promise<ActionResult> {
  const profile = await requirePermission("can_message_customers");

  const parsed = emailComposeSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, name, email")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: contact.email,
    subject: parsed.data.subject,
    react: createElement(CustomerMessageEmail, {
      name: contact.name,
      body: applyNameTemplate(parsed.data.body, contact.name),
    }),
  });

  await supabase.from("messages").insert({
    contact_id: contactId,
    channel: "email",
    subject: parsed.data.subject,
    body: parsed.data.body,
    status: result.error ? "failed" : "sent",
    provider_message_id: result.data?.id ?? null,
    sent_by: profile.id,
    sent_by_name: profile.name,
  });

  revalidatePath(`/admin/crm/${contactId}`);

  if (result.error) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  return { ok: true };
}

/**
 * MSG-02/MSG-06 -- individual SMS send. Same awaited-inline discipline as
 * sendIndividualEmail (Pitfall 4). sendSingleSms() throws on any non-OK
 * Semaphore HTTP response (lib/sms/semaphore.ts), so this wraps the call in
 * try/catch to convert that into a logged "failed" messages row instead of
 * an unhandled rejection.
 */
export async function sendIndividualSms(
  contactId: string,
  values: { body: string }
): Promise<ActionResult> {
  const profile = await requirePermission("can_message_customers");

  const parsed = smsComposeSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  if (!contact.phone) {
    return { ok: false, error: "This contact has no phone number on file." };
  }

  let status: "sent" | "failed";
  let providerMessageId: string | null;

  try {
    const result = await sendSingleSms(contact.phone, parsed.data.body);
    status =
      result.status === "Failed" || result.status === "Refunded"
        ? "failed"
        : "sent";
    providerMessageId = result.message_id ?? null;
  } catch {
    status = "failed";
    providerMessageId = null;
  }

  await supabase.from("messages").insert({
    contact_id: contactId,
    channel: "sms",
    subject: null,
    body: parsed.data.body,
    status,
    provider_message_id: providerMessageId,
    sent_by: profile.id,
    sent_by_name: profile.name,
  });

  revalidatePath(`/admin/crm/${contactId}`);

  if (status === "failed") {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  return { ok: true };
}

/**
 * D-07 -- rolling 24h email quota remaining (Pitfall 1: matches Resend's
 * actual rolling-window enforcement, NOT a calendar-day boundary).
 */
export async function getRemainingEmailQuota(): Promise<number> {
  await requirePermission("can_message_customers");

  const supabase = await createClient();

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return Math.max(0, 100 - (count ?? 0));
}

/**
 * MSG-03/MSG-05/MSG-06 -- bulk email send. Re-queries contacts server-side
 * (T-04-10/D-03) rather than trusting the client-submitted id list, so a
 * stale client selection can never bypass the opted_out filter. Quota is
 * inlined here (not via getRemainingEmailQuota()) to avoid a second
 * requirePermission() round-trip.
 */
export async function sendBulkEmail(
  contactIds: string[],
  values: { subject: string; body: string }
): Promise<BulkSendResult> {
  const profile = await requirePermission("can_message_customers");

  const parsedIds = recipientIdsSchema.safeParse(contactIds);
  const parsedValues = emailComposeSchema.safeParse(values);
  if (!parsedIds.success || !parsedValues.success) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, name, email")
    .in("id", parsedIds.data)
    .eq("opted_out", false);

  if (contactsError || !contacts || contacts.length === 0) {
    return { ok: false, error: NO_ELIGIBLE_RECIPIENTS_MESSAGE };
  }

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const remaining = Math.max(0, 100 - (count ?? 0));

  if (contacts.length > remaining) {
    return {
      ok: false,
      error: `Sending to ${contacts.length} contacts would exceed today's email limit (${remaining} left). Try again tomorrow or select fewer contacts.`,
    };
  }

  const batchId = randomUUID();
  const origin = await getSiteOrigin();

  const items = contacts.map((contact) => ({
    to: contact.email,
    subject: parsedValues.data.subject,
    react: createElement(CustomerMessageEmail, {
      name: contact.name,
      body: applyNameTemplate(parsedValues.data.body, contact.name),
      unsubscribeUrl: `${origin}/unsubscribe?cid=${contact.id}&sig=${signContactId(contact.id)}`,
    }),
  }));

  let markAllStatus: "sent" | "failed";
  try {
    await sendBatchEmails(items);
    markAllStatus = "sent";
  } catch {
    markAllStatus = "failed";
  }

  await supabase.from("messages").insert(
    contacts.map((contact) => ({
      contact_id: contact.id,
      channel: "email",
      subject: parsedValues.data.subject,
      body: parsedValues.data.body,
      status: markAllStatus,
      batch_id: batchId,
      sent_by: profile.id,
      sent_by_name: profile.name,
    }))
  );

  revalidatePath("/admin/crm");

  return {
    ok: true,
    sent: markAllStatus === "sent" ? contacts.length : 0,
    failed: markAllStatus === "failed" ? contacts.length : 0,
    total: contacts.length,
  };
}

/**
 * MSG-04/MSG-05/MSG-06 -- bulk SMS send. Same server-side re-query
 * discipline as sendBulkEmail (D-03), plus a phone-required filter (contacts
 * with no phone are silently skipped -- the compose dialog warns about this
 * client-side already). No quota gate for SMS (D-07 is email-only,
 * pay-as-you-go per T-04-12's mitigation via the confirmation dialog).
 */
export async function sendBulkSms(
  contactIds: string[],
  values: { body: string }
): Promise<BulkSendResult> {
  const profile = await requirePermission("can_message_customers");

  const parsedIds = recipientIdsSchema.safeParse(contactIds);
  const parsedValues = smsComposeSchema.safeParse(values);
  if (!parsedIds.success || !parsedValues.success) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .in("id", parsedIds.data)
    .eq("opted_out", false)
    .not("phone", "is", null);

  if (contactsError || !contacts || contacts.length === 0) {
    return { ok: false, error: NO_ELIGIBLE_RECIPIENTS_MESSAGE };
  }

  const batchId = randomUUID();

  const statusByPhone = new Map<string, "sent" | "failed">();
  try {
    const results = await sendBulkSmsProvider(
      contacts.map((c) => c.phone!),
      parsedValues.data.body
    );
    for (const result of results) {
      statusByPhone.set(
        result.recipient,
        result.status === "Failed" || result.status === "Refunded"
          ? "failed"
          : "sent"
      );
    }
  } catch {
    for (const contact of contacts) {
      statusByPhone.set(contact.phone!, "failed");
    }
  }

  const rows = contacts.map((contact) => ({
    contact_id: contact.id,
    channel: "sms",
    subject: null,
    body: parsedValues.data.body,
    status: statusByPhone.get(contact.phone!) ?? "failed",
    batch_id: batchId,
    sent_by: profile.id,
    sent_by_name: profile.name,
  }));

  await supabase.from("messages").insert(rows);

  revalidatePath("/admin/crm");

  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return { ok: true, sent, failed, total: contacts.length };
}

/**
 * MSG-05 -- staff-manual opt-out toggle (the second of D-02's two opt-out
 * paths, alongside the self-service unsubscribe link in
 * app/unsubscribe/page.tsx). Gated on can_edit_crm (NOT
 * can_message_customers) since this is a contact-record edit, not a message
 * send, per 04-CONTEXT.md's explicit Claude's-Discretion note -- mirrors
 * updateStatus/updateContact in actions/crm.ts. Reuses the existing
 * "can_edit_crm can update contacts" RLS policy from 03-01; opted_out is
 * just another column on contacts, no new policy needed.
 */
export async function updateOptOut(
  contactId: string,
  optedOut: boolean
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const supabase = await createClient();

  const { error } = await supabase
    .from("contacts")
    .update({ opted_out: optedOut })
    .eq("id", contactId);

  if (error) {
    return { ok: false, error: OPT_OUT_ERROR_MESSAGE };
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${contactId}`);

  return { ok: true };
}
