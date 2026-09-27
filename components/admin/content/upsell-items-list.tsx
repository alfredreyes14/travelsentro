"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { addUpsellItem, removeUpsellItem } from "@/actions/upsell-items";
import { updatePackageDiscount } from "@/actions/packages";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
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
  pricePerPax: number;
  discountAmount: number | null;
  priceOriginal: string | null;
  priceFinal: string;
  /**
   * True when the linked package is unpublished or soft-deleted. The
   * authenticated admin session can still see (and remove) this row --
   * unlike the public popup, which silently excludes it via RLS -- so
   * this flag renders as a badge rather than hiding the row outright,
   * keeping the admin's view manageable instead of just inaccurate.
   */
  isHidden: boolean;
};

export type UpsellPackageOption = {
  id: string;
  name: string;
  pricePerPax: number;
  discountAmount: number | null;
};

/**
 * Add/remove/edit list for the upsell popup catalog -- no drag-reorder
 * (public display always shuffles, so a stored order would never be
 * respected -- see the design doc). "Edit" only ever adjusts the
 * package's discount (the same field PackageCard and the package detail
 * page read -- see actions/packages.ts's updatePackageDiscount) -- which
 * package is in the list is fixed at add time; changing that means
 * remove-and-re-add, same as before. Mirrors testimonials-list.tsx's
 * exact table/card composition and hero-slides-list.tsx's AlertDialog
 * delete-confirmation pattern.
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
  const [editingItem, setEditingItem] = useState<UpsellItemListItem | null>(
    null
  );
  const [deletingItem, setDeletingItem] = useState<UpsellItemListItem | null>(
    null
  );
  const [isDeleting, startDeleting] = useTransition();

  function handleMutationSuccess() {
    setIsAddOpen(false);
    setEditingItem(null);
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
            <UpsellItemForm
              mode="add"
              packageOptions={packageOptions}
              onSuccess={handleMutationSuccess}
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
                  <TableHead className="w-40">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {item.packageName}
                        {item.isHidden ? (
                          <Badge variant="secondary">Hidden</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {item.priceOriginal ? (
                          <span className="line-through">
                            {item.priceOriginal}
                          </span>
                        ) : null}
                        {item.priceFinal}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingItem(item)}
                        >
                          Edit
                        </Button>
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.packageName}</p>
                    {item.isHidden ? (
                      <Badge variant="secondary">Hidden</Badge>
                    ) : null}
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {item.priceOriginal ? (
                      <span className="line-through">
                        {item.priceOriginal}
                      </span>
                    ) : null}
                    {item.priceFinal}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingItem(item)}
                  >
                    Edit
                  </Button>
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

      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Discount</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <UpsellItemForm
              mode="edit"
              item={editingItem}
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

/**
 * Dual add/edit form -- mirrors hero-slide-form.tsx's exact create/edit
 * dispatch shape. "Add" picks a package (filtered to ones not already in
 * the list) and optionally sets its discount in the same save; "Edit"
 * only ever adjusts an existing item's discount (which package it is
 * isn't editable -- remove and re-add for that). Both modes show
 * "Original Price" read-only, since editing the price itself belongs in
 * the full package editor, not here.
 */
type UpsellItemFormProps =
  | {
      mode: "add";
      packageOptions: UpsellPackageOption[];
      onSuccess: () => void;
    }
  | { mode: "edit"; item: UpsellItemListItem; onSuccess: () => void };

function UpsellItemForm(props: UpsellItemFormProps) {
  if (props.mode === "add") {
    return (
      <AddUpsellItemForm
        packageOptions={props.packageOptions}
        onSuccess={props.onSuccess}
      />
    );
  }

  return <EditUpsellItemForm item={props.item} onSuccess={props.onSuccess} />;
}

function AddUpsellItemForm({
  packageOptions,
  onSuccess,
}: {
  packageOptions: UpsellPackageOption[];
  onSuccess: () => void;
}) {
  const [packageId, setPackageId] = useState("");
  const [discount, setDiscount] = useState<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const packageItems = packageOptions.map(({ id, name }) => ({
    value: id,
    label: name,
  }));
  const selectedPackage = packageOptions.find((pkg) => pkg.id === packageId);

  function handlePackageChange(value: string | null) {
    const newPackageId = value ?? "";
    setPackageId(newPackageId);
    const pkg = packageOptions.find((option) => option.id === newPackageId);
    // Pre-fills with whatever discount the package already has (e.g. a
    // sitewide sale set from the full package editor) rather than
    // starting blank and silently overwriting it on save.
    setDiscount(pkg?.discountAmount ?? undefined);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!packageId) return;

    setIsSubmitting(true);
    try {
      const result = await addUpsellItem(packageId, discount ?? null);
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
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Package</label>
        <Select items={packageItems} value={packageId} onValueChange={handlePackageChange}>
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
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Price per pax</label>
        <Input
          disabled
          readOnly
          prefix="₱"
          value={
            selectedPackage
              ? selectedPackage.pricePerPax.toLocaleString("en-PH")
              : ""
          }
          placeholder="Select a package first"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Discount (PHP, optional)</label>
        <Input
          type="number"
          min={1}
          prefix="₱"
          value={discount ?? ""}
          disabled={!packageId}
          onChange={(event) =>
            setDiscount(
              event.target.value === "" ? undefined : event.target.valueAsNumber
            )
          }
        />
      </div>

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

function EditUpsellItemForm({
  item,
  onSuccess,
}: {
  item: UpsellItemListItem;
  onSuccess: () => void;
}) {
  const [discount, setDiscount] = useState<number | undefined>(
    item.discountAmount ?? undefined
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setIsSubmitting(true);
    try {
      const result = await updatePackageDiscount(
        item.packageId,
        discount ?? null
      );
      if (result.ok) {
        toast.success("Discount updated.");
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Package</label>
        <p className="text-sm text-muted-foreground">{item.packageName}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Price per pax</label>
        <Input
          disabled
          readOnly
          prefix="₱"
          value={item.pricePerPax.toLocaleString("en-PH")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Discount (PHP, optional)</label>
        <Input
          type="number"
          min={1}
          prefix="₱"
          value={discount ?? ""}
          onChange={(event) =>
            setDiscount(
              event.target.value === "" ? undefined : event.target.valueAsNumber
            )
          }
        />
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting} className="self-end">
        {isSubmitting ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
