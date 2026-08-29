import { FACEBOOK_PAGE_USERNAME } from "@/lib/constants";

/**
 * Ref sent when a link carries no package context (the homepage, contact,
 * coming-soon and error CTAs). Its only job is to make sure *some* ref is
 * always present: Meta fires the referral webhook that triggers the
 * auto-greeting only when the m.me link has a `ref`, so a bare link used
 * to open Messenger and then sit there silently -- the customer got no
 * reply at all. Deliberately not a real package slug, and the webhook
 * skips the package lookup for it, so it resolves to the generic greeting
 * even if a package with this slug is ever created.
 */
export const GENERAL_MESSENGER_REF = "general";

/**
 * Builds an m.me deep link that opens Messenger directly into a chat with
 * the Page, instead of FacebookCta's previous outbound link to the Page
 * itself (D-04 follow-up). packageSlug rides along as Messenger's `ref`
 * param -- the only mechanism m.me links have for carrying context, since
 * unlike wa.me there is no `?text=` prefill equivalent. The slug is a
 * business product code, purely an internal lookup key for the webhook
 * (app/api/messenger/webhook/route.ts) -- it is never shown to the
 * customer, who only ever sees the package's real name in the bot's reply.
 *
 * A ref is always emitted, falling back to GENERAL_MESSENGER_REF -- see
 * that constant for why a ref-less link silently produced no greeting.
 */
export function buildMessengerLink(packageSlug?: string): string {
  const base = `https://m.me/${FACEBOOK_PAGE_USERNAME}`;
  const ref = packageSlug || GENERAL_MESSENGER_REF;
  return `${base}?ref=${encodeURIComponent(ref)}`;
}
