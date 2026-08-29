/**
 * Stateless proof for lib/messenger/link.ts's buildMessengerLink() --
 * no network, no secrets, mirrors scripts/verify-semaphore-error-handling.ts's
 * CheckResult/PASS-FAIL structure.
 *
 * Run via `npm run verify:messenger-link`.
 */
import { buildMessengerLink, GENERAL_MESSENGER_REF } from "../lib/messenger/link";
import { FACEBOOK_PAGE_USERNAME } from "../lib/constants";

type CheckResult = { name: string; pass: boolean; detail: string };

// Regression guard: a ref-less link is what silently broke the auto-greeting
// -- Meta only fires the referral webhook when `ref` is present, so a bare
// m.me link opened Messenger and the customer got no reply. Every link must
// carry a ref, package or not.
function checkNoSlug(): CheckResult {
  const url = buildMessengerLink();
  const expected = `https://m.me/${FACEBOOK_PAGE_USERNAME}?ref=${GENERAL_MESSENGER_REF}`;
  const pass = url === expected;
  return {
    name: "No slug -> general ref (never a bare link)",
    pass,
    detail: pass ? `got "${url}"` : `expected "${expected}", got "${url}"`,
  };
}

function checkEveryLinkHasRef(): CheckResult {
  const urls = [
    buildMessengerLink(),
    buildMessengerLink(""),
    buildMessengerLink("bali-getaway"),
  ];
  const missing = urls.filter((u) => !u.includes("?ref="));
  const pass = missing.length === 0;
  return {
    name: "Every link carries a ref (empty slug included)",
    pass,
    detail: pass
      ? `all ${urls.length} links have a ref`
      : `ref-less link(s): ${missing.join(", ")}`,
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
  const results = [
    checkNoSlug(),
    checkEveryLinkHasRef(),
    checkWithSlug(),
    checkSlugIsEncoded(),
  ];

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
