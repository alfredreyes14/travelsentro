import { after } from "next/server";

import { FACEBOOK_PAGE_ID } from "@/lib/constants";
import { sendInternalNotificationEmails } from "@/lib/crm/notify-staff";
import { fetchFormName, fetchLead, getLeadsAccessToken } from "@/lib/meta-leads/graph";
import { extractLeadgenChanges, parseMetaLead, type LeadgenChange } from "@/lib/meta-leads/lead";
import { recordMetaLead } from "@/lib/meta-leads/record";
import { GENERAL_MESSENGER_REF } from "@/lib/messenger/link";
import { buildGreeting, sendMessengerText, verifySignature } from "@/lib/messenger/webhook";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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
 * A lead ad submission: Meta's webhook only carries the leadgen ID, so the
 * answers are fetched from the Graph API, saved via record_meta_lead()
 * (idempotent, so a redelivery is harmless) and, for a lead not seen
 * before, staff are emailed like for a website inquiry. A failure here is
 * only logged -- `npm run import:meta-leads` re-pulls anything missed.
 */
async function syncLead(change: LeadgenChange, origin: string): Promise<void> {
  const token = getLeadsAccessToken();
  const lead = await fetchLead(change.leadgen_id, token);
  const formId = lead.form_id ?? change.form_id;
  const formName = formId ? await fetchFormName(formId, token) : null;
  const parsed = parseMetaLead(lead, formName);

  const result = await recordMetaLead(createServiceClient(), parsed);
  console.log("Meta lead synced:", {
    leadgenId: parsed.leadgenId,
    isNew: result.isNew,
  });

  if (result.isNew) {
    const source = `Meta lead ad${formName ? ` (${formName})` : ""}`;
    await sendInternalNotificationEmails({
      name: parsed.name ?? "Facebook lead",
      email: parsed.email ?? "",
      phone: parsed.phone ?? "",
      message: parsed.message ? `${source}\n\n${parsed.message}` : source,
      crmUrl: `${origin}/admin/crm/${result.contactId}`,
    });
  }
}

/**
 * Handles lead ad submissions (see syncLead) and Messenger click/message
 * events. For Messenger it only ever reacts to the
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

  // Lead ad submissions arrive on this same endpoint: Meta allows one
  // callback URL per app for all Page webhook fields, so `leadgen` shares it
  // with the Messenger fields.
  const origin = new URL(request.url).origin;
  for (const change of extractLeadgenChanges(payload)) {
    if (change.page_id && change.page_id !== FACEBOOK_PAGE_ID) {
      console.warn("Meta leadgen event for an unknown page ignored:", change.page_id);
      continue;
    }
    after(async () => {
      try {
        await syncLead(change, origin);
      } catch (err) {
        console.error("Meta lead sync failed", { leadgenId: change.leadgen_id, err });
      }
    });
  }

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const referral =
        event.referral ?? event.postback?.referral ?? event.message?.referral;

      // Delivery-shape diagnostic. Deliberately PII-free: no sender PSID,
      // no message text, no raw payload -- an earlier version logged the
      // whole body and put real customers' PSIDs and message contents in
      // Vercel logs. `ref` is safe to keep: it's an internal package slug,
      // never customer data, and hasReferral is the single field that
      // explains the common "clicked the button, got no greeting" report
      // (a link built without a packageSlug carries no ref, so Meta sends
      // no referral and the event is skipped just below).
      console.log("Messenger webhook event:", {
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
          const packageName =
            ref && ref !== GENERAL_MESSENGER_REF
              ? await lookupPackageName(ref)
              : null;
          await sendMessengerText(senderId, buildGreeting(packageName));
        } catch (err) {
          console.error("Messenger auto-greeting failed", err);
        }
      });
    }
  }

  return Response.json({ ok: true });
}
