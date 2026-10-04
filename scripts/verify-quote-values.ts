/**
 * Offline proof for the pure quote/package value mappers
 * (lib/packages/package-content.ts, and -- added in later tasks --
 * lib/quotes/quote-row.ts). No Supabase, no network: every check runs the
 * mappers against hand-written fixtures. Mirrors
 * scripts/verify-poster-extraction.ts's record()/PASS-FAIL structure.
 *
 * Run via `npm run verify:quote-values`.
 */
import { itineraryContentSchema } from "../components/admin/itinerary-content-schema";
import type { QuoteFormValues } from "../components/admin/quote-form-schema";
import { quoteFormSchema } from "../components/admin/quote-form-schema";
import {
  quoteRowToFormValues,
  quoteValuesToRow,
  type QuoteContentRow,
} from "../lib/quotes/quote-row";
import {
  packageRowToContentValues,
  type PackageContentRow,
} from "../lib/packages/package-content";
import { renderItineraryPdf } from "../lib/pdf/itinerary-pdf";
import { LOCAL_LOGO_PATH } from "../lib/pdf/package-pdf";

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
}

/** JSON with recursively sorted keys and undefined dropped -- order-insensitive equality. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

/** Every optional section populated, children deliberately out of order. */
export const FULL_PACKAGE: PackageContentRow = {
  price_per_pax: 5999,
  discount_amount: 1000,
  duration_label: "3 days, 2 nights",
  remarks: "Rates subject to change.",
  itinerary_days: [
    { day_number: 2, title: "Island Hopping", description: "Kayangan Lake\nTwin Lagoon" },
    { day_number: 1, title: "Arrival", description: "Airport pickup\nHotel check-in" },
  ],
  package_inclusions: [
    { kind: "excluded", label: "Airfare", sort_order: 0 },
    { kind: "included", label: "Hotel", sort_order: 1 },
    { kind: "included", label: "Breakfast", sort_order: 0 },
    { kind: "bring", label: "Sunscreen", sort_order: 0 },
  ],
  package_travel_dates: [
    { travel_date_from: "2026-12-20", travel_date_to: "2026-12-22", additional_fee: 500 },
    { travel_date_from: "2026-11-05", travel_date_to: "2026-11-07", additional_fee: null },
  ],
};

/** Every optional field empty -- the Review Focus #3 case. */
export const SPARSE_PACKAGE: PackageContentRow = {
  price_per_pax: 2500,
  discount_amount: null,
  duration_label: null,
  remarks: null,
  itinerary_days: [],
  package_inclusions: [],
  package_travel_dates: [
    { travel_date_from: "2026-11-05", travel_date_to: "2026-11-05", additional_fee: null },
  ],
};

function checkPackageContentOrdering(): void {
  const content = packageRowToContentValues(FULL_PACKAGE);
  const expected = {
    pricePerPax: 5999,
    discountAmount: 1000,
    durationLabel: "3 days, 2 nights",
    remarks: "Rates subject to change.",
    travelDates: [
      { dateFrom: "2026-11-05", dateTo: "2026-11-07" },
      { dateFrom: "2026-12-20", dateTo: "2026-12-22", additionalFee: 500 },
    ],
    itinerary: [
      { title: "Arrival", description: "Airport pickup\nHotel check-in" },
      { title: "Island Hopping", description: "Kayangan Lake\nTwin Lagoon" },
    ],
    inclusions: [{ label: "Breakfast" }, { label: "Hotel" }],
    exclusions: [{ label: "Airfare" }],
    bringItems: [{ label: "Sunscreen" }],
  };
  record(
    "packageRowToContentValues sorts days, inclusions and dates and splits by kind",
    canonical(content) === canonical(expected),
    canonical(content)
  );
}

function checkPackageContentSparse(): void {
  const content = packageRowToContentValues(SPARSE_PACKAGE);
  record(
    "packageRowToContentValues maps nulls to undefined/'' (never null)",
    content.discountAmount === undefined &&
      content.durationLabel === "" &&
      content.remarks === "" &&
      content.travelDates[0].additionalFee === undefined &&
      !JSON.stringify(content).includes("null"),
    canonical(content)
  );
}

