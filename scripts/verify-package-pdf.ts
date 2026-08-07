/**
 * Live-data verification for the package PDF generator
 * (lib/pdf/package-pdf.tsx). Creates a disposable draft package with
 * itinerary/inclusions/exclusions/bring-items/travel-dates/remarks so every
 * optional PDF section has content to render, fetches it via
 * fetchPackageForPdf() and renders it via renderPackagePdf(), then asserts
 * the output is a real, well-formed PDF buffer. Always deletes the
 * disposable package in a finally block (cascades to its child rows —
 * see supabase/migrations/20260718114727_create_package_schema.sql and
 * .../20260807180000_package_fields_rework.sql, both `on delete cascade`),
 * mirroring scripts/verify-permission-denial.ts's disposable-row hygiene.
 *
 * Run via `npm run verify:package-pdf` (-> `tsx --env-file=.env.local
 * scripts/verify-package-pdf.ts`).
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  fetchPackageForPdf,
  renderPackagePdf,
  LOCAL_LOGO_PATH,
} from "../lib/pdf/package-pdf";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:package-pdf`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const supabase = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const results: CheckResult[] = [];
  let packageId: string | undefined;

  try {
    // Deliberately left unpublished (no destination_id) -- publishing
    // requires a destination per packages_destination_required_if_published,
    // and this script only needs id-based fetch, never the published path.
    // is_published defaults to true at the DB level (see
    // supabase/migrations/20260718114727_create_package_schema.sql), so it
    // must be set explicitly to false here or this insert trips the
    // packages_destination_required_if_published check constraint.
    const { data: pkgRow, error: pkgError } = await supabase
      .from("packages")
      .insert({
        name: "Verify PDF Smoke Test Package",
        is_published: false,
        price_per_pax: 12000,
        discount_amount: 1000,
        duration_label: "3 days, 2 nights",
        remarks:
          "Verification-only package, safe to ignore if seen in the admin list.",
      })
      .select("id, slug")
      .single();

    if (pkgError || !pkgRow) {
      throw new Error(
        `Failed to insert disposable package: ${pkgError?.message ?? "no row returned"}`
      );
    }
    packageId = pkgRow.id;

    const { error: itineraryError } = await supabase
      .from("itinerary_days")
      .insert([
        {
          package_id: packageId,
          day_number: 1,
          title: "Arrival",
          description: "Check in to hotel.\nWelcome dinner.",
        },
        {
          package_id: packageId,
          day_number: 2,
          title: "City Tour",
          description: "Full-day guided tour.",
        },
      ]);
    if (itineraryError) {
      throw new Error(
        `Failed to insert itinerary_days: ${itineraryError.message}`
      );
    }

    const { error: inclusionsError } = await supabase
      .from("package_inclusions")
      .insert([
        {
          package_id: packageId,
          kind: "included",
          label: "Hotel accommodation",
          sort_order: 0,
        },
        {
          package_id: packageId,
          kind: "excluded",
          label: "Airfare",
          sort_order: 0,
        },
        { package_id: packageId, kind: "bring", label: "Sunscreen", sort_order: 0 },
      ]);
    if (inclusionsError) {
      throw new Error(
        `Failed to insert package_inclusions: ${inclusionsError.message}`
      );
    }

    const { error: travelDatesError } = await supabase
      .from("package_travel_dates")
      .insert([
        {
          package_id: packageId,
          travel_date_from: "2026-12-01",
          travel_date_to: "2026-12-03",
          additional_fee: 500,
        },
      ]);
    if (travelDatesError) {
      throw new Error(
        `Failed to insert package_travel_dates: ${travelDatesError.message}`
      );
    }

    const pkg = await fetchPackageForPdf(supabase, { id: packageId });
    results.push({
      name: "fetchPackageForPdf returns the package",
      pass: pkg !== null && pkg.id === packageId,
      detail: pkg ? `fetched id=${pkg.id}` : "fetchPackageForPdf returned null",
    });

    if (!pkg) throw new Error("Cannot continue -- fetchPackageForPdf returned null");

    results.push({
      name: "fetched package includes all child rows",
      pass:
        pkg.itinerary_days.length === 2 &&
        pkg.package_inclusions.length === 3 &&
        pkg.package_travel_dates.length === 1,
      detail: `itinerary_days=${pkg.itinerary_days.length} package_inclusions=${pkg.package_inclusions.length} package_travel_dates=${pkg.package_travel_dates.length}`,
    });

    const buffer = await renderPackagePdf(pkg, LOCAL_LOGO_PATH);
    const signature = buffer.subarray(0, 5).toString("ascii");

    results.push({
      name: "renderPackagePdf produces a well-formed PDF buffer",
      pass: signature === "%PDF-" && buffer.length > 1000,
      detail: `signature=${JSON.stringify(signature)} length=${buffer.length}`,
    });
  } finally {
    if (packageId) {
      const { error: deleteError } = await supabase
        .from("packages")
        .delete()
        .eq("id", packageId);
      if (deleteError) {
        console.error(
          `WARNING: failed to delete disposable package ${packageId}: ${deleteError.message}`
        );
      }
    }
  }

  console.log("\nverify-package-pdf\n");
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-package-pdf failed:", err);
  process.exit(1);
});
