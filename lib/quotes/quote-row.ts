import {
  inclusionItemSchema,
  itineraryDaySchema,
  travelDateSchema,
  type ItineraryContentValues,
} from "@/components/admin/itinerary-content-schema";
import type { QuoteFormValues } from "@/components/admin/quote-form-schema";
import type { Tables, TablesInsert } from "@/types/database";
import { z } from "zod";

export type QuoteSource = "manual" | "flyer" | "package";

/** Columns the quote form owns -- everything except id/quote_no/source/audit. */
export type QuoteRowPatch = Pick<
  TablesInsert<"quotes">,
  | "title"
  | "customer_name"
  | "contact_id"
  | "price_per_pax"
  | "discount_amount"
  | "duration_label"
  | "remarks"
  | "travel_dates"
  | "itinerary"
  | "inclusions"
  | "exclusions"
  | "bring_items"
>;

export type QuoteContentRow = Pick<
  Tables<"quotes">,
  | "title"
  | "customer_name"
  | "contact_id"
  | "price_per_pax"
  | "discount_amount"
  | "duration_label"
  | "remarks"
  | "travel_dates"
  | "itinerary"
  | "inclusions"
  | "exclusions"
  | "bring_items"
>;

/**
 * Re-validates jsonb on the way OUT of the database. Deliberately the same
 * item schemas the form writes with: a row that no longer matches (hand
 * edit, future schema change) must fail loudly rather than render a quote
 * PDF with silently missing sections.
 */
const storedContentSchema = z.object({
  travelDates: z.array(travelDateSchema),
  itinerary: z.array(itineraryDaySchema),
  inclusions: z.array(inclusionItemSchema),
  exclusions: z.array(inclusionItemSchema),
  bringItems: z.array(inclusionItemSchema),
});

export function quoteValuesToRow(values: QuoteFormValues): QuoteRowPatch {
  return {
    title: values.title.trim(),
    customer_name: values.customerName?.trim() || null,
    contact_id: values.contactId || null,
    price_per_pax: values.pricePerPax,
    discount_amount: values.discountAmount ?? null,
    duration_label: values.durationLabel,
    remarks: values.remarks?.trim() || null,
    travel_dates: values.travelDates,
    itinerary: values.itinerary,
    inclusions: values.inclusions,
    exclusions: values.exclusions,
    bring_items: values.bringItems,
  };
}

/** Throws ZodError if the stored jsonb doesn't match the content schema. */
export function quoteRowToFormValues(row: QuoteContentRow): QuoteFormValues {
  const stored = storedContentSchema.parse({
    travelDates: row.travel_dates,
    itinerary: row.itinerary,
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    bringItems: row.bring_items,
  });

  return {
    title: row.title,
    customerName: row.customer_name ?? "",
    contactId: row.contact_id ?? "",
    pricePerPax: row.price_per_pax,
    discountAmount: row.discount_amount ?? undefined,
    durationLabel: row.duration_label,
    remarks: row.remarks ?? "",
    ...stored,
  };
}

/** The PDF-relevant subset of a quote's form values. */
export function toItineraryContent(values: QuoteFormValues): ItineraryContentValues {
  return {
    pricePerPax: values.pricePerPax,
    discountAmount: values.discountAmount,
    durationLabel: values.durationLabel,
    remarks: values.remarks,
    travelDates: values.travelDates,
    itinerary: values.itinerary,
    inclusions: values.inclusions,
    exclusions: values.exclusions,
    bringItems: values.bringItems,
  };
}
