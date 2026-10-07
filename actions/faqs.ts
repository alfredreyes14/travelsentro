"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type FaqValues = {
  question: string;
  answer: string;
  isPublished: boolean;
};

function revalidateFaqPaths() {
  revalidatePath("/faq");
  revalidatePath("/admin/content");
}

/**
 * Creates a new FAQ, appending it to the end of the current order (mirrors
 * createTestimonial's count-based sort_order append). Client zod + the
 * table's non-blank CHECK constraints are the validation layers, matching
 * testimonials.
 */
export async function createFaq(
  values: FaqValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("faqs")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("faqs")
    .insert({
      question: values.question.trim(),
      answer: values.answer.trim(),
      is_published: values.isPublished,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (createError || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateFaqPaths();
  return { ok: true, id: created.id };
}

export async function updateFaq(
  id: string,
  values: FaqValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("faqs")
    .update({
      question: values.question.trim(),
      answer: values.answer.trim(),
      is_published: values.isPublished,
    })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateFaqPaths();
  return { ok: true };
}

export async function toggleFaqPublished(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("faqs")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateFaqPaths();
  return { ok: true };
}

export async function deleteFaq(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("faqs")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateFaqPaths();
  return { ok: true };
}

/**
 * Persists a client-computed drag order (mirrors reorderSlides' exact
 * Promise.all-per-item shape).
 */
export async function reorderFaqs(
  order: { id: string; sortOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("faqs")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateFaqPaths();
  return { ok: true };
}
