"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteDestination,
  toggleDestinationActive,
} from "@/actions/destinations";
import { DestinationForm, type DestinationRecord } from "./destination-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type DestinationListItem = DestinationRecord & {
  photoUrl: string | null;
};

/**
 * Combines Dialog-wrapped add/edit DestinationForm with an AlertDialog
 * delete confirmation and a per-row active/inactive Switch, mirroring
 * hero-slides-list.tsx's composition (minus drag-reorder, out of scope
 * per the design spec) and package-list-row.tsx's optimistic-toggle
 * Switch pattern.
 */
export function DestinationsList({
  initialDestinations,
}: {
  initialDestinations: DestinationListItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialDestinations);
  const [prevInitialDestinations, setPrevInitialDestinations] = useState(
    initialDestinations
  );
  if (initialDestinations !== prevInitialDestinations) {
    setPrevInitialDestinations(initialDestinations);
    setItems(initialDestinations);
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDestination, setEditingDestination] =
    useState<DestinationListItem | null>(null);
  const [deletingDestination, setDeletingDestination] =
    useState<DestinationListItem | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  function handleMutationSuccess() {
    setIsCreateOpen(false);
    setEditingDestination(null);
    router.refresh();
  }

  function handleDelete() {
    if (!deletingDestination) return;
    const target = deletingDestination;

    startDeleting(async () => {
      try {
        const result = await deleteDestination(target.id);
        if (result.ok) {
          toast.success("Destination deleted.");
          setItems((current) =>
            current.filter((item) => item.id !== target.id)
          );
          setDeletingDestination(null);
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
            Add Destination
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Destination</DialogTitle>
            </DialogHeader>
            <DestinationForm mode="create" onSuccess={handleMutationSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No destinations yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a destination so packages can be linked to it and travelers
            can browse by destination on the homepage.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <DestinationRow
              key={item.id}
              item={item}
              onEdit={() => setEditingDestination(item)}
              onDelete={() => setDeletingDestination(item)}
              onMutated={() => router.refresh()}
            />
          ))}
        </div>
      )}

      <Dialog
        open={editingDestination !== null}
        onOpenChange={(open) => !open && setEditingDestination(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Destination</DialogTitle>
          </DialogHeader>
          {editingDestination && (
            <DestinationForm
              mode="edit"
              destination={editingDestination}
              onSuccess={handleMutationSuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingDestination !== null}
        onOpenChange={(open) => !open && setDeletingDestination(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this destination?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the homepage and package picker
              immediately. Destinations still linked to a package can&apos;t
              be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete Destination"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DestinationRow({
  item,
  onEdit,
  onDelete,
  onMutated,
}: {
  item: DestinationListItem;
  onEdit: () => void;
  onDelete: () => void;
  onMutated: () => void;
}) {
  const [isActive, setIsActive] = useState(item.isActive);
  const [isPending, startTransition] = useTransition();

  function handleActiveChange(checked: boolean) {
    setIsActive(checked);
    startTransition(async () => {
      try {
        const result = await toggleDestinationActive(item.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          setIsActive(!checked);
        } else {
          onMutated();
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        setIsActive(!checked);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      {/* Plain <img>, not next/image -- site-content isn't in
          next.config.ts's Image Optimizer remotePatterns (mirrors
          hero-slides-list.tsx's identical thumbnail convention). */}
      {item.photoUrl ? (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-secondary/10">
          <img
            src={item.photoUrl}
            alt=""
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div className="size-16 shrink-0 rounded-md bg-secondary/10" />
      )}

      <div className="flex-1">
        <p className="font-medium">{item.name}</p>
        <Badge variant="outline" className="capitalize">
          {item.region}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={isActive}
          onCheckedChange={handleActiveChange}
          disabled={isPending}
        />
        <span className="text-sm text-muted-foreground">Active</span>
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
