/**
 * Live-HTTP verification for the public package PDF download route
 * (app/(public)/packages/[slug]/pdf/route.ts). Looks up the real, published
 * "Palawan Island Hopping" seed package (scripts/seed.ts) via the
 * service-role client to get its DB-generated slug, then proves:
 *  1. a published package's PDF route returns 200 with the right headers
 *     and a well-formed PDF body.
 *  2. a nonexistent slug returns 404.
 *
 * Requires a running server (`npm run dev -- -p 3100` or
 * `npm run build && npm run start -- -p 3100`) and a seeded database
 * (`npm run seed`). Run via `npm run verify:public-package-pdf` (-> `tsx
 * --env-file=.env.local scripts/verify-public-package-pdf.ts`), with
 * BASE_URL optionally overriding the default http://localhost:3100 target.
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:public-package-pdf`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const supabase = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const { data: pkg, error } = await supabase
    .from("packages")
    .select("slug")
    .eq("name", "Palawan Island Hopping")
    .eq("is_published", true)
    .single();

  if (error || !pkg) {
    throw new Error(
      `Could not find published seed package "Palawan Island Hopping" -- run \`npm run seed\` first. (${error?.message ?? "no row"})`
    );
  }

  const results: CheckResult[] = [];

  const res = await fetch(`${BASE_URL}/packages/${pkg.slug}/pdf`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const signature = buffer.subarray(0, 5).toString("ascii");

  results.push({
    name: "Published package PDF route returns 200",
    pass: res.status === 200,
    detail: `status=${res.status}`,
  });
  results.push({
    name: "Published package PDF route sets Content-Type: application/pdf",
    pass: res.headers.get("content-type") === "application/pdf",
    detail: `content-type=${res.headers.get("content-type")}`,
  });
  results.push({
    name: "Published package PDF route sets an attachment Content-Disposition",
    pass: (res.headers.get("content-disposition") ?? "").startsWith(
      `attachment; filename="${pkg.slug}.pdf"`
    ),
    detail: `content-disposition=${res.headers.get("content-disposition")}`,
  });
  results.push({
    name: "Published package PDF body is a well-formed PDF",
    pass: signature === "%PDF-" && buffer.length > 1000,
    detail: `signature=${JSON.stringify(signature)} length=${buffer.length}`,
  });

  const notFoundRes = await fetch(
    `${BASE_URL}/packages/does-not-exist-xyz/pdf`
  );
  results.push({
    name: "Nonexistent slug returns 404",
    pass: notFoundRes.status === 404,
    detail: `status=${notFoundRes.status}`,
  });

  console.log(`\nverify-public-package-pdf -- BASE_URL=${BASE_URL}\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-public-package-pdf failed:", err);
  process.exit(1);
});
