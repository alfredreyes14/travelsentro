/**
 * Stubbed regression proof for this plan's (04-06) fail-loud HMAC secret
 * hardening in lib/unsubscribe-token.ts. Mirrors
 * scripts/verify-semaphore-error-handling.ts's structure (CheckResult type,
 * structured PASS/FAIL console summary, process.exit(1) on any failure,
 * save-original-env-vars-and-restore-in-finally) but requires no Supabase
 * client, service-role key, or real network access -- pure in-process calls
 * to signContactId/verifyContactId.
 *
 * Proves the three behaviors from this task's <behavior> block:
 * (1) an unset UNSUBSCRIBE_TOKEN_SECRET in a production runtime throws
 *     instead of silently signing/verifying with a source-visible fallback
 * (2) an unset UNSUBSCRIBE_TOKEN_SECRET in development still round-trips
 *     successfully (the existing local-dev-without-.env.local workflow)
 * (3) once a real UNSUBSCRIBE_TOKEN_SECRET is configured, a signature
 *     produced with any other secret value is rejected
 *
 * Run via `npm run verify:unsubscribe-token-secret`.
 */
import { createHmac } from "node:crypto";

import { signContactId, verifyContactId } from "../lib/unsubscribe-token";

type CheckResult = { name: string; pass: boolean; detail: string };

// Next.js's global.d.ts declares process.env.NODE_ENV as readonly. This
// script deliberately flips it between checks to exercise both runtime
// branches, so route assignments through a plain mutable-record view of
// process.env instead of fighting that ambient readonly declaration.
const mutableEnv = process.env as Record<string, string | undefined>;

const results: CheckResult[] = [];

const originalNodeEnv = process.env.NODE_ENV;
const originalSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET;

async function checkProductionFailsLoudWhenUnset(): Promise<CheckResult> {
  mutableEnv.NODE_ENV = "production";
  delete process.env.UNSUBSCRIBE_TOKEN_SECRET;

  try {
    signContactId("test-contact-id");
    return {
      name: "Production fails loud when UNSUBSCRIBE_TOKEN_SECRET is unset",
      pass: false,
      detail: "Expected signContactId to throw, but it resolved successfully",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const pass = message.includes("UNSUBSCRIBE_TOKEN_SECRET");
    return {
      name: "Production fails loud when UNSUBSCRIBE_TOKEN_SECRET is unset",
      pass,
      detail: pass
        ? `threw expected message: "${message}"`
        : `threw unexpected message: "${message}"`,
    };
  }
}

async function checkDevelopmentFallbackRoundTrips(): Promise<CheckResult> {
  mutableEnv.NODE_ENV = "development";
  delete process.env.UNSUBSCRIBE_TOKEN_SECRET;

  try {
    const sig = signContactId("test-contact-id");
    const valid = verifyContactId("test-contact-id", sig);
    return {
      name: "Development fallback round-trips without throwing",
      pass: valid,
      detail: valid
        ? "signContactId did not throw and verifyContactId returned true"
        : `verifyContactId returned false for sig="${sig}"`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "Development fallback round-trips without throwing",
      pass: false,
      detail: `expected no throw, but got: "${message}"`,
    };
  }
}

async function checkWrongSecretSignatureRejected(): Promise<CheckResult> {
  mutableEnv.NODE_ENV = "production";
  process.env.UNSUBSCRIBE_TOKEN_SECRET = "test-real-secret-value";

  const validSig = signContactId("contact-a");
  const validAccepted = verifyContactId("contact-a", validSig);

  const forgedSig = createHmac("sha256", "a-totally-different-wrong-secret")
    .update("contact-a")
    .digest("base64url");
  const forgedRejected = !verifyContactId("contact-a", forgedSig);

  const pass = validAccepted && forgedRejected;
  return {
    name: "Wrong-secret signature rejected once a real secret is configured",
    pass,
    detail: pass
      ? "valid signature accepted, forged signature rejected"
      : `validAccepted=${validAccepted} forgedRejected=${forgedRejected}`,
  };
}

async function main() {
  try {
    results.push(await checkProductionFailsLoudWhenUnset());
    results.push(await checkDevelopmentFallbackRoundTrips());
    results.push(await checkWrongSecretSignatureRejected());
  } finally {
    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV;
    } else {
      mutableEnv.NODE_ENV = originalNodeEnv;
    }

    if (originalSecret === undefined) {
      delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    } else {
      process.env.UNSUBSCRIBE_TOKEN_SECRET = originalSecret;
    }
  }

  console.log(`\nverify-unsubscribe-token-secret\n`);
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
  console.error("verify-unsubscribe-token-secret failed:", err);
  process.exit(1);
});
