"use server";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

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
 * Uploads a single image to the site-content Storage bucket and returns its
 * storage path. Unlike package-photos.ts's uploadPhotos (multi-photo
 * gallery, per-file display_order computed from a running max), each hero
 * slide/testimonial/partner has at most one image, so there is no "current
 * max" to race on -- the random suffix (not an index) is sufficient
 * (RESEARCH.md Pitfall 7 does not apply here). Does NOT call
 * revalidatePath -- the uploaded image isn't attached to any visible entity
 * until the owning createSlide/createTestimonial/createPartner/updateSlide/
 * etc. call runs afterward and revalidates.
 */
export async function uploadSiteContentImage(
  folder: "hero-slides" | "testimonials" | "partners" | "destinations",
  file: UploadImageInput
): Promise<ActionResult & { storagePath?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const buffer = Buffer.from(file.base64, "base64");
  const extension = extensionFromMimeType(file.type);
  const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("site-content")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
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
 * accepted, documented scope limit (no cleanup-on-entity-delete requirement
 * stated in REQUIREMENTS.md/CONTEXT.md), not a silent gap.
 */
export async function deleteSiteContentImage(
  storagePath: string
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: removeError } = await supabase.storage
    .from("site-content")
    .remove([storagePath]);

  if (removeError) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true };
}
