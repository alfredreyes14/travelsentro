"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, ImagePlusIcon, XIcon } from "lucide-react";

import { createSlide, deleteSlide, reorderSlides } from "@/actions/hero-slides";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { shrinkImageToFit, type ShrinkAttempt } from "@/lib/images/shrink-image";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

// The hero renders every slide at 16:9, full viewport width. 1920x1080 covers
// typical desktop screens; anything under MIN_RECOMMENDED_WIDTH gets a soft
// "may look blurry" warning (the upload still goes through).
const RECOMMENDED_ASPECT = 16 / 9;
const ASPECT_TOLERANCE = 0.05;
const MIN_RECOMMENDED_WIDTH = 1600;

// Full-width hero images get a larger budget than testimonial photos, but
// still stay well under next.config.ts's 10 MB Server Action body limit
// once base64-encoded (+33%).
const MAX_HERO_BYTES = 3 * 1024 * 1024;
const PASSTHROUGH_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SHRINK_ATTEMPTS: ReadonlyArray<ShrinkAttempt> = [
  { maxEdge: 2560, quality: 0.85 },
  { maxEdge: 1920, quality: 0.85 },
  { maxEdge: 1920, quality: 0.75 },
  { maxEdge: 1920, quality: 0.65 },
];

/**
 * Small web-friendly files upload untouched; anything larger (or in a
 * format like HEIC) is downscaled/re-encoded in the browser first.
 */
async function prepareHeroImage(file: File): Promise<Blob> {
  if (PASSTHROUGH_MIME_TYPES.includes(file.type) && file.size <= MAX_HERO_BYTES) {
    return file;
  }
  return shrinkImageToFit(file, MAX_HERO_BYTES, SHRINK_ATTEMPTS);
}

/**
 * Returns a warning for an image that isn't ~16:9 or is too small for a
 * full-width hero, or null if it's fine. Undecodable files return null --
 * prepareHeroImage reports those.
 */
async function getSizeWarning(file: File): Promise<string | null> {
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch {
    return null;
  }

  if (width < MIN_RECOMMENDED_WIDTH) {
    return `${file.name} is only ${width}px wide and may look blurry on large screens. 1920×1080 is recommended.`;
  }
  const aspect = width / height;
  if (Math.abs(aspect - RECOMMENDED_ASPECT) / RECOMMENDED_ASPECT > ASPECT_TOLERANCE) {
    return `${file.name} isn't 16:9 (${width}×${height}), so its edges will be cropped on the homepage.`;
  }
  return null;
}

export type HeroSlideListItem = {
  id: string;
  imageUrl: string;
};

/**
 * Image-only hero carousel manager: multi-file upload (each file becomes a
 * slide appended to the end), drag-reorder (dnd-kit, same shape as
 * photo-manager.tsx's grid) and AlertDialog-confirmed removal.
 */
export function HeroSlidesList({
  initialSlides,
}: {
  initialSlides: HeroSlideListItem[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initialSlides);
  // Adjusts `items` when fresh props arrive after router.refresh() (Next.js
  // preserves client state across refresh). Calling setState directly
  // during render -- not in an Effect -- per React's documented "adjusting
  // state when a prop changes" pattern.
  const [prevInitialSlides, setPrevInitialSlides] = useState(initialSlides);
  if (initialSlides !== prevInitialSlides) {
    setPrevInitialSlides(initialSlides);
    setItems(initialSlides);
  }
  const [isUploading, setIsUploading] = useState(false);
  const [deletingSlide, setDeletingSlide] = useState<HeroSlideListItem | null>(
    null
  );
  const [isDeleting, startDeleting] = useTransition();
  const [, startReordering] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setIsUploading(true);
    let succeededCount = 0;
    try {
      // Sequential, never Promise.all: createSlide appends using the current
      // row count as sort_order, so concurrent calls would collide. It also
      // keeps the selection order as the carousel order.
      for (const file of files) {
        const warning = await getSizeWarning(file);

        let prepared: Blob;
        try {
          prepared = await prepareHeroImage(file);
        } catch {
          toast.error(
            `Couldn't process ${file.name}. Please use a JPG, PNG, or WebP image.`
          );
          continue;
        }

        try {
          const upload = await uploadSiteContentImage("hero-slides", {
            name: file.name,
            type: prepared.type,
            base64: await readFileAsBase64(prepared),
          });
          if (!upload.ok || !upload.storagePath) {
            toast.error(`Failed to upload ${file.name}.`);
            continue;
          }

          const created = await createSlide(upload.storagePath);
          if (!created.ok || !created.id) {
            toast.error(`Failed to upload ${file.name}.`);
            continue;
          }

          const newItem: HeroSlideListItem = {
            id: created.id,
            imageUrl: getPublicImageUrl(upload.storagePath),
          };
          setItems((current) => [...current, newItem]);
          succeededCount += 1;
          if (warning) toast.warning(warning);
        } catch {
          toast.error(`Failed to upload ${file.name}.`);
        }
      }
    } finally {
      setIsUploading(false);
    }

    if (succeededCount > 0) {
      toast.success(
        succeededCount === 1
          ? "Slide added."
          : `${succeededCount} slides added.`
      );
      router.refresh();
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    const previousItems = items;
    setItems(reordered);

    startReordering(async () => {
      try {
        const result = await reorderSlides(
          reordered.map((item, index) => ({ id: item.id, sortOrder: index }))
        );
        if (!result.ok) {
          toast.error(result.error);
          setItems(previousItems);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        setItems(previousItems);
      }
    });
  }

  function handleDelete() {
    if (!deletingSlide) return;
    const target = deletingSlide;

    startDeleting(async () => {
      try {
        const result = await deleteSlide(target.id);
        if (result.ok) {
          toast.success("Slide removed.");
          setItems((current) =>
            current.filter((item) => item.id !== target.id)
          );
          setDeletingSlide(null);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              Recommended: 1920 × 1080 px (16:9)
            </span>{" "}
            · JPG, PNG, or WebP
          </p>
          <p>
            On desktop the search bar sits over the center of the image —
            keep important text near the top or edges.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={handleFilesSelected}
        />
        <Button
          size="lg"
          className="shrink-0"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlusIcon />
          {isUploading ? "Uploading..." : "Add Images"}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No hero images yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add images to feature in the homepage carousel. Until then, the
            homepage shows a default image.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, index) => (
                <HeroSlideTile
                  key={item.id}
                  item={item}
                  position={index + 1}
                  onDelete={() => setDeletingSlide(item)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AlertDialog
        open={deletingSlide !== null}
        onOpenChange={(open) => !open && setDeletingSlide(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this image?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from the homepage carousel immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Removing..." : "Remove Image"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HeroSlideTile({
  item,
  position,
  onDelete,
}: {
  item: HeroSlideListItem;
  position: number;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2"
    >
      {/* Plain <img>, not next/image -- admin-only thumbnail, no need for
          next/image's optimization/lazy-loading. */}
      <div className="relative aspect-video overflow-hidden rounded-md bg-secondary/10">
        <img src={item.imageUrl} alt="" className="size-full object-cover" />
        <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {position}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex size-11 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
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

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex size-11 items-center justify-center text-destructive"
                onClick={onDelete}
              />
            }
          >
            <XIcon />
            <span className="sr-only">Remove image</span>
          </TooltipTrigger>
          <TooltipContent>Remove image</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
