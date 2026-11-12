import { z } from "zod";

import { EVENT_TYPES } from "@/lib/events/event-type";
import { normalizePartnerLink } from "@/lib/partners/link";

export const COVER_REQUIRED_MESSAGE = "Add a cover photo before publishing.";

/** A real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30). */
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const eventFormSchema = z
  .object({
    name: z.string().trim().min(1, "Please enter a name").max(200, "Keep the name under 200 characters"),
    eventType: z.enum(EVENT_TYPES, { message: "Please choose a type" }),
    startDate: z.string().refine(isIsoDate, "Please choose a start date"),
    endDate: z
      .string()
      .refine((value) => value === "" || isIsoDate(value), "Please choose a valid end date"),
    venue: z.string().trim().min(1, "Please enter the venue").max(300, "Keep the venue under 300 characters"),
    summary: z.string().trim().max(300, "Keep the summary under 300 characters"),
    description: z.string().trim().max(10000, "Keep the write-up under 10,000 characters"),
    coverStoragePath: z.string(),
    linkUrl: z.string().refine((value) => normalizePartnerLink(value).ok, {
      message: "Enter a valid website address, e.g. https://example.com",
    }),
    isPublished: z.boolean(),
    isFeatured: z.boolean(),
  })
  .superRefine((values, ctx) => {
    // Dates are ISO strings, so string order is date order.
    if (isIsoDate(values.startDate) && values.endDate !== "" && values.endDate < values.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date can't be before the start date",
      });
    }
    if (values.isPublished && values.coverStoragePath === "") {
      ctx.addIssue({ code: "custom", path: ["coverStoragePath"], message: COVER_REQUIRED_MESSAGE });
    }
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;
