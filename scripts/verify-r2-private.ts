/**
 * Live round trip against the private documents bucket: a presigned PUT
 * the way the browser does it, a head, a presigned GET, proof that the
 * object is not readable without a signature or through the public CDN,
 * and a delete. Mirrors scripts/verify-r2-storage.ts.
 *
 * Run via `npm run verify:r2-private`. Writes one small object under
 * contacts/verify-.../ in R2_PRIVATE_BUCKET_NAME and deletes it.
 */
import { randomUUID } from "node:crypto";

import {
  deletePrivateObject,
  headObject,
  presignDownload,
  presignUpload,
} from "../lib/storage/r2-private";
import { contentDisposition } from "../lib/crm/documents";

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const results: CheckResult[] = [];
  const key = `contacts/verify-${randomUUID()}/${randomUUID()}.pdf`;
  const body = Buffer.from("%PDF-1.4 verify-r2-private");
  const disposition = contentDisposition('Kontrata "final".pdf');

  try {
    const putUrl = await presignUpload(key, "application/pdf");
    const put = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body,
    });
    results.push({
      name: "a presigned PUT with only a Content-Type header is accepted",
      pass: put.ok,
      detail: `status=${put.status} ${put.ok ? "" : await put.text()}`,
    });

    const head = await headObject(key);
    results.push({
      name: "headObject reports the real size and type",
      pass: head?.size === body.length && head.contentType === "application/pdf",
      detail: JSON.stringify(head),
    });

    results.push({
      name: "headObject of a missing key is null",
      pass: (await headObject(`contacts/verify-missing/${randomUUID()}.pdf`)) === null,
      detail: "expected null",
    });

    const getUrl = await presignDownload(key, disposition, "application/pdf");
    const get = await fetch(getUrl);
    const downloaded = Buffer.from(await get.arrayBuffer());
    results.push({
      name: "a presigned GET returns the file with the requested disposition",
      pass:
        get.ok &&
        downloaded.equals(body) &&
        get.headers.get("content-disposition") === disposition,
      detail: `status=${get.status} disposition=${get.headers.get("content-disposition")}`,
    });

    const unsigned = await fetch(getUrl.split("?")[0]);
    results.push({
      name: "the same URL without its signature is refused",
      pass: !unsigned.ok,
      detail: `status=${unsigned.status}`,
    });

    const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, "");
    const viaCdn = await fetch(`${publicBase}/${key}`);
    results.push({
      name: "the object is not reachable through the public media URL",
      pass: !viaCdn.ok,
      detail: `status=${viaCdn.status}`,
    });
  } finally {
    await deletePrivateObject(key);
  }

  results.push({
    name: "deletePrivateObject removes the object",
    pass: (await headObject(key)) === null,
    detail: "expected null after delete",
  });

  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-r2-private failed:", err);
  process.exit(1);
});
