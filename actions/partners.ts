"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { normalizePartnerLink } from "@/lib/partners/link";
import { isPartnerType, type PartnerType } from "@/lib/partners/partner-type";
import {
  partnerFormSchema,
  type PartnerFormValues,
} from "@/components/admin/partners/partner-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

function revalidatePartnerPaths() {
  revalidatePath("/");
  revalidatePath("/admin/partners");
}

/**
 * Server Action arguments aren't runtime-type-checked at the network
 * boundary, so the form values are re-validated here rather than trusted:
 * link_url ends up as an href on the public homepage and must be an
 * http(s) URL, and the logo key must stay inside the partners/ R2 folder.
 * Returns null when the values don't pass.
 */
function toColumns(values: unknown) {
  const parsed = partnerFormSchema.safeParse(values);
  if (!parsed.success) return null;

  const link = normalizePartnerLink(parsed.data.linkUrl ?? "");
  if (!link.ok) return null;
  if (!parsed.data.logoStoragePath.startsWith("partners/")) return null;

  return {
    name: parsed.data.name,
    logo_storage_path: parsed.data.logoStoragePath,
    link_url: link.url,
    is_published: parsed.data.isPublished,
  };
}

/**
 * Creates a partner at the end of its own group's order. Uses the group's
 * highest sort_order + 1 rather than a row count, so adding after a delete
 * can't collide with an existing position.
 */
export async function createPartner(
  partnerType: PartnerType,
  values: PartnerFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const columns = toColumns(values);
  if (!isPartnerType(partnerType) || !columns) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: last, error: lastError } = await supabase
    .from("partners")
    .select("sort_order")
    .eq("partner_type", partnerType)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const { error: createError } = await supabase.from("partners").insert({
    ...columns,
    partner_type: partnerType,
    sort_order: last ? last.sort_order + 1 : 0,
  });

  if (createError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}

export async function updatePartner(
  id: string,
  values: PartnerFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const columns = toColumns(values);
  if (!columns) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("partners")
    .update(columns)
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}

export async function togglePartnerPublished(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  if (typeof isPublished !== "boolean") {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("partners")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
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

  revalidatePartnerPaths();
  return { ok: true };
}

/** Persists a client-computed drag order for one group (mirrors reorderFaqs). */
export async function reorderPartners(
  order: { id: string; sortOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const isValidOrder =
    Array.isArray(order) &&
    order.every(
      (item) =>
        typeof item?.id === "string" && Number.isInteger(item?.sortOrder)
    );
  if (!isValidOrder) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("partners")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePartnerPaths();
  return { ok: true };
}
