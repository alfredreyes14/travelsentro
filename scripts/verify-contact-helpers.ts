/**
 * Pure-logic proof for lib/crm's contact rules: stages per client type,
 * contract end colours, tag normalising, document limits, contact labels
 * and the contact form schema. Mirrors scripts/verify-partner-helpers.ts's
 * CheckResult/PASS-FAIL structure. No network or Supabase access.
 *
 * Run via `npm run verify:contact-helpers`.
 */
import { format } from "date-fns";

import {
  B2B_STAGES,
  B2C_STAGES,
  STAGE_CHIP_CLASSNAME,
  STAGE_LABELS,
  isClientType,
  isStageForType,
  toClientType,
  toContactStage,
} from "../lib/crm/stage";
import { SERVICE_LABELS, toServiceKeys } from "../lib/crm/services";
import { contractEndTone, todayInManila } from "../lib/crm/contract";
import { normalizeTags } from "../lib/crm/tags";
import {
  MAX_DOCUMENT_BYTES,
  checkDocument,
  contentDisposition,
  formatBytes,
  isAllowedDocumentType,
  isDocumentKeyForContact,
  sanitizeFileName,
} from "../lib/crm/documents";
import { contactLabel, withEmail } from "../lib/crm/contact-label";
import {
  EMPTY_CONTACT_VALUES,
  contactFormSchema,
  contactRowToFormValues,
  contactValuesToRow,
  convertSchema,
  parseLabeledList,
  type ContactFormValues,
} from "../lib/crm/contact-schema";

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, pass: a === e, detail: `expected=${e} actual=${a}` });
}

// ---------------------------------------------------------------- stages
check("B2C stages in order", B2C_STAGES, [
  "new",
  "inquiry",
  "quotation",
  "confirmation",
  "lost",
]);
check("B2B stages in order", B2B_STAGES, [
  "new",
  "contacted",
  "follow_up",
  "discovery",
  "contract_review",
  "won",
  "lost",
]);
for (const stage of [...B2C_STAGES, ...B2B_STAGES]) {
  check(`stage ${stage} has a label`, typeof STAGE_LABELS[stage], "string");
  check(
    `stage ${stage} has chip colours`,
    /^border-\w+-200 bg-\w+-100 text-\w+-800$/.test(STAGE_CHIP_CLASSNAME[stage]),
    true
  );
}
check("Follow-up label", STAGE_LABELS.follow_up, "Follow-up");
check("Contract Review label", STAGE_LABELS.contract_review, "Contract Review");
check("inquiry is a B2C stage", isStageForType("b2c", "inquiry"), true);
check("inquiry is not a B2B stage", isStageForType("b2b", "inquiry"), false);
check("discovery is not a B2C stage", isStageForType("b2c", "discovery"), false);
check("won is not a B2C stage", isStageForType("b2c", "won"), false);
check("new belongs to both", [isStageForType("b2c", "new"), isStageForType("b2b", "new")], [true, true]);
check("a non-string is no stage", isStageForType("b2c", 3), false);
check("an unknown client type has no stages", isStageForType("vip" as never, "new"), false);
check("a prototype name is no client type", isStageForType("constructor" as never, "new"), false);
check("unknown stage reads as new", toContactStage("b2c", "qualified"), "new");
check("known stage reads as itself", toContactStage("b2b", "follow_up"), "follow_up");
check("isClientType", [isClientType("b2c"), isClientType("b2b"), isClientType("B2B"), isClientType(null)], [true, true, false, false]);
check("unknown client type reads as b2c", toClientType("company"), "b2c");

// -------------------------------------------------------------- services
check("Flight / Accommodation label", SERVICE_LABELS.flight_accommodation, "Flight / Accommodation");
check("toServiceKeys drops unknown keys", toServiceKeys(["visa_services", "cruise", "other"]), ["visa_services", "other"]);

