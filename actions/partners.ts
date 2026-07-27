"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type PartnerValues = {
  partnerType: "brand_partner" | "corporate_client";
  logoStoragePath: string;
  linkUrl?: string;
};

/**
 * Creates a new partner/client logo entry. sort_order is computed as the
 * row count WITHIN that partner_type only (not a global count across both
 * types), since Brand Partners and Corporate Clients render as two fully
 * independent ordered lists (D-07, RESEARCH.md Pitfall 3).
 */
export async function createPartner(
  values: PartnerValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("partners")
    .select("id", { count: "exact", head: true })
    .eq("partner_type", values.partnerType);

  const { data: created, error: createError } = await supabase
    .from("partners")
    .insert({
      partner_type: values.partnerType,
      logo_storage_path: values.logoStoragePath,
      link_url: values.linkUrl || null,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (createError || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true, id: created.id };
}

/**
 * Updates a partner's logo/link only -- never partner_type (an existing
 * partner never changes which section it belongs to; editing type would
 * require a fresh sort_order in the new type's list, out of scope).
 */
export async function updatePartner(
  id: string,
  values: PartnerValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("partners")
    .update({
      logo_storage_path: values.logoStoragePath,
      link_url: values.linkUrl || null,
    })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true };
}

export async function deletePartner(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("partners")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true };
}
