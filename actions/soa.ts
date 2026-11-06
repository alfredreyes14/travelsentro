"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  soaFormSchema,
  type SoaFormValues,
} from "@/components/admin/soa/soa-form-schema";
import { soaValuesToRow } from "@/lib/soa/soa-row";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
const INVALID_MESSAGE =
  "Some fields are invalid. Please review the form and try again.";

/** soa_no and created_by are set by the database, never sent from here. */
export async function createSoa(
  values: SoaFormValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_quotes");

  const parsed = soaFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .insert(soaValuesToRow(parsed.data))
    .select("id")
    .single();

  if (error || !data) {
    console.error("createSoa failed:", error?.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/soa");
  return { ok: true, id: data.id };
}

export async function updateSoa(
  id: string,
  values: SoaFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const parsed = soaFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .update({ ...soaValuesToRow(parsed.data), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("updateSoa failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "That statement no longer exists." };
  }

  revalidatePath("/admin/soa");
  revalidatePath(`/admin/soa/${id}`);
  return { ok: true };
}

export async function deleteSoa(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { error } = await supabase.from("statements").delete().eq("id", id);

  if (error) {
    console.error("deleteSoa failed:", error.message);
    return {
      ok: false,
      error: "Something went wrong deleting that statement. Please try again.",
    };
  }

  revalidatePath("/admin/soa");
  return { ok: true };
}
