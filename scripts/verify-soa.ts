/**
 * Offline proof for the SOA maker: totals math, row round trip, schema
 * rules, and that the PDF renders. No Supabase, no network.
 *
 * Run via `npm run verify:soa`. Pass --out <file.pdf> to also save the
 * sample PDF for a visual check.
 */
import { writeFileSync } from "node:fs";

import { soaFormSchema } from "../components/admin/soa/soa-form-schema";
import { computeSoaTotals, discountLabel } from "../lib/soa/totals";
import { soaRowToFormValues, soaValuesToRow, type SoaContentRow } from "../lib/soa/soa-row";
import { renderSoaPdf } from "../lib/pdf/soa-pdf";
import { LOCAL_LOGO_PATH } from "../lib/pdf/package-pdf";
import { SAMPLE } from "./verify-soa-sample";

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];
const record = (name: string, pass: boolean, detail: string) =>
  results.push({ name, pass, detail });

function checkTotals(): void {
  const t = computeSoaTotals(SAMPLE);
  // 17999 + 6500 + 1350 = 25849; 10% = 2584.90; voucher 1000
  const ok =
    t.subtotal === 25849 &&
    t.discountAmounts[0] === 2584.9 &&
    t.discountAmounts[1] === 1000 &&
    t.total === 22264.1 &&
    t.totalPaid === 10000 &&
    t.balance === 12264.1;
  record("totals: lines, % of subtotal, fixed voucher, payments", ok, JSON.stringify(t));
}

function checkFloatSafety(): void {
  const t = computeSoaTotals({
    lineItems: [
      { quantity: 3, unitPrice: 0.1 },
      { quantity: 1, unitPrice: 0.2 },
    ],
    discounts: [],
    payments: [{ amount: 0.5 }],
  });
  record("totals are centavo-exact (no 0.1+0.2 drift)", t.subtotal === 0.5 && t.balance === 0, JSON.stringify(t));
}

function checkDiscountCap(): void {
  const t = computeSoaTotals({
    lineItems: [{ quantity: 1, unitPrice: 1000 }],
    discounts: [
      { type: "amount", value: 800 },
      { type: "amount", value: 500 },
      { type: "percent", value: 50 },
    ],
    payments: [{ amount: 300 }],
  });
  record(
    "discounts never push the total below 0; overpayment shows as negative balance",
    t.discountAmounts.join() === "800,200,0" && t.total === 0 && t.balance === -300,
    JSON.stringify(t)
  );
}

function checkHalfTypedForm(): void {
  const t = computeSoaTotals({
    lineItems: [{ quantity: 2, unitPrice: undefined }, { quantity: NaN, unitPrice: 5 }],
    discounts: [{ type: "percent" }],
    payments: [{}],
  });
  record("blank/NaN inputs count as 0 (live summary never shows NaN)", t.total === 0 && t.balance === 0, JSON.stringify(t));
}

function checkRoundTrip(): void {
  const row = JSON.parse(JSON.stringify(soaValuesToRow(SAMPLE))) as SoaContentRow;
  const back = soaRowToFormValues(row);
  const ok =
    soaFormSchema.safeParse(back).success &&
    JSON.stringify(computeSoaTotals(back)) === JSON.stringify(computeSoaTotals(SAMPLE)) &&
    back.discounts[1].voucherCode === "HTL-2026-001" &&
    back.payments[0].label === "Downpayment via GCash" &&
    back.contactId === "" &&
    row.contact_id === null;
  record("values survive soaValuesToRow -> JSON -> soaRowToFormValues", ok, JSON.stringify(back));
}

function checkVoucherFieldsDroppedOnPlainDiscount(): void {
  const row = soaValuesToRow({
    ...SAMPLE,
    discounts: [{ source: "discount", label: "x", type: "amount", value: 1, voucherId: "abc", voucherCode: "Z" }],
  });
  record(
    "plain discounts don't keep stale voucher fields",
    JSON.stringify(row.discounts) === '[{"source":"discount","label":"x","type":"amount","value":1}]',
    JSON.stringify(row.discounts)
  );
}

function checkSchemaRules(): void {
  const bad = [
    ["no line items", { ...SAMPLE, lineItems: [] }],
    ["percent over 100", { ...SAMPLE, discounts: [{ source: "discount", label: "x", type: "percent", value: 120 }] }],
    ["3 decimal places", { ...SAMPLE, lineItems: [{ description: "x", quantity: 1, unitPrice: 1.005 }] }],
    ["due before issue", { ...SAMPLE, dueDate: "2026-11-01" }],
    ["blank bill-to", { ...SAMPLE, billToName: "  " }],
    ["zero quantity", { ...SAMPLE, lineItems: [{ description: "x", quantity: 0, unitPrice: 1 }] }],
  ] as const;
  const accepted = bad.filter(([, v]) => soaFormSchema.safeParse(v).success).map(([n]) => n);
  record(
    "schema rejects invalid statements",
    accepted.length === 0 && soaFormSchema.safeParse(SAMPLE).success,
    accepted.length ? `accepted: ${accepted.join(", ")}` : "all rejected, sample accepted"
  );
}

function checkLabels(): void {
  const labels = SAMPLE.discounts.map(discountLabel);
  record(
    "discount labels name vouchers and percents",
    labels[0] === "Early bird – 10%" && labels[1] === "Voucher: Partner hotel voucher (HTL-2026-001)",
    JSON.stringify(labels)
  );
}

async function checkPdf(outPath: string | undefined): Promise<void> {
  const buffer = await renderSoaPdf({ soaNo: "SOA-000001", values: SAMPLE }, LOCAL_LOGO_PATH);
  const signature = buffer.subarray(0, 5).toString("ascii");
  if (outPath) writeFileSync(outPath, buffer);
  record("renderSoaPdf produces a well-formed PDF offline", signature === "%PDF-" && buffer.length > 1000, `length=${buffer.length}`);
}

async function main(): Promise<void> {
  checkTotals();
  checkFloatSafety();
  checkDiscountCap();
  checkHalfTypedForm();
  checkRoundTrip();
  checkVoucherFieldsDroppedOnPlainDiscount();
  checkSchemaRules();
  checkLabels();
  const outIndex = process.argv.indexOf("--out");
  await checkPdf(outIndex > -1 ? process.argv[outIndex + 1] : undefined);

  console.log("\nverify-soa\n");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error("verify-soa failed:", error);
  process.exit(1);
});
