/**
 * Pure-logic proof for lib/packages/package-url.ts (readable package URLs
 * and their code lookup) and lib/packages/package-description.ts (meta
 * descriptions) -- mirrors scripts/verify-format-price.ts's
 * CheckResult/PASS-FAIL structure. No network/Supabase access needed.
 *
 * Run via `npm run verify:package-url`.
 */
import {
  packageCodeFromSegment,
  packagePath,
  packageSegment,
  slugifyName,
} from "../lib/packages/package-url";
import { buildPackageDescription } from "../lib/packages/package-description";

type CheckResult = { name: string; pass: boolean; detail: string };

function check(name: string, actual: unknown, expected: unknown): CheckResult {
  return {
    name,
    pass: actual === expected,
    detail: `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  };
}

const HK = { slug: "TSP-000032", name: "Hong Kong Macau 4D3N" };

function urlChecks(): CheckResult[] {
  return [
    check("Readable path is name + lowercase code", packagePath(HK), "/packages/hong-kong-macau-4d3n-tsp-000032"),
    check("Ampersand, punctuation and diacritics slugify cleanly", slugifyName("Boracay & Coroñ (5D4N)!"), "boracay-and-coron-5d4n"),
    check("Name with no slug-able characters falls back to the bare code", packageSegment({ slug: "TSP-000007", name: "★★★" }), "tsp-000007"),
    check("Non-TSP legacy slug is left untouched", packageSegment({ slug: "palawan-getaway", name: "Palawan Getaway" }), "palawan-getaway"),
    check("Readable segment resolves to the stored code", packageCodeFromSegment("hong-kong-macau-4d3n-tsp-000032"), "TSP-000032"),
    check("Bare uppercase code (old URLs) resolves", packageCodeFromSegment("TSP-000032"), "TSP-000032"),
    check("Bare lowercase code resolves", packageCodeFromSegment("tsp-000032"), "TSP-000032"),
    check("Outdated name prefix still resolves by code", packageCodeFromSegment("old-name-tsp-000032"), "TSP-000032"),
    check("Name merely containing 'tsp' isn't mistaken for a code", packageCodeFromSegment("tsp-tour"), "tsp-tour"),
    check("Round trip: segment -> code matches the stored slug", packageCodeFromSegment(packageSegment(HK)), HK.slug),
  ];
}

function descriptionChecks(): CheckResult[] {
  const full = buildPackageDescription({
    name: "Hong Kong Macau 4D3N",
    durationLabel: "4D3N",
    destinationName: "Hong Kong",
    pricePerPax: 29888,
    inclusions: ["Roundtrip airfare", "3 nights hotel", "Daily breakfast", "Disneyland ticket", "Travel insurance"],
  });
  const missingBits = buildPackageDescription({
    name: "Island Hopping Getaway",
    durationLabel: "3D2N",
    destinationName: "Coron",
    pricePerPax: 8500,
    inclusions: [],
  });
  const longName = buildPackageDescription({
    name: "A ".repeat(100).trim(),
    durationLabel: null,
    destinationName: null,
    pricePerPax: 1000,
    inclusions: ["Hotel"],
  });

  return [
    check(
      "Duration/destination already in the name aren't repeated",
      full.startsWith("Hong Kong Macau 4D3N tour package from ₱29,888 per pax. Includes Roundtrip airfare"),
      true
    ),
    { name: "Description stays within 160 characters", pass: full.length <= 160, detail: `${full.length}: ${full}` },
    check(
      "Missing duration/destination are added; empty inclusions skipped",
      missingBits,
      "Island Hopping Getaway (3D2N) — Coron tour package from ₱8,500 per pax. Inquire with TravelSentro on WhatsApp or Messenger."
    ),
    check(
      "Name already saying 'Tour' isn't followed by 'tour package'; destination added with 'in'",
      buildPackageDescription({
        name: "Bangkok-Pattaya 4D3N Tour",
        durationLabel: "4D3N",
        destinationName: "Thailand",
        pricePerPax: 25888,
        inclusions: [],
      }),
      "Bangkok-Pattaya 4D3N Tour in Thailand from ₱25,888 per pax. Inquire with TravelSentro on WhatsApp or Messenger."
    ),
    check(
      "Name saying 'Packages' with destination already in it gets no qualifier",
      buildPackageDescription({
        name: "El Nido All-In Packages",
        durationLabel: null,
        destinationName: "El Nido",
        pricePerPax: 14999,
        inclusions: [],
      }),
      "El Nido All-In Packages from ₱14,999 per pax. Inquire with TravelSentro on WhatsApp or Messenger."
    ),
    {
      name: "Over-long lead is truncated at a word boundary with an ellipsis",
      pass: longName.length <= 160 && longName.endsWith("…"),
      detail: `${longName.length} chars`,
    },
  ];
}

function main() {
  const results = [...urlChecks(), ...descriptionChecks()];

  console.log(`\nverify-package-url\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main();