// -------------------------------------------------------------- contract
// Local-time dates with a time of day, to prove the time is ignored.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 30);
check("no end date", contractEndTone(null, at(2026, 10, 13)), "none");
check("unparseable end date", contractEndTone("soon", at(2026, 10, 13)), "none");
check("3 months and a day before", contractEndTone("2026-12-15", at(2026, 9, 14)), "none");
check("exactly 3 months before", contractEndTone("2026-12-15", at(2026, 9, 15)), "warning");
check("1 month and a day before", contractEndTone("2026-12-15", at(2026, 11, 14)), "warning");
check("exactly 1 month before", contractEndTone("2026-12-15", at(2026, 11, 15)), "danger");
check("on the end date", contractEndTone("2026-12-15", at(2026, 12, 15)), "danger");
check("the day after", contractEndTone("2026-12-15", at(2026, 12, 16)), "expired");
check("a year after", contractEndTone("2026-12-15", at(2027, 12, 16)), "expired");
// May 31 minus 3 months clamps to Feb 28.
check("month-end clamp, day before", contractEndTone("2026-05-31", at(2026, 2, 27)), "none");
check("month-end clamp, on the day", contractEndTone("2026-05-31", at(2026, 2, 28)), "warning");
check(
  "todayInManila is the Manila calendar day (UTC+8)",
  format(todayInManila(new Date("2026-10-13T17:00:00Z")), "yyyy-MM-dd"),
  "2026-10-14"
);
check(
  "todayInManila before 16:00 UTC is the same day",
  format(todayInManila(new Date("2026-10-13T15:59:00Z")), "yyyy-MM-dd"),
  "2026-10-13"
);

// ------------------------------------------------------------------ tags
check("trims and drops blanks", normalizeTags(["  vip ", "", "   "]), ["vip"]);
check("collapses inner whitespace", normalizeTags(["repeat   customer"]), ["repeat customer"]);
check("removes case-insensitive duplicates, first wins", normalizeTags(["VIP", "vip", "Vip"]), ["VIP"]);
check("reuses an existing tag's spelling", normalizeTags(["honeymoon", "new one"], ["Honeymoon", "Corporate"]), ["Honeymoon", "new one"]);
check("keeps order", normalizeTags(["b", "a", "c"]), ["b", "a", "c"]);

