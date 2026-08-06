"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deletePartner } from "@/actions/partners";
import { PartnerForm, type PartnerRecord } from "./partner-form";
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

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Display-ready partners row, as assembled server-side by 06-08's
 * /admin/content page: PartnerRecord's raw editable fields (logoStoragePath
 * stays a bare Storage path -- PartnerForm's edit-mode default value and
 * updatePartner() both need the raw path, never a resolved URL, or a
 * no-photo-change save would overwrite logo_storage_path with a public URL)
 * plus one display-only resolved logoUrl this list needs to actually render
 * an <img>. Mirrors hero-slides-list.tsx's HeroSlideListItem split between a
 * form-facing raw path and a display-only resolved URL.
 */
export type PartnerListItem = PartnerRecord & { logoUrl: string };

/**
 * Renders TWO fully independent sub-sections (Brand Partners, Corporate
 * Clients) stacked vertically within one admin tab, each with its own Add
 * button, empty state, and delete confirmation (D-07). The two sub-sections'
 * state is kept fully separate -- no shared "partners" state array anywhere
 * in this component.
 */
export function PartnersList({
  initialBrandPartners,
  initialCorporateClients,
}: {
  initialBrandPartners: PartnerListItem[];
  initialCorporateClients: PartnerListItem[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <PartnerSubSection
        partnerType="brand_partner"
        heading="Brand Partners"
        addLabel="Add Partner"
        emptyHeading="No partners yet"
        emptyBody="Add a logo to display in the homepage's Brand Partners section. This section stays hidden on the public site until at least one is added."
        removeBody="This logo will be removed from the homepage's Brand Partners section immediately."
        initialItems={initialBrandPartners}
      />

      <PartnerSubSection
        partnerType="corporate_client"
        heading="Corporate Clients"
        addLabel="Add Client"
        emptyHeading="No clients yet"
        emptyBody="Add a logo to display in the homepage's Corporate Clients section. This section stays hidden on the public site until at least one is added."
        removeBody="This logo will be removed from the homepage's Corporate Clients section immediately."
        initialItems={initialCorporateClients}
      />
    </div>
  );
}

function PartnerSubSection({
  partnerType,
  heading,
  addLabel,
  emptyHeading,
  emptyBody,
  removeBody,
  initialItems,
}: {
  partnerType: "brand_partner" | "corporate_client";
  heading: string;
  addLabel: string;
  emptyHeading: string;
  emptyBody: string;
  removeBody: string;
  initialItems: PartnerListItem[];
}) {
  const [items, setItems] = useState(initialItems);
  // Adjusts `items` when fresh props arrive after router.refresh() (Next.js
  // preserves client state across refresh, so without this the list never
  // reflects a create/edit until a hard page reload). Calling setState
  // directly during render -- not in an Effect -- per React's documented
  // "adjusting state when a prop changes" pattern.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PartnerListItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<PartnerListItem | null>(
    null
  );
  const [isDeleting, startDeleting] = useTransition();
  const router = useRouter();

  function handleMutationSuccess() {
    setIsCreateOpen(false);
    setEditingItem(null);
    router.refresh();
  }

  function handleDelete() {
    if (!deletingItem) return;
    const target = deletingItem;

    startDeleting(async () => {
      try {
        const result = await deletePartner(target.id);
        if (result.ok) {
          toast.success("Logo removed.");
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
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
          {heading}
        </h3>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" />}>
            {addLabel}
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{addLabel}</DialogTitle>
            </DialogHeader>
            <PartnerForm
              mode="create"
              partnerType={partnerType}
              onSuccess={handleMutationSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            {emptyHeading}
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            {emptyBody}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4"
            >
              <div className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-md bg-secondary/10">
                {/* Plain <img>, not next/image -- the site-content Storage
                    bucket isn't in next.config.ts's Image Optimizer
                    remotePatterns (scoped only to package-photos), matching
                    hero-slides-list.tsx's precedent. */}
                <img
                  src={item.logoUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex gap-2">
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
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={editingItem !== null}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Logo</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <PartnerForm
              mode="edit"
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
            <AlertDialogTitle>Remove this logo?</AlertDialogTitle>
            <AlertDialogDescription>{removeBody}</AlertDialogDescription>
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
