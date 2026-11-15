import { FOLLOW_UP_REF_PREFIX, buildMessengerLink } from "@/lib/messenger/link";
import { WHATSAPP_NUMBER } from "@/lib/whatsapp";

/**
 * Tracked follow-up links: https://<site>/go/<token>?to=messenger|whatsapp.
 * The route (app/go/[token]/route.ts) records the click, moves the lead in
 * the funnel, then redirects to the chat. Pure helpers, no server imports.
 */

export const CHAT_TARGETS = ["messenger", "whatsapp"] as const;

export type ChatTarget = (typeof CHAT_TARGETS)[number];

export const CHAT_TARGET_LABELS: Record<ChatTarget, string> = {
  messenger: "Messenger",
  whatsapp: "WhatsApp",
};

/** Tokens are 12 random bytes, base64url: 16 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16}$/;

export function isTrackingToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** An unknown or missing `to` falls back to Messenger (the SMS link has none). */
export function toChatTarget(value: string | null | undefined): ChatTarget {
  return value === "whatsapp" ? "whatsapp" : "messenger";
}

export function buildTrackedUrl(
  origin: string,
  token: string,
  target?: ChatTarget
): string {
  const base = `${origin.replace(/\/+$/, "")}/go/${token}`;
  return target ? `${base}?to=${target}` : base;
}

/**
 * Link scanners (corporate mail filters, chat-app previews) open links
 * nobody clicked. Their requests are still redirected, just not counted,
 * so a scanner can't move a lead to Inquiry on its own.
 */
const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|preview|scanner|facebookexternalhit|whatsapp\/|skypeuripreview|bingpreview|googleimageproxy|headless|curl|wget|python-requests|go-http-client|okhttp|axios|node-fetch|undici/i;

export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim() === "") return true;
  return BOT_USER_AGENT.test(userAgent);
}

/** Where a click finally lands. */
export function buildChatUrl(
  target: ChatTarget,
  context: {
    name?: string | null;
    channel?: string | null;
    packageSlug?: string | null;
    followUpToken?: string | null;
  }
): string {
  if (target === "messenger") {
    // The follow-up's token rides along as the m.me ref, so the webhook can
    // link the chat to the contact and greet them with their package
    // (lib/meta-sync/messenger.ts). Without one, the package slug does.
    return buildMessengerLink(
      context.followUpToken
        ? `${FOLLOW_UP_REF_PREFIX}${context.followUpToken}`
        : (context.packageSlug ?? undefined)
    );
  }

  const via = context.channel === "sms" ? "text" : "email";
  const name = context.name?.trim();
  const message = name
    ? `Hi TravelSentro! This is ${name}. I got your follow-up ${via} and I'd like to continue my inquiry.`
    : `Hi TravelSentro! I got your follow-up ${via} and I'd like to continue my inquiry.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
