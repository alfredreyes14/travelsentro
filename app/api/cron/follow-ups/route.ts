import { isCronAuthorized } from "@/lib/cron/authorize";
import { flushMetaOutbox } from "@/lib/meta-sync/flush";
import {
  isFollowUpAutomationEnabled,
  runFollowUpAutomation,
} from "@/lib/follow-ups/run-automation";

/**
 * Daily lead follow-ups, run by Vercel Cron (vercel.json: 01:07 UTC =
 * 9:07 AM Asia/Manila, so leads get them in business hours). Uses the same
 * CRON_SECRET as the Meta lead sync; FOLLOW_UPS_ENABLED=false turns it off.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("Follow-up automation: CRON_SECRET is not set");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFollowUpAutomationEnabled()) {
    return Response.json({ skipped: "FOLLOW_UPS_ENABLED is false" });
  }

  try {
    const result = await runFollowUpAutomation();
    // Sends stage changes queued for Meta (Lost moves, missed jobs).
    const metaSync = await flushMetaOutbox().catch((err) => {
      console.error("Meta stage sync failed", err);
      return null;
    });
    return Response.json({ ...result, metaSync }, { status: result.failed > 0 ? 500 : 200 });
  } catch (err) {
    console.error("Follow-up automation failed", err);
    return Response.json({ error: "Run failed" }, { status: 500 });
  }
}
