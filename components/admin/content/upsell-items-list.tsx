"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { addUpsellItem, removeUpsellItem } from "@/actions/upsell-items";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/** Display-ready upsell_items row, assembled server-side by /admin/content. */
export type UpsellItemListItem = {
  id: string;
  packageId: string;
  packageName: string;
  imageUrl: string | null;
  priceLabel: string;
};

export type UpsellPackageOption = {
  id: string;
  name: string;
};

/**
 * Add/remove-only list for the upsell popup catalog -- no drag-reorder
 * (public display always shuffles, so a stored order would never be
 * respected -- see the design doc) and no edit form (nothing to edit
 * besides membership: which package, present or absent). Mirrors
 * testimonials-list.tsx's exact table/card composition and
 * hero-slides-list.tsx's AlertDialog delete-confirmation pattern.
 */
export function UpsellItemsList({
  initialItems,
  packageOptions,
}: {
  initialItems: UpsellItemListItem[];
  packageOptions: UpsellPackageOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  // Adjusts `items` when fresh props arrive after router.refresh() -- see
  // hero-slides-list.tsx/testimonials-list.tsx for why this runs during
  // render, not in an Effect.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<UpsellItemListItem | null>(
    null
  );
  const [isDeleting, startDeleting] = useTransition();

  function handleAddSuccess() {
    setIsAddOpen(false);
    router.refresh();
  }

  function handleDelete() {
    if (!deletingItem) return;
    const target = deletingItem;

    startDeleting(async () => {
      try {
        const result = await removeUpsellItem(target.id);
        if (result.ok) {
          toast.success("Removed from the upsell popup.");
          setItems((current) => current.filter((item) => item.id !== target.id));
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
      <div className="flex justify-end">
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={<Button size="lg" />}>Add Item</DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Upsell Item</DialogTitle>
            </DialogHeader>
            <AddUpsellItemForm
              packageOptions={packageOptions}
              onSuccess={handleAddSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No upsell items yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add packages to feature in the popup shown to first-time
            visitors on the public site.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.packageName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.priceLabel}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeletingItem(item)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {items.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{item.packageName}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.priceLabel}
                  </p>
                </div>
                <div className="mt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeletingItem(item)}
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <AlertDialog
        open={deletingItem !== null}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this item?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingItem?.packageName} will stop appearing in the upsell
              popup immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddUpsellItemForm({
  packageOptions,
  onSuccess,
}: {
  packageOptions: UpsellPackageOption[];
  onSuccess: () => void;
}) {
  const [packageId, setPackageId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const packageItems = packageOptions.map(({ id, name }) => ({
    value: id,
    label: name,
  }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!packageId) return;

    setIsSubmitting(true);
    try {
      const result = await addUpsellItem(packageId);
      if (result.ok) {
        toast.success("Added to the upsell popup.");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (packageOptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every published package is already in the upsell popup -- publish a
        new package, or remove one from the list first, to add another.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Select
        items={packageItems}
        value={packageId}
        onValueChange={(value) => setPackageId(value ?? "")}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a package" />
        </SelectTrigger>
        <SelectContent>
          {packageOptions.map((pkg) => (
            <SelectItem key={pkg.id} value={pkg.id}>
              {pkg.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || !packageId}
        className="self-end"
      >
        {isSubmitting ? "Adding..." : "Add Item"}
      </Button>
    </form>
  );
}
