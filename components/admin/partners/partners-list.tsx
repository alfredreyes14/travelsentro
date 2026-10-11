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

import {
  deletePartner,
  reorderPartners,
  togglePartnerPublished,
} from "@/actions/partners";
import { PartnerForm, type PartnerRecord } from "./partner-form";
import {
  PARTNER_TYPE_LABELS,
  type PartnerType,
} from "@/lib/partners/partner-type";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
 * One group's partner manager (Brand Partners or Corporate Clients) --
 * same composition as content/visa-services-list.tsx: Dialog-wrapped
 * add/edit form, dnd-kit drag-reorder, per-row optimistic visibility
 * Switch and AlertDialog-confirmed delete. Rendered once per tab on
 * /admin/partners; each instance only ever sees its own group's rows.
 */
export function PartnersList({
  partnerType,
  initialItems,
}: {
  partnerType: PartnerType;
  initialItems: PartnerRecord[];
}) {
  const labels = PARTNER_TYPE_LABELS[partnerType];
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  // Adjusts `items` when fresh props arrive after router.refresh() (see
  // content/faqs-list.tsx for the rationale).
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PartnerRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<PartnerRecord | null>(null);
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
    setEditingItem(null);
    router.refresh();
  }

  function handlePublishedChange(id: string, isPublished: boolean) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isPublished } : item))
    );
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
        const result = await reorderPartners(
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
    if (!deletingItem) return;
    const target = deletingItem;

    startDeleting(async () => {
      try {
        const result = await deletePartner(target.id);
        if (result.ok) {
          toast.success(`${labels.singular} deleted.`);
          setItems((current) =>
            current.filter((item) => item.id !== target.id)
          );
          setDeletingItem(null);
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
        <p className="text-sm text-muted-foreground">
          Shown on the homepage {labels.placement}, in this order. Drag to
          reorder; hidden logos stay saved here. A logo with a website link
          opens that site in a new tab when clicked.
        </p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" className="shrink-0" />}>
            Add {labels.singular}
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add {labels.singular}</DialogTitle>
            </DialogHeader>
            <PartnerForm
              partnerType={partnerType}
              onSuccess={handleMutationSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No {labels.plural.toLowerCase()} yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a logo and, if you like, the website it should link to. The
            homepage shows a &ldquo;coming soon&rdquo; note until the first
            one is visible.
          </p>
        </div>
      ) : (
        <DndContext
          // A stable id: dnd-kit otherwise numbers its aria-describedby
          // from a module-level counter that keeps climbing on the
          // server, so the server HTML and the client disagree on hydrate.
          id={`partners-dnd-${partnerType}`}
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
                <PartnerRow
                  key={item.id}
                  item={item}
                  onEdit={() => setEditingItem(item)}
                  onDelete={() => setDeletingItem(item)}
                  onPublishedChange={handlePublishedChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {labels.singular}</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <PartnerForm
              key={editingItem.id}
              partnerType={partnerType}
              partner={editingItem}
              onSuccess={handleMutationSuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingItem !== null}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this {labels.singular.toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deletingItem?.name}&rdquo; will be removed from the
              homepage immediately. To keep it for later, hide it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : `Delete ${labels.singular}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PartnerRow({
  item,
  onEdit,
  onDelete,
  onPublishedChange,
}: {
  item: PartnerRecord;
  onEdit: () => void;
  onDelete: () => void;
  onPublishedChange: (id: string, isPublished: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
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

  function handlePublishedChange(checked: boolean) {
    onPublishedChange(item.id, checked);
    startTransition(async () => {
      try {
        const result = await togglePartnerPublished(item.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          onPublishedChange(item.id, !checked);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        onPublishedChange(item.id, !checked);
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="-my-2 flex size-11 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
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

        {/* Plain <img> -- admin thumbnail, mirrors visa-services-list.tsx.
            White tile + object-contain so a transparent logo stays
            legible and uncropped. */}
        <img
          src={getPublicImageUrl(item.logoStoragePath)}
          alt=""
          className="h-14 w-28 shrink-0 rounded-md bg-white object-contain p-2 ring-1 ring-foreground/10"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.name}</p>
            {!item.isPublished && <Badge variant="outline">Hidden</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {item.linkUrl ?? "No link"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-13 sm:pl-0">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={item.isPublished}
            onCheckedChange={handlePublishedChange}
            disabled={isPending}
          />
          Visible
        </label>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
