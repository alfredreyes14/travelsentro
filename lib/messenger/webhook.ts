import crypto from "node:crypto";

import { FACEBOOK_PAGE_ID } from "@/lib/constants";

/**
 * The one auto-reply this bot ever sends -- one message per Messenger
 * click, then silence (staff take over manually). packageName is the
 * package's real display name, already resolved from the link's slug by
 * the caller (app/api/messenger/webhook/route.ts) -- this function never
 * sees the slug/product-code itself.
 */
export function buildGreeting(packageName: string | null): string {
  return packageName
    ? `Hi! Thanks for your interest in the ${packageName} package. One of our team members will get back to you shortly \u{1F60A}`
    : "Hi! Thanks for reaching out, we'll get back to you shortly \u{1F60A}";
}

/**
 * Confirms an incoming webhook POST genuinely came from Meta, per the
 * Messenger Platform's documented X-Hub-Signature-256 scheme: HMAC-SHA256
 * of the raw (unparsed) request body, keyed with the app secret. Must run
 * against the raw body string, not the parsed JSON -- re-serializing JSON
 * is not guaranteed byte-identical to what Meta signed.
 *
 * crypto.timingSafeEqual requires equal-length buffers, hence the length
 * check first -- a length mismatch is simply "not a match," not an error.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

const GRAPH_API_VERSION = "v25.0";

/**
 * Thin fetch-based Messenger Send API wrapper (server-only -- no official
 * Node SDK exists, mirrors lib/sms/semaphore.ts's callSemaphore). Reads
 * MESSENGER_PAGE_ACCESS_TOKEN internally rather than taking it as a
 * parameter, same discipline as callSemaphore reading SEMAPHORE_API_KEY.
 */
export async function sendMessengerText(
  recipientId: string,
  text: string
): Promise<void> {
  const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Messenger is not configured: MESSENGER_PAGE_ACCESS_TOKEN is unset."
    );
  }

  const endpoint = `https://graph.facebook.com/${GRAPH_API_VERSION}/${FACEBOOK_PAGE_ID}/messages?access_token=${encodeURIComponent(token)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Messenger Send API error: ${res.status} ${body}`);
  }
}
