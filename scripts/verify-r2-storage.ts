/**
 * Live-HTTP verification that lib/storage/r2-client.ts and
 * lib/storage/image-url.ts work end-to-end against a real R2 bucket:
 * uploads a disposable test object, fetches its public URL and checks the
 * bytes round-trip correctly, deletes it, then confirms the delete took
 * effect. Always attempts cleanup on any failure path, mirroring
 * scripts/verify-permission-denial.ts's disposable-resource convention.
 *
 * Run via `npm run verify:r2-storage` (-> `tsx --env-file=.env.local
 * scripts/verify-r2-storage.ts`). Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and NEXT_PUBLIC_R2_PUBLIC_URL to be
 * set in .env.local (see .env.local.example) — provision the bucket in the
 * Cloudflare dashboard first.
 */
import { uploadObject, deleteObject } from "../lib/storage/r2-client";
import { getPublicImageUrl } from "../lib/storage/image-url";

const REQUIRED_ENV_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "NEXT_PUBLIC_R2_PUBLIC_URL",
] as const;

for (const name of REQUIRED_ENV_VARS) {
  if (!process.env[name]) {
    throw new Error(
      `Missing ${name} in the environment. Provision the R2 bucket in the ` +
        `Cloudflare dashboard and populate .env.local (see .env.local.example) ` +
        `before running \`npm run verify:r2-storage\`.`
    );
  }
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const testKey = `verify/${Date.now()}.txt`;
  const testBody = "r2-verify-payload";
  const results: CheckResult[] = [];

  try {
    await uploadObject(testKey, Buffer.from(testBody), "text/plain");
    results.push({
      name: "uploadObject succeeds",
      pass: true,
      detail: `uploaded key=${testKey}`,
    });

    const url = getPublicImageUrl(testKey);
    const res = await fetch(url);
    const body = await res.text();
    const fetchPass = res.status === 200 && body === testBody;
    results.push({
      name: "Uploaded object is publicly readable",
      pass: fetchPass,
      detail: fetchPass
        ? `status=${res.status} body matches`
        : `status=${res.status} (want 200) body="${body}" (want "${testBody}") url=${url}`,
    });

    await deleteObject(testKey);
    results.push({
      name: "deleteObject succeeds",
      pass: true,
      detail: `deleted key=${testKey}`,
    });

    const resAfterDelete = await fetch(url);
    const deletedPass = resAfterDelete.status !== 200;
    results.push({
      name: "Deleted object is no longer readable",
      pass: deletedPass,
      detail: deletedPass
        ? `status=${resAfterDelete.status} (not 200, as expected)`
        : `status=${resAfterDelete.status} (want non-200 after delete)`,
    });
  } catch (err) {
    results.push({
      name: "Script ran without throwing",
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    // Best-effort cleanup even if an assertion above never reached delete.
    await deleteObject(testKey).catch(() => {});
  }

  console.log(`\nverify-r2-storage\n`);
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
  console.error("verify-r2-storage failed:", err);
  process.exit(1);
});
