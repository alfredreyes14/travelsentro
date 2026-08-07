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

export const packageFormSchema = z.object({
  name: z.string().min(1, "Please enter a package name"),
  slug: z
    .string()
    .min(1, "Please enter a slug")
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens only"
    ),
  fromPrice: z
    .number({ error: "Price must be a positive number" })
    .int("Price must be a positive number")
    .positive("Price must be a positive number"),
  durationDays: z
    .number({ error: "Duration must be a positive number" })
    .int("Duration must be a positive number")
    .positive("Duration must be a positive number"),
  durationLabel: z.string().optional(),
  destinationId: z.string().optional(),
  itinerary: z.array(itineraryDaySchema),
  inclusions: z.array(inclusionItemSchema),
  exclusions: z.array(inclusionItemSchema),
  bringItems: z.array(inclusionItemSchema),
  bestTimeToGo: z.string().min(1, "Please enter the best time to go"),
  groupSize: z.string().min(1, "Please enter the typical group size"),
});

export type PackageFormValues = z.infer<typeof packageFormSchema>;
