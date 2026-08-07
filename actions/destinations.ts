"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { DestinationFormValues } from "@/components/admin/content/destination-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const FK_VIOLATION = "23503";

/**
 * Creates a new destination, appending it to the end of the admin list's
 * current order (mirrors createSlide/createPackage's count-based sort_order
 * append). New destinations default to is_active = true at the DB level --
 * this action never sets is_active explicitly, matching how createPackage
 * never sets is_published to anything but an explicit value it controls.
 */
export async function createDestination(
  values: DestinationFormValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("destinations")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("destinations")
    .insert({
      name: values.name,
      slug: values.slug,
      region: values.region,
      photo_storage_path: values.photoStoragePath || null,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (createError || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true, id: created.id };
}

/**
 * Updates a destination's content fields. Never touches is_active or
 * sort_order -- those are toggleDestinationActive's and a future
 * reorderDestinations' concern only, mirroring updatePackage/updateSlide
 * never touching is_published/sort_order.
 */
export async function updateDestination(
  id: string,
  values: DestinationFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("destinations")
    .update({
      name: values.name,
      slug: values.slug,
      region: values.region,
      photo_storage_path: values.photoStoragePath || null,
    })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true };
}

/**
 * Flips is_active. The disable-guard trigger (Task 1) can reject the
 * true -> false transition with a raised Postgres exception -- its message
 * is already a safe, human-readable string (e.g. 'Cannot disable "Palawan"
 * — 2 active package(s)...'), so it's surfaced directly via error.message
 * instead of the generic fallback.
 */
export async function toggleDestinationActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true };
}

/**
 * Hard-deletes a destination. Unlike softDeletePackage, destinations has no
 * deleted_at column -- deletion is blocked instead by packages.destination_id's
 * default (RESTRICT) FK behavior whenever any package (active or not) still
 * references this row, surfaced here as a friendly error rather than the
 * raw Postgres FK-violation message.
 */
export async function deleteDestination(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("destinations")
    .delete()
    .eq("id", id);

  if (deleteError) {
    if (deleteError.code === FK_VIOLATION) {
      return {
        ok: false,
        error: "Remove or reassign packages using this destination first.",
      };
    }
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true };
}
