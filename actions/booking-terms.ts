"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Saves the single booking_terms row (seeded by its migration, so this is
 * always an UPDATE). updated_at is set here rather than by a trigger and
 * drives the public page's "Last updated" date.
 */
export async function updateBookingTerms(
  content: string
): Promise<ActionResult & { updatedAt?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("booking_terms")
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("updated_at")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/booking-terms");
  revalidatePath("/admin/content");
  return { ok: true, updatedAt: updated.updated_at };
}
