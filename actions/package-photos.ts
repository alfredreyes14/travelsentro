"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadObject, deleteObject } from "@/lib/storage/r2-client";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type UploadPhotoInput = {
  name: string;
  type: string;
  base64: string;
};

export type UploadedPhoto = {
  id: string;
  storagePath: string;
  displayOrder: number;
  altText: string | null;
};

function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}

/**
 * Multi-uploads photos for an existing package (Storage upload, then a
 * package_photos row insert per file — mirrors scripts/seed.ts lines
 * 265-289), appending after the current max display_order. Unlike the seed
 * script's fixed `photo-N.jpg` naming, each upload gets a unique path
 * (`packages/${packageId}/photo-${timestamp}-${index}.${ext}`) since photos
 * are added incrementally here, not all at once.
 */
export async function uploadPhotos(
  packageId: string,
  files: UploadPhotoInput[]
): Promise<ActionResult & { photos?: UploadedPhoto[] }> {
  // AUTH-05 — gate independent of D-13's nav hiding. This is now the sole
  // authorization check on this write path: images live on R2, accessed via
  // a single full-access credential rather than per-request Storage RLS, so
  // there is no second independent layer (the storage.objects RLS policies
  // this used to pair with were dropped when Supabase Storage buckets were
  // removed in favor of R2).
  await requirePermission("can_manage_packages");

  if (files.length === 0) {
    return { ok: true, photos: [] };
  }

  const supabase = await createClient();

  const { data: pkg, error: pkgError } = await supabase
    .from("packages")
    .select("slug")
    .eq("id", packageId)
    .single();

  if (pkgError || !pkg) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const { data: existingPhotos, error: existingError } = await supabase
    .from("package_photos")
    .select("display_order")
    .eq("package_id", packageId)
    .order("display_order", { ascending: false })
    .limit(1);

  if (existingError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const maxDisplayOrder = existingPhotos?.[0]?.display_order ?? -1;
  const uploaded: UploadedPhoto[] = [];

  for (const [index, file] of files.entries()) {
    const buffer = Buffer.from(file.base64, "base64");
    const extension = extensionFromMimeType(file.type);
    const storagePath = `packages/${packageId}/photo-${Date.now()}-${index}.${extension}`;

    try {
      await uploadObject(storagePath, buffer, file.type);
    } catch {
      return { ok: false, error: GENERIC_ERROR_MESSAGE };
    }

    const displayOrder = maxDisplayOrder + index + 1;

    const { data: photoRow, error: insertError } = await supabase
      .from("package_photos")
      .insert({
        package_id: packageId,
        storage_path: storagePath,
        display_order: displayOrder,
        alt_text: null,
      })
      .select("id, storage_path, display_order, alt_text")
      .single();

    if (insertError || !photoRow) {
      return { ok: false, error: GENERIC_ERROR_MESSAGE };
    }

    uploaded.push({
      id: photoRow.id,
      storagePath: photoRow.storage_path,
      displayOrder: photoRow.display_order,
      altText: photoRow.alt_text,
    });
  }

  revalidatePath(`/packages/${pkg.slug}`);
  return { ok: true, photos: uploaded };
}

/**
 * Deletes a single photo's Storage object and its package_photos row.
 * Low-stakes per UI-SPEC (no alert-dialog confirmation needed on the client
 * side) — server-side this is still fully permission-gated (T-02-21).
 */
export async function deletePhoto(photoId: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: photo, error: photoError } = await supabase
    .from("package_photos")
    .select("storage_path, package_id")
    .eq("id", photoId)
    .single();

  if (photoError || !photo) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const { data: pkg, error: pkgError } = await supabase
    .from("packages")
    .select("slug")
    .eq("id", photo.package_id)
    .single();

  if (pkgError || !pkg) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  try {
    await deleteObject(photo.storage_path);
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const { error: deleteError } = await supabase
    .from("package_photos")
    .delete()
    .eq("id", photoId);

  if (deleteError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath(`/packages/${pkg.slug}`);
  return { ok: true };
}

/**
 * Persists a client-computed drag order (Pattern 6, adapted to
 * package_photos.display_order instead of packages.sort_order).
 */
export async function reorderPhotos(
  packageId: string,
  order: { id: string; displayOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: pkg, error: pkgError } = await supabase
    .from("packages")
    .select("slug")
    .eq("id", packageId)
    .single();

  if (pkgError || !pkg) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("package_photos")
        .update({ display_order: item.displayOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath(`/packages/${pkg.slug}`);
  return { ok: true };
}
