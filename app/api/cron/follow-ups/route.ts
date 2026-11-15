import { isCronAuthorized } from "@/lib/cron/authorize";
import {
  isFollowUpAutomationEnabled,
  runFollowUpAutomation,
} from "@/lib/follow-ups/run-automation";

/**
 * Daily lead follow-up emails, run by Vercel Cron (vercel.json: 01:07 UTC =
 * 9:07 AM Asia/Manila, so leads get them in business hours). Needs
 * FOLLOW_UPS_ENABLED=true and the same CRON_SECRET as the Meta lead sync.
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
    return Response.json({ skipped: "FOLLOW_UPS_ENABLED is not true" });
  }

  try {
    const result = await runFollowUpAutomation();
    return Response.json(result, { status: result.failed > 0 ? 500 : 200 });
  } catch (err) {
    console.error("Follow-up automation failed", err);
    return Response.json({ error: "Run failed" }, { status: 500 });
  }
}
