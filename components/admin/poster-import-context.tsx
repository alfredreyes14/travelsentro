"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { UnmappedField } from "@/lib/packages/poster-mapping";

/**
 * One import into a form: a flyer extraction (package or quote) or a
 * package copied into a quote. `values` is loosely typed because the same
 * provider serves both PackageForm and QuoteForm; useFormImport() narrows
 * it to the consuming form's values type. `origin` lets QuoteForm record
 * where a quote came from; PackageForm ignores it.
 */
export type FormImport = {
  values: Record<string, unknown>;
  unmapped: UnmappedField[];
  origin?: { source: "flyer" } | { source: "package"; packageId: string };
};

type PosterImportContextValue = {
  extraction: FormImport | null;
  /**
   * Increments on every successful import. useFormImport keys its reset effect
   * on this rather than on the extraction object, so importing a second
   * poster with identical results still re-fills the form.
   */
  importSeq: number;
  isDismissed: boolean;
  applyExtraction: (result: FormImport) => void;
  dismiss: () => void;
};

const PosterImportContext = createContext<PosterImportContextValue | null>(null);

/**
 * Bridges the import controls (rendered in the page header) and the form
 * (rendered below it) -- they sit on opposite branches of the
 * page tree, so a shared parent holds the one piece of state between them.
 */
export function PosterImportProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{
    result: FormImport;
    seq: number;
  } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  const applyExtraction = useCallback((result: FormImport) => {
    setState((previous) => ({ result, seq: (previous?.seq ?? 0) + 1 }));
    setIsDismissed(false);
  }, []);

  const dismiss = useCallback(() => setIsDismissed(true), []);

  const value = useMemo<PosterImportContextValue>(
    () => ({
      extraction: state?.result ?? null,
      importSeq: state?.seq ?? 0,
      isDismissed,
      applyExtraction,
      dismiss,
    }),
    [state, isDismissed, applyExtraction, dismiss]
  );

  return (
    <PosterImportContext value={value}>{children}</PosterImportContext>
  );
}

export function usePosterImport(): PosterImportContextValue {
  const context = useContext(PosterImportContext);
  if (context === null) {
    throw new Error("usePosterImport must be used within a PosterImportProvider");
  }
  return context;
}
