"use client";

import { useEffect, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

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
import { usePosterImport, type FormImport } from "./poster-import-context";

/**
 * Applies imports from PosterImportProvider (a flyer extraction, or a
 * package copied into a quote) to `form`. An import replaces the whole
 * form: on an untouched form it applies straight away; if the admin has
 * already typed something, it asks first. Render `dialog` inside the form.
 * `onApplied` runs once the import actually lands (e.g. switch to the
 * Details tab, record the quote's source).
 */
export function useFormImport<V extends FieldValues>({
  form,
  emptyValues,
  noun,
  onApplied,
}: {
  form: UseFormReturn<V>;
  emptyValues: V;
  noun: string;
  onApplied: (applied: FormImport) => void;
}): { dialog: React.ReactNode } {
  const { extraction, importSeq } = usePosterImport();
  const [pendingImport, setPendingImport] = useState<{
    values: V;
    source: FormImport;
  } | null>(null);
  // Tracks which importSeq has already been handled -- dialog opened, or
  // immediate-apply tab switch performed -- so the derived render logic
  // below doesn't refire (and reopen a just-cancelled dialog, or re-force
  // the Details tab) on unrelated re-renders once importSeq itself stops
  // changing.
  const [handledImportSeq, setHandledImportSeq] = useState(0);

  const merge = (source: FormImport): V =>
    ({ ...emptyValues, ...(source.values as Partial<V>) }) as V;

  /**
   * Keyed on importSeq, not on `extraction`, so re-importing a poster that
   * yields identical values still re-fills the form.
   *
   * Both branches below are decided directly in the render body -- React's
   * documented "adjusting state when a value changes" alternative to an
   * Effect (https://react.dev/learn/you-might-not-need-an-effect). Neither
   * "should the confirmation dialog be open" nor "which tab is active" is
   * an imperative call to an external system; both are pure UI state
   * derivable from importSeq and the form's own isDirty flag. form.reset()
   * is different -- it mutates react-hook-form's internal store and
   * notifies subscribers -- so it alone stays in the effect below.
   */
  // Read unconditionally (not just inside the branch below) so react-hook-form
  // subscribes to isDirty at mount. RHF only computes isDirty once something
  // has read it through the formState proxy -- if the first read happened
  // inside the `importSeq !== 0` branch, the very first import would run
  // before the subscription existed and form.formState.isDirty would still
  // read stale/false, silently skipping the confirmation dialog.
  const isFormDirty = form.formState.isDirty;

  if (importSeq !== 0 && importSeq !== handledImportSeq && extraction !== null) {
    setHandledImportSeq(importSeq);
    if (isFormDirty) {
      setPendingImport({ values: merge(extraction), source: extraction });
    } else {
      onApplied(extraction);
    }
  }

  useEffect(() => {
    if (importSeq === 0 || extraction === null) return;
    if (isFormDirty) return; // handled above, during render

    form.reset(merge(extraction));
    // form and extraction are stable for a given importSeq; re-running on
    // their identity would re-apply the import on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importSeq]);

  const dialog = (
    <AlertDialog
      open={pendingImport !== null}
      onOpenChange={(open) => !open && setPendingImport(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace what you&apos;ve entered?</AlertDialogTitle>
          <AlertDialogDescription>
            Importing this {noun} will overwrite everything currently in
            this form, including any changes you&apos;ve typed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingImport) {
                form.reset(pendingImport.values);
                onApplied(pendingImport.source);
              }
              setPendingImport(null);
            }}
          >
            Replace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog };
}
