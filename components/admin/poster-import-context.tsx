"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { PosterMappingResult } from "@/lib/packages/poster-mapping";

type PosterImportContextValue = {
  extraction: PosterMappingResult | null;
  /**
   * Increments on every successful import. PackageForm keys its reset effect
   * on this rather than on the extraction object, so importing a second
   * poster with identical results still re-fills the form.
   */
  importSeq: number;
  isDismissed: boolean;
  applyExtraction: (result: PosterMappingResult) => void;
  dismiss: () => void;
};

const PosterImportContext = createContext<PosterImportContextValue | null>(null);

/**
 * Bridges the Import from Poster button (rendered in the page header) and
 * PackageForm (rendered below it) -- they sit on opposite branches of the
 * page tree, so a shared parent holds the one piece of state between them.
 */
export function PosterImportProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{
    result: PosterMappingResult;
    seq: number;
  } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  const applyExtraction = useCallback((result: PosterMappingResult) => {
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
