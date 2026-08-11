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
 * referral itself (the m.me click, or -- for a visitor's very first-ever
 * interaction with the Page -- the "Get Started" postback that carries
 * the same referral data) -- never to anything typed afterward, per this
 * feature's "greeting only" scope decision. Meta requires a 200 response
 * within 5 seconds, so the actual send is deferred via after() -- ack
 * first, send second, matching app/api/inquiries/route.ts's D-02
 * discipline of never blocking the response on a side effect.
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

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const referral = event.referral ?? event.postback?.referral;

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
