"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { extractPackageFromPoster } from "@/actions/package-poster";
import type { ActionResult } from "@/lib/action-result";
import type { UnmappedField } from "@/lib/packages/poster-mapping";
import {
  ACCEPTED_POSTER_MIME_TYPES,
  MAX_POSTER_BYTES,
  isAcceptedMimeType,
  OVERSIZED_POSTER_MESSAGE,
  POSTER_PREP_FAILED_MESSAGE,
  UNSUPPORTED_POSTER_MESSAGE,
} from "@/lib/packages/poster-upload-limits";
import { preparePosterForUpload } from "@/lib/packages/compress-poster-image";
import { Button } from "@/components/ui/button";
import { useNavigationBlocker } from "./navigation-guard";
import { usePosterImport } from "./poster-import-context";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

type ExtractAction = (input: {
  base64: string;
  mimeType: string;
}) => Promise<
  ActionResult & { values?: Record<string, unknown>; unmapped?: UnmappedField[] }
>;

/**
 * Uploads a poster/flyer, hands the extraction to PosterImportProvider, and
 * reports the outcome -- it never writes to the database itself. Defaults
 * are the package page's; the quote page passes extractQuoteFromPoster and
 * "flyer" wording.
 */
export function PosterImportButton({
  extract = extractPackageFromPoster,
  noun = "poster",
  label = "Import from Poster",
}: {
  extract?: ExtractAction;
  noun?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const { applyExtraction } = usePosterImport();

  // The extraction lives entirely in this component's state -- leaving the
  // page (or the tab) throws away the poster's details, so confirm first.
  useNavigationBlocker({
    when: isExtracting,
    title: `Still reading the ${noun}`,
    description: `This ${noun} hasn't finished processing. If you leave now the import is cancelled, and none of its details will be filled into the form.`,
    confirmLabel: "Leave anyway",
  });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    event.target.value = "";
    if (!file) return;

    if (!isAcceptedMimeType(file.type)) {
      toast.error(UNSUPPORTED_POSTER_MESSAGE);
      return;
    }

    if (file.size > MAX_POSTER_BYTES) {
      toast.error(OVERSIZED_POSTER_MESSAGE);
      return;
    }

    setIsExtracting(true);
    try {
      // A large poster is downscaled/re-encoded in the browser first so the
      // request stays under the extraction API's inline-image limit -- the
      // admin can pick a full-resolution export and it just works.
      let prepared: Awaited<ReturnType<typeof preparePosterForUpload>>;
      try {
        prepared = await preparePosterForUpload(file);
      } catch {
        toast.error(POSTER_PREP_FAILED_MESSAGE);
        return;
      }

      const result = await extract({
        base64: prepared.base64,
        mimeType: prepared.mimeType,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const filledCount = Object.keys(result.values ?? {}).length;
      const missingCount = result.unmapped?.length ?? 0;

      if (filledCount === 0) {
        // Spec: a successful call that yields nothing usable is not an
        // error -- the form is left untouched. Don't call applyExtraction
        // at all here: with values === {}, PackageForm's
        // form.reset({ ...EMPTY_DEFAULTS, ...values }) would reset to
        // EMPTY_DEFAULTS and wipe out createDraftPackage's "Untitled
        // Package" (and anything the admin had typed) for nothing.
        toast.warning(
          `Nothing could be read from that ${noun}. Try a clearer image, or fill the form in manually.`
        );
        return;
      }

      applyExtraction({
        values: result.values ?? {},
        unmapped: result.unmapped ?? [],
        origin: { source: "flyer" },
      });

      if (missingCount > 0) {
        // Wording is true whether or not a confirmation dialog is about to
        // gate applying these values (dirty-form path) -- "Filled" would be
        // a lie if the admin then cancels the replace-confirmation dialog.
        toast.success(
          `Read ${filledCount} field${filledCount === 1 ? "" : "s"} from the ${noun} — ${missingCount} still need${missingCount === 1 ? "s" : ""} your attention.`
        );
      } else {
        toast.success(
          `Read ${filledCount} field${filledCount === 1 ? "" : "s"} from the ${noun}.`
        );
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsExtracting(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_POSTER_MIME_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        size="lg"
        disabled={isExtracting}
        aria-busy={isExtracting}
        onClick={() => inputRef.current?.click()}
      >
        {isExtracting ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <SparklesIcon aria-hidden="true" />
        )}
        {isExtracting ? `Reading ${noun}...` : label}
      </Button>
    </>
  );
}
