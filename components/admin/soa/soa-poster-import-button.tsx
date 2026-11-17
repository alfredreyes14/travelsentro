"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { extractSoaLineItemsFromPoster } from "@/actions/soa-poster";
import type { SoaPosterLineItem } from "@/lib/soa/poster-mapping";
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
import { useNavigationBlocker } from "@/components/admin/navigation-guard";

const GENERIC_ERROR_MESSAGE = "Something went wrong reading that poster. Please try again.";

/**
 * Optional AI helper on the SOA's line items: reads a tour poster and
 * hands back the package, its inclusions and exclusions as line items.
 * Never saves -- `onImport` adds them to the form for the admin to review.
 */
export function SoaPosterImportButton({
  onImport,
}: {
  onImport: (items: SoaPosterLineItem[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  useNavigationBlocker({
    when: isExtracting,
    title: "Still reading the poster",
    description:
      "This poster hasn't finished processing. If you leave now the import is cancelled and no line items are added.",
    confirmLabel: "Leave anyway",
  });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file twice still fires onChange
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
      let prepared: Awaited<ReturnType<typeof preparePosterForUpload>>;
      try {
        prepared = await preparePosterForUpload(file);
      } catch {
        toast.error(POSTER_PREP_FAILED_MESSAGE);
        return;
      }

      const result = await extractSoaLineItemsFromPoster({
        base64: prepared.base64,
        mimeType: prepared.mimeType,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const items = result.lineItems ?? [];
      if (items.length === 0) {
        toast.warning(
          "No package, inclusions or exclusions could be read from that poster. Try a clearer image, or add the items by hand."
        );
        return;
      }

      onImport(items);
      const needPrice = items.filter((i) => i.unitPrice === null).length;
      toast.success(
        `Added ${items.length} line item${items.length === 1 ? "" : "s"} from the poster.` +
          (needPrice > 0
            ? ` ${needPrice} need${needPrice === 1 ? "s" : ""} a price — fill in what you bill and remove the rest.`
            : "")
      );
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
        type="button"
        variant="outline"
        size="sm"
        disabled={isExtracting}
        aria-busy={isExtracting}
        onClick={() => inputRef.current?.click()}
      >
        {isExtracting ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <SparklesIcon aria-hidden="true" />
        )}
        {isExtracting ? "Reading poster..." : "Import from poster"}
      </Button>
    </>
  );
}
