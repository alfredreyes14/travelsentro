import { isCronAuthorized } from "@/lib/cron/authorize";
import { isMetaLeadSyncEnabled } from "@/lib/meta-leads/run-sync";
import { flushMetaOutbox } from "@/lib/meta-sync/flush";
import { syncMessengerChats } from "@/lib/meta-sync/poll";

/**
 * Reads new Messenger messages into the CRM every 15 minutes
 * (lib/meta-sync/poll.ts), run by Vercel Cron (vercel.json; needs Vercel
 * Pro -- Hobby allows only daily crons). Same CRON_SECRET as the other
 * crons; production only, so the staging database never receives real
 * customers' chats.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isMetaLeadSyncEnabled()) {
    return Response.json({ error: "Messenger sync only runs on the production deployment" }, { status: 403 });
  }
  if (!process.env.CRON_SECRET) {
    console.error("Messenger sync: CRON_SECRET is not set");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMessengerChats();
    // Stage moves queue Meta Ads events; send them now.
    await flushMetaOutbox().catch((err) => console.error("Meta stage sync failed", err));
    return Response.json(result, { status: result.errors > 0 ? 500 : 200 });
  } catch (err) {
    console.error("Messenger sync failed", err);
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
