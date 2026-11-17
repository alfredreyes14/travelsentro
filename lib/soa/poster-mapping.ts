import type { SoaLineItem } from "@/components/admin/soa/soa-form-schema";
import type { PosterExtraction } from "@/lib/packages/poster-prompt";

/**
 * A line item read from a flyer. unitPrice is null when the admin must
 * type it: the package price the flyer didn't print, or an exclusion
 * (billed only if the agency collects it -- otherwise the admin deletes it).
 */
export type SoaPosterLineItem = {
  description: string;
  quantity: number;
  unitPrice: number | null;
};

export const SOA_INCLUSION_PREFIX = "Inclusion: ";
export const SOA_EXCLUSION_PREFIX = "Exclusion: ";

function clean(text: string | null | undefined): string {
  return (text ?? "").trim();
}

/**
 * Flyer -> SOA line items: the package at its per-pax price, each
 * inclusion at ₱0 (covered by the package), each exclusion with a blank
 * price. Pure: no I/O. Returns [] when the flyer yields nothing usable.
 */
export function mapPosterToSoaLineItems(raw: PosterExtraction): SoaPosterLineItem[] {
  const inclusions = raw.inclusions.map(clean).filter(Boolean);
  const exclusions = raw.exclusions.map(clean).filter(Boolean);
  const name = clean(raw.name);
  const duration = clean(raw.durationLabel);
  const price =
    raw.pricePerPax !== null && Number.isFinite(raw.pricePerPax) && raw.pricePerPax >= 0
      ? Math.round(raw.pricePerPax * 100) / 100
      : null;

  const items: SoaPosterLineItem[] = [];

  if (name || price !== null || inclusions.length || exclusions.length) {
    const base = name || "Tour package";
    const description =
      duration && !base.toLowerCase().includes(duration.toLowerCase())
        ? `${base} (${duration})`
        : base;
    items.push({ description, quantity: 1, unitPrice: price });
  }

  for (const text of inclusions) {
    items.push({ description: `${SOA_INCLUSION_PREFIX}${text}`, quantity: 1, unitPrice: 0 });
  }
  for (const text of exclusions) {
    items.push({ description: `${SOA_EXCLUSION_PREFIX}${text}`, quantity: 1, unitPrice: null });
  }

  return items;
}

/** A row the admin hasn't touched: the blank starter row of a new SOA. */
export function isBlankSoaLineItem(item: Partial<SoaLineItem> | undefined): boolean {
  if (!item) return true;
  const price: unknown = item.unitPrice;
  return (
    !clean(item.description) &&
    (price === undefined || price === null || (typeof price === "number" && !Number.isFinite(price)))
  );
}
