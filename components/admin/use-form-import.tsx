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
 * `onApplied` runs when the import is accepted (e.g. switch to the Details
 * tab, record the quote's source). On an untouched form that is DURING
 * RENDER, before the reset effect; after the dialog's Replace, it is in the
 * click handler.
 *
 * Opt-in options: `confirmAfterImport` also asks before a repeat import
 * (an applied import makes its values the form's defaults, so isDirty alone
 * would let a second import silently replace the first); `preserveFields`
 * keeps those fields' current values across an import.
 */
export function useFormImport<V extends FieldValues>({
  form,
  emptyValues,
  noun,
  onApplied,
  confirmAfterImport = false,
  preserveFields,
}: {
  form: UseFormReturn<V>;
  emptyValues: V;
  noun: string;
  /**
   * May run during render: only set state owned by the component calling
   * this hook, and never read form values here.
   */
  onApplied: (applied: FormImport) => void;
  /** Also confirm when an earlier import was already applied to this form. */
  confirmAfterImport?: boolean;
  /** Fields whose current values survive an import. */
  preserveFields?: (keyof V)[];
}): { dialog: React.ReactNode } {
  const { extraction, importSeq } = usePosterImport();
  const [pendingImport, setPendingImport] = useState<{
    source: FormImport;
  } | null>(null);
  // Tracks which importSeq has already been handled -- dialog opened, or
  // immediate-apply tab switch performed -- so the derived render logic
  // below doesn't refire (and reopen a just-cancelled dialog, or re-force
  // the Details tab) on unrelated re-renders once importSeq itself stops
  // changing.
  const [handledImportSeq, setHandledImportSeq] = useState(0);
  // The importSeq whose render-time decision was "ask first". The effect
  // skips its reset for exactly that seq, so render and effect can't disagree.
  const [promptedImportSeq, setPromptedImportSeq] = useState(0);
  // Whether an import has been applied to this form (confirmAfterImport).
  const [hasAppliedImport, setHasAppliedImport] = useState(false);

  // Read form.getValues() only at apply time (effect / Replace click), never
  // during render.
  const merge = (source: FormImport): V => {
    const merged = {
      ...emptyValues,
      ...(source.values as Partial<V>),
    } as V;
    if (preserveFields?.length) {
      const current = form.getValues();
      for (const field of preserveFields) merged[field] = current[field];
    }
    return merged;
  };

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
    if (isFormDirty || (confirmAfterImport && hasAppliedImport)) {
      setPromptedImportSeq(importSeq);
      setPendingImport({ source: extraction });
    } else {
      setHasAppliedImport(true);
      onApplied(extraction);
    }
  }

  useEffect(() => {
    if (importSeq === 0 || extraction === null) return;
    if (promptedImportSeq === importSeq) return; // handled above, during render

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
                form.reset(merge(pendingImport.source));
                setHasAppliedImport(true);
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
