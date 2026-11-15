"use client";

import { deleteEventPhoto, reorderEventPhotos, uploadEventPhotos } from "@/actions/event-photos";
import {
  PhotoManager,
  type PhotoManagerActions,
  type PhotoManagerPhoto,
} from "@/components/admin/photo-manager";
import {
  EVENT_IMAGE_ACCEPT,
  EVENT_IMAGE_LIMIT_MESSAGE,
  isAcceptedEventImage,
} from "@/lib/events/image-limits";
import { useCan } from "@/components/admin/permissions-provider";

const EVENT_PHOTO_ACTIONS: PhotoManagerActions = {
  upload: uploadEventPhotos,
  remove: deleteEventPhoto,
  reorder: reorderEventPhotos,
};

function validateEventPhoto(file: File): string | null {
  return isAcceptedEventImage(file.type, file.size)
    ? null
    : `${file.name}: ${EVENT_IMAGE_LIMIT_MESSAGE}`;
}

/**
 * The event's gallery. A client wrapper so the action set and file check
 * (functions) stay on the client side of the Server Component page.
 */
export function EventGalleryManager({
  eventId,
  initialPhotos,
}: {
  eventId: string;
  initialPhotos: PhotoManagerPhoto[];
}) {
  // Upload, delete and reorder need Events Create or Edit.
  const canManage = useCan("events", ["create", "update"]);
  return (
    <fieldset disabled={!canManage} className="contents">
      <PhotoManager
        ownerId={eventId}
        initialPhotos={initialPhotos}
        actions={EVENT_PHOTO_ACTIONS}
        accept={EVENT_IMAGE_ACCEPT}
        validateFile={validateEventPhoto}
      />
    </fieldset>
  );
}
