"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { packagePath } from "@/lib/packages/package-url";
import type { ActionResult } from "@/lib/action-result";
import {
  packageFormSchema,
  type PackageFormValues,
} from "@/components/admin/package-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const UNSAVED_PACKAGE_ERROR =
  "Save this package before publishing or featuring it.";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Rejects publishing/featuring a package that has never been saved.
 * createDraftPackage leaves destination_id unset and every save requires
 * one, so a null destination_id is what "never saved" means (the same test
 * as isUnsavedDraft on the edit page). Turning either flag OFF is always
 * allowed, so callers only run this when switching one on.
 */
async function ensureSavedBeforeGoingLive(
  supabase: SupabaseServerClient,
  packageId: string
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from("packages")
    .select("destination_id")
    .eq("id", packageId)
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  if (data.destination_id === null) {
    return { ok: false, error: UNSAVED_PACKAGE_ERROR };
  }

  return { ok: true };
}

/**
 * Atomically replaces a package's itinerary_days/package_inclusions/
 * package_travel_dates rows via the write_package_children() RPC. The RPC
 * runs the delete+reinsert sequence inside a single Postgres transaction,
 * so a failed insert can never leave the package's pre-existing content
 * partially deleted. day_number/kind/sort_order are all derived from array
 * position, never user-entered fields.
 */
async function writePackageChildren(
  supabase: SupabaseServerClient,
  packageId: string,
  values: PackageFormValues
): Promise<ActionResult> {
  const inclusionRows = [
    ...values.inclusions.map((item, index) => ({
      kind: "included",
      label: item.label,
      sort_order: index,
    })),
    ...values.exclusions.map((item, index) => ({
      kind: "excluded",
      label: item.label,
      sort_order: index,
    })),
    ...values.bringItems.map((item, index) => ({
      kind: "bring",
      label: item.label,
      sort_order: index,
    })),
  ];

  const { error } = await supabase.rpc("write_package_children", {
    p_package_id: packageId,
    p_itinerary: values.itinerary.map((day, index) => ({
      day_number: index + 1,
      title: day.title,
      description: day.description,
    })),
    p_inclusions: inclusionRows,
    p_travel_dates: values.travelDates.map((item) => ({
      travel_date_from: item.dateFrom,
      travel_date_to: item.dateTo,
      additional_fee: item.additionalFee ?? null,
    })),
  });

  if (error) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true };
}

/**
 * Creates a brand-new package as a minimal unpublished draft -- just enough
 * (a placeholder name, is_published: false) for a real package id to exist
 * immediately -- then redirects straight to its edit page, so the Photos
 * tab is usable right away. destination/duration/travel dates stay empty
 * until the admin's first real Save, which is always updatePackage from
 * here on.
 *
 * This MUST be invoked as a real Server Action (e.g. a <form action={...}>
 * submit, not called directly during a Server Component's render) --
 * revalidatePath/redirect are only legal in Next's "action" phase, not
 * during render. See app/admin/(dashboard)/packages/page.tsx for the
 * calling <form>.
 */
export async function createDraftPackage(): Promise<void> {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-18).
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  // New packages append to the end of the admin list's current order.
  const { count } = await supabase
    .from("packages")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const { data: created, error } = await supabase
    .from("packages")
    .insert({
      name: "Untitled Package",
      price_per_pax: 0,
      is_published: false,
      is_featured: false,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath("/admin/packages");
  redirect(`/admin/packages/${created.id}`);
}

/**
 * Updates a package's full Details/Travel Dates/Itinerary/Inclusions
 * content plus its Published/Featured flags -- the only save path now that
 * every package gets a real id at creation time (see createDraftPackage).
 * Never touches sort_order. The list page's per-row switches still go
 * through publishPackage/featurePackage.
 */
export async function updatePackage(
  id: string,
  values: PackageFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const parsed = packageFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const supabase = await createClient();

  // Checked against the row as it is BEFORE this save, so a package's first
  // save can't also publish/feature it.
  if (parsed.data.isPublished || parsed.data.isFeatured) {
    const savedCheck = await ensureSavedBeforeGoingLive(supabase, id);
    if (!savedCheck.ok) {
      return savedCheck;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("packages")
    .update({
      name: parsed.data.name,
      price_per_pax: parsed.data.pricePerPax,
      discount_amount: parsed.data.discountAmount ?? null,
      duration_label: parsed.data.durationLabel,
      destination_id: parsed.data.destinationId,
      remarks: parsed.data.remarks || null,
      is_published: parsed.data.isPublished,
      is_featured: parsed.data.isFeatured,
    })
    .eq("id", id)
    .select("slug, name")
    .single();

  // Postgres check_violation — packages_destination_required_if_published.
  // packageFormSchema already requires a destination, so this is a backstop.
  if (updateError?.code === "23514") {
    return {
      ok: false,
      error: "Assign a destination to this package before publishing it.",
    };
  }

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const childResult = await writePackageChildren(supabase, id, parsed.data);
  if (!childResult.ok) {
    return childResult;
  }

  revalidatePath("/packages");
  revalidatePath(packagePath(updated));
  revalidatePath("/admin/packages");
  revalidatePath("/admin/content");
  // "layout", not the default "page" -- the upsell popup renders this
  // package's live price/discount in the shared (public)/layout.tsx, which
  // wraps every public route.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Discards a package the admin started adding but never saved (the Cancel
 * button on the Add Package form). Only a never-saved draft -- destination
 * still null, see isUnsavedDraft on the edit page -- is soft-deleted; if the
 * package has been saved since the page loaded, it's left alone and this
 * still succeeds, since the admin only asked to leave the form.
 */
export async function discardDraftPackage(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .update({ deleted_at: new Date().toISOString(), is_published: false })
    .eq("id", id)
    .is("destination_id", null)
    .is("deleted_at", null);

  if (error) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/packages");
  return { ok: true };
}

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
    .select("slug, name")
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath(packagePath(data));
  revalidatePath("/admin/packages");
  return { ok: true };
}

export async function publishPackage(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  if (isPublished) {
    const savedCheck = await ensureSavedBeforeGoingLive(supabase, id);
    if (!savedCheck.ok) {
      return savedCheck;
    }
  }

  const { data, error } = await supabase
    .from("packages")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("slug, name")
    .single();

  // Postgres check_violation — packages_destination_required_if_published.
  if (error?.code === "23514") {
    return {
      ok: false,
      error: "Assign a destination to this package before publishing it.",
    };
  }

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath(packagePath(data));
  revalidatePath("/admin/packages");
  return { ok: true };
}

export async function featurePackage(
  id: string,
  isFeatured: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  if (isFeatured) {
    const savedCheck = await ensureSavedBeforeGoingLive(supabase, id);
    if (!savedCheck.ok) {
      return savedCheck;
    }
  }

  const { data, error } = await supabase
    .from("packages")
    .update({ is_featured: isFeatured })
    .eq("id", id)
    .select("slug, name")
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath(packagePath(data));
  revalidatePath("/admin/packages");
  return { ok: true };
}
