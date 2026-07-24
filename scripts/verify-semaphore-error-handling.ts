/**
 * Stubbed-fetch regression proof for this plan's (04-05) Semaphore
 * hardening in lib/sms/semaphore.ts. Mirrors scripts/verify-permission-denial.ts's
 * structure (CheckResult type, structured PASS/FAIL console summary,
 * process.exit(1) on any failure) but requires no Supabase client,
 * service-role key, or real network access -- it stubs globalThis.fetch
 * directly, so it behaves identically regardless of whether real Semaphore
 * credentials are configured locally.
 *
 * Proves the three behaviors from this task's <behavior> block:
 * (1) a missing SEMAPHORE_API_KEY throws before any fetch call is made
 * (2) Semaphore's HTTP-200-with-validation-error body shape produces an
 *     explicit "Semaphore API error: <field>: ..." throw, never the old
 *     incidental array-destructure TypeError
 * (3) a real array-of-SemaphoreMessage success body still passes through
 *     unchanged (regression guard for the existing real-success path)
 *
 * Run via `npm run verify:semaphore-error-handling`.
 */
import { sendSingleSms } from "../lib/sms/semaphore";

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.SEMAPHORE_API_KEY;
const originalSenderName = process.env.SEMAPHORE_SENDER_NAME;

async function checkMissingApiKeyGuard(): Promise<CheckResult> {
  delete process.env.SEMAPHORE_API_KEY;
  delete process.env.SEMAPHORE_SENDER_NAME;

  globalThis.fetch = (async () => {
    throw new Error(
      "fetch should never be called when SEMAPHORE_API_KEY is unset"
    );
  }) as typeof fetch;

  try {
    await sendSingleSms("09171234567", "test");
    return {
      name: "Missing SEMAPHORE_API_KEY guard",
      pass: false,
      detail: "Expected sendSingleSms to throw, but it resolved successfully",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const pass = message.includes("Semaphore is not configured");
    return {
      name: "Missing SEMAPHORE_API_KEY guard",
      pass,
      detail: pass
        ? `threw expected message: "${message}"`
        : `threw unexpected message: "${message}"`,
    };
  }
}

async function checkExplicitValidationErrorThrow(): Promise<CheckResult> {
  process.env.SEMAPHORE_API_KEY = "test-placeholder-key";
  process.env.SEMAPHORE_SENDER_NAME = "TestSender";

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ apikey: ["The selected apikey is invalid."] }),
    }) as unknown as Response) as typeof fetch;

  try {
    await sendSingleSms("09171234567", "test");
    return {
      name: "Explicit validation-error throw",
      pass: false,
      detail: "Expected sendSingleSms to throw, but it resolved successfully",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hasExpectedPhrase = message.includes("Semaphore API error");
    const hasFieldName = message.includes("apikey");
    const noIterable = !message.toLowerCase().includes("iterable");
    const noUndefined = !message.toLowerCase().includes("undefined");
    const pass = hasExpectedPhrase && hasFieldName && noIterable && noUndefined;
    return {
      name: "Explicit validation-error throw",
      pass,
      detail: pass
        ? `threw expected message: "${message}"`
        : `threw unexpected message: "${message}" (expectedPhrase=${hasExpectedPhrase} fieldName=${hasFieldName} noIterable=${noIterable} noUndefined=${noUndefined})`,
    };
  }
}

async function checkRealSuccessPassthrough(): Promise<CheckResult> {
  process.env.SEMAPHORE_API_KEY = "test-placeholder-key";
  process.env.SEMAPHORE_SENDER_NAME = "TestSender";

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => [
        {
          message_id: "1",
          recipient: "09171234567",
          message: "test",
          sender_name: "Test",
          network: "Globe",
          status: "Queued",
          created_at: new Date().toISOString(),
        },
      ],
    }) as unknown as Response) as typeof fetch;

  try {
    const result = await sendSingleSms("09171234567", "test");
    const pass = result?.status === "Queued";
    return {
      name: "Real-success passthrough (regression guard)",
      pass,
      detail: pass
        ? `returned status="Queued" as expected`
        : `returned unexpected result: ${JSON.stringify(result)}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "Real-success passthrough (regression guard)",
      pass: false,
      detail: `expected no throw, but got: "${message}"`,
    };
  }
}

async function main() {
  try {
    results.push(await checkMissingApiKeyGuard());
    results.push(await checkExplicitValidationErrorThrow());
    results.push(await checkRealSuccessPassthrough());
  } finally {
    globalThis.fetch = originalFetch;

    if (originalApiKey === undefined) {
      delete process.env.SEMAPHORE_API_KEY;
    } else {
      process.env.SEMAPHORE_API_KEY = originalApiKey;
    }

    if (originalSenderName === undefined) {
      delete process.env.SEMAPHORE_SENDER_NAME;
    } else {
      process.env.SEMAPHORE_SENDER_NAME = originalSenderName;
    }
  }

  console.log(`\nverify-semaphore-error-handling\n`);
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
  console.error("verify-semaphore-error-handling failed:", err);
  process.exit(1);
});
