"use client";

import { useState, useTransition } from "react";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";

import { deleteSlide, reorderSlides } from "@/actions/hero-slides";
import {
  HeroSlideForm,
  type HeroSlidePackageOption,
  type HeroSlideRecord,
} from "./hero-slide-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

/**
 * Display-ready hero_slides row, as assembled server-side by 06-08's
 * /admin/content page: HeroSlideRecord's raw editable fields plus two
 * display-only fields this list needs but the form doesn't (packageName for
 * package-type slide titles, imageUrl resolved from either the linked
 * package's own photo or this slide's own imageStoragePath).
 */
export type HeroSlideListItem = HeroSlideRecord & {
  packageName: string | null;
  imageUrl: string | null;
};

/**
 * Combines drag-reorder (dnd-kit, mirrors sortable-package-list.tsx exactly)
 * with Dialog-wrapped add/edit HeroSlideForm and an AlertDialog delete
 * confirmation (mirrors users-table.tsx's exact composition).
 */
export function HeroSlidesList({
  initialSlides,
  packages,
}: {
  initialSlides: HeroSlideListItem[];
  packages: HeroSlidePackageOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialSlides);
  // Adjusts `items` when fresh props arrive after router.refresh() (Next.js
  // preserves client state across refresh, so without this the list never
  // reflects a create/edit until a hard page reload). Calling setState
  // directly during render -- not in an Effect -- per React's documented
  // "adjusting state when a prop changes" pattern.
  const [prevInitialSlides, setPrevInitialSlides] = useState(initialSlides);
  if (initialSlides !== prevInitialSlides) {
    setPrevInitialSlides(initialSlides);
    setItems(initialSlides);
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<HeroSlideListItem | null>(
    null
  );
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

  function handleMutationSuccess() {
    setIsCreateOpen(false);
    setEditingSlide(null);
    router.refresh();
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
          toast.success("Slide deleted.");
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
      <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" />}>
            Add Slide
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Slide</DialogTitle>
            </DialogHeader>
            <HeroSlideForm
              mode="create"
              packages={packages}
              onSuccess={handleMutationSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No hero slides yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a photo or promotional slide to feature on the homepage
            carousel.
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
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <HeroSlideRow
                  key={item.id}
                  item={item}
                  onEdit={() => setEditingSlide(item)}
                  onDelete={() => setDeletingSlide(item)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog
        open={editingSlide !== null}
        onOpenChange={(open) => !open && setEditingSlide(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Slide</DialogTitle>
          </DialogHeader>
          {editingSlide && (
            <HeroSlideForm
              mode="edit"
              slide={editingSlide}
              packages={packages}
              onSuccess={handleMutationSuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingSlide !== null}
        onOpenChange={(open) => !open && setDeletingSlide(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slide?</AlertDialogTitle>
            <AlertDialogDescription>
              This slide will be removed from the homepage carousel
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete Slide"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HeroSlideRow({
  item,
  onEdit,
  onDelete,
}: {
  item: HeroSlideListItem;
  onEdit: () => void;
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

  const title =
    item.slideType === "package"
      ? (item.packageName ?? "Untitled package slide")
      : (item.headline ?? "Untitled promo slide");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
    >
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

      {/* Plain <img>, not next/image -- R2's hostname is allow-listed in
          next.config.ts's remotePatterns now, but this admin-only list row
          thumbnail doesn't need next/image's optimization/lazy-loading, so
          it's kept as a plain <img> intentionally. */}
      {item.imageUrl ? (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-secondary/10">
          <img src={item.imageUrl} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <div className="size-16 shrink-0 rounded-md bg-secondary/10" />
      )}

      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground capitalize">
          {item.slideType} slide
        </p>
      </div>

      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit
      </Button>
      <Button variant="destructive" size="sm" onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
