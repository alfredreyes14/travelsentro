import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import type { Tables } from "@/types/database";

/**
 * The minimal package shape that carries itinerary content -- satisfied by
 * the admin edit page's full row, fetchPackageForPdf()'s row, and
 * getPackageQuoteValues()'s narrow select alike.
 */
export type PackageContentRow = Pick<
  Tables<"packages">,
  "price_per_pax" | "discount_amount" | "duration_label" | "remarks"
> & {
  itinerary_days: Pick<Tables<"itinerary_days">, "day_number" | "title" | "description">[];
  package_inclusions: Pick<Tables<"package_inclusions">, "kind" | "label" | "sort_order">[];
  package_travel_dates: Pick<
    Tables<"package_travel_dates">,
    "travel_date_from" | "travel_date_to" | "additional_fee"
  >[];
};

function labelsOfKind(
  rows: PackageContentRow["package_inclusions"],
  kind: "included" | "excluded" | "bring"
): { label: string }[] {
  return rows
    .filter((item) => item.kind === kind)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));
}

/**
 * Package row + child rows -> the form/PDF content shape, in display order.
 * Nullable DB columns become undefined/"" (never null) so the result passes
 * itineraryContentSchema and merges cleanly onto EMPTY_ITINERARY_CONTENT.
 * Pure: no I/O.
 */
export function packageRowToContentValues(
  pkg: PackageContentRow
): ItineraryContentValues {
  return {
    pricePerPax: pkg.price_per_pax,
    discountAmount: pkg.discount_amount ?? undefined,
    durationLabel: pkg.duration_label ?? "",
    remarks: pkg.remarks ?? "",
    travelDates: [...pkg.package_travel_dates]
      .sort(
        (a, b) =>
          a.travel_date_from.localeCompare(b.travel_date_from) ||
          a.travel_date_to.localeCompare(b.travel_date_to)
      )
      .map((date) => ({
        dateFrom: date.travel_date_from,
        dateTo: date.travel_date_to,
        additionalFee: date.additional_fee ?? undefined,
      })),
    itinerary: [...pkg.itinerary_days]
      .sort((a, b) => a.day_number - b.day_number)
      .map((day) => ({ title: day.title, description: day.description })),
    inclusions: labelsOfKind(pkg.package_inclusions, "included"),
    exclusions: labelsOfKind(pkg.package_inclusions, "excluded"),
    bringItems: labelsOfKind(pkg.package_inclusions, "bring"),
  };
}
