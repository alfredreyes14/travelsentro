"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Soft-deletes a package: sets BOTH `deleted_at` and `is_published = false`
 * in the same update call. This is belt-and-suspenders defense in depth —
 * 02-01's public-read RLS policy already independently excludes rows with
 * `deleted_at is not null`, and this also unpublishes so even a query that
 * only checked `is_published` would stay safe (Pitfall 4 / T-02-16).
 */
export async function softDeletePackage(id: string): Promise<ActionResult> {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-15).
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .update({ deleted_at: new Date().toISOString(), is_published: false })
    .eq("id", id)
    .select("slug")
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${data.slug}`);
  revalidatePath("/admin/packages");
  return { ok: true };
}

export async function publishPackage(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("slug")
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${data.slug}`);
  revalidatePath("/admin/packages");
  return { ok: true };
}

export async function featurePackage(
  id: string,
  isFeatured: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .update({ is_featured: isFeatured })
    .eq("id", id)
    .select("slug")
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${data.slug}`);
  revalidatePath("/admin/packages");
  return { ok: true };
}

/**
 * Persists a client-computed drag order (Pattern 6). The order array is
 * untrusted input from the browser (T-02-17) — the only real boundary here
 * is the can_manage_packages permission check itself, since this operates
 * on global catalog state with no per-user ownership concept.
 */
export async function reorderPackages(
  order: { id: string; sortOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("packages")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  // Ordering doesn't change any single package's detail content, so only
  // the list pages need revalidation.
  revalidatePath("/packages");
  revalidatePath("/admin/packages");
  return { ok: true };
}