// ------------------------------------------------------------- documents
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
check("a PDF is accepted", checkDocument({ name: "contract.pdf", type: "application/pdf", size: 1024 }), {
  ok: true,
  contentType: "application/pdf",
  extension: "pdf",
});
check("exactly 20 MB is accepted", checkDocument({ name: "a.pdf", type: "application/pdf", size: MAX_DOCUMENT_BYTES }).ok, true);
check("one byte over is rejected", checkDocument({ name: "a.pdf", type: "application/pdf", size: MAX_DOCUMENT_BYTES + 1 }), {
  ok: false,
  error: "Documents must be 20 MB or smaller.",
});
check("an empty file is rejected", checkDocument({ name: "a.pdf", type: "application/pdf", size: 0 }), {
  ok: false,
  error: "That file is empty.",
});
check("a blank type falls back to the extension", checkDocument({ name: "Agreement.DOCX", type: "", size: 10 }), {
  ok: true,
  contentType: DOCX,
  extension: "docx",
});
check("a blank type with an unknown extension is rejected", checkDocument({ name: "notes.txt", type: "", size: 10 }).ok, false);
check("SVG is rejected", checkDocument({ name: "logo.svg", type: "image/svg+xml", size: 10 }).ok, false);
check("HTML is rejected", checkDocument({ name: "page.html", type: "text/html", size: 10 }).ok, false);
check("a wrong type is not rescued by its extension", checkDocument({ name: "evil.pdf", type: "text/html", size: 10 }).ok, false);
check("a prototype name is not a type", checkDocument({ name: "x.html", type: "constructor", size: 10 }).ok, false);
check("a prototype name is not an extension", checkDocument({ name: "x.constructor", type: "", size: 10 }).ok, false);
check(
  "isAllowedDocumentType",
  [isAllowedDocumentType("application/pdf"), isAllowedDocumentType("text/html"), isAllowedDocumentType("toString")],
  [true, false, false]
);
check("jpeg maps to jpg", checkDocument({ name: "id.jpeg", type: "image/jpeg", size: 10 }), {
  ok: true,
  contentType: "image/jpeg",
  extension: "jpg",
});
check("file name: strips a path", sanitizeFileName("C:\\Users\\me\\Contract 2026.pdf"), "Contract 2026.pdf");
check("file name: strips a unix path", sanitizeFileName("../../etc/passwd"), "passwd");
check("file name: removes control characters", sanitizeFileName("a\u0000b\nc.pdf"), "abc.pdf");
check("file name: blank becomes document", sanitizeFileName("   "), "document");
check("file name: capped at 200 characters", sanitizeFileName("a".repeat(300)).length, 200);
// The cut at 200 lands in the middle of the emoji's surrogate pair.
const SPLIT_EMOJI = sanitizeFileName(`${"a".repeat(199)}\u{1F600}.pdf`);
check("file name: no half emoji left by the cut", SPLIT_EMOJI, "a".repeat(199));
check(
  "content disposition survives a lone surrogate",
  contentDisposition("a\ud83d.pdf"),
  "inline; filename=\"a_.pdf\"; filename*=UTF-8''a.pdf"
);
const CONTACT = "11111111-2222-3333-4444-555555555555";
const OBJECT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
check("key under the contact's prefix", isDocumentKeyForContact(`contacts/${CONTACT}/${OBJECT}.pdf`, CONTACT), true);
check("key under another contact", isDocumentKeyForContact(`contacts/${OBJECT}/${OBJECT}.pdf`, CONTACT), false);
check("key with a traversal", isDocumentKeyForContact(`contacts/${CONTACT}/../x.pdf`, CONTACT), false);
check("key with a nested path", isDocumentKeyForContact(`contacts/${CONTACT}/a/${OBJECT}.pdf`, CONTACT), false);
check(
  "content disposition escapes quotes and keeps unicode",
  contentDisposition('Kontrata "final" ñ.pdf'),
  "inline; filename=\"Kontrata _final_ _.pdf\"; filename*=UTF-8''Kontrata%20%22final%22%20%C3%B1.pdf"
);
check("formatBytes", [formatBytes(512), formatBytes(2048), formatBytes(5 * 1024 * 1024 + 512 * 1024)], ["512 B", "2 KB", "5.5 MB"]);

// --------------------------------------------------------- contact label
check("label prefers email", contactLabel({ name: "Maria", email: "m@x.com", phone: "0917" }), "Maria (m@x.com)");
check("label falls back to phone", contactLabel({ name: "Maria", email: null, phone: "0917" }), "Maria (0917)");
check("label with neither", contactLabel({ name: "Maria", email: null, phone: null }), "Maria");
check(
  "withEmail drops null and blank emails",
  withEmail([
    { id: "1", email: "a@x.com" },
    { id: "2", email: null },
    { id: "3", email: "  " },
  ]).map((c) => c.id),
  ["1"]
);

// ---------------------------------------------------------------- schema
const VALID: ContactFormValues = {
  ...EMPTY_CONTACT_VALUES,
  name: "Maria Santos",
  email: "maria@example.com",
};

function firstIssue(values: unknown): string {
  const parsed = contactFormSchema.safeParse(values);
  return parsed.success ? "OK" : parsed.error.issues[0].path.join(".");
}

