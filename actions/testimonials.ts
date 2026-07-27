"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type TestimonialValues = {
  customerName: string;
  quote: string;
  rating: number;
  photoStoragePath?: string;
};

/**
 * Creates a new testimonial, appending it to the end via a simple
 * sort_order increment on create. No server-side rating-range re-validation
 * beyond the client zod schema (06-06) -- testimonials' `check (rating
 * between 1 and 5)` constraint from 06-01's migration is the server-side
 * backstop, matching this project's existing WR-01-accepted pattern
 * (client-zod + DB CHECK, no duplicate server-side zod re-parse).
 */
export async function createTestimonial(
  values: TestimonialValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("testimonials")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("testimonials")
    .insert({
      customer_name: values.customerName,
      quote: values.quote,
      rating: values.rating,
      photo_storage_path: values.photoStoragePath || null,
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

export async function updateTestimonial(
  id: string,
  values: TestimonialValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("testimonials")
    .update({
      customer_name: values.customerName,
      quote: values.quote,
      rating: values.rating,
      photo_storage_path: values.photoStoragePath || null,
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

export async function deleteTestimonial(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("testimonials")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true };
}
