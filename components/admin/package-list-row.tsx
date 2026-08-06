"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import {
  featurePackage,
  publishPackage,
  softDeletePackage,
} from "@/actions/packages";
import type { AdminPackageListItem } from "@/app/admin/(dashboard)/packages/page";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export function PackageListRow({
  item,
  onMutated,
  onDeleted,
}: {
  item: AdminPackageListItem;
  onMutated: () => void;
  onDeleted: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const [isPublished, setIsPublished] = useState(item.isPublished);
  const [isFeatured, setIsFeatured] = useState(item.isFeatured);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  function handlePublishChange(checked: boolean) {
    setIsPublished(checked);
    startTransition(async () => {
      try {
        const result = await publishPackage(item.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          setIsPublished(!checked);
        } else {
          onMutated();
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        setIsPublished(!checked);
      }
    });
  }

  function handleFeatureChange(checked: boolean) {
    setIsFeatured(checked);
    startTransition(async () => {
      try {
        const result = await featurePackage(item.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          setIsFeatured(!checked);
        } else {
          onMutated();
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        setIsFeatured(!checked);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await softDeletePackage(item.id);
        if (result.ok) {
          toast.success("Package deleted.");
          setIsDeleteOpen(false);
          onDeleted(item.id);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  return (
    <>
      <TableRow ref={setNodeRef} style={style}>
        <TableCell>
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
        </TableCell>
        <TableCell>
          <div className="relative size-12 overflow-hidden rounded-md bg-secondary/10">
            {item.photoUrl ? (
              <Image
                src={item.photoUrl}
                alt={item.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            ) : null}
          </div>
        </TableCell>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Switch
              checked={isPublished}
              onCheckedChange={handlePublishChange}
              disabled={isPending}
            />
            <span className="text-sm text-muted-foreground">Published</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Switch
              checked={isFeatured}
              onCheckedChange={handleFeatureChange}
              disabled={isPending}
            />
            <span className="text-sm text-muted-foreground">Featured</span>
          </div>
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <MoreHorizontalIcon />
              <span className="sr-only">Open actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={<Link href={`/admin/packages/${item.id}`} />}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this package?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{item.name}&quot; will be removed from the admin list and
              the public site immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? "Deleting..." : "Delete Package"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
