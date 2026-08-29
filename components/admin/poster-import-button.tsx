"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { extractPackageFromPoster } from "@/actions/package-poster";
import {
  ACCEPTED_POSTER_MIME_TYPES,
  MAX_POSTER_BYTES,
  isAcceptedMimeType,
  OVERSIZED_POSTER_MESSAGE,
  UNSUPPORTED_POSTER_MESSAGE,
} from "@/lib/packages/poster-upload-limits";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { Button } from "@/components/ui/button";
import { usePosterImport } from "./poster-import-context";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

/**
 * Rendered in the package page header, and only for a package that has never
 * been saved (see app/admin/(dashboard)/packages/[id]/page.tsx). Uploads a
 * poster, hands the extraction to PosterImportProvider, and reports the
 * outcome -- it never writes to the database itself.
 */
export function PosterImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const { applyExtraction } = usePosterImport();

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
      const base64 = await readFileAsBase64(file);
      const result = await extractPackageFromPoster({
        base64,
        mimeType: file.type,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      applyExtraction({
        values: result.values ?? {},
        unmapped: result.unmapped ?? [],
      });

      const filledCount = Object.keys(result.values ?? {}).length;
      const missingCount = result.unmapped?.length ?? 0;

      if (filledCount === 0) {
        toast.warning(
          "Nothing could be read from that poster. Try a clearer image, or fill the form in manually."
        );
      } else if (missingCount > 0) {
        toast.success(
          `Filled ${filledCount} field${filledCount === 1 ? "" : "s"} — ${missingCount} still need${missingCount === 1 ? "s" : ""} your attention.`
        );
      } else {
        toast.success(`Filled ${filledCount} fields from the poster.`);
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
        variant="outline"
        size="lg"
        disabled={isExtracting}
        onClick={() => inputRef.current?.click()}
      >
        <SparklesIcon />
        {isExtracting ? "Reading poster..." : "Import from Poster"}
      </Button>
    </>
  );
}
