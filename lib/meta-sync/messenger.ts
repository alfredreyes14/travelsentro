import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

import { messengerUserName, pageTokenOrNull } from "./graph";
import { extractEmails, extractPhoneKeys } from "./parse";

/**
 * The webhook's database side (app/api/messenger/webhook/route.ts). Each
 * helper logs its own failures and never throws: the webhook has already
 * answered Meta by the time these run.
 */

export type MessengerWebhookPayload = {
  entry?: Array<{
    messaging?: Array<{
      sender?: { id?: string };
      referral?: { ref?: string };
      postback?: { referral?: { ref?: string } };
      message?: { text?: string; is_echo?: boolean; referral?: { ref?: string } };
    }>;
    changes?: Array<{
      field?: string;
      value?: {
        action?: string;
        label?: { id?: string; page_label_name?: string };
        user?: { id?: string };
      };
    }>;
  }>;
};

export async function recordInboundMessage(psid: string, text: string): Promise<void> {
  try {
    const supabase = createServiceClient();

    // Fetch a display name once per chat, so staff can recognise it.
    const { data: thread } = await supabase
      .from("messenger_threads")
      .select("name")
      .eq("psid", psid)
      .maybeSingle();
    let name: string | null = thread?.name ?? null;
    if (!name) {
      const token = await pageTokenOrNull();
      if (token) name = await messengerUserName(token, psid);
    }

    const { error } = await supabase.rpc("record_messenger_inbound", {
      p_psid: psid,
      p_name: name,
      p_snippet: text.replace(/\s+/g, " ").trim().slice(0, 100),
      p_emails: extractEmails(text),
      p_phone_keys: extractPhoneKeys(text),
    });
    if (error) console.error("record_messenger_inbound failed:", error.message);
  } catch (err) {
    console.error("Recording a Messenger message failed:", err);
  }
}

/** Links the chat to the follow-up's contact; returns their package name. */
export async function linkFollowUpChat(psid: string, token: string): Promise<string | null> {
  try {
    const { data, error } = await createServiceClient().rpc("link_messenger_by_token", {
      p_psid: psid,
      p_token: token,
    });
    if (error) console.error("link_messenger_by_token failed:", error.message);
    return data?.[0]?.package_name ?? null;
  } catch (err) {
    console.error("Linking a follow-up chat failed:", err);
    return null;
  }
}

export async function applyInboxStage(psid: string, stage: string): Promise<void> {
  try {
    const { error } = await createServiceClient().rpc("apply_inbox_stage", {
      p_psid: psid,
      p_stage: stage,
    });
    if (error) console.error("apply_inbox_stage failed:", error.message);
  } catch (err) {
    console.error("Applying an inbox stage label failed:", err);
  }
}
