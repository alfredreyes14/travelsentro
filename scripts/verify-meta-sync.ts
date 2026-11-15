/**
 * Pure-logic proof for lib/meta-sync: stage <-> label names, email/phone
 * extraction from Messenger messages, and the Conversions API for CRM
 * request body. No network or Supabase access.
 *
 * The SQL side (linking chats, queueing jobs, label -> stage) lives in
 * supabase/migrations/20261116120000_meta_stage_sync.sql.
 *
 * Run via `npm run verify:meta-sync`.
 */
import { createHash } from "node:crypto";

import {
  buildCapiBody,
  isFreshEnough,
  normalizePhoneForMeta,
} from "../lib/meta-sync/capi";
import { extractEmails, extractPhoneKeys } from "../lib/meta-sync/parse";
import {
  ALL_META_STAGE_NAMES,
  isLabelRemoval,
  metaStageName,
  stageForLabel,
} from "../lib/meta-sync/stages";

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, pass: a === e, detail: `expected=${e} actual=${a}` });
}

// ---------------------------------------------------------------- labels
check("label names", ALL_META_STAGE_NAMES, [
  "New lead", "Inquiry", "Quotation", "Confirmation", "Lost",
  "Contacted", "Follow-up", "Discovery", "Contract Review", "Won",
]);
check("New -> 'New lead'", metaStageName("new"), "New lead");
check("'Quotation' -> quotation", stageForLabel("Quotation"), "quotation");
check("case/space-insensitive", stageForLabel("  new LEAD "), "new");
check("plain 'New' works too", stageForLabel("New"), "new");
check("'follow up' -> follow_up", stageForLabel("follow up"), "follow_up");
check("'Contract-Review' -> contract_review", stageForLabel("Contract-Review"), "contract_review");
check("other labels ignored", stageForLabel("VIP"), null);
check("empty ignored", stageForLabel(""), null);
check("removal: remove", isLabelRemoval("remove"), true);
check("removal: delete_label", isLabelRemoval("delete_label"), true);
check("add is not removal", isLabelRemoval("add"), false);

// ---------------------------------------------------------------- parsing
// The shape of a Meta lead form's first Messenger message (made-up data).
const formMessage =
  "Hello! I filled out your form and would like to know more about your business.\n" +
  "Email: Juan.Dela.Cruz@Example.com\nFull name: Juan Dela Cruz\nPhone number: 0917 555 1234\n" +
  "Which package do you want to avail?: BEIJING + SHANGHAI 6D5N";
check("email from form message", extractEmails(formMessage), ["juan.dela.cruz@example.com"]);
check("phone from form message", extractPhoneKeys(formMessage), ["9175551234"]);
check("+63 format", extractPhoneKeys("call me +63 917-555-1234"), ["9175551234"]);
check("639 format", extractPhoneKeys("639175551234"), ["9175551234"]);
check("dates and prices aren't phones", extractPhoneKeys("Dec 17-23, 2026 for 4 pax, USD 699"), []);
check("landline ignored", extractPhoneKeys("(02) 8123 4567"), []);
check("no email", extractEmails("4 pax po"), []);

// ---------------------------------------------------------------- Conversions API
check("phone 09.. -> 63..", normalizePhoneForMeta("0917 555 1234"), "639175551234");
check("phone +63 kept", normalizePhoneForMeta("+63 917 555 1234"), "639175551234");
const now = Math.floor(Date.now() / 1000);
check("6 days old is fresh", isFreshEnough(now - 6 * 86400), true);
check("8 days old is stale", isFreshEnough(now - 8 * 86400), false);

const body = buildCapiBody([
  { leadId: "12345678901234567", stage: "quotation", eventTime: now, email: " Juan@Example.com ", phone: "09175551234" },
  { leadId: "not-a-lead", stage: "new", eventTime: now },
]);
check("17-digit lead id kept exact (raw number)", body.includes('"lead_id":12345678901234567'), true);
const parsed = JSON.parse(body.replace(/"lead_id":(\d+)/g, '"lead_id":"$1"'));
check("bad lead id dropped", parsed.data.length, 1);
check("event_name is the stage", parsed.data[0].event_name, "Quotation");
check("action_source", parsed.data[0].action_source, "system_generated");
check("custom_data marks CRM", parsed.data[0].custom_data, { event_source: "crm", lead_event_source: "TravelSentro CRM" });
check("email hashed, normalised", parsed.data[0].user_data.em, [createHash("sha256").update("juan@example.com").digest("hex")]);
check("phone hashed with country code", parsed.data[0].user_data.ph, [createHash("sha256").update("639175551234").digest("hex")]);
check("test code only when given", "test_event_code" in parsed, false);
check("test code included", JSON.parse(buildCapiBody([], "TEST123")).test_event_code, "TEST123");

let allPass = true;
for (const r of results) {
  if (!r.pass) allPass = false;
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
}
console.log(
  `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
);
if (!allPass) process.exit(1);
