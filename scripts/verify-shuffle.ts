/**
 * Pure-logic proof for lib/upsell/shuffle.ts -- mirrors
 * scripts/verify-unsubscribe-token-secret.ts's CheckResult/PASS-FAIL
 * structure. No network/Supabase access needed.
 *
 * Run via `npm run verify:shuffle`.
 */
import { shuffle } from "../lib/upsell/shuffle";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkSameElements(): CheckResult {
  const input = ["a", "b", "c", "d", "e"];
  const result = shuffle(input);
  const pass =
    result.length === input.length &&
    [...result].sort().join(",") === [...input].sort().join(",");
  return {
    name: "Shuffled array has the same elements as the input",
    pass,
    detail: `input=${JSON.stringify(input)} result=${JSON.stringify(result)}`,
  };
}

function checkDoesNotMutateInput(): CheckResult {
  const input = ["a", "b", "c", "d", "e"];
  const before = [...input];
  shuffle(input);
  const pass = input.join(",") === before.join(",");
  return {
    name: "shuffle() does not mutate its input array",
    pass,
    detail: `input after call=${JSON.stringify(input)} (expected unchanged: ${JSON.stringify(before)})`,
  };
}

function checkProducesDifferentOrders(): CheckResult {
  const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const orderings = new Set<string>();
  for (let i = 0; i < 20; i++) {
    orderings.add(shuffle(input).join(","));
  }
  // With 8 elements, the chance all 20 runs land on the exact same
  // ordering by pure luck is astronomically small -- this is a real proof
  // of randomness, not a flaky test.
  const pass = orderings.size > 1;
  return {
    name: "shuffle() produces more than one distinct ordering across repeated calls",
    pass,
    detail: `saw ${orderings.size} distinct ordering(s) across 20 calls`,
  };
}

function main() {
  const results = [
    checkSameElements(),
    checkDoesNotMutateInput(),
    checkProducesDifferentOrders(),
  ];

  console.log(`\nverify-shuffle\n`);
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
