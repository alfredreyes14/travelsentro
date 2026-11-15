/**
 * One-time setup for the CRM <-> Meta stage sync (lib/meta-sync). Run it
 * after the Page token has pages_messaging and the Page's admin has
 * accepted Meta's Page Contact Terms:
 *
 *   npm run setup:meta-sync
 *
 * 1. Subscribes the Page to the webhook fields the CRM needs: messages
 *    (customer messages), messaging_referrals / messaging_postbacks (the
 *    existing greeting) and inbox_labels (stage labels staff put on chats).
 * 2. Creates the stage labels in the Page inbox ("New lead", "Inquiry",
 *    "Quotation", ...), so staff can pick them from the start.
 * 3. Checks the Conversions API dataset is reachable (when configured).
 *
 * Idempotent: re-running changes nothing that's already set. Reads back
 * what it wrote, like scripts/setup-messenger-profile.ts.
 */
import { FACEBOOK_PAGE_ID } from "../lib/constants";
import { getPageAccessToken } from "../lib/meta-leads/graph";
import { ALL_META_STAGE_NAMES } from "../lib/meta-sync/stages";

const GRAPH = "https://graph.facebook.com/v25.0";
const FIELDS = ["messages", "messaging_referrals", "messaging_postbacks", "inbox_labels"];

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

async function graph(method: string, path: string, token: string, body?: object) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : {}, text };
}

async function main() {
  console.log("\nsetup-meta-sync\n");
  const token = await getPageAccessToken(FACEBOOK_PAGE_ID);

  // 1. Webhook fields
  const sub = await graph(
    "POST",
    `${FACEBOOK_PAGE_ID}/subscribed_apps?subscribed_fields=${FIELDS.join(",")}`,
    token
  );
  results.push({
    name: "Subscribe Page to webhook fields",
    pass: sub.ok,
    detail: sub.ok ? FIELDS.join(", ") : `HTTP ${sub.status}: ${sub.text}`,
  });
  const apps = await graph("GET", `${FACEBOOK_PAGE_ID}/subscribed_apps`, token);
  const subscribed: string[] = apps.json?.data?.[0]?.subscribed_fields ?? [];
  const missing = FIELDS.filter((f) => !subscribed.includes(f));
  results.push({
    name: "Webhook fields read back",
    pass: apps.ok && missing.length === 0,
    detail: apps.ok ? (missing.length ? `missing: ${missing.join(", ")}` : "all present") : apps.text,
  });

  // 2. Stage labels
  const list = await graph("GET", `${FACEBOOK_PAGE_ID}/custom_labels?fields=page_label_name&limit=100`, token);
  if (!list.ok) {
    results.push({
      name: "Read inbox labels",
      pass: false,
      detail: `HTTP ${list.status}: ${list.text} (Page Contact Terms accepted? pages_messaging on the token?)`,
    });
  } else {
    const existing = new Set<string>(
      (list.json.data ?? []).map((l: { page_label_name: string }) => l.page_label_name)
    );
    for (const name of ALL_META_STAGE_NAMES) {
      if (existing.has(name)) {
        results.push({ name: `Label "${name}"`, pass: true, detail: "already there" });
        continue;
      }
      const created = await graph("POST", `${FACEBOOK_PAGE_ID}/custom_labels`, token, {
        page_label_name: name,
      });
      results.push({
        name: `Label "${name}"`,
        pass: created.ok,
        detail: created.ok ? "created" : `HTTP ${created.status}: ${created.text}`,
      });
    }
  }

  // 3. Conversions API dataset
  const datasetId = process.env.META_CRM_DATASET_ID;
  const capiToken = process.env.META_CAPI_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
  if (!datasetId || !capiToken) {
    results.push({
      name: "Conversions API dataset",
      pass: false,
      detail: "META_CRM_DATASET_ID / META_CAPI_ACCESS_TOKEN not set -- stage events to Meta Ads are skipped",
    });
  } else {
    const ds = await graph("GET", `${encodeURIComponent(datasetId)}?fields=name`, capiToken);
    results.push({
      name: "Conversions API dataset reachable",
      pass: ds.ok,
      detail: ds.ok ? `"${ds.json.name}"` : `HTTP ${ds.status}: ${ds.text}`,
    });
  }

  let allPass = true;
  for (const r of results) {
    if (!r.pass) allPass = false;
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
  }
  console.log(`\n${allPass ? "PASS" : "FAIL"}\n`);
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
