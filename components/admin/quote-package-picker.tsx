"use client";

import { useState } from "react";
import { toast } from "sonner";

import { getPackageQuoteValues } from "@/actions/quotes";
import { usePosterImport } from "./poster-import-context";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";

export type QuotePackageOption = { id: string; name: string; slug: string };

/**
 * "Copy from a package": loads a published package's content and hands it
 * to QuoteForm through the same import channel as a flyer, so the
 * replace-what-you've-typed confirmation applies identically. The quote
 * gets a frozen copy -- later package edits never reach it.
 */
export function QuotePackagePicker({
  packages,
}: {
  packages: QuotePackageOption[];
}) {
  const { applyExtraction } = usePosterImport();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSelect(pkg: QuotePackageOption | null) {
    if (!pkg) return;
    setIsLoading(true);
    try {
      const result = await getPackageQuoteValues(pkg.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      applyExtraction({
        values: result.values ?? {},
        unmapped: [],
        origin: { source: "package", packageId: pkg.id },
      });
      toast.success(`Loaded "${pkg.name}".`);
    } catch {
      toast.error("Couldn't load that package. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-72">
      <Combobox
        items={packages}
        value={null}
        onValueChange={handleSelect}
        disabled={isLoading}
        itemToStringLabel={(pkg: QuotePackageOption) => `${pkg.name} (${pkg.slug})`}
      >
        <ComboboxInputGroup>
          <ComboboxInput
            placeholder={isLoading ? "Loading package..." : "Copy from a package..."}
          />
          <ComboboxTrigger />
        </ComboboxInputGroup>
        <ComboboxPortal>
          <ComboboxPositioner>
            <ComboboxPopup>
              <ComboboxEmpty>No published packages found.</ComboboxEmpty>
              <ComboboxList>
                {(pkg: QuotePackageOption) => (
                  <ComboboxItem key={pkg.id} value={pkg}>
                    {pkg.name} ({pkg.slug})
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </ComboboxPositioner>
        </ComboboxPortal>
      </Combobox>
    </div>
  );
}
