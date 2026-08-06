/**
 * Stubbed-fetch regression proof for this plan's (04-06) accurate
 * per-recipient bulk email status hardening in lib/resend.ts. Mirrors
 * scripts/verify-semaphore-error-handling.ts's structure (CheckResult type,
 * structured PASS/FAIL console summary, process.exit(1) on any failure,
 * stubbed globalThis.fetch, restore-in-finally) but requires no real
 * Resend credentials or network access.
 *
 * Proves the behaviors from this task's <behavior> block:
 * (1) a partial-failure batch response (some indices rejected via the
 *     permissive-mode `errors` array, the rest queued) is attributed
 *     per-item, aligned 1:1 by position with the input items
 * (2) a whole-call failure (top-level `error`, no `data`) attributes every
 *     item as failed
 * (3) every call requests permissive batch validation via the
 *     `x-batch-validation` request header
 *
 * Run via `npm run verify:bulk-email-status`.
 */
import { createElement } from "react";

import { sendBatchEmails } from "../lib/resend";

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

const originalFetch = globalThis.fetch;

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    to: `recipient-${i}@example.com`,
    subject: "Test subject",
    react: createElement("p", null, "test"),
  }));
}

async function checkPartialFailureAttribution(): Promise<CheckResult> {
  const captured: { headers: Headers | null } = { headers: null };

  globalThis.fetch = (async (_url: unknown, options: unknown) => {
    captured.headers =
      (options as { headers?: Headers } | undefined)?.headers ?? null;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        data: [{ id: "email-a" }, { id: "email-c" }],
        errors: [{ index: 1, message: "Invalid recipient" }],
      }),
    } as unknown as Response;
  }) as typeof fetch;

  const results3 = await sendBatchEmails(makeItems(3));

  const shapeOk =
    results3.length === 3 &&
    results3[0]?.id === "email-a" &&
    results3[0]?.error === null &&
    results3[1]?.id === null &&
    results3[1]?.error === "Invalid recipient" &&
    results3[2]?.id === "email-c" &&
    results3[2]?.error === null;

  const headerOk = captured.headers?.get("x-batch-validation") === "permissive";

  const pass = shapeOk && headerOk;
  return {
    name: "Partial-failure batch attributes per-item results, aligned by position",
    pass,
    detail: pass
      ? "results aligned correctly and x-batch-validation=permissive header sent"
      : `shapeOk=${shapeOk} headerOk=${headerOk} results=${JSON.stringify(results3)}`,
  };
}

async function checkWholeCallFailureAttribution(): Promise<CheckResult> {
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          message: "Unauthorized",
          statusCode: 401,
          name: "authentication_error",
        }),
    }) as unknown as Response) as typeof fetch;

  const results2 = await sendBatchEmails(makeItems(2));

  const pass =
    results2.length === 2 &&
    results2.every((r) => r.id === null && Boolean(r.error));

  return {
    name: "Whole-call failure attributes every item as failed",
    pass,
    detail: pass
      ? "every entry has id=null and a non-null error"
      : `unexpected results: ${JSON.stringify(results2)}`,
  };
}

async function main() {
  try {
    results.push(await checkPartialFailureAttribution());
    results.push(await checkWholeCallFailureAttribution());
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log(`\nverify-bulk-email-status-accuracy\n`);
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

main().catch((err) => {
  console.error("verify-bulk-email-status-accuracy failed:", err);
  process.exit(1);
});
