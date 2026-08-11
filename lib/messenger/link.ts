import { FACEBOOK_PAGE_USERNAME } from "@/lib/constants";

/**
 * Builds an m.me deep link that opens Messenger directly into a chat with
 * the Page, instead of FacebookCta's previous outbound link to the Page
 * itself (D-04 follow-up). packageSlug rides along as Messenger's `ref`
 * param -- the only mechanism m.me links have for carrying context, since
 * unlike wa.me there is no `?text=` prefill equivalent. The slug is a
 * business product code, purely an internal lookup key for the webhook
 * (app/api/messenger/webhook/route.ts) -- it is never shown to the
 * customer, who only ever sees the package's real name in the bot's reply.
 */
export function buildMessengerLink(packageSlug?: string): string {
  const base = `https://m.me/${FACEBOOK_PAGE_USERNAME}`;
  return packageSlug
    ? `${base}?ref=${encodeURIComponent(packageSlug)}`
    : base;
}
