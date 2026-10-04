"use client";

import { useCallback, useState } from "react";

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

export type RequestRemove = (
  hasContent: boolean,
  label: string,
  onConfirm: () => void
) => void;

/**
 * Removing a row that has content asks first; an empty row goes straight
 * away. `noun` finishes the sentence "can't be undone once you save the
 * <noun>". Render `dialog` once inside the form.
 */
export function useRemoveConfirmation(noun: string): {
  requestRemove: RequestRemove;
  dialog: React.ReactNode;
} {
  const [pendingRemoval, setPendingRemoval] = useState<{
    label: string;
    onConfirm: () => void;
  } | null>(null);

  const requestRemove = useCallback<RequestRemove>(
    (hasContent, label, onConfirm) => {
      if (hasContent) {
        setPendingRemoval({ label, onConfirm });
      } else {
        onConfirm();
      }
    },
    []
  );

  const dialog = (
    <AlertDialog
      open={pendingRemoval !== null}
      onOpenChange={(open) => !open && setPendingRemoval(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {pendingRemoval?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete its content. This can&apos;t be undone once
            you save the {noun}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              pendingRemoval?.onConfirm();
              setPendingRemoval(null);
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestRemove, dialog };
}
