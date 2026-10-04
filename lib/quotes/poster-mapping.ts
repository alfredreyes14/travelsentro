import type { QuoteFormValues } from "@/components/admin/quote-form-schema";
import {
  mapPosterToFormValues,
  type UnmappedField,
} from "@/lib/packages/poster-mapping";
import type { PosterExtraction } from "@/lib/packages/poster-prompt";

/**
 * Flyer -> quote form values. Reuses the package mapper for every rule
 * (pricing, dates, partial drops, never-auto-fill-discount) and only
 * translates its output: name -> title, destination dropped (quotes have
 * none), and the discount hint re-pointed from the public site to the PDF.
 * Pure: no I/O.
 */
export function mapPosterToQuoteValues(raw: PosterExtraction): {
  values: Partial<QuoteFormValues>;
  unmapped: UnmappedField[];
} {
  const mapped = mapPosterToFormValues(raw, []);
  const v = mapped.values;

  const values: Partial<QuoteFormValues> = {
    title: v.name,
    pricePerPax: v.pricePerPax,
    discountAmount: v.discountAmount,
    durationLabel: v.durationLabel,
    remarks: v.remarks,
    travelDates: v.travelDates,
    itinerary: v.itinerary,
    inclusions: v.inclusions,
    exclusions: v.exclusions,
    bringItems: v.bringItems,
  };
  // Drop the keys the flyer didn't fill: the form merges with
  // `{ ...EMPTY_QUOTE_VALUES, ...values }`, and an explicit undefined would
  // overwrite a default (travelDates: undefined crashes useFieldArray).
  for (const key of Object.keys(values) as (keyof QuoteFormValues)[]) {
    if (values[key] === undefined) delete values[key];
  }

  const unmapped = mapped.unmapped
    .filter((entry) => entry.field !== "destinationId")
    .map((entry): UnmappedField => {
      if (entry.field === "name") {
        return {
          ...entry,
          field: "title",
          label: "Quote title",
          reason: "The flyer doesn't show a tour title. Type one on the Details tab.",
        };
      }
      if (entry.field === "discountAmount") {
        return {
          ...entry,
          reason: entry.reason.replace("on the site", "on the quote PDF"),
        };
      }
      return entry;
    });

  return { values, unmapped };
}
