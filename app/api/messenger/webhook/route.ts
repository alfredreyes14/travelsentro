import { after } from "next/server";

import { FACEBOOK_PAGE_ID } from "@/lib/constants";
import { FOLLOW_UP_REF_PREFIX, GENERAL_MESSENGER_REF } from "@/lib/messenger/link";
import {
  applyInboxStage,
  linkFollowUpChat,
  recordInboundMessage,
  type MessengerWebhookPayload,
} from "@/lib/meta-sync/messenger";
import { flushMetaOutboxSafely } from "@/lib/meta-sync/schedule";
import { isLabelRemoval, stageForLabel } from "@/lib/meta-sync/stages";
import { buildGreeting, sendMessengerText, verifySignature } from "@/lib/messenger/webhook";
import { createClient } from "@/lib/supabase/server";

/**
 * Meta's one-time webhook verification handshake (Messenger Platform docs):
 * echo back hub.challenge only if hub.verify_token matches what's
 * configured in the Meta App Dashboard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    token === process.env.MESSENGER_VERIFY_TOKEN
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

async function lookupPackageName(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("name")
    .eq("slug", slug)
    .eq("is_published", true)
    .is("deleted_at", null)
    .maybeSingle();

  return data?.name ?? null;
}

/**
 * Handles Messenger webhook events. Meta requires a 200 within 5 seconds,
 * so everything that calls out (greeting, database, Meta) runs in after():
 * ack first, work second.
 *
 * 1. Referrals -- the auto-greeting. Meta delivers an m.me click's ref as
 *    a bare `referral` event (existing thread), inside the "Get Started"
 *    `postback.referral` (brand-new thread), or as `message.referral` on a
 *    message sent shortly after the click; all three are treated alike.
 *    A ref of fu_<token> comes from a follow-up email's "Chat on
 *    Messenger" button: it links the chat to that contact and greets them
 *    with their package (lib/meta-sync).
 * 2. Customer messages -- saved so staff can link the chat; auto-linked
 *    when the message holds the contact's email or phone; a linked lead
 *    who writes again moves from New/Lost to Inquiry.
 * 3. inbox_labels changes -- a stage label staff put on a chat sets the
 *    contact's CRM stage.
 * Plain typed messages still never get a bot reply.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.MESSENGER_APP_SECRET;

  if (!appSecret || !verifySignature(rawBody, signature, appSecret)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: MessengerWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MessengerWebhookPayload;
  } catch (err) {
    console.error("Messenger webhook: malformed JSON body", err);
    return Response.json({ ok: true });
  }

  // Run in order after the response: CRM writes first, then the Meta sync
  // that sends what they queued.
  const tasks: Array<() => Promise<void>> = [];
  let touchedCrm = false;

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const referral =
        event.referral ?? event.postback?.referral ?? event.message?.referral;
      const isCustomerMessage =
        Boolean(event.message) && !event.message?.is_echo && senderId !== FACEBOOK_PAGE_ID;

      // Delivery-shape diagnostic. Deliberately PII-free: no sender PSID,
      // no message text, no raw payload. `ref` is safe to keep when it's
      // an internal package slug; follow-up refs (fu_<token>) are logged
      // only as "follow-up", since a token links to a contact.
      console.log("Messenger webhook event:", {
        hasReferral: Boolean(referral),
        ref: referral?.ref?.startsWith(FOLLOW_UP_REF_PREFIX) ? "follow-up" : referral?.ref,
        hasMessage: Boolean(event.message),
        hasPostback: Boolean(event.postback),
      });

      if (!senderId) continue;

      if (isCustomerMessage && event.message?.text !== undefined) {
        const text = event.message.text ?? "";
        touchedCrm = true;
        tasks.push(() => recordInboundMessage(senderId, text));
      }

      if (!referral) continue;

      const ref = referral.ref;
      tasks.push(async () => {
        try {
          let packageName: string | null = null;
          if (ref?.startsWith(FOLLOW_UP_REF_PREFIX)) {
            packageName = await linkFollowUpChat(senderId, ref.slice(FOLLOW_UP_REF_PREFIX.length));
          } else if (ref && ref !== GENERAL_MESSENGER_REF) {
            packageName = await lookupPackageName(ref);
          }
          await sendMessengerText(senderId, buildGreeting(packageName));
        } catch (err) {
          console.error("Messenger auto-greeting failed", err);
        }
      });
      if (ref?.startsWith(FOLLOW_UP_REF_PREFIX)) touchedCrm = true;
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "inbox_labels") continue;
      const value = change.value ?? {};
      const psid = value.user?.id;
      const labelName = value.label?.page_label_name;
      // Confirms the real action values in the logs (no PII).
      console.log("Messenger inbox label change:", {
        action: value.action,
        isStageLabel: stageForLabel(labelName) !== null,
      });
      if (!psid || isLabelRemoval(value.action)) continue;
      const stage = stageForLabel(labelName);
      if (!stage) continue;
      touchedCrm = true;
      tasks.push(() => applyInboxStage(psid, stage));
    }
  }

  if (tasks.length > 0) {
    after(async () => {
      for (const task of tasks) await task();
      if (touchedCrm) await flushMetaOutboxSafely();
    });
  }

  return Response.json({ ok: true });
}
