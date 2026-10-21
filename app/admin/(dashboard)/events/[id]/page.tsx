import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { EventForm } from "@/components/admin/events/event-form";
import { EventGalleryManager } from "@/components/admin/events/event-gallery-manager";
import { toEventRecord } from "@/components/admin/events/event-record";
import { Card } from "@/components/ui/card";
import type { Tables } from "@/types/database";

type EventWithPhotos = Tables<"events"> & {
  event_photos: Pick<Tables<"event_photos">, "id" | "storage_path" | "display_order">[];
};

export const metadata: Metadata = {
  title: "Edit event | TravelSentro Admin",
};

/** Fetches by id with no published filter, so drafts can be edited. */
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("can_manage_packages");

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select("*, event_photos(id, storage_path, display_order)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const { event_photos: photoRows, ...row } = data as EventWithPhotos;
  const event = toEventRecord(row);
  const photos = photoRows.map((photo) => ({
    id: photo.id,
    storagePath: photo.storage_path,
    displayOrder: photo.display_order,
    altText: null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Edit event"
        description={`${event.name} · /events/${event.slug}`}
      />
      <EventForm event={event} />
      <Card className="gap-4 p-5 sm:p-8">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">Gallery</h2>
        <EventGalleryManager eventId={event.id} initialPhotos={photos} />
      </Card>
    </div>
  );
}
