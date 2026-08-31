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
 * dateFrom/dateTo are plain "YYYY-MM-DD" strings from native
 * <input type="date"> fields — no date library needed, and "YYYY-MM-DD"
 * strings compare correctly with plain >=/<=. additionalFee is the
 * optional surcharge for this whole date range (e.g. a peak-season
 * upcharge).
 */
const travelDateSchema = z
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

/**
 * The form's reset baseline -- also PackageForm's default `useForm` values
 * and the shape poster imports get merged onto (`{ ...EMPTY_DEFAULTS,
 * ...values }`). Lives here rather than in package-form.tsx because this
 * module has no React dependency, so scripts/verify-poster-extraction.ts
 * (a plain tsx script, not a Next.js runtime) can import it directly instead
 * of hand-duplicating it -- importing package-form.tsx itself would pull in
 * actions/packages.ts -> lib/auth/dal.ts -> the `server-only` package,
 * which fails outside Next.js.
 */
export const EMPTY_DEFAULTS: PackageFormValues = {
  name: "",
  pricePerPax: 0,
  discountAmount: undefined,
  durationLabel: "",
  destinationId: "",
  remarks: "",
  travelDates: [],
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
};
