"use server";

import { revalidatePath } from "next/cache";

import { linkMessengerChat } from "@/actions/messenger-link";
import type { ActionResult } from "@/lib/action-result";
import { requirePermission } from "@/lib/auth/dal";
import { nextFollowUps } from "@/lib/follow-ups/send";
import {
  followUpMessengerTemplate,
  MESSENGER_FOLLOW_UP_GAP_DAYS,
} from "@/lib/follow-ups/templates";
import { applyNameTemplate } from "@/lib/crm/messages";
import { scheduleMetaSync } from "@/lib/meta-sync/schedule";
import { createClient } from "@/lib/supabase/server";

/**
 * The Leads page's "Messenger to-do" (components/admin/messenger-todo.tsx):
 *   - "Mark as Quotation?" -- staff sent a picture in a lead's chat;
 *   - chats not matched yet -- match to a lead, add as a new lead, or mark
 *     "not a lead";
 *   - follow ups to send on Messenger -- for leads without an email, which
 *     staff send by hand and mark sent here.
 * See supabase/migrations/20261117120000_messenger_leads.sql.
 */

const ERROR = "Something went wrong. Please try again.";

function done(path = "/admin/crm") {
  revalidatePath(path, "layout");
}

// ------------------------------------------------ Mark as Quotation?

export async function confirmQuoteSuggestion(contactId: string): Promise<ActionResult> {
  await requirePermission("can_edit_crm");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ stage: "quotation" })
    .eq("id", contactId)
    .eq("client_type", "b2c")
    .in("stage", ["new", "inquiry", "lost"])
    .select("id");
  if (error) {
    console.error("confirmQuoteSuggestion failed:", error.message);
    return { ok: false, error: ERROR };
  }
  if (!data?.length) {
    // Already moved on (e.g. someone confirmed it a moment ago): just clear.
    await supabase.from("contacts").update({ quote_suggested_at: null }).eq("id", contactId);
  }
  scheduleMetaSync();
  done();
  return { ok: true };
}

export async function dismissQuoteSuggestion(contactId: string): Promise<ActionResult> {
  await requirePermission("can_edit_crm");
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ quote_suggested_at: null })
    .eq("id", contactId);
  if (error) {
    console.error("dismissQuoteSuggestion failed:", error.message);
    return { ok: false, error: ERROR };
  }
  done();
  return { ok: true };
}

// ------------------------------------------------ Chats not matched yet

export async function matchChatToLead(psid: string, contactId: string): Promise<ActionResult> {
  const result = await linkMessengerChat(contactId, psid);
  if (result.ok) done();
  return result;
}

export type AddLeadResult = { ok: true; id: string } | { ok: false; error: string };

export async function addLeadFromChat(psid: string): Promise<AddLeadResult> {
  await requirePermission("can_edit_crm");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_lead_from_chat", { p_psid: psid });
  if (error) {
    console.error("add_lead_from_chat failed:", error.message);
    return { ok: false, error: ERROR };
  }
  if (!data) {
    return { ok: false, error: "That chat is already matched to a lead." };
  }
  scheduleMetaSync();
  done();
  return { ok: true, id: data };
}

export async function markChatNotALead(psid: string): Promise<ActionResult> {
  await requirePermission("can_edit_crm");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_messenger_thread_ignored", {
    p_psid: psid,
    p_ignored: true,
  });
  if (error) {
    console.error("set_messenger_thread_ignored failed:", error.message);
    return { ok: false, error: ERROR };
  }
  done();
  return { ok: true };
}

// ------------------------------------------------ Follow up on Messenger

export type MessengerFollowUpItem = {
  contactId: string;
  name: string;
  sequence: "no_reply" | "quote";
  step: number;
  message: string;
  chatUrl: string | null;
};

/**
 * Staff sent the follow-up in Messenger: log it as that lead's next
 * follow-up (channel "messenger"). The step is worked out again here, so
 * two staff clicking at once can't log the same step twice.
 */
export async function markMessengerFollowUpSent(contactId: string): Promise<ActionResult> {
  const profile = await requirePermission("can_message_customers");
  const supabase = await createClient();

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, name, opted_out")
    .eq("id", contactId)
    .single();
  if (contactError || !contact) return { ok: false, error: ERROR };
  if (contact.opted_out) {
    return { ok: false, error: "This lead unsubscribed, so follow-ups have stopped." };
  }

  const next = (await nextFollowUps(supabase, [contactId])).get(contactId);
  if (!next || next.step > MESSENGER_FOLLOW_UP_GAP_DAYS.length) {
    return { ok: false, error: "All Messenger follow-ups for this lead are already sent." };
  }

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      contact_id: contactId,
      channel: "messenger",
      subject: null,
      body: applyNameTemplate(followUpMessengerTemplate(next.sequence, next.step), contact.name),
      status: "sent",
      kind: "follow_up",
      follow_up_sequence: next.sequence,
      follow_up_step: next.step,
      sent_by: profile.id,
      sent_by_name: profile.name,
    })
    .select("id");
  if (error) {
    console.error("markMessengerFollowUpSent failed:", error.message);
    return { ok: false, error: ERROR };
  }

  await supabase.rpc("mark_follow_ups_sent", {
    p_message_ids: (inserted ?? []).map((row) => row.id),
  });
  scheduleMetaSync();
  done();
  revalidatePath(`/admin/crm/${contactId}`);
  return { ok: true };
}
