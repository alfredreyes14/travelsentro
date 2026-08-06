"use client";

import { useState, type ChangeEvent } from "react";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  deletePhoto,
  reorderPhotos,
  uploadPhotos,
} from "@/actions/package-photos";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type PhotoManagerPhoto = {
  id: string;
  storagePath: string;
  displayOrder: number;
  altText: string | null;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      // Strip the "data:<mime>;base64," prefix — only the raw payload is
      // sent to uploadPhotos, which decodes it server-side.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function PhotoThumbnail({
  photo,
  url,
  onDelete,
  isDeleting,
}: {
  photo: PhotoManagerPhoto;
  url: string;
  onDelete: (photoId: string) => void;
  isDeleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-lg border border-input p-2"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary/10">
        <Image
          src={url}
          alt={photo.altText ?? ""}
          fill
          sizes="200px"
          className="object-cover"
        />
      </div>
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex size-11 items-center justify-center text-muted-foreground"
                {...attributes}
                {...listeners}
              />
            }
          >
            <GripVerticalIcon />
            <span className="sr-only">Drag to reorder</span>
          </TooltipTrigger>
          <TooltipContent>Drag to reorder</TooltipContent>
        </Tooltip>

        {/* No alert-dialog confirmation per UI-SPEC — low-stakes, easily
            re-uploaded, single inline delete icon. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex size-11 items-center justify-center text-destructive disabled:pointer-events-none disabled:opacity-50"
                onClick={() => onDelete(photo.id)}
                disabled={isDeleting}
              />
            }
          >
            <XIcon />
            <span className="sr-only">Delete photo</span>
          </TooltipTrigger>
          <TooltipContent>Delete photo</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Multi-upload + drag-reorder + per-photo delete UI (D-11), mounted in
 * package-form.tsx's Photos tab once a real packageId exists. Drag order is
 * computed optimistically in local useState (Pattern 6 / CLAUDE.md's
 * "local useState for isolated client interactivity" rule), persisted via
 * reorderPhotos; upload/delete call their own Server Actions directly and
 * update local state from the action's response rather than refetching.
 */
export function PhotoManager({
  packageId,
  initialPhotos,
}: {
  packageId: string;
  initialPhotos: PhotoManagerPhoto[];
}) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<PhotoManagerPhoto[]>(
    [...initialPhotos].sort((a, b) => a.displayOrder - b.displayOrder)
  );
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function urlFor(storagePath: string): string {
    return supabase.storage.from("package-photos").getPublicUrl(storagePath)
      .data.publicUrl;
  }

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    try {
      const files = await Promise.all(
        Array.from(fileList).map(async (file) => ({
          name: file.name,
          type: file.type,
          base64: await readFileAsBase64(file),
        }))
      );

      // One Server Action call per file, awaited sequentially (never
      // Promise.all): uploadPhotos computes each file's display_order from
      // the current max at call time, so concurrent calls would race and
      // collide. Sequential awaiting also means a failure partway through a
      // multi-file selection leaves already-uploaded files visible instead
      // of discarding the whole batch.
      let succeededCount = 0;
      const failedNames: string[] = [];
      for (const file of files) {
        const result = await uploadPhotos(packageId, [file]);
        if (result.ok) {
          setPhotos((current) => [...current, ...(result.photos ?? [])]);
          succeededCount += 1;
        } else {
          failedNames.push(file.name);
        }
      }

      if (succeededCount > 0) {
        toast.success(
          succeededCount === 1
            ? "Photo uploaded."
            : `${succeededCount} photos uploaded.`
        );
      }
      if (failedNames.length > 0) {
        toast.error(
          failedNames.length === 1
            ? `Failed to upload ${failedNames[0]}.`
            : `Failed to upload ${failedNames.length} photos.`
        );
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleDelete(photoId: string) {
    setDeletingId(photoId);
    const previousPhotos = photos;
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));

    const result = await deletePhoto(photoId);
    if (!result.ok) {
      toast.error(result.error);
      setPhotos(previousPhotos);
    } else {
      toast.success("Photo deleted.");
    }
    setDeletingId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = photos.findIndex((photo) => photo.id === active.id);
    const newIndex = photos.findIndex((photo) => photo.id === over.id);
    const reordered = arrayMove(photos, oldIndex, newIndex);
    const previousPhotos = photos;
    setPhotos(reordered);

    void reorderPhotos(
      packageId,
      reordered.map((photo, index) => ({ id: photo.id, displayOrder: index }))
    )
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          setPhotos(previousPhotos);
        }
      })
      .catch(() => {
        toast.error(GENERIC_ERROR_MESSAGE);
        setPhotos(previousPhotos);
      });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="photo-upload-input"
          className="text-sm leading-[1.5] font-medium"
        >
          Upload photos
        </label>
        <input
          id="photo-upload-input"
          type="file"
          accept="image/*"
          multiple
          disabled={isUploading}
          onChange={handleFilesSelected}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
        />
        {isUploading ? (
          <p className="text-sm text-muted-foreground">Uploading...</p>
        ) : null}
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No photos yet. Upload some above.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={photos.map((photo) => photo.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  url={urlFor(photo.storagePath)}
                  onDelete={handleDelete}
                  isDeleting={deletingId === photo.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
