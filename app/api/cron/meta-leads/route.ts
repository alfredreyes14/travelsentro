import { isCronAuthorized } from "@/lib/cron/authorize";
import { flushMetaOutbox } from "@/lib/meta-sync/flush";
import { isMetaLeadSyncEnabled, runMetaLeadSync } from "@/lib/meta-leads/run-sync";

/**
 * Nightly Meta lead ads -> CRM sync, run by Vercel Cron (vercel.json:
 * 15:59 UTC = 11:59 PM Asia/Manila). Staff can also run it from the CRM's
 * "Sync Meta leads" button; both go through runMetaLeadSync().
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` with each cron call;
 * anything else is refused, as is any deployment other than production.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isMetaLeadSyncEnabled()) {
    return Response.json(
      { error: "Meta lead sync only runs on the production deployment" },
      { status: 403 }
    );
  }
  if (!process.env.CRON_SECRET) {
    console.error("Meta lead sync: CRON_SECRET is not set");
    return Response.json({ error: "Not configured" }, { status: 500 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMetaLeadSync({ kind: "cron" });
    // New Meta leads queue their first Conversions API event; send them.
    await flushMetaOutbox().catch((err) => console.error("Meta stage sync failed", err));
    return Response.json(result, { status: result.status === "success" ? 200 : 500 });
  } catch (err) {
    // Already recorded in the sync log (meta_lead_sync_runs) when it got that far.
    console.error("Meta lead sync failed", err);
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
