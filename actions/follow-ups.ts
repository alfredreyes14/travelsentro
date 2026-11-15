"use server";

import { revalidatePath } from "next/cache";

import { getSiteOrigin } from "@/actions/auth";
import type { BulkSendResult } from "@/actions/messages";
import type { ActionResult } from "@/lib/action-result";
import { requirePermission } from "@/lib/auth/dal";
import { withEmail } from "@/lib/crm/contact-label";
import { remainingEmailQuota } from "@/lib/crm/email-quota";
import {
  emailComposeSchema,
  recipientIdsSchema,
  smsComposeSchema,
} from "@/lib/crm/message-schema";
import {
  FIRST_FOLLOW_UP,
  latestPackageNames,
  nextFollowUps,
  sendFollowUpEmails,
  sendFollowUpSms,
  type FollowUpSummary,
} from "@/lib/follow-ups/send";
import {
  followUpEmailTemplate,
  followUpSmsTemplate,
} from "@/lib/follow-ups/templates";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff-sent follow-ups: the same compose flow as actions/messages.ts, but
 * every email carries tracked Messenger/WhatsApp buttons (every text, a
 * tracked link). Each is logged as the next step of the contact's current
 * sequence (lib/follow-ups/templates.ts), so it counts toward the automatic
 * 4. A click moves the lead on (see the lead_follow_ups migration).
 *
 * Like other individual sends, an individual follow-up ignores opted_out;
 * bulk follow-ups skip opted-out contacts.
 *
 * Bulk sends take `values: null` to give each contact their own next
 * follow-up message, so contacts at different steps never get a repeat;
 * or one custom message for everyone.
 */

const SEND_ERROR_MESSAGE = "Couldn't send the follow-up. Please try again.";
const NO_ELIGIBLE_RECIPIENTS_MESSAGE =
  "No eligible contacts to follow up — all selected contacts are opted out or missing the required contact info.";

// Each follow-up text is its own Semaphore call (own link), so bulk texts
// are capped to keep one action inside the function time limit.
const MAX_BULK_SMS = 100;

function toBulkResult(summary: FollowUpSummary): BulkSendResult {
  return { ok: true, ...summary };
}

export async function sendFollowUpEmail(
  contactId: string,
  values: { subject: string; body: string }
): Promise<ActionResult> {
  const profile = await requirePermission("can_message_customers");

  const parsed = emailComposeSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: SEND_ERROR_MESSAGE };

  const supabase = await createClient();
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id, name, email")
    .eq("id", contactId)
    .single();
  if (error || !contact) return { ok: false, error: SEND_ERROR_MESSAGE };
  if (!contact.email?.trim()) {
    return { ok: false, error: "This contact has no email address on file." };
  }

  if ((await remainingEmailQuota(supabase)) < 1) {
    return { ok: false, error: "Today's email limit is used up. Try again tomorrow." };
  }

  const next = (await nextFollowUps(supabase, [contact.id])).get(contact.id) ?? FIRST_FOLLOW_UP;
  const summary = await sendFollowUpEmails({
    supabase,
    items: [
      {
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        ...next,
        ...parsed.data,
      },
    ],
    sender: { id: profile.id, name: profile.name },
    origin: await getSiteOrigin(),
  });

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${contact.id}`);
  return summary.sent === 1 ? { ok: true } : { ok: false, error: SEND_ERROR_MESSAGE };
}

export async function sendBulkFollowUpEmail(
  contactIds: string[],
  values: { subject: string; body: string } | null
): Promise<BulkSendResult> {
  const profile = await requirePermission("can_message_customers");

  const parsedIds = recipientIdsSchema.safeParse(contactIds);
  const parsedValues = values === null ? null : emailComposeSchema.safeParse(values);
  if (!parsedIds.success || (parsedValues && !parsedValues.success)) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }
  const custom = parsedValues?.data ?? null;

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("contacts")
    .select("id, name, email")
    .in("id", parsedIds.data)
    .eq("opted_out", false)
    .not("email", "is", null);
  const contacts = withEmail(rows ?? []);
  if (error || contacts.length === 0) {
    return { ok: false, error: NO_ELIGIBLE_RECIPIENTS_MESSAGE };
  }

  const remaining = await remainingEmailQuota(supabase);
  if (contacts.length > remaining) {
    return {
      ok: false,
      error: `Sending to ${contacts.length} contacts would exceed today's email limit (${remaining} left). Try again tomorrow or select fewer contacts.`,
    };
  }

  const ids = contacts.map((c) => c.id);
  const [nextById, packageNames] = await Promise.all([
    nextFollowUps(supabase, ids),
    custom ? Promise.resolve(new Map<string, string>()) : latestPackageNames(supabase, ids),
  ]);
  const summary = await sendFollowUpEmails({
    supabase,
    items: contacts.map((c) => {
      const next = nextById.get(c.id) ?? FIRST_FOLLOW_UP;
      return {
        contactId: c.id,
        name: c.name,
        email: c.email,
        ...next,
        ...(custom ??
          followUpEmailTemplate(next.sequence, next.step, packageNames.get(c.id))),
      };
    }),
    sender: { id: profile.id, name: profile.name },
    origin: await getSiteOrigin(),
  });

  revalidatePath("/admin/crm");
  return toBulkResult(summary);
}

