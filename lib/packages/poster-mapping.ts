import type { PackageFormValues } from "@/components/admin/package-form-schema";
import type { PosterExtraction } from "./poster-prompt";

/**
 * One field the poster couldn't fill in. `tab` names the PackageForm tab the
 * admin needs to visit; `reason` is shown verbatim in the import banner, so
 * it is written as a complete sentence addressed to the admin.
 */
export type UnmappedField = {
  field: keyof PackageFormValues;
  label: string;
  tab: string;
  reason: string;
};

export type PosterMappingResult = {
  values: Partial<PackageFormValues>;
  unmapped: UnmappedField[];
};

type Destination = { id: string; name: string };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Rejects both non-ISO shapes ("March 14") and calendar-invalid ISO strings
 * ("2026-02-30", which Date happily rolls forward to March 2nd) -- the
 * round-trip comparison catches the rollover.
 */
function isValidIsoDate(value: string | null): value is string {
  if (value === null || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Formats a whole-peso amount for banner copy ("6999" -> "PHP 6,999"). Only
 * ever used in reason strings the admin reads, never in form values.
 */
function formatPeso(amount: number): string {
  return `PHP ${amount.toLocaleString("en-PH")}`;
}

function toLabelRows(entries: string[]): { label: string }[] {
  return entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((label) => ({ label }));
}

/**
 * Resolves the poster's destination text against the real destination rows,
 * widening from strictest to loosest. Anything ambiguous is deliberately
 * reported as unmatched: silently picking one of two plausible destinations
 * is the kind of error an admin would never think to check for.
 */
function matchDestination(
  rawName: string | null,
  destinations: Destination[]
): { id: string } | { reason: string } {
  const text = cleanText(rawName);
  if (text === null) {
    return {
      reason:
        "The poster doesn't name a destination. Pick one on the Details tab.",
    };
  }

  const needle = normalize(text);

  const exact = destinations.filter((d) => normalize(d.name) === needle);
  if (exact.length === 1) return { id: exact[0].id };

  // "Coron, Palawan" contains the configured destination "Coron".
  const contained = destinations.filter((d) => needle.includes(normalize(d.name)));
  if (contained.length === 1) return { id: contained[0].id };

  if (contained.length > 1) {
    const names = contained.map((d) => d.name).join(", ");
    return {
      reason: `The poster says "${text}", which matches more than one destination (${names}). Pick the right one on the Details tab.`,
    };
  }

  return {
    reason: `The poster says "${text}", which doesn't match any destination. Pick one on the Details tab, or add it under Packages -> Destinations.`,
  };
}

/**
 * Converts a literal poster transcription into form values, dropping
 * anything packageFormSchema would reject and recording why. Pure: no I/O,
 * no SDK, no Supabase -- which is what lets scripts/verify-poster-extraction.ts
 * cover every rule without spending an API call.
 */
export function mapPosterToFormValues(
  raw: PosterExtraction,
  destinations: Destination[]
): PosterMappingResult {
  const values: Partial<PackageFormValues> = {};
  const unmapped: UnmappedField[] = [];

  const flag = (
    field: keyof PackageFormValues,
    label: string,
    tab: string,
    reason: string
  ): void => {
    unmapped.push({ field, label, tab, reason });
  };

  const name = cleanText(raw.name);
  if (name !== null) {
    values.name = name;
  } else {
    flag(
      "name",
      "Package name",
      "details",
      "The poster doesn't show a package title. Type one on the Details tab."
    );
  }

  const destination = matchDestination(raw.destinationName, destinations);
  if ("id" in destination) {
    values.destinationId = destination.id;
  } else {
    flag("destinationId", "Destination", "details", destination.reason);
  }

  // Pricing. pricePerPax on the form is the PRE-discount price: the public
  // site renders `price_per_pax - discount_amount` with price_per_pax struck
  // through. So a poster showing "was 6999, now 5999" puts 6999 here, NOT
  // 5999 -- the 1000 difference belongs in discountAmount.
  //
  // discountAmount itself is NEVER auto-filled: discounts are entered by hand
  // (user decision, 2026-08-31). Auto-filling it and putting the marked-down
  // price in pricePerPax would be the one combination that silently
  // undercharges, since an admin who then typed the discount in would be
  // discounting an already-discounted price. Instead we seed the pre-discount
  // price and flag the discount with the exact figure to type, so a manual
  // entry lands correctly and an ignored one is at least visible in the
  // banner.
  const current =
    raw.pricePerPax !== null ? Math.round(raw.pricePerPax) : null;
  const original =
    raw.originalPricePerPax !== null
      ? Math.round(raw.originalPricePerPax)
      : null;

  if (current === null || current <= 0) {
    flag(
      "pricePerPax",
      "Price per pax",
      "details",
      "The poster doesn't show a usable per-person price. Enter it on the Details tab."
    );
  } else if (original === null) {
    values.pricePerPax = current;
  } else {
    const discount = original - current;
    if (discount > 0 && discount < original) {
      // Seed the struck-through price so a hand-entered discount subtracts
      // from the right number.
      values.pricePerPax = original;
      flag(
        "discountAmount",
        "Discount",
        "details",
        `The poster marks ${formatPeso(original)} down to ${formatPeso(current)}. Price per pax is set to ${original} — enter ${discount} as the Discount on the Details tab to show that markdown on the site.`
      );
    } else {
      values.pricePerPax = current;
      flag(
        "discountAmount",
        "Discount",
        "details",
        `The poster's "was" price (${original}) isn't higher than its current price (${current}), so no discount could be worked out. Check the Details tab.`
      );
    }
  }

  const durationLabel = cleanText(raw.durationLabel);
  if (durationLabel !== null) {
    values.durationLabel = durationLabel;
  } else {
    flag(
      "durationLabel",
      "Duration",
      "details",
      "The poster doesn't state how long the tour runs. Enter it on the Details tab."
    );
  }

  // Remarks is optional in packageFormSchema and absent from most posters --
  // flagging it would put a line in the banner on every single import.
  const remarks = cleanText(raw.remarks);
  if (remarks !== null) values.remarks = remarks;

  const travelDates: PackageFormValues["travelDates"] = [];
  let droppedDateRows = 0;
  for (const row of raw.travelDates) {
    const from = row.dateFrom;
    const to = row.dateTo;
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || to < from) {
      droppedDateRows += 1;
      continue;
    }
    const fee = row.additionalFee !== null ? Math.round(row.additionalFee) : null;
    travelDates.push({
      dateFrom: from,
      dateTo: to,
      additionalFee: fee !== null && fee > 0 ? fee : undefined,
    });
  }
  if (travelDates.length > 0) {
    values.travelDates = travelDates;
    // A partial drop is the case the banner exists for: some dates imported,
    // others vanished. Staying silent here loses a departure the poster
    // actually printed.
    if (droppedDateRows > 0) {
      flag(
        "travelDates",
        "Travel dates",
        "travel-dates",
        `${droppedDateRows} of ${raw.travelDates.length} date ranges on the poster couldn't be used (most often a missing year) and ${droppedDateRows === 1 ? "was" : "were"} dropped. Check the Travel Dates tab.`
      );
    }
  } else {
    flag(
      "travelDates",
      "Travel dates",
      "travel-dates",
      raw.travelDates.length > 0
        ? "The poster's dates are missing a year, so they couldn't be used. Add them on the Travel Dates tab."
        : "The poster doesn't show departure dates. Add at least one on the Travel Dates tab."
    );
  }

  const itinerary = raw.itinerary
    .map((day) => ({
      title: day.title.trim(),
      description: day.description.trim(),
    }))
    .filter((day) => day.title.length > 0 && day.description.length > 0);
  if (itinerary.length > 0) {
    values.itinerary = itinerary;
    const droppedDays = raw.itinerary.length - itinerary.length;
    // Same partial-drop reasoning as travel dates: an itinerary day missing
    // its title or description silently vanishing is worse than a visible
    // flag the admin can act on.
    if (droppedDays > 0) {
      flag(
        "itinerary",
        "Itinerary",
        "itinerary",
        `${droppedDays} day${droppedDays === 1 ? "" : "s"} on the poster ${droppedDays === 1 ? "was" : "were"} missing a title or description and ${droppedDays === 1 ? "was" : "were"} dropped. Check the Itinerary tab.`
      );
    }
  } else {
    flag(
      "itinerary",
      "Itinerary",
      "itinerary",
      raw.itinerary.length > 0
        ? "The poster's itinerary days are missing a title or description, so they couldn't be used. Add them on the Itinerary tab."
        : "The poster doesn't show a day-by-day itinerary. Add days on the Itinerary tab."
    );
  }

  const listFields: {
    field: "inclusions" | "exclusions" | "bringItems";
    label: string;
    source: string[];
    reason: string;
  }[] = [
    {
      field: "inclusions",
      label: "Inclusions",
      source: raw.inclusions,
      reason:
        "The poster doesn't list what's included. Add items on the Inclusions tab.",
    },
    {
      field: "exclusions",
      label: "Exclusions",
      source: raw.exclusions,
      reason:
        "The poster doesn't list what's excluded. Add items on the Inclusions tab.",
    },
    {
      field: "bringItems",
      label: "What to bring",
      source: raw.bringItems,
      reason:
        "The poster doesn't list what travelers should bring. Add items on the Inclusions tab.",
    },
  ];

  for (const list of listFields) {
    const rows = toLabelRows(list.source);
    if (rows.length > 0) {
      values[list.field] = rows;
    } else {
      flag(list.field, list.label, "inclusions", list.reason);
    }
  }

  return { values, unmapped };
}
