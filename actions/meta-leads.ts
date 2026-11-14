"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import {
  isMetaLeadSyncEnabled,
  MetaLeadSyncRunError,
  runMetaLeadSync,
  type MetaLeadSyncResult,
} from "@/lib/meta-leads/run-sync";

export type MetaLeadSyncActionResult =
  | { ok: true; result: MetaLeadSyncResult }
  | { ok: false; error: string; partial?: boolean };

/**
 * The CRM's "Sync Meta leads" button: the same run as the nightly cron, on
 * demand. Production only (see isMetaLeadSyncEnabled); needs can_edit_crm,
 * since it creates and updates contacts.
 */
export async function syncMetaLeadsNow(): Promise<MetaLeadSyncActionResult> {
  const profile = await requirePermission("can_edit_crm");

  if (!isMetaLeadSyncEnabled()) {
    return { ok: false, error: "Meta lead sync only runs on the live site." };
  }

  try {
    const result = await runMetaLeadSync({
      kind: "manual",
      userId: profile.id,
      userName: profile.name || profile.email,
    });
    // "layout" also covers /admin/crm/sync-log.
    revalidatePath("/admin/crm", "layout");
    return { ok: true, result };
  } catch (err) {
    console.error("Manual Meta lead sync failed", err);
    revalidatePath("/admin/crm/sync-log");
    return {
      ok: false,
      error:
        err instanceof MetaLeadSyncRunError
          ? err.message
          : "Couldn't start the sync. Please try again in a few minutes.",
      partial: err instanceof MetaLeadSyncRunError && err.status === "partial",
    };
  }
}
