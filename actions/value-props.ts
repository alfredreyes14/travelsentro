"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type ValuePropValues = {
  title: string;
  description: string;
};

/**
 * Creates a new value prop, appending it to the end via a simple
 * sort_order increment on create -- no drag-reorder for this content type
 * this phase (RESEARCH.md discretion note).
 */
export async function createValueProp(
  values: ValuePropValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("value_props")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("value_props")
    .insert({
      title: values.title,
      description: values.description,
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

export async function updateValueProp(
  id: string,
  values: ValuePropValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("value_props")
    .update({
      title: values.title,
      description: values.description,
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

export async function deleteValueProp(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("value_props")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true };
}
