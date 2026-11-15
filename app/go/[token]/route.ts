import {
  buildChatUrl,
  isLikelyBot,
  isTrackingToken,
  toChatTarget,
  type ChatTarget,
} from "@/lib/follow-ups/links";
import { scheduleMetaSync } from "@/lib/meta-sync/schedule";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Tracked chat button/link from a follow-up email or text:
 * /go/<token>?to=messenger|whatsapp.
 *
 * Records the click (record_follow_up_click() also moves the lead to
 * Inquiry / Discovery), then sends the visitor to the chat. Whatever goes
 * wrong -- unknown token, database down -- the visitor still lands in the
 * chat; tracking never blocks a customer from reaching us.
 *
 * Kept outside the (public) route group and exempt from the coming-soon
 * gate (proxy.ts) so it works before launch.
 */

function redirectTo(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function recordClick(
  token: string,
  target: ChatTarget
): Promise<{ name?: string; channel?: string; packageSlug?: string | null }> {
  try {
    const { data, error } = await createPublicClient().rpc(
      "record_follow_up_click",
      { p_token: token, p_target: target }
    );
    if (error) {
      console.error("record_follow_up_click failed:", error.message);
      return {};
    }
    const row = data?.[0];
    return row
      ? { name: row.contact_name, channel: row.channel, packageSlug: row.package_slug }
      : {};
  } catch (err) {
    console.error("record_follow_up_click threw:", err);
    return {};
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const target = toChatTarget(new URL(request.url).searchParams.get("to"));

  if (!isTrackingToken(token) || isLikelyBot(request.headers.get("user-agent"))) {
    return redirectTo(buildChatUrl(target, {}));
  }

  const context = await recordClick(token, target);
  // A recorded click can move the stage; send that on to Meta.
  scheduleMetaSync();
  return redirectTo(buildChatUrl(target, { ...context, followUpToken: token }));
}

/** Link checkers send HEAD: answer with the redirect, record nothing. */
export async function HEAD(request: Request) {
  const target = toChatTarget(new URL(request.url).searchParams.get("to"));
  return redirectTo(buildChatUrl(target, {}));
}
