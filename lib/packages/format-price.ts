/**
 * Formats a package's price for display -- shared by PackageCard and the
 * upsell popup so the ₱-formatting/discount-strikethrough logic isn't
 * duplicated a second time. `pricePerPax` is the real price the customer
 * pays -- `discountAmount` is added ON TOP of it to produce the inflated
 * struck-through "original" price (e.g. price 100 + discount 50 displays as
 * ~~150~~ 100). `original` is null when there's no discount (nothing to
 * strike through); `final` always includes the "/ pax" suffix.
 */
export function formatPackagePrice(
  pricePerPax: number,
  discountAmount: number | null
): { original: string | null; final: string } {
  return {
    original: discountAmount
      ? `₱${(pricePerPax + discountAmount).toLocaleString("en-PH")}`
      : null,
    final: `₱${pricePerPax.toLocaleString("en-PH")} / pax`,
  };
}
