/**
 * Live-data verification for the quote PDF (lib/pdf/quote-pdf.ts). Inserts
 * a disposable quote through the same quoteValuesToRow() the server actions
 * use, fetches it via fetchQuoteForPdf(), renders via quoteToPdfData() ->
 * renderItineraryPdf(), and asserts a real PDF buffer. Always deletes the
 * disposable quote in a finally block. Mirrors scripts/verify-package-pdf.ts.
 *
 * Run via `npm run verify:quote-pdf` against a project with the quotes
 * migration applied (see the plan's Local Environment Notes).
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { EMPTY_QUOTE_VALUES } from "../components/admin/quote-form-schema";
import { quoteValuesToRow } from "../lib/quotes/quote-row";
import { fetchQuoteForPdf, quoteToPdfData } from "../lib/pdf/quote-pdf";
import { renderItineraryPdf } from "../lib/pdf/itinerary-pdf";
import { LOCAL_LOGO_PATH } from "../lib/pdf/package-pdf";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY. Run via `npm run verify:quote-pdf`."
  );
}

/** Same Node 20 WebSocket polyfill as scripts/verify-upsell-rls.ts. */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  await ensureWebSocketPolyfill();

  const supabase = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const results: CheckResult[] = [];
  let quoteId: string | undefined;

  try {
    const { data: inserted, error: insertError } = await supabase
      .from("quotes")
      .insert(
        quoteValuesToRow({
          ...EMPTY_QUOTE_VALUES,
          title: "Verify quote PDF",
          pricePerPax: 4999,
          discountAmount: 500,
          durationLabel: "2 days, 1 night",
          remarks: "Disposable verification quote.",
          travelDates: [{ dateFrom: "2026-12-01", dateTo: "2026-12-02", additionalFee: 300 }],
          itinerary: [{ title: "Arrival", description: "Pickup\nCheck-in" }],
          inclusions: [{ label: "Hotel" }],
          exclusions: [{ label: "Airfare" }],
          bringItems: [{ label: "ID" }],
        })
      )
      .select("id, quote_no")
      .single();
    if (insertError || !inserted) throw new Error(`insert failed: ${insertError?.message}`);
    quoteId = inserted.id;

    const quote = await fetchQuoteForPdf(supabase, inserted.id);
    results.push({
      name: "fetchQuoteForPdf returns the quote",
      pass: quote !== null && quote.id === inserted.id,
      detail: quote ? `fetched ${quote.quote_no}` : "returned null",
    });
    if (!quote) throw new Error("Cannot continue -- fetchQuoteForPdf returned null");

    const data = quoteToPdfData(quote);
    results.push({
      name: "quoteToPdfData carries title and every content section",
      pass:
        data.title === "Verify quote PDF" &&
        data.content.itinerary.length === 1 &&
        data.content.inclusions.length === 1 &&
        data.content.exclusions.length === 1 &&
        data.content.bringItems.length === 1 &&
        data.content.travelDates[0].additionalFee === 300,
      detail: JSON.stringify(data.content),
    });

    const buffer = await renderItineraryPdf(data, LOCAL_LOGO_PATH);
    const signature = buffer.subarray(0, 5).toString("ascii");
    results.push({
      name: "quote renders to a well-formed PDF buffer",
      pass: signature === "%PDF-" && buffer.length > 1000,
      detail: `signature=${JSON.stringify(signature)} length=${buffer.length}`,
    });
  } finally {
    if (quoteId) {
      const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
      if (error) console.error(`WARNING: failed to delete disposable quote ${quoteId}: ${error.message}`);
    }
  }

  console.log("\nverify-quote-pdf\n");
  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-quote-pdf failed:", err);
  process.exit(1);
});
