import type { Metadata } from "next";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CrmContactsView } from "@/components/admin/crm-contacts-view";
import type { AdminContactListItem } from "@/components/admin/crm-table";
import { toServiceKeys } from "@/lib/crm/services";
import { isClientType, toClientType, toContactStage } from "@/lib/crm/stage";
import { isMetaLeadSyncEnabled } from "@/lib/meta-leads/run-sync";
import { toFollowUpProgress } from "@/lib/follow-ups/progress";
import {
  followUpMessengerTemplate,
  MESSENGER_FOLLOW_UP_GAP_DAYS,
  MESSENGER_WINDOW_DAYS,
  toFollowUpSequence,
} from "@/lib/follow-ups/templates";
import { applyNameTemplate } from "@/lib/crm/messages";
import { chatUrl } from "@/lib/meta-sync/chats";
import { MessengerTodo } from "@/components/admin/messenger-todo";

export const metadata: Metadata = {
  title: "Leads | TravelSentro Admin",
};

// Covers the "Sync Meta leads" Server Action (same limit as the cron route).
export const maxDuration = 60;

type MessengerDueRow = {
  contact_id: string;
  name: string;
  sequence: string;
  next_step: number;
  chat_link: string | null;
};

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  // CRM-03: read access is universal for every authenticated Staff/Admin,
  // regardless of can_edit_crm -- session validation only, no permission
  // gate. can_edit_crm only decides whether "Add Contact" shows.
  const profile = await getProfile();
  const { type } = await searchParams;

  const supabase = await createClient();

  const [contactsResult, activityResult, progressResult, chatsResult, messengerDueResult] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, name, email, phone, client_type, stage, tags, opted_out, services_availed, services_other, rep_name, contract_end, created_at, quote_suggested_at"
      )
      .order("created_at", { ascending: false }),
    // Latest inquiry and latest contact per lead (a view; see
    // 20261115120000_lead_contact_tracking.sql).
    supabase
      .from("contact_last_activity")
      .select("contact_id, last_inquiry_at, last_contacted_at"),
    // Only contacts that got a follow-up in their current stage have a badge.
    supabase
      .from("follow_up_progress")
      .select("contact_id, sequence, sent_count, clicked")
      .gt("sent_count", 0),
    // Messenger to-do: chats nobody matched to a lead yet...
    supabase
      .from("messenger_threads")
      .select("psid, name, last_snippet, last_inbound_at, chat_link")
      .is("contact_id", null)
      .is("ignored_at", null)
      .not("last_inbound_at", "is", null)
      .order("last_inbound_at", { ascending: false })
      .limit(30),
    // ...and leads without an email whose Messenger follow-up is due.
    supabase.rpc("list_due_messenger_follow_ups", {
      p_gap_days: [...MESSENGER_FOLLOW_UP_GAP_DAYS],
      p_window_days: MESSENGER_WINDOW_DAYS,
    }),
  ]);
  if (chatsResult.error) console.error("Failed to load Messenger chats:", chatsResult.error.message);
  if (messengerDueResult.error) {
    console.error("Failed to load Messenger follow-ups:", messengerDueResult.error.message);
  }
  const { data: contacts, error } = contactsResult;

  if (error) {
    console.error("Failed to load contacts:", error.message);
  }
  if (activityResult.error) {
    console.error("Failed to load lead activity dates:", activityResult.error.message);
  }
  if (progressResult.error) {
    console.error("Failed to load follow-up progress:", progressResult.error.message);
  }
  const progressById = new Map(
    (progressResult.data ?? []).map((row) => [row.contact_id, toFollowUpProgress(row)])
  );
  const activityById = new Map(
    (activityResult.data ?? []).map((row) => [row.contact_id, row])
  );

  const items: AdminContactListItem[] = (contacts ?? []).map((contact) => {
    const clientType = toClientType(contact.client_type);
    const activity = activityById.get(contact.id);
    return {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      clientType,
      stage: toContactStage(clientType, contact.stage),
      followUp: progressById.get(contact.id),
      tags: contact.tags,
      opted_out: contact.opted_out,
      servicesAvailed: toServiceKeys(contact.services_availed),
      servicesOther: contact.services_other,
      repName: contact.rep_name,
      contractEnd: contact.contract_end,
      createdAt: contact.created_at,
      lastInquiryAt: activity?.last_inquiry_at ?? null,
      lastContactedAt: activity?.last_contacted_at ?? null,
      quoteSuggestedAt: contact.quote_suggested_at,
    };
  });

  const canEdit = profile.role === "admin" || profile.can_edit_crm;
  const todo = (
    <MessengerTodo
      suggestions={items
        .filter((c) => c.quoteSuggestedAt)
        .map((c) => ({ contactId: c.id, name: c.name, at: c.quoteSuggestedAt! }))}
      chats={(chatsResult.data ?? []).map((row) => ({
        psid: row.psid,
        name: row.name,
        snippet: row.last_snippet,
        lastInboundAt: row.last_inbound_at,
        chatUrl: chatUrl(row.chat_link),
      }))}
      followUps={((messengerDueResult.data ?? []) as MessengerDueRow[]).map((row) => {
        const sequence = toFollowUpSequence(row.sequence);
        return {
          contactId: row.contact_id,
          name: row.name,
          sequence,
          step: row.next_step,
          message: applyNameTemplate(followUpMessengerTemplate(sequence, row.next_step), row.name),
          chatUrl: chatUrl(row.chat_link),
        };
      })}
      leads={items.map((c) => ({ id: c.id, name: c.name, detail: c.email ?? c.phone }))}
      canEdit={canEdit}
      canMessage={profile.role === "admin" || profile.can_message_customers}
    />
  );

  return (
    <CrmContactsView
      contacts={items}
      initialType={isClientType(type) ? type : "b2c"}
      canEdit={canEdit}
      todoSlot={todo}
      metaLeadSyncEnabled={isMetaLeadSyncEnabled()}
    />
  );
}
