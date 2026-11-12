"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { deleteObject } from "@/lib/storage/r2-client";
import type { ActionResult } from "@/lib/action-result";
import { normalizePartnerLink } from "@/lib/partners/link";
import { slugifyEventName, uniqueSlug } from "@/lib/events/slug";
import {
  COVER_REQUIRED_MESSAGE,
  eventFormSchema,
  type EventFormValues,
} from "@/components/admin/events/event-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Refreshes every page that can show an event. */
async function revalidateEventPaths(slug: string, id?: string) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath("/admin/events");
  if (id) revalidatePath(`/admin/events/${id}`);
}

/**
 * Server Action arguments aren't runtime-type-checked at the network
 * boundary, so the form values are re-validated here rather than trusted:
 * link_url ends up as an href on the public site, and the cover key must
 * stay inside the events/ R2 folder. Returns null when the values don't
 * pass.
 */
function toColumns(values: unknown) {
  const parsed = eventFormSchema.safeParse(values);
  if (!parsed.success) return null;
  const data = parsed.data;

  const link = normalizePartnerLink(data.linkUrl);
  if (!link.ok) return null;
  if (data.coverStoragePath !== "" && !data.coverStoragePath.startsWith("events/")) {
    return null;
  }

  return {
    name: data.name,
    event_type: data.eventType,
    start_date: data.startDate,
    end_date: data.endDate || null,
    venue: data.venue,
    summary: data.summary || null,
    description: data.description || null,
    cover_storage_path: data.coverStoragePath || null,
    link_url: link.url,
    is_published: data.isPublished,
    is_featured: data.isFeatured,
  };
}

/** Deletes R2 objects, logging failures without failing the caller. */
async function deleteObjectsQuietly(paths: string[]) {
  await Promise.all(
    paths.map(async (path) => {
      try {
        await deleteObject(path);
      } catch (err) {
        console.error(`Could not delete event image ${path}:`, err);
      }
    })
  );
}

async function takenSlugs(supabase: Supabase, base: string): Promise<Set<string> | null> {
  const { data, error } = await supabase.from("events").select("slug").like("slug", `${base}%`);
  if (error) return null;
  return new Set(data.map((row) => row.slug));
}

/**
 * Creates an event. The slug comes from the name once, here, and never
 * changes afterwards so shared links keep working. A taken slug gets -2,
 * -3, …; if another save claims the same slug between the read and the
 * insert, the unique constraint rejects it and the insert is retried once
 * with a fresh read.
 */
export async function createEvent(
  values: EventFormValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const columns = toColumns(values);
  if (!columns) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();
  const base = slugifyEventName(columns.name);

  for (let attempt = 0; attempt < 2; attempt++) {
    const taken = await takenSlugs(supabase, base);
    if (!taken) return { ok: false, error: GENERIC_ERROR_MESSAGE };

    const slug = uniqueSlug(base, taken);
    const { data, error } = await supabase
      .from("events")
      .insert({ ...columns, slug })
      .select("id")
      .single();

    if (!error && data) {
      await revalidateEventPaths(slug, data.id);
      return { ok: true, id: data.id };
    }
    if (error?.code !== "23505") break;
  }

  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}

/** Updates an event. Never touches the slug. Removes a replaced cover from R2. */
export async function updateEvent(id: string, values: EventFormValues): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const columns = toColumns(values);
  if (!columns) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("events")
    .select("slug, cover_storage_path")
    .eq("id", id)
    .single();
  if (existingError || !existing) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update(columns)
    .eq("id", id)
    .select("id")
    .single();
  if (updateError || !updated) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const oldCover = existing.cover_storage_path;
  if (oldCover && oldCover !== columns.cover_storage_path) {
    await deleteObjectsQuietly([oldCover]);
  }

  await revalidateEventPaths(existing.slug, id);
  return { ok: true };
}

export async function setEventPublished(id: string, published: boolean): Promise<ActionResult> {
  await requirePermission("can_manage_packages");
  if (typeof published !== "boolean") return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();

  const { data: event, error: readError } = await supabase
    .from("events")
    .select("slug, cover_storage_path")
    .eq("id", id)
    .single();
  if (readError || !event) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  if (published && !event.cover_storage_path) {
    return { ok: false, error: COVER_REQUIRED_MESSAGE };
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({ is_published: published })
    .eq("id", id)
    .select("id")
    .single();
  if (updateError || !updated) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  await revalidateEventPaths(event.slug, id);
  return { ok: true };
}

export async function setEventFeatured(id: string, featured: boolean): Promise<ActionResult> {
  await requirePermission("can_manage_packages");
  if (typeof featured !== "boolean") return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({ is_featured: featured })
    .eq("id", id)
    .select("slug")
    .single();
  if (updateError || !updated) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  await revalidateEventPaths(updated.slug, id);
  return { ok: true };
}

/** Deletes an event (its photo rows cascade), then its R2 objects. */
export async function deleteEvent(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: event, error: readError } = await supabase
    .from("events")
    .select("slug, cover_storage_path, event_photos(storage_path)")
    .eq("id", id)
    .single();
  if (readError || !event) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const { error: deleteError } = await supabase.from("events").delete().eq("id", id);
  if (deleteError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const paths = event.event_photos.map((photo) => photo.storage_path);
  if (event.cover_storage_path) paths.push(event.cover_storage_path);
  await deleteObjectsQuietly(paths);

  await revalidateEventPaths(event.slug);
  return { ok: true };
}
