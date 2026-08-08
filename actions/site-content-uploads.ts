"use server";

import { requirePermission } from "@/lib/auth/dal";
import { uploadObject, deleteObject } from "@/lib/storage/r2-client";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

// Server Action arguments aren't runtime-type-checked at the network
// boundary -- a client can POST any string here regardless of what the
// exported function's TypeScript signature says. All site-content images
// share a single R2 bucket with no per-folder RLS (that protection was
// Supabase Storage-specific and no longer exists), so this allow-list is the
// only thing keeping these functions scoped to their own folders.
const ALLOWED_FOLDERS = [
  "hero-slides",
  "testimonials",
  "partners",
  "destinations",
] as const;

export type UploadImageInput = {
  name: string;
  type: string;
  base64: string;
};

function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}

/**
 * Uploads a single image to R2 and returns its object key. Unlike
 * package-photos.ts's uploadPhotos (multi-photo gallery, per-file
 * display_order computed from a running max), each hero slide/testimonial/
 * partner has at most one image, so there is no "current max" to race on --
 * the random suffix (not an index) is sufficient. Does NOT call
 * revalidatePath -- the uploaded image isn't attached to any visible entity
 * until the owning createSlide/createTestimonial/createPartner/updateSlide/
 * etc. call runs afterward and revalidates.
 */
export async function uploadSiteContentImage(
  folder: "hero-slides" | "testimonials" | "partners" | "destinations",
  file: UploadImageInput
): Promise<ActionResult & { storagePath?: string }> {
  await requirePermission("can_manage_packages");

  if (!ALLOWED_FOLDERS.includes(folder)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const buffer = Buffer.from(file.base64, "base64");
  const extension = extensionFromMimeType(file.type);
  const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

  try {
    await uploadObject(storagePath, buffer, file.type);
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, storagePath };
}

/**
 * Standalone Storage-only utility for the admin form's "replace/remove
 * image before saving" UX -- does NOT also delete a database row (unlike
 * package-photos.ts's deletePhoto, which deletes both together) and is NOT
 * chained from deleteSlide/deleteTestimonial/deletePartner in this phase,
 * so a deleted entity's Storage object can become orphaned. This is an
 * accepted, documented scope limit, not a silent gap.
 */
export async function deleteSiteContentImage(
  storagePath: string
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const isWithinAllowedFolder = ALLOWED_FOLDERS.some((folder) =>
    storagePath.startsWith(`${folder}/`)
  );

  if (!isWithinAllowedFolder) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  try {
    await deleteObject(storagePath);
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true };
}
