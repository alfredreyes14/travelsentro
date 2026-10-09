"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { VisaServiceFormValues } from "@/components/admin/content/visa-service-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

function revalidateVisaServicePaths() {
  revalidatePath("/");
  revalidatePath("/admin/content");
}

/** Blank optional text fields are stored as null, not empty strings. */
function toColumns(values: VisaServiceFormValues) {
  return {
    country: values.country.trim(),
    description: values.description?.trim() || null,
    processing_time: values.processingTime?.trim() || null,
    price: values.price ?? null,
    requirements: values.requirements?.trim() || null,
    photo_storage_path: values.photoStoragePath || null,
    is_published: values.isPublished,
  };
}

/**
 * Creates a new visa service, appending it to the end of the current order
 * (mirrors createFaq's count-based sort_order append).
 */
export async function createVisaService(
  values: VisaServiceFormValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("visa_services")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("visa_services")
    .insert({ ...toColumns(values), sort_order: count ?? 0 })
    .select("id")
    .single();

  if (createError || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateVisaServicePaths();
  return { ok: true, id: created.id };
}

export async function updateVisaService(
  id: string,
  values: VisaServiceFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("visa_services")
    .update(toColumns(values))
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateVisaServicePaths();
  return { ok: true };
}

export async function toggleVisaServicePublished(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("visa_services")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateVisaServicePaths();
  return { ok: true };
}

export async function deleteVisaService(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("visa_services")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateVisaServicePaths();
  return { ok: true };
}

/** Persists a client-computed drag order (mirrors reorderFaqs). */
export async function reorderVisaServices(
  order: { id: string; sortOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("visa_services")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateVisaServicePaths();
  return { ok: true };
}
