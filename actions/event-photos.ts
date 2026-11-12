"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadObject, deleteObject } from "@/lib/storage/r2-client";
import { extensionFromMimeType } from "@/lib/storage/image-extension";
import type { ActionResult } from "@/lib/action-result";
import type { UploadedPhoto } from "@/actions/package-photos";
import type { UploadImageInput } from "@/actions/site-content-uploads";
import { EVENT_IMAGE_LIMIT_MESSAGE, isAcceptedEventImage } from "@/lib/events/image-limits";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function revalidateEvent(supabase: Supabase, eventId: string) {
  const { data: event } = await supabase.from("events").select("slug").eq("id", eventId).single();
  revalidatePath("/");
  revalidatePath("/events");
  if (event) revalidatePath(`/events/${event.slug}`);
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
}

function isValidFile(file: UploadImageInput): boolean {
  if (typeof file?.type !== "string" || typeof file?.base64 !== "string") return false;
  return isAcceptedEventImage(file.type, Buffer.byteLength(file.base64, "base64"));
}

/**
 * Uploads gallery photos for an existing event, appending after the current
 * max display_order. Mirrors package-photos.ts's uploadPhotos without the
 * watermark check, which only matters for supplier package photos.
 */
export async function uploadEventPhotos(
  eventId: string,
  files: UploadImageInput[]
): Promise<ActionResult & { photos?: UploadedPhoto[] }> {
  await requirePermission("can_manage_packages");

  if (!Array.isArray(files)) return { ok: false, error: GENERIC_ERROR_MESSAGE };
  if (files.length === 0) return { ok: true, photos: [] };
  if (!files.every(isValidFile)) return { ok: false, error: EVENT_IMAGE_LIMIT_MESSAGE };

  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .single();
  if (eventError || !event) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const { data: last, error: lastError } = await supabase
    .from("event_photos")
    .select("display_order")
    .eq("event_id", eventId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (lastError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const maxDisplayOrder = last?.[0]?.display_order ?? -1;
  const uploaded: UploadedPhoto[] = [];

  for (const [index, file] of files.entries()) {
    const buffer = Buffer.from(file.base64, "base64");
    const extension = extensionFromMimeType(file.type);
    const rand = crypto.randomUUID().slice(0, 8);
    const storagePath = `events/${eventId}/photo-${Date.now()}-${rand}.${extension}`;

    try {
      await uploadObject(storagePath, buffer, file.type);
    } catch {
      return { ok: false, error: GENERIC_ERROR_MESSAGE };
    }

    const { data: row, error: insertError } = await supabase
      .from("event_photos")
      .insert({
        event_id: eventId,
        storage_path: storagePath,
        display_order: maxDisplayOrder + index + 1,
      })
      .select("id, storage_path, display_order")
      .single();
    if (insertError || !row) return { ok: false, error: GENERIC_ERROR_MESSAGE };

    uploaded.push({
      id: row.id,
      storagePath: row.storage_path,
      displayOrder: row.display_order,
      altText: null,
    });
  }

  await revalidateEvent(supabase, eventId);
  return { ok: true, photos: uploaded };
}

/** Deletes a gallery photo's row, then its R2 object. */
export async function deleteEventPhoto(photoId: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: photo, error: photoError } = await supabase
    .from("event_photos")
    .select("storage_path, event_id")
    .eq("id", photoId)
    .single();
  if (photoError || !photo) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const { error: deleteError } = await supabase.from("event_photos").delete().eq("id", photoId);
  if (deleteError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  try {
    await deleteObject(photo.storage_path);
  } catch (err) {
    console.error(`Could not delete event photo ${photo.storage_path}:`, err);
  }

  await revalidateEvent(supabase, photo.event_id);
  return { ok: true };
}

/** Persists a client-computed drag order. Every id must belong to the event. */
export async function reorderEventPhotos(
  eventId: string,
  order: { id: string; displayOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const isValidOrder =
    Array.isArray(order) &&
    order.every((item) => typeof item?.id === "string" && Number.isInteger(item?.displayOrder));
  if (!isValidOrder) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();

  const { data: owned, error: ownedError } = await supabase
    .from("event_photos")
    .select("id")
    .eq("event_id", eventId);
  if (ownedError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const ownedIds = new Set(owned.map((row) => row.id));
  if (!order.every((item) => ownedIds.has(item.id))) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("event_photos")
        .update({ display_order: item.displayOrder })
        .eq("id", item.id)
        .eq("event_id", eventId)
    )
  );
  if (results.some((result) => result.error)) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  await revalidateEvent(supabase, eventId);
  return { ok: true };
}