function checkPackageContentValidates(): void {
  const parsed = itineraryContentSchema.safeParse(packageRowToContentValues(FULL_PACKAGE));
  record(
    "a fully populated package's content passes itineraryContentSchema",
    parsed.success,
    parsed.success ? "valid" : JSON.stringify(parsed.error.issues)
  );
}

/** What PostgREST hands back: the inserted patch after a JSON round trip. */
function simulateStoredRow(values: QuoteFormValues): QuoteContentRow {
  return JSON.parse(JSON.stringify(quoteValuesToRow(values))) as QuoteContentRow;
}

function checkQuoteRoundTrip(): void {
  const values: QuoteFormValues = {
    ...packageRowToContentValues(FULL_PACKAGE),
    title: "Coron for the Santos family",
    customerName: "Maria Santos",
    contactId: "",
  };
  const back = quoteRowToFormValues(simulateStoredRow(values));
  record(
    "quote values survive quoteValuesToRow -> JSON -> quoteRowToFormValues",
    canonical(back) === canonical(values) && quoteFormSchema.safeParse(back).success,
    canonical(back)
  );
}

function checkPackageToQuoteMatches(): void {
  for (const [label, fixture] of [["full", FULL_PACKAGE], ["sparse", SPARSE_PACKAGE]] as const) {
    const packageContent = packageRowToContentValues(fixture);
    const quote = quoteRowToFormValues(
      simulateStoredRow({ ...packageContent, title: "x", customerName: "", contactId: "" })
    );
    const { title: _t, customerName: _c, contactId: _id, ...quoteContent } = quote;
    void _t; void _c; void _id;
    record(
      `a quote copied from a ${label} package carries identical itinerary content`,
      canonical(quoteContent) === canonical(packageContent),
      canonical(quoteContent)
    );
  }
}

function checkEmptyOptionalsBecomeNull(): void {
  const row = quoteValuesToRow({
    ...packageRowToContentValues(SPARSE_PACKAGE),
    title: "  Trimmed  ",
    customerName: "   ",
    contactId: "",
    remarks: "",
  });
  record(
    "quoteValuesToRow stores blank optionals as null and trims text",
    row.title === "Trimmed" &&
      row.customer_name === null &&
      row.contact_id === null &&
      row.remarks === null &&
      row.discount_amount === null,
    JSON.stringify(row)
  );
}

function checkCorruptJsonbThrows(): void {
  const row = simulateStoredRow({
    ...packageRowToContentValues(FULL_PACKAGE),
    title: "x",
    customerName: "",
    contactId: "",
  });
  let threw = false;
  try {
    quoteRowToFormValues({ ...row, itinerary: [{ title: 42 }] });
  } catch {
    threw = true;
  }
  record(
    "quoteRowToFormValues throws on malformed stored jsonb (never renders half a quote)",
    threw,
    threw ? "threw" : "returned without error"
  );
}

async function checkItineraryPdfRenders(): Promise<void> {
  const buffer = await renderItineraryPdf(
    { title: "Coron Island Escape", content: packageRowToContentValues(FULL_PACKAGE) },
    LOCAL_LOGO_PATH
  );
  const signature = buffer.subarray(0, 5).toString("ascii");
  record(
    "renderItineraryPdf produces a well-formed PDF offline",
    signature === "%PDF-" && buffer.length > 1000,
    `signature=${JSON.stringify(signature)} length=${buffer.length}`
  );
}

async function main(): Promise<void> {
  checkPackageContentOrdering();
  checkPackageContentSparse();
  checkPackageContentValidates();
  checkQuoteRoundTrip();
  checkPackageToQuoteMatches();
  checkEmptyOptionalsBecomeNull();
  checkCorruptJsonbThrows();
  await checkItineraryPdfRenders();

  console.log("\nverify-quote-values\n");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("verify-quote-values failed:", error);
  process.exit(1);
});
