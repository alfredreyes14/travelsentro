"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import {
  isMetaLeadSyncEnabled,
  runMetaLeadSync,
  type MetaLeadSyncResult,
} from "@/lib/meta-leads/run-sync";

export type MetaLeadSyncActionResult =
  | { ok: true; result: MetaLeadSyncResult }
  | { ok: false; error: string };

/**
 * The CRM's "Sync Meta leads" button: the same run as the nightly cron, on
 * demand. Production only (see isMetaLeadSyncEnabled); needs can_edit_crm,
 * since it creates and updates contacts.
 */
export async function syncMetaLeadsNow(): Promise<MetaLeadSyncActionResult> {
  await requirePermission("can_edit_crm");

  if (!isMetaLeadSyncEnabled()) {
    return { ok: false, error: "Meta lead sync only runs on the live site." };
  }

  try {
    const result = await runMetaLeadSync();
    revalidatePath("/admin/crm");
    return { ok: true, result };
  } catch (err) {
    console.error("Manual Meta lead sync failed", err);
    return {
      ok: false,
      error: "Couldn't reach Meta or the database. Please try again in a few minutes.",
    };
  }
}
