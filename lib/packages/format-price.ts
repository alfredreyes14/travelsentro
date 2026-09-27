/**
 * Formats a package's price for display -- shared by PackageCard and the
 * upsell popup so the ₱-formatting/discount-strikethrough logic isn't
 * duplicated a second time. `original` is null when there's no discount
 * (nothing to strike through); `final` always includes the "/ pax"
 * suffix; `savings` is the formatted discount amount alone (e.g. for the
 * popup's "Save ₱X" ribbon), null when there's no discount.
 */
export function formatPackagePrice(
  pricePerPax: number,
  discountAmount: number | null
): { original: string | null; final: string; savings: string | null } {
  return {
    original: discountAmount
      ? `₱${pricePerPax.toLocaleString("en-PH")}`
      : null,
    final: `₱${(pricePerPax - (discountAmount ?? 0)).toLocaleString("en-PH")} / pax`,
    savings: discountAmount ? `₱${discountAmount.toLocaleString("en-PH")}` : null,
  };
}
