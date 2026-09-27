"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { updatePackageDiscount } from "@/actions/packages";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Adds a package to the upsell popup, optionally setting the package's
 * real discount_amount in the same call -- deliberately the package's
 * actual discount (read by PackageCard and the package detail page too),
 * not a separate upsell-only field, so the "Save ₱X" the popup shows
 * always matches what the visitor sees after clicking through. Applies
 * the discount first and bails out on its error before inserting the
 * upsell_items row, so a rejected discount (e.g. exceeds the price) never
 * leaves a half-configured item. upsell_items.package_id is unique, so a
 * duplicate add (e.g. a race between two admins, or a stale picker
 * option) fails the insert -- surfaced as the same generic error every
 * other content-management action uses, not a raw DB error.
 */
export async function addUpsellItem(
  packageId: string,
  discountAmount?: number | null
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  if (discountAmount !== undefined) {
    const discountResult = await updatePackageDiscount(
      packageId,
      discountAmount
    );
    if (!discountResult.ok) {
      return discountResult;
    }
  }

  const supabase = await createClient();

  const { data: created, error: createError } = await supabase
    .from("upsell_items")
    .insert({ package_id: packageId })
    .select("id")
    .single();

  if (createError || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  // "layout", not the default "page" -- the popup renders in the shared
  // (public)/layout.tsx, which wraps every public route, so a page-only
  // revalidation would leave every route besides "/" showing stale items.
  revalidatePath("/", "layout");
  revalidatePath("/admin/content");
  return { ok: true, id: created.id };
}

export async function removeUpsellItem(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("upsell_items")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/content");
  return { ok: true };
}