export async function sendFollowUpText(
  contactId: string,
  values: { body: string }
): Promise<ActionResult> {
  const profile = await requirePermission("can_message_customers");

  const parsed = smsComposeSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: SEND_ERROR_MESSAGE };

  const supabase = await createClient();
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .eq("id", contactId)
    .single();
  if (error || !contact) return { ok: false, error: SEND_ERROR_MESSAGE };
  if (!contact.phone) {
    return { ok: false, error: "This contact has no phone number on file." };
  }

  const next = (await nextFollowUps(supabase, [contact.id])).get(contact.id) ?? FIRST_FOLLOW_UP;
  const summary = await sendFollowUpSms({
    supabase,
    items: [
      {
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        ...next,
        body: parsed.data.body,
      },
    ],
    sender: { id: profile.id, name: profile.name },
    origin: await getSiteOrigin(),
  });

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${contact.id}`);
  return summary.sent === 1 ? { ok: true } : { ok: false, error: SEND_ERROR_MESSAGE };
}

export async function sendBulkFollowUpText(
  contactIds: string[],
  values: { body: string } | null
): Promise<BulkSendResult> {
  const profile = await requirePermission("can_message_customers");

  const parsedIds = recipientIdsSchema.safeParse(contactIds);
  const parsedValues = values === null ? null : smsComposeSchema.safeParse(values);
  if (!parsedIds.success || (parsedValues && !parsedValues.success)) {
    return { ok: false, error: SEND_ERROR_MESSAGE };
  }
  const customBody = parsedValues?.data?.body ?? null;

  const supabase = await createClient();
  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .in("id", parsedIds.data)
    .eq("opted_out", false)
    .not("phone", "is", null);
  if (error || !contacts || contacts.length === 0) {
    return { ok: false, error: NO_ELIGIBLE_RECIPIENTS_MESSAGE };
  }
  if (contacts.length > MAX_BULK_SMS) {
    return {
      ok: false,
      error: `Follow-up texts go out one by one, so send to at most ${MAX_BULK_SMS} contacts at a time (${contacts.length} selected).`,
    };
  }

  const nextById = await nextFollowUps(
    supabase,
    contacts.map((c) => c.id)
  );
  const summary = await sendFollowUpSms({
    supabase,
    items: contacts.map((c) => {
      const next = nextById.get(c.id) ?? FIRST_FOLLOW_UP;
      return {
        contactId: c.id,
        name: c.name,
        phone: c.phone!,
        ...next,
        body: customBody ?? followUpSmsTemplate(next.sequence, next.step),
      };
    }),
    sender: { id: profile.id, name: profile.name },
    origin: await getSiteOrigin(),
  });

  revalidatePath("/admin/crm");
  return toBulkResult(summary);
}
