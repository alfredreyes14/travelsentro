import { z } from "zod";

/**
 * What Claude is asked to report from a poster image: a literal
 * transcription, not the form's shape. Every scalar is `.nullable()` rather
 * than `.optional()` -- structured outputs require every property to be
 * present, and an explicit null is the signal the banner is built on
 * ("the poster doesn't say"). Deriving form fields from these raw
 * observations is poster-mapping.ts's job, not the model's.
 */
export const PosterExtractionSchema = z.object({
  name: z.string().nullable(),
  destinationName: z.string().nullable(),
  pricePerPax: z.number().nullable(),
  originalPricePerPax: z.number().nullable(),
  durationLabel: z.string().nullable(),
  remarks: z.string().nullable(),
  travelDates: z.array(
    z.object({
      dateFrom: z.string().nullable(),
      dateTo: z.string().nullable(),
      additionalFee: z.number().nullable(),
    })
  ),
  itinerary: z.array(
    z.object({ title: z.string(), description: z.string() })
  ),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()),
  bringItems: z.array(z.string()),
});

export type PosterExtraction = z.infer<typeof PosterExtractionSchema>;

/**
 * The destination list is supplied for context only -- the model still
 * reports whatever the poster prints, and poster-mapping.ts does the
 * matching. Letting the model pick an id would hide near-misses that the
 * admin needs to see and correct.
 */
export function buildPosterSystemPrompt(destinationNames: string[]): string {
  const known =
    destinationNames.length > 0
      ? destinationNames.map((name) => `- ${name}`).join("\n")
      : "- (none configured yet)";

  return `You read Philippine tour-package marketing posters and transcribe what is printed on them into structured data for a travel agency's admin system.

THE ONE RULE THAT MATTERS: TRANSCRIBE, NEVER INFER. If a value is not printed on the poster, return null (or an empty array). Do not guess it, do not compute a plausible value, and do not fill it in from general knowledge about the destination. A null is useful -- it tells the admin exactly what they still need to type. A guess is harmful -- these values are published to a public website customers book against.

Fields:

- name: the package or tour title exactly as printed.
- destinationName: the place as printed. Do not normalize, expand, or correct it.
- pricePerPax: the per-person price a customer pays today, as a plain number with no currency symbol or thousands separators (a poster reading "PHP 5,999" gives 5999). If several per-person tiers are shown, use the lowest. Ignore prices that are not per-person (per-group rates, optional add-ons).
- originalPricePerPax: fill this ONLY when the poster shows a higher "was", "regular", or struck-through per-person price next to the current one. Otherwise null. Never derive it from a percentage.
- durationLabel: as printed, e.g. "3 days, 2 nights" or "4D3N".
- remarks: fine print, disclaimers, or booking conditions. Otherwise null.
- travelDates: one entry per departure date range printed. dateFrom and dateTo must be full ISO "YYYY-MM-DD" dates. IF THE POSTER DOES NOT PRINT A YEAR FOR A DATE, RETURN NULL FOR THAT DATE -- do not assume the current year, the next year, or anything else. additionalFee is a surcharge printed for that specific range (e.g. a peak-season upcharge), otherwise null.
- itinerary: one entry per day. For "Day 1 - Arrival & City Tour", title is "Arrival & City Tour" and description is the activities listed under it. Empty array if the poster has no day-by-day breakdown.
- inclusions: what the price covers ("Inclusions", "Package includes").
- exclusions: what it does not cover ("Exclusions", "Not included").
- bringItems: what the traveler should bring ("What to bring", "Reminders").

Each list entry is one short line of plain text as printed, with bullet characters and leading dashes removed.

Destinations already configured in this system, for your reference only. Still report destinationName exactly as the poster prints it, even when it is not on this list:
${known}`;
}
