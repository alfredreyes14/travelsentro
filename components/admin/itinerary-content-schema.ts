import { z } from "zod";

/**
 * The itinerary content shared by packages and quotes -- everything the
 * "Download Full Itinerary" PDF prints except the title. Package- and
 * quote-specific fields (name/destination, title/customer) are added by
 * package-form-schema.ts and quote-form-schema.ts via .extend().
 *
 * No React dependency, so tsx scripts can import it directly.
 */

/**
 * Itinerary day: day_number is NOT a form field — it's computed from the
 * row's array index at submit time (actions/packages.ts) or render time
 * (lib/pdf/itinerary-pdf.tsx).
 */
export const itineraryDaySchema = z.object({
  title: z.string().min(1, "Please enter a day title"),
  description: z.string().min(1, "Please enter a day description"),
});

/**
 * Shared shape for inclusions/exclusions/bring-items rows — kind and
 * sort_order are computed at submit time (actions/packages.ts), not
 * user-entered.
 */
export const inclusionItemSchema = z.object({
  label: z.string().min(1, "Please enter a label"),
});

/**
 * dateFrom/dateTo are plain "YYYY-MM-DD" strings from native
 * <input type="date"> fields — no date library needed, and "YYYY-MM-DD"
 * strings compare correctly with plain >=/<=. additionalFee is the
 * optional surcharge for this whole date range (e.g. a peak-season
 * upcharge).
 */
export const travelDateSchema = z
  .object({
    dateFrom: z.string().min(1, "Please pick a start date"),
    dateTo: z.string().min(1, "Please pick an end date"),
    additionalFee: z
      .number({ error: "Fee must be a positive number" })
      .positive("Fee must be a positive number")
      .optional(),
  })
  .refine((value) => value.dateTo >= value.dateFrom, {
    message: "End date must be on or after the start date",
    path: ["dateTo"],
  });

export const itineraryContentSchema = z.object({
  pricePerPax: z
    .number({ error: "Price must be a positive number" })
    .int("Price must be a positive number")
    .positive("Price must be a positive number"),
  // Added ON TOP of pricePerPax to display an inflated, struck-through
  // "original" price (price 100 + discount 50 shows as ~~150~~ 100) --
  // pricePerPax itself is always the real price the customer pays, so there's
  // no upper bound tying discountAmount to it.
  discountAmount: z
    .number({ error: "Discount must be a positive number" })
    .positive("Discount must be a positive number")
    .optional(),
  durationLabel: z.string().min(1, "Please enter the duration"),
  remarks: z.string().optional(),
  travelDates: z
    .array(travelDateSchema)
    .min(1, "Add at least one travel date"),
  itinerary: z.array(itineraryDaySchema),
  inclusions: z.array(inclusionItemSchema),
  exclusions: z.array(inclusionItemSchema),
  bringItems: z.array(inclusionItemSchema),
});

export type ItineraryContentValues = z.infer<typeof itineraryContentSchema>;

export const EMPTY_ITINERARY_CONTENT: ItineraryContentValues = {
  pricePerPax: 0,
  discountAmount: undefined,
  durationLabel: "",
  remarks: "",
  travelDates: [],
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
};
