/**
 * Stateless proof for lib/messenger/link.ts's buildMessengerLink() --
 * no network, no secrets, mirrors scripts/verify-semaphore-error-handling.ts's
 * CheckResult/PASS-FAIL structure.
 *
 * Run via `npm run verify:messenger-link`.
 */
import { buildMessengerLink } from "../lib/messenger/link";
import { FACEBOOK_PAGE_USERNAME } from "../lib/constants";

type CheckResult = { name: string; pass: boolean; detail: string };

function checkNoSlug(): CheckResult {
  const url = buildMessengerLink();
  const expected = `https://m.me/${FACEBOOK_PAGE_USERNAME}`;
  const pass = url === expected;
  return {
    name: "No slug -> plain page link",
    pass,
    detail: pass ? `got "${url}"` : `expected "${expected}", got "${url}"`,
  };
}

function checkWithSlug(): CheckResult {
  const url = buildMessengerLink("bali-getaway");
  const expected = `https://m.me/${FACEBOOK_PAGE_USERNAME}?ref=bali-getaway`;
  const pass = url === expected;
  return {
    name: "Slug appended as ref param",
    pass,
    detail: pass ? `got "${url}"` : `expected "${expected}", got "${url}"`,
  };
}

function checkSlugIsEncoded(): CheckResult {
  const url = buildMessengerLink("has space/slash");
  const pass = url.includes(encodeURIComponent("has space/slash"));
  return {
    name: "Slug is URL-encoded",
    pass,
    detail: pass ? `got "${url}"` : `raw slug leaked unencoded into "${url}"`,
  };
}

function main() {
  const results = [checkNoSlug(), checkWithSlug(), checkSlugIsEncoded()];

  console.log(`\nverify-messenger-link\n`);
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
