import { z } from "zod";

/**
 * Itinerary day: day_number is NOT a form field — it's computed from the
 * row's array index at submit time (actions/packages.ts).
 */
const itineraryDaySchema = z.object({
  title: z.string().min(1, "Please enter a day title"),
  description: z.string().min(1, "Please enter a day description"),
});

/**
 * Shared shape for inclusions/exclusions/bring-items rows — kind and
 * sort_order are computed at submit time (actions/packages.ts), not
 * user-entered.
 */
const inclusionItemSchema = z.object({
  label: z.string().min(1, "Please enter a label"),
});

/**
 * `date` is a plain "YYYY-MM-DD" string from a native <input type="date">
 * — no date library needed. additionalFee is the optional per-date
 * surcharge (e.g. a peak-season upcharge).
 */
const travelDateSchema = z.object({
  date: z.string().min(1, "Please pick a date"),
  additionalFee: z
    .number({ error: "Fee must be a positive number" })
    .positive("Fee must be a positive number")
    .optional(),
});

export const packageFormSchema = z
  .object({
    name: z.string().min(1, "Please enter a package name"),
    pricePerPax: z
      .number({ error: "Price must be a positive number" })
      .int("Price must be a positive number")
      .positive("Price must be a positive number"),
    discountAmount: z
      .number({ error: "Discount must be a positive number" })
      .positive("Discount must be a positive number")
      .optional(),
    durationLabel: z.string().min(1, "Please enter the duration"),
    destinationId: z.string().min(1, "Please select a destination"),
    remarks: z.string().optional(),
    travelDates: z
      .array(travelDateSchema)
      .min(1, "Add at least one travel date"),
    itinerary: z.array(itineraryDaySchema),
    inclusions: z.array(inclusionItemSchema),
    exclusions: z.array(inclusionItemSchema),
    bringItems: z.array(inclusionItemSchema),
  })
  .refine(
    (values) =>
      values.discountAmount === undefined ||
      values.discountAmount < values.pricePerPax,
    {
      message: "Discount must be less than the price per pax",
      path: ["discountAmount"],
    }
  );

export type PackageFormValues = z.infer<typeof packageFormSchema>;
