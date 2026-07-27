"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type HeroSlideValues = {
  slideType: "package" | "promo";
  packageId?: string;
  imageStoragePath?: string;
  headline?: string;
  subheading?: string;
  ctaLabel?: string;
  externalLink?: string;
};

/**
 * Creates a new hero slide, appending it to the end of the carousel's
 * current order (mirrors createPackage's count-based sort_order append).
 * hero_slides has no deleted_at column, so the count query has no soft-
 * delete filter unlike packages'.
 */
export async function createSlide(
  values: HeroSlideValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("hero_slides")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("hero_slides")
    .insert({
      slide_type: values.slideType,
      package_id: values.packageId ?? null,
      image_storage_path: values.imageStoragePath ?? null,
      headline: values.headline ?? null,
      subheading: values.subheading ?? null,
      cta_label: values.ctaLabel ?? null,
      external_link: values.externalLink ?? null,
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
 * Updates a hero slide's content fields. Never touches sort_order -- that's
 * reorderSlides' concern only, mirroring updatePackage never touching
 * is_published/sort_order.
 */
export async function updateSlide(
  id: string,
  values: HeroSlideValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("hero_slides")
    .update({
      slide_type: values.slideType,
      package_id: values.packageId ?? null,
      image_storage_path: values.imageStoragePath ?? null,
      headline: values.headline ?? null,
      subheading: values.subheading ?? null,
      cta_label: values.ctaLabel ?? null,
      external_link: values.externalLink ?? null,
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

/**
 * Hard-deletes a hero slide -- no soft-delete requirement for this table,
 * unlike packages.
 */
export async function deleteSlide(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("hero_slides")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true };
}

/**
 * Persists a client-computed drag order (mirrors reorderPackages' exact
 * Promise.all-per-item shape).
 */
export async function reorderSlides(
  order: { id: string; sortOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("hero_slides")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true };
}
