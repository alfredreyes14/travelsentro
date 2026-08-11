/**
 * Stateless proof for lib/messenger/webhook.ts's pure functions
 * (buildGreeting, verifySignature) -- no real network call, since
 * sendMessengerText needs a live token and a real Messenger user to send
 * to (covered instead by this plan's Task 4 manual end-to-end check).
 * Mirrors scripts/verify-semaphore-error-handling.ts's CheckResult/
 * PASS-FAIL structure.
 *
 * Run via `npm run verify:messenger-webhook`.
 */
import crypto from "node:crypto";

import { buildGreeting, verifySignature } from "../lib/messenger/webhook";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkNamedGreeting(): CheckResult {
  const text = buildGreeting("Bali Getaway");
  const pass = text.includes("Bali Getaway");
  return {
    name: "Named greeting includes package name",
    pass,
    detail: pass ? `got "${text}"` : `package name missing from "${text}"`,
  };
}

function checkGenericGreeting(): CheckResult {
  const text = buildGreeting(null);
  const pass = text.length > 0 && !text.includes("null");
  return {
    name: "Generic greeting for no package",
    pass,
    detail: pass ? `got "${text}"` : `unexpected output "${text}"`,
  };
}

function checkValidSignaturePasses(): CheckResult {
  const secret = "test-secret";
  const body = JSON.stringify({ hello: "world" });
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");
  const pass = verifySignature(body, signature, secret) === true;
  return {
    name: "Correctly-signed body passes",
    pass,
    detail: pass ? "verified" : "expected true, got false",
  };
}

function checkTamperedBodyFails(): CheckResult {
  const secret = "test-secret";
  const body = JSON.stringify({ hello: "world" });
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");
  const tamperedBody = JSON.stringify({ hello: "world!" });
  const pass = verifySignature(tamperedBody, signature, secret) === false;
  return {
    name: "Tampered body fails verification",
    pass,
    detail: pass ? "correctly rejected" : "expected false, got true",
  };
}

function checkMissingHeaderFails(): CheckResult {
  const pass = verifySignature("{}", null, "test-secret") === false;
  return {
    name: "Missing signature header fails",
    pass,
    detail: pass ? "correctly rejected" : "expected false, got true",
  };
}

function main() {
  const results = [
    checkNamedGreeting(),
    checkGenericGreeting(),
    checkValidSignaturePasses(),
    checkTamperedBodyFails(),
    checkMissingHeaderFails(),
  ];

  console.log(`\nverify-messenger-webhook\n`);
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
