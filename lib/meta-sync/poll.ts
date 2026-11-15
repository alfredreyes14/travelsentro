import "server-only";

import { FACEBOOK_PAGE_ID } from "@/lib/constants";
import { createServiceClient } from "@/lib/supabase/service";

import { newMessages, type GraphConversation } from "./chats";
import { pageTokenOrNull } from "./graph";
import { extractEmails, extractPhoneKeys } from "./parse";

/**
 * Reads new Messenger messages and applies them to the CRM, the no-App-Review
 * way: with the Page token the app can read the Page's own chats (the
 * Conversations API), just not label them. Run every 15 minutes by Vercel
 * Cron through /api/cron/messenger-sync, and once more right before the
 * daily follow-up emails.
 *
 * - Customer message: saves the chat for staff; links it to the contact
 *   whose email/phone it contains; a linked lead replying moves New/Lost ->
 *   Inquiry (record_messenger_inbound()).
 * - Staff message: a saved-reply phrase moves the lead forward, e.g. the
 *   prices message -> Quotation (record_messenger_staff_message()).
 *
 * Reads chats updated since the last run, with 2 minutes of overlap; every
 * step is safe to repeat, so the overlap can't double-apply anything.
 */

const GRAPH = "https://graph.facebook.com/v25.0";
const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const OVERLAP_MS = 2 * 60 * 1000;
const MAX_PAGES = 8; // 25 chats each; enough for any 15-minute window

export type MessengerSyncResult = {
  chatsRead: number;
  customerMessages: number;
  staffMessages: number;
  linked: number;
  movedToInquiry: number;
  movedBySavedReply: number;
  errors: number;
};

async function fetchConversations(token: string, since: Date): Promise<GraphConversation[]> {
  const fields =
    "id,link,updated_time,participants,messages.limit(25){id,message,created_time,from}";
  let url: string | null =
    `${GRAPH}/${FACEBOOK_PAGE_ID}/conversations?platform=messenger&limit=25&fields=${encodeURIComponent(fields)}`;
  const all: GraphConversation[] = [];

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Conversations API ${res.status}: ${(await res.text()).replace(/\d{6,}/g, "<id>").slice(0, 300)}`);
    }
    const body = (await res.json()) as { data: GraphConversation[]; paging?: { next?: string } };
    // Newest first: stop at the first chat untouched since the last run.
    const fresh = body.data.filter((c) => new Date(c.updated_time) > since);
    all.push(...fresh);
    url = fresh.length === body.data.length ? (body.paging?.next ?? null) : null;
  }
  return all;
}

export async function syncMessengerChats(): Promise<MessengerSyncResult> {
  const token = await pageTokenOrNull();
  if (!token) throw new Error("Messenger sync needs a Page token (MESSENGER_PAGE_ACCESS_TOKEN or META_SYSTEM_USER_TOKEN).");

  const supabase = createServiceClient();
  const startedAt = new Date();

  const { data: state } = await supabase
    .from("messenger_sync_state")
    .select("last_synced_at")
    .maybeSingle();
  const since = state?.last_synced_at
    ? new Date(new Date(state.last_synced_at).getTime() - OVERLAP_MS)
    : new Date(startedAt.getTime() - FIRST_RUN_LOOKBACK_MS);

  const conversations = await fetchConversations(token, since);
  const messages = newMessages(conversations, FACEBOOK_PAGE_ID, since);

  const result: MessengerSyncResult = {
    chatsRead: conversations.length,
    customerMessages: 0,
    staffMessages: 0,
    linked: 0,
    movedToInquiry: 0,
    movedBySavedReply: 0,
    errors: 0,
  };

  for (const m of messages) {
    if (m.fromCustomer) {
      result.customerMessages += 1;
      const { data, error } = await supabase.rpc("record_messenger_inbound", {
        p_psid: m.psid,
        p_name: m.name,
        p_snippet: m.text.replace(/\s+/g, " ").trim().slice(0, 100),
        p_emails: extractEmails(m.text),
        p_phone_keys: extractPhoneKeys(m.text),
        p_chat_link: m.chatLink,
        p_sent_at: m.sentAt,
      });
      if (error) {
        result.errors += 1;
        console.error("record_messenger_inbound failed:", error.message);
        continue;
      }
      if (data?.[0]?.linked_now) result.linked += 1;
      if (data?.[0]?.moved_to) result.movedToInquiry += 1;
    } else {
      result.staffMessages += 1;
      const { data, error } = await supabase.rpc("record_messenger_staff_message", {
        p_psid: m.psid,
        p_name: m.name,
        p_text: m.text,
        p_chat_link: m.chatLink,
        p_sent_at: m.sentAt,
      });
      if (error) {
        result.errors += 1;
        console.error("record_messenger_staff_message failed:", error.message);
        continue;
      }
      if (data) result.movedBySavedReply += 1;
    }
  }

  const { error: stateError } = await supabase
    .from("messenger_sync_state")
    .update({
      last_synced_at: startedAt.toISOString(),
      last_result: result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (stateError) console.error("messenger_sync_state update failed:", stateError.message);

  console.log("Messenger sync:", result);
  return result;
}
