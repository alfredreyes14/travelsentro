/**
 * Pure-logic proof for lib/partners/link.ts's normalizePartnerLink and
 * lib/storage/image-extension.ts's extensionFromMimeType -- mirrors
 * scripts/verify-format-price.ts's CheckResult/PASS-FAIL structure. No
 * network/Supabase access needed.
 *
 * Run via `npm run verify:partner-helpers`.
 */
import { normalizePartnerLink } from "../lib/partners/link";
import { extensionFromMimeType } from "../lib/storage/image-extension";

type CheckResult = { name: string; pass: boolean; detail: string };

// `expected` is the stored URL, null for "valid and blank", or "INVALID".
const LINK_CASES: ReadonlyArray<{ input: string; expected: string | null }> = [
  { input: "", expected: null },
  { input: "   ", expected: null },
  { input: "paynamics.com", expected: "https://paynamics.com" },
  { input: "  paynamics.com  ", expected: "https://paynamics.com" },
  { input: "https://paynamics.com", expected: "https://paynamics.com" },
  { input: "https://paynamics.com/", expected: "https://paynamics.com/" },
  { input: "http://example.com/about?ref=ts", expected: "http://example.com/about?ref=ts" },
  { input: "HTTPS://Example.COM/Path", expected: "https://example.com/Path" },
  { input: "www.example.com/partners", expected: "https://www.example.com/partners" },
  { input: "example.com:8080/x", expected: "https://example.com:8080/x" },
  { input: "javascript:alert(1)", expected: "INVALID" },
  { input: "JavaScript:alert(1)", expected: "INVALID" },
  { input: "data:text/html,<script>alert(1)</script>", expected: "INVALID" },
  { input: "mailto:hello@example.com", expected: "INVALID" },
  { input: "ftp://example.com", expected: "INVALID" },
  { input: "localhost:3000", expected: "INVALID" },
  { input: "example", expected: "INVALID" },
  { input: "my site.com", expected: "INVALID" },
  { input: "https://", expected: "INVALID" },
  { input: `https://example.com/${"a".repeat(2100)}`, expected: "INVALID" },
  // An email address or a URL carrying a username is not a website link.
  { input: "info@paynamics.com", expected: "INVALID" },
  { input: "https://user:pass@example.com", expected: "INVALID" },
  { input: "good.com@evil.com", expected: "INVALID" },
];

function checkLink(input: string, expected: string | null): CheckResult {
  const result = normalizePartnerLink(input);
  const actual = result.ok ? result.url : "INVALID";
  const shown = input.length > 40 ? `${input.slice(0, 40)}...` : input;
  return {
    name: `normalizePartnerLink(${JSON.stringify(shown)})`,
    pass: actual === expected,
    detail: `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  };
}

const EXTENSION_CASES: ReadonlyArray<{ type: string; expected: string }> = [
  { type: "image/svg+xml", expected: "svg" },
  { type: "image/jpeg", expected: "jpg" },
  { type: "image/png", expected: "png" },
  { type: "image/webp", expected: "webp" },
  { type: "", expected: "jpg" },
];

function checkExtension(type: string, expected: string): CheckResult {
  const actual = extensionFromMimeType(type);
  return {
    name: `extensionFromMimeType(${JSON.stringify(type)})`,
    pass: actual === expected,
    detail: `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  };
}

function main() {
  const results = [
    ...LINK_CASES.map((c) => checkLink(c.input, c.expected)),
    ...EXTENSION_CASES.map((c) => checkExtension(c.type, c.expected)),
  ];

  console.log(`\nverify-partner-helpers\n`);
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
