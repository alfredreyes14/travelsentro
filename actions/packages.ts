"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  packageFormSchema,
  type PackageFormValues,
} from "@/components/admin/package-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
      travel_date: item.date,
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
 * content -- the only save path now that every package gets a real id at
 * creation time (see createDraftPackage). Never touches
 * is_published/is_featured/sort_order -- those stay 02-04's concern only
 * (publish/feature switches, drag-reorder).
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

  const { data: updated, error: updateError } = await supabase
    .from("packages")
    .update({
      name: parsed.data.name,
      price_per_pax: parsed.data.pricePerPax,
      discount_amount: parsed.data.discountAmount ?? null,
      duration_label: parsed.data.durationLabel,
      destination_id: parsed.data.destinationId,
      remarks: parsed.data.remarks || null,
    })
    .eq("id", id)
    .select("slug")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const childResult = await writePackageChildren(supabase, id, parsed.data);
  if (!childResult.ok) {
    return childResult;
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${updated.slug}`);
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
