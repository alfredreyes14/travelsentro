"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { deleteObject } from "@/lib/storage/r2-client";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Creates a new image-only hero slide, appending it to the end of the
 * carousel's current order (mirrors createPackage's count-based sort_order
 * append). The image must already be uploaded via uploadSiteContentImage
 * ("hero-slides") -- the folder prefix check keeps a client from pointing a
 * slide at some other entity's R2 object.
 */
export async function createSlide(
  imageStoragePath: string
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  if (!imageStoragePath.startsWith("hero-slides/")) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("hero_slides")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("hero_slides")
    .insert({
      image_storage_path: imageStoragePath,
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
 * Hard-deletes a hero slide and its R2 image -- no soft-delete requirement
 * for this table, unlike packages. The image is only ever referenced by this
 * one slide, so it's removed too rather than left orphaned. A failed R2
 * delete is logged but doesn't fail the action: the slide is already gone
 * from the homepage, which is what the admin asked for.
 */
export async function deleteSlide(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("hero_slides")
    .delete()
    .eq("id", id)
    .select("image_storage_path")
    .single();

  if (deleteError || !deleted) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  try {
    await deleteObject(deleted.image_storage_path);
  } catch (error) {
    console.error("Failed to delete hero slide image:", error);
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
