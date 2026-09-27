/**
 * Pure-logic proof for lib/packages/format-price.ts's formatPackagePrice --
 * mirrors scripts/verify-unsubscribe-token-secret.ts's CheckResult/PASS-FAIL
 * structure. No network/Supabase access needed.
 *
 * Run via `npm run verify:format-price`.
 */
import { formatPackagePrice } from "../lib/packages/format-price";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkNoDiscount(): CheckResult {
  const result = formatPackagePrice(12000, null);
  const pass = result.original === null && result.final === "₱12,000 / pax";
  return {
    name: "No discount: original is null, final is the plain formatted price",
    pass,
    detail: `original=${JSON.stringify(result.original)} final=${JSON.stringify(result.final)}`,
  };
}

function checkWithDiscount(): CheckResult {
  const result = formatPackagePrice(12000, 2000);
  const pass = result.original === "₱12,000" && result.final === "₱10,000 / pax";
  return {
    name: "With discount: original is the pre-discount price, final is discounted",
    pass,
    detail: `original=${JSON.stringify(result.original)} final=${JSON.stringify(result.final)}`,
  };
}

function checkZeroDiscountTreatedAsNoDiscount(): CheckResult {
  const result = formatPackagePrice(12000, 0);
  const pass = result.original === null && result.final === "₱12,000 / pax";
  return {
    name: "Zero discount_amount is treated the same as no discount",
    pass,
    detail: `original=${JSON.stringify(result.original)} final=${JSON.stringify(result.final)}`,
  };
}

function main() {
  const results = [
    checkNoDiscount(),
    checkWithDiscount(),
    checkZeroDiscountTreatedAsNoDiscount(),
  ];

  console.log(`\nverify-format-price\n`);
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
