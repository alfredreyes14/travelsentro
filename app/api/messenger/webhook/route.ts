import { after } from "next/server";

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
 * Handles Messenger click/message events. Only ever reacts to the
 * referral itself -- the m.me click on a brand-new thread (delivered as a
 * bare `referral` event), the "Get Started" postback for a visitor's
 * very first-ever interaction (`postback.referral`), or, confirmed via
 * live testing, a regular message sent in an *already-existing*
 * conversation shortly after a fresh m.me click, which Meta delivers as
 * a normal message event carrying `message.referral` instead of a
 * standalone referral event. All three shapes are treated identically;
 * anything with no referral in any of these three locations is still
 * silently ignored, so a plain typed message with no referral context
 * never gets a reply, per this feature's "greeting only" scope decision.
 * Meta requires a 200 response within 5 seconds, so the actual send is
 * deferred via after() -- ack first, send second, matching
 * app/api/inquiries/route.ts's D-02 discipline of never blocking the
 * response on a side effect.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const appSecret = process.env.MESSENGER_APP_SECRET;

  if (!appSecret || !verifySignature(rawBody, signature, appSecret)) {
    return new Response("Forbidden", { status: 403 });
  }

  type WebhookPayload = {
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string };
        referral?: { ref?: string };
        postback?: { referral?: { ref?: string } };
        message?: { referral?: { ref?: string } };
      }>;
    }>;
  };

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch (err) {
    console.error("Messenger webhook: malformed JSON body", err);
    return Response.json({ ok: true });
  }

  // TEMPORARY DIAGNOSTIC (remove once live delivery shape is confirmed):
  // logs the raw event shape so we can see exactly what Meta sends for a
  // real click/message, since dashboard "Test" tools have proven unreliable
  // as a stand-in for real delivery.
  console.log("Messenger webhook raw payload:", rawBody);

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const referral =
        event.referral ?? event.postback?.referral ?? event.message?.referral;

      // TEMPORARY DIAGNOSTIC (remove once live delivery shape is confirmed):
      console.log("Messenger webhook event:", {
        senderId,
        hasReferral: Boolean(referral),
        ref: referral?.ref,
        hasMessage: Boolean(event.message),
        hasPostback: Boolean(event.postback),
      });

      if (!senderId || !referral) {
        continue;
      }

      const ref = referral.ref;

      after(async () => {
        try {
          const packageName = ref ? await lookupPackageName(ref) : null;
          await sendMessengerText(senderId, buildGreeting(packageName));
        } catch (err) {
          console.error("Messenger auto-greeting failed", err);
        }
      });
    }
  }

  return Response.json({ ok: true });
}