check("a contact with an email is valid", firstIssue(VALID), "OK");
check("phone only is valid", firstIssue({ ...VALID, email: "", phone: "0917 123 4567" }), "OK");
check("neither email nor phone", firstIssue({ ...VALID, email: "", phone: "  " }), "email");
check("a blank name", firstIssue({ ...VALID, name: "   " }), "name");
check("a malformed email", firstIssue({ ...VALID, email: "maria@" }), "email");
const cased = contactFormSchema.safeParse({ ...VALID, email: "  Jane@Gmail.COM " });
check("email is trimmed and lower-cased", cased.success ? cased.data.email : "INVALID", "jane@gmail.com");
check("Other ticked without text", firstIssue({ ...VALID, servicesAvailed: ["other"] }), "servicesOther");
check("Other ticked with text", firstIssue({ ...VALID, servicesAvailed: ["other"], servicesOther: "Travel insurance" }), "OK");
check("an unknown service key", firstIssue({ ...VALID, servicesAvailed: ["cruise"] }), "servicesAvailed.0");
check("a malformed extra email", firstIssue({ ...VALID, otherEmails: [{ label: "Billing", value: "billing" }] }), "otherEmails.0.value");
check("a blank extra number", firstIssue({ ...VALID, otherPhones: [{ label: "Office", value: " " }] }), "otherPhones.0.value");
check("contract end before start", firstIssue({ ...VALID, contractStart: "2026-06-01", contractEnd: "2026-05-31" }), "contractEnd");
check("contract ending the day it starts", firstIssue({ ...VALID, contractStart: "2026-06-01", contractEnd: "2026-06-01" }), "OK");
check("a contract date that is not a date", firstIssue({ ...VALID, contractEnd: "next year" }), "contractEnd");
check("21 tags", firstIssue({ ...VALID, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }), "tags");
check("a 41-character tag", firstIssue({ ...VALID, tags: ["x".repeat(41)] }), "tags.0");

const row = contactValuesToRow(
  {
    ...VALID,
    phone: "",
    tags: ["honeymoon", "Honeymoon", "new"],
    servicesAvailed: ["tour_package"],
    servicesOther: "left over from before",
    repName: "",
    contractStart: "",
  },
  ["Honeymoon"]
);
check("row: blank phone is null", row.phone, null);
check("row: tags normalised against existing", row.tags, ["Honeymoon", "new"]);
check("row: Other text cleared when Other is not ticked", row.services_other, null);
check("row: blank representative is null", row.rep_name, null);
check("row: blank contract date is null", row.contract_start, null);

check("parseLabeledList keeps well-formed entries", parseLabeledList([{ label: "Billing", value: "b@x.com" }, { value: 3 }, "x", null]), [
  { label: "Billing", value: "b@x.com" },
]);
check("parseLabeledList of a non-array", parseLabeledList({ label: "a", value: "b" }), []);
check(
  "row to form values",
  contactRowToFormValues({
    name: "Acme Travel",
    email: null,
    phone: "0917",
    tags: ["corp"],
    services_availed: ["other", "cruise"],
    services_other: "Insurance",
    rep_name: "J. Cruz",
    rep_position: null,
    other_emails: [{ label: "Billing", value: "b@acme.com" }],
    other_phones: "garbage",
    contract_start: "2026-01-01",
    contract_end: null,
  }),
  {
    name: "Acme Travel",
    email: "",
    phone: "0917",
    tags: ["corp"],
    servicesAvailed: ["other"],
    servicesOther: "Insurance",
    repName: "J. Cruz",
    repPosition: "",
    otherEmails: [{ label: "Billing", value: "b@acme.com" }],
    otherPhones: [],
    contractStart: "2026-01-01",
    contractEnd: "",
  }
);

check("convert: a B2B stage for B2B", convertSchema.safeParse({ clientType: "b2b", stage: "discovery" }).success, true);
check("convert: a B2C stage for B2B", convertSchema.safeParse({ clientType: "b2b", stage: "inquiry" }).success, false);
check("convert: an unknown type", convertSchema.safeParse({ clientType: "vip", stage: "new" }).success, false);

let allPass = true;
for (const r of results) {
  if (!r.pass) allPass = false;
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} -- ${r.detail}`);
}
console.log(
  `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
);
if (!allPass) process.exit(1);
