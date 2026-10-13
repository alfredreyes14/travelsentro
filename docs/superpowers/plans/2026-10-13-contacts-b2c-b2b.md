# Contacts B2C and B2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff manage B2C and B2B clients in Contacts, each with its own stage pipeline and fields, on a revamped main page with coloured stage chips.

**Architecture:** B2C and B2B share the `contacts` table, told apart by a `client_type` column, with a `stage` column constrained to that type's pipeline. The old `status` column stays and a trigger keeps it in sync, so production's current code keeps working on the shared database until this ships. Pure rules (stages, contract colours, tags, document limits, form validation) live in `lib/crm/` and are used by the forms, the server actions and mirrored by database constraints. Documents go to a private R2 bucket through presigned URLs.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions, Route Handlers), Supabase Postgres + RLS, Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, react-hook-form + zod 4, TanStack Table, shadcn/ui on Base UI, date-fns, `tsx` verify scripts.

**Spec:** `docs/superpowers/specs/2026-10-13-contacts-b2c-b2b-design.md`

## Global Constraints

- Client types are exactly `b2c` and `b2b`.
- B2C stages, in order: `new`, `inquiry`, `quotation`, `confirmation`, `lost`. B2B stages, in order: `new`, `contacted`, `follow_up`, `discovery`, `contract_review`, `won`, `lost`.
- Service keys are exactly `tour_package`, `visa_services`, `custom_tour`, `flight_accommodation`, `other`.
- Existing contacts become B2C with `contacted → inquiry`, `qualified → quotation`, `won → confirmation`.
- The old `contacts.status` column, its check constraint and its values are **not** changed or dropped. New code reads and writes only `stage`.
- A contact needs an email or a phone number. Stored emails are trimmed and lower-cased; a blank email or phone is stored as `null`, never `''`.
- Contract end colour: yellow from 3 calendar months before, red from 1 calendar month before, red plus "Expired" after. "Today" is the date in `Asia/Manila`.
- Documents: 20 MB each; PDF, JPEG, PNG, WebP, `.doc`, `.docx`, `.xls`, `.xlsx`. No SVG or HTML. They live only in the private bucket named by `R2_PRIVATE_BUCKET_NAME`, never in `R2_BUCKET_NAME`.
- Permissions: any logged-in staff member can view contacts and open documents. Every contact or document change needs `can_edit_crm`. Quote linking needs `can_manage_quotes`. No new permission column.
- Converting a contact never deletes the other type's fields.
- Messaging uses a contact's primary email and phone only.
- Transaction history is an empty card. No table, no action.
- One new npm dependency: `@aws-sdk/s3-request-presigner`, at the same version as the installed `@aws-sdk/client-s3`.
- Stage chip colours are Tailwind classes applied to the `outline` Badge. `components/ui/badge.tsx` is not modified.
- Next.js 16 has breaking changes versus older versions. Before using a Next API not already used in a neighbouring file, read its guide under `node_modules/next/dist/docs/01-app/`.
- Tests in this repo are `scripts/verify-*.ts` run with `tsx`, each registered as an `npm run verify:*` script, printing PASS/FAIL per check and exiting 1 on any failure. Scripts and everything in `lib/crm/` import with relative paths, never the `@/` alias.
- **Never `git push`.** Pushing `staging` applies the migration to the database production also uses. The user does the push (see "Rollout handoff").

## Local Environment Notes (read before Task 1)

- Work in a git worktree on a branch cut from `staging` (the superpowers:using-git-worktrees skill sets it up; earlier features used `.worktrees/<name>`). `.env.local` is gitignored, so copy it from the main checkout into the worktree.
- `.env.local` points at a **remote** Supabase project that staging and production share. Never run a write against it. New migrations are applied to the **local** stack only. Point live scripts and the test dev server at the local stack by exporting env vars first (Node's `--env-file` and Next never override variables already set):
  ```bash
  eval "$(npx supabase status -o env | sed -n 's/^API_URL=/export NEXT_PUBLIC_SUPABASE_URL=/p; s/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p; s/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p')"
  export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
  ```
  Run that once per shell before any live command in this plan. If `npx supabase status -o env` prints different key names, map them by hand from `npx supabase status`.
- If `npx supabase start` fails on ports 54321–54327, another project's stack may hold them: `docker ps --format '{{.Names}}\t{{.Ports}}'`. Ask the user before stopping someone else's containers.
- The local database is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Every `psql` command in this plan uses that string; confirm it says `127.0.0.1` before running one.
- The user usually has `next dev` running on port 3000 in the main checkout, pointed at the remote project. Do not stop it. Browser checks run from a scratch copy on port 3100 (Task 9 gives the commands).
- R2 has no local stand-in. Task 8's live check and Task 9's document checks use the real private bucket named in `.env.local`. If `R2_PRIVATE_BUCKET_NAME` is not set there, stop at that step and ask the user to finish the bucket setup described in Task 8 Step 1.

## Review Focus

1. **A contact with no email in a messaging flow** — a phone-only lead opened for an individual message, or ticked in a bulk email selection. Expected: the email tab is unavailable for the individual, the bulk send skips them with a visible count, and nothing is ever sent to `null`. Pinned by Task 1's `withEmail` checks; exercised by hand in Task 9.
2. **A file that is not what it claims** — a `.docx` the browser reports with an empty type, an SVG or HTML file, a 0-byte file, a file of exactly 20 MB and one byte over, a name with quotes, slashes or non-Latin characters. Expected: a blank type falls back to the extension, disallowed types and sizes get their own message, and the stored name can never break the download header. Pinned by Task 1's document checks; the server re-reads the real size and type in Task 8.
3. **A stage that no longer fits the contact** — a stale tab sets a B2C stage on a contact someone just converted to B2B. Expected: the database refuses it and the user sees a message telling them to refresh, not a generic failure. Pinned by Task 2's wrong-pipeline check and Task 4's `23514` handling.
4. **The same email typed differently, or twice** — `Jane@Gmail.com ` when `jane@gmail.com` exists; two phone-only contacts. Expected: the first is recognised as a duplicate with a link to the existing contact; the second is allowed. Pinned by Task 1's lower-casing check and Task 2's duplicate and two-phone-only checks.
5. **Production's old code writing during the rollout window** — the live site sets `status = 'won'` on a contact after the migration has run. Expected: `stage` follows, and the migration's own backfill does not overwrite "last updated by" on every contact. Pinned by Task 2's backfill check and trigger checks.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/crm/stage.ts` | Client types, stages per type, labels, chip classes, guards |
| `lib/crm/services.ts` | The five service keys and labels |
| `lib/crm/contract.ts` | Contract end tone and "today in Manila" |
| `lib/crm/tags.ts` | Tag normalising and limits |
| `lib/crm/documents.ts` | Document types, size limit, file name and key helpers |
| `lib/crm/contact-label.ts` | `name (email or phone)` label; filter to contacts with an email |
| `lib/crm/contact-schema.ts` | zod schema for the contact form, row ↔ form mapping, convert schema |
| `scripts/verify-contact-helpers.ts` | PASS/FAIL checks for everything above |
| `supabase/migrations/20261013120000_contacts_b2c_b2b.sql` | Columns, constraints, backfill, sync trigger, insert policy, `contact_documents`, `list_contact_tags()` |
| `scripts/verify-contacts-rls.ts` | Live checks: constraints, trigger, RLS |
| `types/database.ts` | `contacts` gains columns; `contact_documents`; `list_contact_tags` |
| `actions/messages.ts`, `components/admin/message-compose-dialog.tsx` | Handle contacts with no email |
| `actions/crm.ts` | `createContact`, `updateContact`, `updateStage`, `convertContactType` |
| `components/admin/contact-tag-picker.tsx` | Pick existing tags or create one |
| `components/admin/contact-form-fields.tsx` | Field groups shared by the edit form and the add dialog |
| `components/admin/contact-edit-form.tsx` | Type-aware edit form |
| `components/admin/contact-add-dialog.tsx` | Add contact dialog |
| `components/admin/contact-stage-chip.tsx` | Coloured stage chip |
| `components/admin/contract-end-chip.tsx` | Coloured contract end date |
| `components/admin/crm-contacts-view.tsx` | Tabs, stage chips, search, tag filter, selection |
| `components/admin/crm-table.tsx` | Table and mobile cards for one type |
| `app/admin/(dashboard)/crm/page.tsx` | Loads contacts, reads `?type=` |
| `components/admin/contact-convert-dialog.tsx` | Convert between B2C and B2B |
| `components/admin/contact-b2b-card.tsx` | Representative, extra contacts, contract |
| `components/admin/contact-activity.tsx` | Inquiry and message timeline (moved out of `crm-detail.tsx`) |
| `components/admin/crm-detail.tsx` | Thin layout of the contact page |
| `app/admin/(dashboard)/crm/[id]/page.tsx` | Loads the contact and its related data |
| `actions/quotes.ts`, `components/admin/contact-quotes-card.tsx`, `app/admin/(dashboard)/quotes/new/page.tsx` | Link, unlink and preset quotes |
| `lib/storage/r2-private.ts` | Presign, head and delete on the private bucket |
| `scripts/verify-r2-private.ts` | Live round trip against the private bucket |
| `actions/contact-documents.ts` | Start upload, confirm upload, delete |
| `app/admin/(dashboard)/crm/[id]/documents/[documentId]/route.ts` | Session check, then redirect to a short-lived link |
| `components/admin/contact-documents-card.tsx` | Document list, upload, delete |

Deleted along the way: `components/admin/contact-edit-form-schema.ts` (Task 4), `lib/crm/status.ts` (Task 6).

---

### Task 1: Pure rules and their checks

**Files:**
- Create: `lib/crm/stage.ts`, `lib/crm/services.ts`, `lib/crm/contract.ts`, `lib/crm/tags.ts`, `lib/crm/documents.ts`, `lib/crm/contact-label.ts`, `lib/crm/contact-schema.ts`
- Create: `scripts/verify-contact-helpers.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `stage.ts`: `CLIENT_TYPES`, `type ClientType = "b2c" | "b2b"`, `CLIENT_TYPE_LABELS`, `isClientType(v)`, `toClientType(v: string): ClientType`, `B2C_STAGES`, `B2B_STAGES`, `type ContactStage`, `STAGES_BY_TYPE: Record<ClientType, readonly ContactStage[]>`, `STAGE_LABELS`, `STAGE_CHIP_CLASSNAME`, `isStageForType(type, stage)`, `toContactStage(type, value: string): ContactStage`
  - `services.ts`: `SERVICE_KEYS`, `type ServiceKey`, `SERVICE_LABELS`, `toServiceKeys(values: readonly string[]): ServiceKey[]`
  - `contract.ts`: `type ContractEndTone = "none" | "warning" | "danger" | "expired"`, `contractEndTone(end: string | null, today: Date)`, `todayInManila(now?: Date): Date`, `CONTRACT_END_CLASSNAME`
  - `tags.ts`: `MAX_TAGS = 20`, `MAX_TAG_LENGTH = 40`, `normalizeTags(input, existing?)`
  - `documents.ts`: `MAX_DOCUMENT_BYTES`, `DOCUMENT_ACCEPT`, `checkDocument(file)`, `isAllowedDocumentType(contentType)`, `sanitizeFileName(name)`, `documentKeyPrefix(contactId)`, `isDocumentKeyForContact(key, contactId)`, `contentDisposition(fileName)`, `formatBytes(bytes)`
  - `contact-label.ts`: `contactLabel(c)`, `withEmail(contacts)`
  - `contact-schema.ts`: `contactFormSchema`, `type ContactFormValues`, `type LabeledValue`, `EMPTY_CONTACT_VALUES`, `parseLabeledList(json)`, `contactRowToFormValues(row)`, `contactValuesToRow(values, existingTags)`, `convertSchema`

- [ ] **Step 1: Write the failing verify script**

Create `scripts/verify-contact-helpers.ts`:

```ts
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
```

In `package.json`, add to `"scripts"` after `"verify:partners-rls"`:

```json
    "verify:contact-helpers": "tsx scripts/verify-contact-helpers.ts",
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run verify:contact-helpers`
Expected: FAIL with `Cannot find module '../lib/crm/stage'`.

- [ ] **Step 3: Write `lib/crm/stage.ts`**

```ts
/**
 * Client types and their stage pipelines. The same lists are enforced by
 * the contacts_stage_matches_type check constraint
 * (supabase/migrations/20261013120000_contacts_b2c_b2b.sql) -- change both
 * together.
 */
export const CLIENT_TYPES = ["b2c", "b2b"] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  b2c: "B2C",
  b2b: "B2B",
};

export function isClientType(value: unknown): value is ClientType {
  return (
    typeof value === "string" &&
    (CLIENT_TYPES as readonly string[]).includes(value)
  );
}

/** A client type read from the database; an unknown value reads as B2C. */
export function toClientType(value: string): ClientType {
  return isClientType(value) ? value : "b2c";
}

export const B2C_STAGES = [
  "new",
  "inquiry",
  "quotation",
  "confirmation",
  "lost",
] as const;

export const B2B_STAGES = [
  "new",
  "contacted",
  "follow_up",
  "discovery",
  "contract_review",
  "won",
  "lost",
] as const;

export type ContactStage =
  | (typeof B2C_STAGES)[number]
  | (typeof B2B_STAGES)[number];

export const STAGES_BY_TYPE: Record<ClientType, readonly ContactStage[]> = {
  b2c: B2C_STAGES,
  b2b: B2B_STAGES,
};

export const STAGE_LABELS: Record<ContactStage, string> = {
  new: "New",
  inquiry: "Inquiry",
  quotation: "Quotation",
  confirmation: "Confirmation",
  contacted: "Contacted",
  follow_up: "Follow-up",
  discovery: "Discovery",
  contract_review: "Contract Review",
  won: "Won",
  lost: "Lost",
};

// Applied on top of Badge's `outline` variant, never as new badge.tsx
// variants. Written out in full so Tailwind sees every class name.
export const STAGE_CHIP_CLASSNAME: Record<ContactStage, string> = {
  new: "border-blue-200 bg-blue-100 text-blue-800",
  inquiry: "border-violet-200 bg-violet-100 text-violet-800",
  quotation: "border-amber-200 bg-amber-100 text-amber-800",
  confirmation: "border-green-200 bg-green-100 text-green-800",
  contacted: "border-cyan-200 bg-cyan-100 text-cyan-800",
  follow_up: "border-amber-200 bg-amber-100 text-amber-800",
  discovery: "border-violet-200 bg-violet-100 text-violet-800",
  contract_review: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800",
  won: "border-green-200 bg-green-100 text-green-800",
  lost: "border-red-200 bg-red-100 text-red-800",
};

export function isStageForType(
  type: ClientType,
  stage: unknown
): stage is ContactStage {
  // `?.` because a caller validating untrusted input may pass a type that
  // is not a ClientType at all.
  const stages: readonly string[] | undefined = STAGES_BY_TYPE[type];
  return typeof stage === "string" && (stages?.includes(stage) ?? false);
}

/** A stage read from the database; a value outside the pipeline reads as New. */
export function toContactStage(type: ClientType, value: string): ContactStage {
  return isStageForType(type, value) ? value : "new";
}
```

- [ ] **Step 4: Write `lib/crm/services.ts`**

```ts
/**
 * What a B2C customer availed. The same keys are enforced by the
 * contacts_services_availed_known check constraint.
 */
export const SERVICE_KEYS = [
  "tour_package",
  "visa_services",
  "custom_tour",
  "flight_accommodation",
  "other",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  tour_package: "Tour Package",
  visa_services: "Visa Services",
  custom_tour: "Custom Tour",
  flight_accommodation: "Flight / Accommodation",
  other: "Other",
};

/** Service keys read from the database, with anything unknown dropped. */
export function toServiceKeys(values: readonly string[]): ServiceKey[] {
  return values.filter((value): value is ServiceKey =>
    (SERVICE_KEYS as readonly string[]).includes(value)
  );
}
```

- [ ] **Step 5: Write `lib/crm/contract.ts`**

```ts
import { isValid, parseISO, startOfDay, subMonths } from "date-fns";

export type ContractEndTone = "none" | "warning" | "danger" | "expired";

/**
 * How urgently a contract end date should read: yellow ("warning") from 3
 * calendar months before, red ("danger") from 1 calendar month before, and
 * "expired" once the end date has passed. `end` is a "YYYY-MM-DD" date;
 * `today`'s time of day is ignored.
 */
export function contractEndTone(
  end: string | null,
  today: Date
): ContractEndTone {
  if (!end) return "none";
  const endDate = parseISO(end);
  if (!isValid(endDate)) return "none";

  const day = startOfDay(today);
  if (day > endDate) return "expired";
  if (day >= subMonths(endDate, 1)) return "danger";
  if (day >= subMonths(endDate, 3)) return "warning";
  return "none";
}

/**
 * Today's calendar date in the Philippines, as a local-midnight Date. Used
 * instead of the machine's own date so the server render (UTC on Vercel)
 * and the browser agree, and the colour follows the business's day.
 */
export function todayInManila(now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(now);
  return parseISO(ymd);
}

export const CONTRACT_END_CLASSNAME: Record<ContractEndTone, string> = {
  none: "",
  warning: "border-yellow-300 bg-yellow-100 text-yellow-900",
  danger: "border-red-300 bg-red-100 text-red-800",
  expired: "border-red-300 bg-red-100 text-red-800",
};
```

- [ ] **Step 6: Write `lib/crm/tags.ts`**

```ts
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/**
 * Trims tags, drops blanks and removes case-insensitive duplicates (the
 * first spelling wins). A tag that matches one already in use, ignoring
 * case, takes the existing spelling so "vip" and "VIP" never both exist.
 * Limits are enforced by contactFormSchema, not here.
 */
export function normalizeTags(
  input: readonly string[],
  existing: readonly string[] = []
): string[] {
  const canonical = new Map<string, string>();
  for (const tag of existing) {
    const key = tag.trim().toLowerCase();
    if (key && !canonical.has(key)) canonical.set(key, tag.trim());
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical.get(key) ?? tag);
  }
  return result;
}
```

- [ ] **Step 7: Write `lib/crm/documents.ts`**

```ts
/**
 * Rules for B2B contact documents, shared by the upload card, the server
 * actions and the download route. SVG and HTML are deliberately absent:
 * documents open inline in the browser.
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const TYPE_TO_EXTENSION: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const EXTENSION_TO_TYPE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(TYPE_TO_EXTENSION).map(([type, ext]) => [ext, type])
  ),
  jpeg: "image/jpeg",
};

export const DOCUMENT_ACCEPT = [
  ...Object.keys(TYPE_TO_EXTENSION),
  ...Object.keys(EXTENSION_TO_TYPE).map((ext) => `.${ext}`),
].join(",");

const TYPE_ERROR =
  "Documents must be a PDF, an image (JPG, PNG, WebP), or a Word or Excel file.";
const SIZE_ERROR = "Documents must be 20 MB or smaller.";
const EMPTY_ERROR = "That file is empty.";

export type DocumentCheck =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; error: string };

/**
 * Validates a file's type and size. Browsers report an empty type for
 * Office files on machines without Office installed, so a blank type (and
 * only a blank one) falls back to the file name's extension.
 */
export function checkDocument(file: {
  name: string;
  type: string;
  size: number;
}): DocumentCheck {
  let contentType = file.type;
  if (!contentType) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    contentType = EXTENSION_TO_TYPE[ext] ?? "";
  }
  const extension = TYPE_TO_EXTENSION[contentType];
  if (!extension) return { ok: false, error: TYPE_ERROR };
  if (file.size <= 0) return { ok: false, error: EMPTY_ERROR };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: SIZE_ERROR };
  return { ok: true, contentType, extension };
}

/** True when a content type read back from storage is one we accept. */
export function isAllowedDocumentType(contentType: string): boolean {
  return contentType in TYPE_TO_EXTENSION;
}

/** The display name stored for a document: no path, no control characters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return clean || "document";
}

export function documentKeyPrefix(contactId: string): string {
  return `contacts/${contactId}/`;
}

/** True only for `contacts/{contactId}/{uuid}.{ext}` -- nothing nested. */
export function isDocumentKeyForContact(
  key: string,
  contactId: string
): boolean {
  const prefix = documentKeyPrefix(contactId);
  return (
    key.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(key.slice(prefix.length))
  );
}

/**
 * An inline Content-Disposition header value for a stored file name: an
 * ASCII-only quoted fallback plus the RFC 5987 UTF-8 form.
 */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 8: Write `lib/crm/contact-label.ts`**

```ts
/**
 * "Name (email)" for pickers and lists, falling back to the phone number
 * for contacts that have no email.
 */
export function contactLabel(contact: {
  name: string;
  email: string | null;
  phone?: string | null;
}): string {
  const detail = contact.email || contact.phone;
  return detail ? `${contact.name} (${detail})` : contact.name;
}

/** The contacts that can receive an email. */
export function withEmail<T extends { email: string | null }>(
  contacts: readonly T[]
): (T & { email: string })[] {
  return contacts.filter(
    (contact): contact is T & { email: string } =>
      typeof contact.email === "string" && contact.email.trim() !== ""
  );
}
```

- [ ] **Step 9: Write `lib/crm/contact-schema.ts`**

```ts
import { z } from "zod";

import { CLIENT_TYPES, isStageForType } from "./stage";
import { SERVICE_KEYS, toServiceKeys } from "./services";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from "./tags";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const labeledValueSchema = z.object({
  label: z.string().trim().max(40, "Keep the label under 40 characters"),
  value: z.string().trim().max(254),
});

export type LabeledValue = z.infer<typeof labeledValueSchema>;

/**
 * Every editable contact field, in the form's all-strings shape ("" means
 * unset). One schema serves both client types: the form shows only the
 * fields for the contact's type and passes the rest through unchanged, so
 * converting a contact never loses the other type's data.
 */
export const contactFormSchema = z
  .object({
    name: z.string().trim().min(1, "Please enter a name").max(200),
    email: z.string().trim().toLowerCase().max(254),
    phone: z.string().trim().max(40),
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(MAX_TAG_LENGTH, `Keep each tag under ${MAX_TAG_LENGTH} characters`)
      )
      .max(MAX_TAGS, `A contact can have up to ${MAX_TAGS} tags`),
    servicesAvailed: z.array(z.enum(SERVICE_KEYS)),
    servicesOther: z
      .string()
      .trim()
      .max(500, "Keep this under 500 characters"),
    repName: z.string().trim().max(200),
    repPosition: z.string().trim().max(200),
    otherEmails: z.array(labeledValueSchema).max(10, "Up to 10 extra emails"),
    otherPhones: z.array(labeledValueSchema).max(10, "Up to 10 extra numbers"),
    contractStart: z.string().trim(),
    contractEnd: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.email && !EMAIL_PATTERN.test(values.email)) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Please enter a valid email address",
      });
    }
    if (!values.email && !values.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter an email address or a phone number",
      });
    }
    if (values.servicesAvailed.includes("other") && !values.servicesOther) {
      ctx.addIssue({
        code: "custom",
        path: ["servicesOther"],
        message: "Please describe the other service",
      });
    }
    values.otherEmails.forEach((entry, index) => {
      if (!EMAIL_PATTERN.test(entry.value)) {
        ctx.addIssue({
          code: "custom",
          path: ["otherEmails", index, "value"],
          message: "Please enter a valid email address",
        });
      }
    });
    values.otherPhones.forEach((entry, index) => {
      if (!entry.value) {
        ctx.addIssue({
          code: "custom",
          path: ["otherPhones", index, "value"],
          message: "Please enter a number",
        });
      }
    });
    for (const field of ["contractStart", "contractEnd"] as const) {
      if (values[field] && !DATE_PATTERN.test(values[field])) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Please pick a date",
        });
      }
    }
    if (
      DATE_PATTERN.test(values.contractStart) &&
      DATE_PATTERN.test(values.contractEnd) &&
      values.contractEnd < values.contractStart
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["contractEnd"],
        message: "The contract can't end before it starts",
      });
    }
  });

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const EMPTY_CONTACT_VALUES: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  tags: [],
  servicesAvailed: [],
  servicesOther: "",
  repName: "",
  repPosition: "",
  otherEmails: [],
  otherPhones: [],
  contractStart: "",
  contractEnd: "",
};

/** A stored other_emails / other_phones jsonb value, with anything malformed dropped. */
export function parseLabeledList(json: unknown): LabeledValue[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as LabeledValue).value === "string"
    ) {
      const { label, value } = entry as LabeledValue;
      return [{ label: typeof label === "string" ? label : "", value }];
    }
    return [];
  });
}

/** The contacts columns the form owns, as stored. */
export type ContactRowFields = {
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  services_availed: string[];
  services_other: string | null;
  rep_name: string | null;
  rep_position: string | null;
  other_emails: unknown;
  other_phones: unknown;
  contract_start: string | null;
  contract_end: string | null;
};

export function contactRowToFormValues(row: ContactRowFields): ContactFormValues {
  return {
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    tags: row.tags,
    servicesAvailed: toServiceKeys(row.services_availed),
    servicesOther: row.services_other ?? "",
    repName: row.rep_name ?? "",
    repPosition: row.rep_position ?? "",
    otherEmails: parseLabeledList(row.other_emails),
    otherPhones: parseLabeledList(row.other_phones),
    contractStart: row.contract_start ?? "",
    contractEnd: row.contract_end ?? "",
  };
}

/**
 * Parsed form values as contacts columns. Blank strings become null, tags
 * are normalised against the tags already in use, and the Other text is
 * cleared unless Other is ticked.
 */
export function contactValuesToRow(
  values: ContactFormValues,
  existingTags: readonly string[]
) {
  return {
    name: values.name,
    email: values.email || null,
    phone: values.phone || null,
    tags: normalizeTags(values.tags, existingTags),
    services_availed: values.servicesAvailed,
    services_other: values.servicesAvailed.includes("other")
      ? values.servicesOther
      : null,
    rep_name: values.repName || null,
    rep_position: values.repPosition || null,
    other_emails: values.otherEmails,
    other_phones: values.otherPhones,
    contract_start: values.contractStart || null,
    contract_end: values.contractEnd || null,
  };
}

/** Switching a contact's type: the stage must belong to the new type. */
export const convertSchema = z
  .object({
    clientType: z.enum(CLIENT_TYPES),
    stage: z.string(),
  })
  .refine((values) => isStageForType(values.clientType, values.stage), {
    path: ["stage"],
    message: "Pick a stage from this pipeline",
  });
```

- [ ] **Step 10: Run the checks**

Run: `npm run verify:contact-helpers`
Expected: every line `[PASS]`, ending `PASS: N/N checks passed`.

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add lib/crm/stage.ts lib/crm/services.ts lib/crm/contract.ts lib/crm/tags.ts lib/crm/documents.ts lib/crm/contact-label.ts lib/crm/contact-schema.ts scripts/verify-contact-helpers.ts package.json
git commit -m "feat: contact rules for client types, stages, contracts, tags and documents"
```

---

### Task 2: Database — columns, sync trigger, policies, documents table

**Files:**
- Create: `supabase/migrations/20261013120000_contacts_b2c_b2b.sql`
- Create: `scripts/verify-contacts-rls.ts`
- Modify: `types/database.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `contacts` columns `client_type`, `stage`, `services_availed`, `services_other`, `rep_name`, `rep_position`, `other_emails`, `other_phones`, `contract_start`, `contract_end`; `email` nullable
  - Table `contact_documents (id, contact_id, file_name, storage_key, content_type, size_bytes, uploaded_by, uploaded_by_name, created_at)`
  - RPC `list_contact_tags(): text[]`
  - An `insert` policy on `contacts` for `can_edit_crm`

`npx tsc --noEmit` reports errors after this task (email is now nullable in the types). That is expected; Task 3 clears them.

- [ ] **Step 1: Write the failing live script**

Create `scripts/verify-contacts-rls.ts`:

```ts
/**
 * Proves the contacts B2C/B2B migration against a real database: the
 * stage/type, email-or-phone, contract-date and services constraints; the
 * status <-> stage sync trigger in both directions; that record_inquiry()
 * still creates a B2C / New contact; and the RLS on contacts inserts and
 * contact_documents. Mirrors scripts/verify-quote-rls.ts's structure.
 *
 * Run via `npm run verify:contacts-rls` with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY pointed at
 * the local Supabase stack with 20261013120000_contacts_b2c_b2b.sql
 * applied. It creates and deletes its own contacts and staff accounts.
 * `.env.local` points at the hosted project production uses, so the
 * script refuses any host other than the local stack.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CheckResult = { name: string; pass: boolean; detail: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY. " +
      "Point them at the local stack, then run `npm run verify:contacts-rls`."
  );
}

/** Same Node 20 WebSocket polyfill as scripts/verify-upsell-rls.ts. */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

type Client = ReturnType<typeof createClient<Database>>;

const STAMP = Date.now();
const PREFIX = `__verify_contacts_${STAMP}`;
const emailFor = (label: string) => `verify-contacts-${label}-${STAMP}@example.com`;

async function signedInClient(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  return client;
}

async function main() {
  const { host, hostname } = new URL(SUPABASE_URL as string);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Refusing to run against ${host}: this script writes contacts and staff accounts. ` +
        "Point NEXT_PUBLIC_SUPABASE_URL and the two keys at the local Supabase stack."
    );
  }

  await ensureWebSocketPolyfill();
  console.log(`\nverify-contacts-rls -> ${host}\n`);

  const options = { auth: { persistSession: false } };
  const anon = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, options);
  const service = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, options);

  const results: CheckResult[] = [];
  const userIds: string[] = [];
  const password = `Verify-${STAMP}-pw`;

  const rejected = (name: string, error: { code?: string; message: string } | null, code: string) => {
    results.push({
      name,
      pass: error?.code === code,
      detail: error ? `code=${error.code} ${error.message}` : "unexpectedly succeeded",
    });
  };

  const readContact = async (id: string) => {
    const { data, error } = await service
      .from("contacts")
      .select("status, stage, client_type")
      .eq("id", id)
      .single();
    if (error || !data) throw new Error(`readContact failed: ${error?.message}`);
    return data;
  };

  try {
    // ------------------------------------------------ defaults and trigger
    const { data: base, error: baseError } = await service
      .from("contacts")
      .insert({ name: `${PREFIX} base`, email: emailFor("base") })
      .select("id, status, stage, client_type")
      .single();
    if (baseError || !base) throw new Error(`fixture insert failed: ${baseError?.message}`);

    results.push({
      name: "a new contact defaults to b2c / new, status new",
      pass: base.client_type === "b2c" && base.stage === "new" && base.status === "new",
      detail: JSON.stringify(base),
    });

    await service.from("contacts").update({ stage: "quotation" }).eq("id", base.id);
    let row = await readContact(base.id);
    results.push({
      name: "new code sets stage=quotation -> status follows as qualified",
      pass: row.status === "qualified",
      detail: JSON.stringify(row),
    });

    await service.from("contacts").update({ status: "won" }).eq("id", base.id);
    row = await readContact(base.id);
    results.push({
      name: "old code sets status=won on a B2C contact -> stage follows as confirmation",
      pass: row.stage === "confirmation",
      detail: JSON.stringify(row),
    });

    await service.from("contacts").update({ client_type: "b2b", stage: "follow_up" }).eq("id", base.id);
    row = await readContact(base.id);
    results.push({
      name: "converting to b2b / follow_up -> status follows as contacted",
      pass: row.client_type === "b2b" && row.stage === "follow_up" && row.status === "contacted",
      detail: JSON.stringify(row),
    });

    await service.from("contacts").update({ status: "qualified" }).eq("id", base.id);
    row = await readContact(base.id);
    results.push({
      name: "old code sets status=qualified on a B2B contact -> stage follows as discovery",
      pass: row.stage === "discovery",
      detail: JSON.stringify(row),
    });

    await service.from("contacts").update({ status: "lost" }).eq("id", base.id);
    row = await readContact(base.id);
    results.push({
      name: "old code sets status=lost -> stage follows as lost",
      pass: row.stage === "lost",
      detail: JSON.stringify(row),
    });

    // ---------------------------------------------------------- constraints
    {
      const { error } = await service
        .from("contacts")
        .insert({ name: `${PREFIX} wrong pipeline`, email: emailFor("wrong"), stage: "discovery" });
      rejected("a B2B stage on a B2C contact is rejected", error, "23514");
    }
    {
      const { error } = await service
        .from("contacts")
        .update({ stage: "inquiry" })
        .eq("id", base.id);
      rejected("a B2C stage on a B2B contact is rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({ name: `${PREFIX} unreachable` });
      rejected("a contact with neither email nor phone is rejected", error, "23514");
    }
    {
      const { error } = await service
        .from("contacts")
        .insert({ name: `${PREFIX} blank`, email: "  ", phone: "" });
      rejected("blank email and blank phone are rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({
        name: `${PREFIX} dates`,
        email: emailFor("dates"),
        contract_start: "2026-06-01",
        contract_end: "2026-05-31",
      });
      rejected("a contract ending before it starts is rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({
        name: `${PREFIX} service`,
        email: emailFor("service"),
        services_availed: ["cruise"],
      });
      rejected("an unknown service key is rejected", error, "23514");
    }
    {
      const { error } = await service.from("contacts").insert({
        name: `${PREFIX} other`,
        email: emailFor("other"),
        services_availed: ["tour_package"],
        services_other: "Insurance",
      });
      rejected("Other text without Other ticked is rejected", error, "23514");
    }
    {
      const { error } = await service
        .from("contacts")
        .insert({ name: `${PREFIX} duplicate`, email: emailFor("base") });
      rejected("a duplicate email is rejected", error, "23505");
    }
    {
      const { error } = await service.from("contacts").insert([
        { name: `${PREFIX} phone only 1`, phone: "09170000001" },
        { name: `${PREFIX} phone only 2`, phone: "09170000002" },
      ]);
      results.push({
        name: "two phone-only contacts are both accepted",
        pass: error === null,
        detail: error ? `code=${error.code} ${error.message}` : "inserted",
      });
    }

    // ------------------------------------------------------- record_inquiry
    {
      const { data, error } = await service.rpc("record_inquiry", {
        p_request_id: randomUUID(),
        p_email: emailFor("inquiry"),
        p_name: `${PREFIX} inquiry`,
        p_phone: "",
        p_message: "verify",
      });
      const contactId = data?.[0]?.contact_id;
      const created = contactId ? await readContact(contactId) : null;
      results.push({
        name: "record_inquiry() still creates a b2c / new contact",
        pass: !error && created?.client_type === "b2c" && created.stage === "new" && created.status === "new",
        detail: error ? error.message : JSON.stringify(created),
      });
    }

    // ---------------------------------------------------------------- tags
    await service.from("contacts").update({ tags: ["zeta", "Alpha"] }).eq("id", base.id);

    // ----------------------------------------------------------------- RLS
    const makeUser = async (label: string) => {
      const email = emailFor(`staff-${label}`);
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
      userIds.push(data.user.id);
      return { id: data.user.id, email };
    };

    const denied = await makeUser("denied");
    const allowed = await makeUser("allowed");
    const { error: grantError } = await service
      .from("profiles")
      .update({ can_edit_crm: true })
      .eq("id", allowed.id);
    if (grantError) throw new Error(`grant can_edit_crm failed: ${grantError.message}`);

    const deniedClient = await signedInClient(denied.email, password);
    const allowedClient = await signedInClient(allowed.email, password);

    const documentRow = (label: string) => ({
      contact_id: base.id,
      file_name: `${label}.pdf`,
      storage_key: `contacts/${base.id}/${randomUUID()}.pdf`,
      content_type: "application/pdf",
      size_bytes: 1024,
    });

    const { data: seededDoc, error: seedDocError } = await service
      .from("contact_documents")
      .insert(documentRow("seeded"))
      .select("id")
      .single();
    if (seedDocError || !seededDoc) throw new Error(`document fixture failed: ${seedDocError?.message}`);

    {
      const { data, error } = await anon.from("contact_documents").select("id").eq("contact_id", base.id);
      results.push({
        name: "an anonymous visitor reads no documents",
        pass: !error && (data ?? []).length === 0,
        detail: `rows=${data?.length ?? "n/a"} error=${error?.message ?? "none"}`,
      });
    }
    {
      const { data, error } = await deniedClient.from("contact_documents").select("id").eq("contact_id", base.id);
      results.push({
        name: "staff without can_edit_crm can read documents",
        pass: !error && (data ?? []).length === 1,
        detail: `rows=${data?.length ?? "n/a"} error=${error?.message ?? "none"}`,
      });
    }
    {
      const { error } = await deniedClient.from("contact_documents").insert(documentRow("denied"));
      results.push({
        name: "staff without can_edit_crm cannot add a document",
        pass: error !== null,
        detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
      });
    }
    {
      const { data } = await deniedClient.from("contact_documents").delete().eq("id", seededDoc.id).select("id");
      results.push({
        name: "staff without can_edit_crm cannot delete a document",
        pass: (data ?? []).length === 0,
        detail: `deleted rows=${data?.length ?? 0}`,
      });
    }
    {
      const { error } = await deniedClient
        .from("contacts")
        .insert({ name: `${PREFIX} denied`, email: emailFor("denied-contact") });
      results.push({
        name: "staff without can_edit_crm cannot add a contact",
        pass: error !== null,
        detail: error ? `rejected: ${error.message}` : "insert unexpectedly succeeded",
      });
    }
    {
      const { data, error } = await allowedClient
        .from("contacts")
        .insert({ name: `${PREFIX} allowed`, phone: "09170000003", client_type: "b2b" })
        .select("id, client_type, stage")
        .single();
      results.push({
        name: "staff with can_edit_crm can add a phone-only B2B contact",
        pass: !error && data?.client_type === "b2b" && data.stage === "new",
        detail: error ? error.message : JSON.stringify(data),
      });
    }
    {
      const { data: inserted, error: insertError } = await allowedClient
        .from("contact_documents")
        .insert(documentRow("allowed"))
        .select("id, uploaded_by")
        .single();
      const { data: deleted } = inserted
        ? await allowedClient.from("contact_documents").delete().eq("id", inserted.id).select("id")
        : { data: null };
      results.push({
        name: "staff with can_edit_crm can add and delete a document, stamped as theirs",
        pass: !insertError && inserted?.uploaded_by === allowed.id && (deleted ?? []).length === 1,
        detail: insertError ? insertError.message : `uploaded_by=${inserted?.uploaded_by} deleted=${deleted?.length ?? 0}`,
      });
    }
    {
      const { data, error } = await deniedClient.rpc("list_contact_tags");
      const tags = data ?? [];
      results.push({
        name: "list_contact_tags() returns distinct tags in order",
        pass: !error && tags.indexOf("Alpha") !== -1 && tags.indexOf("Alpha") < tags.indexOf("zeta"),
        detail: error ? error.message : JSON.stringify(tags),
      });
    }
    {
      const { data, error } = await anon.rpc("list_contact_tags");
      results.push({
        name: "an anonymous visitor gets no tags",
        pass: error !== null || (data ?? []).length === 0,
        detail: error ? `rejected: ${error.message}` : `rows=${data?.length ?? 0}`,
      });
    }
  } finally {
    await service.from("contacts").delete().like("name", `${PREFIX}%`);
    for (const id of userIds) {
      await service.auth.admin.deleteUser(id);
    }
  }

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
  console.error("verify-contacts-rls failed:", err);
  process.exit(1);
});
```

In `package.json`, add to `"scripts"` after `"verify:contact-helpers"`:

```json
    "verify:contacts-rls": "tsx --env-file=.env.local scripts/verify-contacts-rls.ts",
```

- [ ] **Step 2: Bring the local database to the state production is in now, with legacy rows**

```bash
npx supabase start
npx supabase db reset --version 20261011120000
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
insert into contacts (email, name, status, updated_by_name, updated_at) values
  ('legacy-new@example.com', 'Legacy New', 'new', 'Ana', '2026-01-01T00:00:00Z'),
  ('legacy-contacted@example.com', 'Legacy Contacted', 'contacted', 'Ana', '2026-01-01T00:00:00Z'),
  ('legacy-qualified@example.com', 'Legacy Qualified', 'qualified', 'Ana', '2026-01-01T00:00:00Z'),
  ('legacy-won@example.com', 'Legacy Won', 'won', 'Ana', '2026-01-01T00:00:00Z'),
  ('legacy-lost@example.com', 'Legacy Lost', 'lost', 'Ana', '2026-01-01T00:00:00Z');"
```

Expected: `INSERT 0 5`. If `supabase start` fails on a port, see Local Environment Notes.

- [ ] **Step 3: Run the live script to make sure it fails**

Export the local-stack variables (Local Environment Notes), then:

Run: `npm run verify:contacts-rls`
Expected: `verify-contacts-rls failed` — the first check reads `stage` and `client_type`, which do not exist yet.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261013120000_contacts_b2c_b2b.sql`:

```sql
-- Contacts: B2C and B2B clients
-- (docs/superpowers/specs/2026-10-13-contacts-b2c-b2b-design.md).
--
-- (1) contacts gains client_type and stage (a pipeline per type), the B2C
--     "services availed" fields, and the B2B representative, extra
--     emails/numbers and contract dates.
-- (2) stage is backfilled from the old status column.
-- (3) contacts.status is deliberately KEPT, with its check constraint,
--     and a trigger keeps status and stage aligned in both directions.
--     Staging and production share this database, so this migration runs
--     while production still serves code that reads and writes status.
--     A follow-up migration drops status and the trigger once this
--     release is on master.
-- (4) email becomes optional (a lead from WhatsApp or Facebook may only
--     have a number); email or phone is required.
-- (5) An insert policy, so staff can add a contact by hand. Until now
--     record_inquiry() (SECURITY DEFINER) was the only way a contact was
--     created, and 20260720130816 dropped the direct insert policies.
-- (6) contact_documents -- metadata for files in the private R2 bucket.
-- (7) list_contact_tags() -- the tags in use, for the tag picker.

-- ============================================================================
-- (1) New columns
-- ============================================================================
alter table contacts
  add column client_type text not null default 'b2c'
    check (client_type in ('b2c', 'b2b')),
  add column stage text not null default 'new',
  add column services_availed text[] not null default '{}',
  add column services_other text,
  add column rep_name text,
  add column rep_position text,
  add column other_emails jsonb not null default '[]'::jsonb
    check (jsonb_typeof(other_emails) = 'array'),
  add column other_phones jsonb not null default '[]'::jsonb
    check (jsonb_typeof(other_phones) = 'array'),
  add column contract_start date,
  add column contract_end date;

-- ============================================================================
-- (2) Backfill stage from status. contacts_set_updated_by fires on every
-- UPDATE and would stamp updated_by = null, updated_at = now() on every
-- contact, wiping "last updated by", so it is switched off for the backfill.
-- ============================================================================
alter table contacts disable trigger contacts_set_updated_by;

update contacts
set stage = case status
  when 'contacted' then 'inquiry'
  when 'qualified' then 'quotation'
  when 'won' then 'confirmation'
  else status
end;

alter table contacts enable trigger contacts_set_updated_by;

-- ============================================================================
-- (1, continued) Constraints, added after the backfill so existing rows
-- already satisfy them. The stage lists mirror lib/crm/stage.ts and the
-- service keys mirror lib/crm/services.ts -- change both together.
-- ============================================================================
alter table contacts
  add constraint contacts_stage_matches_type check (
    (client_type = 'b2c' and stage in
      ('new', 'inquiry', 'quotation', 'confirmation', 'lost'))
    or
    (client_type = 'b2b' and stage in
      ('new', 'contacted', 'follow_up', 'discovery', 'contract_review', 'won', 'lost'))
  ),
  add constraint contacts_services_availed_known check (
    services_availed <@ array[
      'tour_package', 'visa_services', 'custom_tour', 'flight_accommodation', 'other'
    ]::text[]
  ),
  add constraint contacts_services_other_needs_other check (
    services_other is null or 'other' = any (services_availed)
  ),
  add constraint contacts_contract_dates_ordered check (
    contract_start is null or contract_end is null or contract_end >= contract_start
  );

-- ============================================================================
-- (4) Optional email. The unique constraint stays: Postgres allows any
-- number of nulls, and record_inquiry()'s `on conflict (email)` is
-- unaffected.
-- ============================================================================
alter table contacts
  alter column email drop not null,
  add constraint contacts_email_or_phone check (
    nullif(trim(coalesce(email, '')), '') is not null
    or nullif(trim(coalesce(phone, '')), '') is not null
  );

-- ============================================================================
-- (3) status <-> stage sync. Fires before the table's check constraints
-- are evaluated, so whichever column the caller did not set is filled in
-- first.
--   * insert, or stage / client_type changed (new code): status follows.
--   * otherwise status changed (production's old code): stage follows,
--     using the row's client type.
-- ============================================================================
create function public.contacts_sync_status_stage()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.stage is distinct from old.stage
     or new.client_type is distinct from old.client_type then
    new.status := case new.stage
      when 'new' then 'new'
      when 'lost' then 'lost'
      when 'inquiry' then 'contacted'
      when 'quotation' then 'qualified'
      when 'confirmation' then 'won'
      when 'contacted' then 'contacted'
      when 'follow_up' then 'contacted'
      when 'discovery' then 'qualified'
      when 'contract_review' then 'qualified'
      when 'won' then 'won'
      else new.status
    end;
  elsif new.status is distinct from old.status then
    new.stage := case
      when new.status in ('new', 'lost') then new.status
      when new.client_type = 'b2b' then
        case new.status
          when 'contacted' then 'contacted'
          when 'qualified' then 'discovery'
          else 'won'
        end
      else
        case new.status
          when 'contacted' then 'inquiry'
          when 'qualified' then 'quotation'
          else 'confirmation'
        end
    end;
  end if;
  return new;
end;
$$;

create trigger contacts_sync_status_stage
  before insert or update on contacts
  for each row execute function public.contacts_sync_status_stage();

-- ============================================================================
-- (5) Manual add
-- ============================================================================
create policy "can_edit_crm can insert contacts" on contacts
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_edit_crm'));

-- ============================================================================
-- (6) contact_documents. Read follows contacts' universal-read rule
-- (CRM-03); writes need can_edit_crm. No update policy: a document is
-- replaced by deleting it and uploading again. No anon policy of any kind.
-- size_bytes' ceiling mirrors MAX_DOCUMENT_BYTES in lib/crm/documents.ts.
-- ============================================================================
create table contact_documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  file_name text not null check (length(trim(file_name)) > 0),
  storage_key text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  -- set null, not restrict: deleting a staff account must never be blocked
  -- by the documents they uploaded.
  uploaded_by uuid references profiles(id) on delete set null default auth.uid(),
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

alter table contact_documents enable row level security;

create index contact_documents_contact_id_idx on contact_documents(contact_id);

create policy "authenticated staff can read contact documents" on contact_documents
  for select to authenticated using (true);

create policy "can_edit_crm can insert contact documents" on contact_documents
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_edit_crm'));

create policy "can_edit_crm can delete contact documents" on contact_documents
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'can_edit_crm'));

-- ============================================================================
-- (7) Tags in use. SECURITY INVOKER: it reads contacts as the caller, so
-- an anonymous caller (no select policy) gets nothing even if it could
-- execute it -- and execute is revoked from anon anyway.
-- ============================================================================
create function public.list_contact_tags()
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select distinct tag
  from contacts, unnest(tags) as tag
  where trim(tag) <> ''
  order by 1;
$$;

revoke execute on function public.list_contact_tags() from public, anon;
grant execute on function public.list_contact_tags() to authenticated, service_role;
```

- [ ] **Step 5: Apply it on top of the legacy rows and check the backfill**

```bash
npx supabase migration up --local
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select name, status, client_type, stage, updated_by_name, updated_at::date
from contacts where email like 'legacy-%' order by name;"
```

Expected, exactly:

```
       name       |  status   | client_type |    stage     | updated_by_name | updated_at
------------------+-----------+-------------+--------------+-----------------+------------
 Legacy Contacted | contacted | b2c         | inquiry      | Ana             | 2026-01-01
 Legacy Lost      | lost      | b2c         | lost         | Ana             | 2026-01-01
 Legacy New       | new       | b2c         | new          | Ana             | 2026-01-01
 Legacy Qualified | qualified | b2c         | quotation    | Ana             | 2026-01-01
 Legacy Won       | won       | b2c         | confirmation | Ana             | 2026-01-01
```

`status` is unchanged, `updated_by_name` is still `Ana` and `updated_at` is still `2026-01-01` (Review Focus 5). If `updated_at` shows today's date, the `disable trigger` lines are not taking effect — fix that before continuing.

Then remove the legacy rows:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "delete from contacts where email like 'legacy-%';"
```

- [ ] **Step 6: Run the live script**

Run: `npm run verify:contacts-rls`
Expected: every line `[PASS]`, ending `PASS: 25/25 checks passed`.

- [ ] **Step 7: Update `types/database.ts`**

Replace the three field lists of the `contacts` block (`Row`, `Insert`, `Update`; leave its `Relationships` as they are) with:

```ts
        Row: {
          client_type: string;
          contract_end: string | null;
          contract_start: string | null;
          created_at: string;
          created_by: string | null;
          created_by_name: string | null;
          email: string | null;
          id: string;
          name: string;
          opted_out: boolean;
          other_emails: Json;
          other_phones: Json;
          phone: string | null;
          rep_name: string | null;
          rep_position: string | null;
          services_availed: string[];
          services_other: string | null;
          stage: string;
          status: string;
          tags: string[];
          updated_at: string;
          updated_by: string | null;
          updated_by_name: string | null;
        };
        Insert: {
          client_type?: string;
          contract_end?: string | null;
          contract_start?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          opted_out?: boolean;
          other_emails?: Json;
          other_phones?: Json;
          phone?: string | null;
          rep_name?: string | null;
          rep_position?: string | null;
          services_availed?: string[];
          services_other?: string | null;
          stage?: string;
          status?: string;
          tags?: string[];
          updated_at?: string;
          updated_by?: string | null;
          updated_by_name?: string | null;
        };
        Update: {
          client_type?: string;
          contract_end?: string | null;
          contract_start?: string | null;
          created_at?: string;
          created_by?: string | null;
          created_by_name?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          opted_out?: boolean;
          other_emails?: Json;
          other_phones?: Json;
          phone?: string | null;
          rep_name?: string | null;
          rep_position?: string | null;
          services_availed?: string[];
          services_other?: string | null;
          stage?: string;
          status?: string;
          tags?: string[];
          updated_at?: string;
          updated_by?: string | null;
          updated_by_name?: string | null;
        };
```

Insert this block in `public.Tables` immediately before `contacts: {` (tables are alphabetical):

```ts
      contact_documents: {
        Row: {
          contact_id: string;
          content_type: string;
          created_at: string;
          file_name: string;
          id: string;
          size_bytes: number;
          storage_key: string;
          uploaded_by: string | null;
          uploaded_by_name: string | null;
        };
        Insert: {
          contact_id: string;
          content_type: string;
          created_at?: string;
          file_name: string;
          id?: string;
          size_bytes: number;
          storage_key: string;
          uploaded_by?: string | null;
          uploaded_by_name?: string | null;
        };
        Update: {
          contact_id?: string;
          content_type?: string;
          created_at?: string;
          file_name?: string;
          id?: string;
          size_bytes?: number;
          storage_key?: string;
          uploaded_by?: string | null;
          uploaded_by_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_documents_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
```

In `public.Functions`, add after `has_permission`:

```ts
      list_contact_tags: { Args: Record<PropertyKey, never>; Returns: string[] };
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261013120000_contacts_b2c_b2b.sql scripts/verify-contacts-rls.ts types/database.ts package.json
git commit -m "feat: contacts schema for client types, stages, B2B fields and documents"
```

---

### Task 3: Contacts without an email

`contacts.email` is now `string | null` in the types. This task makes every place that reads it cope, and is what makes `tsc` pass again.

**Files:**
- Modify: `actions/messages.ts`
- Modify: `components/admin/message-compose-dialog.tsx`
- Modify: `components/admin/quote-form.tsx`, `app/admin/(dashboard)/quotes/new/page.tsx`, `app/admin/(dashboard)/quotes/[id]/page.tsx`
- Modify: `components/admin/vouchers/voucher-form.tsx`, `app/admin/(dashboard)/vouchers/page.tsx`
- Modify: `components/admin/crm-table.tsx`, `components/admin/crm-detail.tsx`, `components/admin/contact-edit-form.tsx` (type-only; all three are replaced in Tasks 4–6)

**Interfaces:**
- Consumes: `contactLabel`, `withEmail` from `lib/crm/contact-label.ts` (Task 1).
- Produces: `QuoteContactOption = { id: string; name: string; email: string | null; phone: string | null }`; `VoucherContactOption` with the same shape; `MessageComposeDialog`'s `contacts[].email` accepts `null`.

- [ ] **Step 1: Confirm the starting failures**

Run: `npx tsc --noEmit`
Expected: errors of the form `Type 'string | null' is not assignable to type 'string'` in the files listed above, and nowhere else. If another file is listed, it reads a contact's email too: apply the same treatment there (a label → `contactLabel`; a send → guard on a missing email) and include it in this task's commit.

- [ ] **Step 2: `actions/messages.ts` — never send to a missing address**

Add the import beside the other `@/lib/crm` imports:

```ts
import { withEmail } from "@/lib/crm/contact-label";
```

In `sendIndividualEmail`, directly after the `if (contactError || !contact)` block, add:

```ts
  if (!contact.email) {
    return { ok: false, error: "This contact has no email address on file." };
  }
```

In `sendBulkEmail`, replace the contacts query and the check that follows it:

```ts
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, name, email")
    .in("id", parsedIds.data)
    .eq("opted_out", false);

  if (contactsError || !contacts || contacts.length === 0) {
    return { ok: false, error: NO_ELIGIBLE_RECIPIENTS_MESSAGE };
  }
```

with:

```ts
  // Contacts with no email are skipped, the same way sendBulkSms skips
  // contacts with no phone (the compose dialog says how many).
  const { data: contactRows, error: contactsError } = await supabase
    .from("contacts")
    .select("id, name, email")
    .in("id", parsedIds.data)
    .eq("opted_out", false)
    .not("email", "is", null);

  const contacts = withEmail(contactRows ?? []);

  if (contactsError || contacts.length === 0) {
    return { ok: false, error: NO_ELIGIBLE_RECIPIENTS_MESSAGE };
  }
```

Nothing below that point changes: `contacts` is now typed with a non-null `email`.

- [ ] **Step 3: `components/admin/message-compose-dialog.tsx` — say who is skipped**

Add the import:

```ts
import { withEmail } from "@/lib/crm/contact-label";
```

Change `ComposeContact`'s email to `email: string | null;`.

Replace

```ts
  const [activeTab, setActiveTab] = useState<ActiveTab>("email");
```

with

```ts
  // null = staff haven't picked a tab yet, so the default below applies.
  const [tabChoice, setTabChoice] = useState<ActiveTab | null>(null);
```

Replace

```ts
  const smsDisabled = mode === "individual" && !primaryContact?.phone;
  const noPhoneCount = contacts.filter((c) => !c.phone).length;
```

with

```ts
  const emailDisabled = mode === "individual" && !primaryContact?.email;
  const smsDisabled = mode === "individual" && !primaryContact?.phone;
  // A phone-only contact opens straight on SMS.
  const activeTab: ActiveTab = tabChoice ?? (emailDisabled ? "sms" : "email");
  const emailRecipientCount = withEmail(contacts).length;
  const noEmailCount = contacts.length - emailRecipientCount;
  const noPhoneCount = contacts.filter((c) => !c.phone).length;
```

In `resetForm`, replace `setActiveTab("email");` with `setTabChoice(null);`.

In the `<Tabs>` element, replace `onValueChange={(value) => setActiveTab(value as ActiveTab)}` with `onValueChange={(value) => setTabChoice(value as ActiveTab)}`.

Replace `<TabsTrigger value="email">Email</TabsTrigger>` with:

```tsx
            {emailDisabled ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <TabsTrigger value="email" disabled>
                    Email
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  This contact has no email address on file
                </TooltipContent>
              </Tooltip>
            ) : (
              <TabsTrigger value="email">Email</TabsTrigger>
            )}
```

Directly inside `<TabsContent value="email" ...>`, before the subject field, add:

```tsx
            {mode === "bulk" && noEmailCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                {noEmailCount} selected contact(s) have no email address and
                will be skipped.
              </p>
            ) : null}
```

In `handleBulkSubmitAttempt`, replace the body of the `if (activeTab === "email") { ... }` block with:

```ts
      if (emailRecipientCount === 0) {
        setQuotaBanner("None of the selected contacts have an email address.");
        return;
      }
      setIsSubmitting(true);
      try {
        const remaining = await getRemainingEmailQuota();
        if (emailRecipientCount > remaining) {
          setQuotaBanner(
            `Sending to ${emailRecipientCount} contacts would exceed today's email limit (${remaining} left). Try again tomorrow or select fewer contacts.`
          );
          return;
        }
      } finally {
        setIsSubmitting(false);
      }
```

In the confirmation `AlertDialog`, replace the title and description contents with:

```tsx
              <AlertDialogTitle>
                Send to{" "}
                {activeTab === "email" ? emailRecipientCount : contacts.length}{" "}
                contacts?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {activeTab === "email"
                  ? `This will send ${emailRecipientCount} separate emails. This can't be undone.`
                  : `This will send ${contacts.length} text messages via SMS, charged per message. This can't be undone.`}
              </AlertDialogDescription>
```

- [ ] **Step 4: Quote and voucher contact pickers — label with the phone when there is no email**

`components/admin/quote-form.tsx`:
- Add `import { contactLabel } from "@/lib/crm/contact-label";`
- Replace the type with `export type QuoteContactOption = { id: string; name: string; email: string | null; phone: string | null };`
- Replace the `itemToStringLabel` prop with `itemToStringLabel={(contact: QuoteContactOption) => contactLabel(contact)}`
- Replace `{contact.name} ({contact.email})` inside `ComboboxItem` with `{contactLabel(contact)}`

`app/admin/(dashboard)/quotes/new/page.tsx` and `app/admin/(dashboard)/quotes/[id]/page.tsx`: in each, change `.select("id, name, email")` on `contacts` to `.select("id, name, email, phone")`.

`components/admin/vouchers/voucher-form.tsx`:
- Add `import { contactLabel } from "@/lib/crm/contact-label";`
- Replace the type with `export type VoucherContactOption = { id: string; name: string; email: string | null; phone: string | null };`
- Replace both occurrences of the `name (email)` label — the template string `` `${contact.name} (${contact.email})` `` and the JSX `{contact.name} ({contact.email})` — with `contactLabel(contact)` and `{contactLabel(contact)}`.

`app/admin/(dashboard)/vouchers/page.tsx`:
- Add `import { contactLabel } from "@/lib/crm/contact-label";`
- Change `contacts: { name: string; email: string } | null;` to `contacts: { name: string; email: string | null; phone: string | null } | null;`
- Change `"*, voucher_partners(name), contacts(name, email)"` to `"*, voucher_partners(name), contacts(name, email, phone)"`
- Change the contacts list query's `.select("id, name, email")` to `.select("id, name, email, phone")`
- Replace

  ```ts
      contactLabel: row.contacts
        ? `${row.contacts.name} (${row.contacts.email})`
        : null,
  ```

  with

  ```ts
      contactLabel: row.contacts ? contactLabel(row.contacts) : null,
  ```

- [ ] **Step 5: The three CRM components — types only**

These are rewritten in Tasks 4–6; this just keeps the build green in between.

- `components/admin/crm-table.tsx`: in `AdminContactListItem` change `email: string;` to `email: string | null;`. Change the email column's `cell: ({ row }) => row.original.email,` to `cell: ({ row }) => row.original.email ?? "—",`. In the mobile card, change `{row.original.email}` to `{row.original.email ?? row.original.phone ?? "—"}`.
- `components/admin/crm-detail.tsx`: in `CrmDetailContact` change `email: string;` to `email: string | null;`. Change `{contact.email}` in the Contact Info card to `{contact.email ?? "—"}`.
- `components/admin/contact-edit-form.tsx`: in the `contact` prop type change `email: string;` to `email: string | null;`, and change `value={contact.email}` to `value={contact.email ?? ""}`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run verify:contact-helpers`
Expected: no type errors, no lint errors, all checks PASS.

- [ ] **Step 7: Commit**

```bash
git add actions/messages.ts components/admin/message-compose-dialog.tsx components/admin/quote-form.tsx "app/admin/(dashboard)/quotes/new/page.tsx" "app/admin/(dashboard)/quotes/[id]/page.tsx" components/admin/vouchers/voucher-form.tsx "app/admin/(dashboard)/vouchers/page.tsx" components/admin/crm-table.tsx components/admin/crm-detail.tsx components/admin/contact-edit-form.tsx
git commit -m "feat: handle contacts that have a phone number but no email"
```

---

### Task 4: Contact actions, tag picker and the type-aware edit form

**Files:**
- Modify: `actions/crm.ts`
- Create: `components/admin/contact-tag-picker.tsx`
- Create: `components/admin/contact-form-fields.tsx`
- Modify: `components/admin/contact-edit-form.tsx` (replaced)
- Delete: `components/admin/contact-edit-form-schema.ts`
- Modify: `components/admin/crm-detail.tsx`, `app/admin/(dashboard)/crm/[id]/page.tsx` (pass the new props)

**Interfaces:**
- Consumes: `contactFormSchema`, `ContactFormValues`, `contactValuesToRow`, `contactRowToFormValues`, `convertSchema` (Task 1); `list_contact_tags` RPC and the insert policy (Task 2).
- Produces:
  - `type ContactActionResult = { ok: true; id: string } | { ok: false; error: string; existingContactId?: string }`
  - `createContact(clientType: ClientType, values: ContactFormValues): Promise<ContactActionResult>`
  - `updateContact(id: string, values: ContactFormValues): Promise<ContactActionResult>`
  - `updateStage(id: string, stage: ContactStage): Promise<ActionResult>`
  - `convertContactType(id: string, clientType: ClientType, stage: ContactStage): Promise<ActionResult>`
  - `ContactTagPicker({ id?, value, onChange, existingTags })`
  - `ContactCoreFields({ nameLabel, existingTags, duplicateContactId })`, `ContactRepFields()`, `ContactServicesFields()`, `ContactB2bDetailFields()` — all read the form from `useFormContext<ContactFormValues>()`
  - `ContactEditForm({ contactId, clientType, defaultValues, existingTags, onSuccess })`

`updateStatus` stays in `actions/crm.ts` for now: the contact page still calls it until Task 6 replaces that page and removes it.

- [ ] **Step 1: Replace `actions/crm.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  contactFormSchema,
  contactValuesToRow,
  convertSchema,
  type ContactFormValues,
} from "@/lib/crm/contact-schema";
import {
  isClientType,
  isStageForType,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";
import type { ContactStatus } from "@/lib/crm/status";

const STATUS_ERROR_MESSAGE =
  "Something went wrong updating the status. Please try again.";
const STAGE_ERROR_MESSAGE =
  "Something went wrong updating the stage. Please try again.";
const STAGE_MISMATCH_MESSAGE =
  "That stage doesn't belong to this contact's pipeline anymore. Refresh the page and try again.";
const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
const INVALID_MESSAGE =
  "Some fields are invalid. Please review the form and try again.";
const DUPLICATE_EMAIL_MESSAGE = "A contact with this email already exists.";
const GONE_MESSAGE = "That contact no longer exists.";

// Postgres error codes.
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

export type ContactActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; existingContactId?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadExistingTags(supabase: Supabase): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_contact_tags");
  if (error) console.error("list_contact_tags failed:", error.message);
  return data ?? [];
}

/** The duplicate-email result, with the other contact's id so the form can link to it. */
async function duplicateEmailResult(
  supabase: Supabase,
  email: string | null,
  ownId?: string
): Promise<ContactActionResult> {
  let existingContactId: string | undefined;
  if (email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (data && data.id !== ownId) existingContactId = data.id;
  }
  return { ok: false, error: DUPLICATE_EMAIL_MESSAGE, existingContactId };
}

/**
 * Adds a contact by hand. Until this action existed, record_inquiry() was
 * the only way a contact was created; the stage starts at New for either
 * client type (the column default).
 */
export async function createContact(
  clientType: ClientType,
  values: ContactFormValues
): Promise<ContactActionResult> {
  const profile = await requirePermission("can_edit_crm");

  const parsed = contactFormSchema.safeParse(values);
  if (!isClientType(clientType) || !parsed.success) {
    return { ok: false, error: INVALID_MESSAGE };
  }

  const supabase = await createClient();
  const row = contactValuesToRow(parsed.data, await loadExistingTags(supabase));

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      ...row,
      client_type: clientType,
      created_by: profile.id,
      created_by_name: profile.name,
    })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    return duplicateEmailResult(supabase, row.email);
  }
  if (error || !data) {
    console.error("createContact failed:", error?.message);
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }

  revalidatePath("/admin/crm");
  return { ok: true, id: data.id };
}

/**
 * Saves the contact form. The client type and stage are not part of the
 * form: updateStage() and convertContactType() own those.
 */
export async function updateContact(
  id: string,
  values: ContactFormValues
): Promise<ContactActionResult> {
  await requirePermission("can_edit_crm");

  const parsed = contactFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const row = contactValuesToRow(parsed.data, await loadExistingTags(supabase));

  const { data, error } = await supabase
    .from("contacts")
    .update(row)
    .eq("id", id)
    .select("id");

  if (error?.code === UNIQUE_VIOLATION) {
    return duplicateEmailResult(supabase, row.email, id);
  }
  if (error) {
    console.error("updateContact failed:", error.message);
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) return { ok: false, error: GONE_MESSAGE };

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true, id };
}

/**
 * Moves a contact along its pipeline. Whether the stage belongs to the
 * contact's client type is decided by the database
 * (contacts_stage_matches_type), so a stale tab that still shows the
 * pipeline of a contact someone just converted gets a clear message.
 */
export async function updateStage(
  id: string,
  stage: ContactStage
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  if (!isStageForType("b2c", stage) && !isStageForType("b2b", stage)) {
    return { ok: false, error: STAGE_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ stage })
    .eq("id", id)
    .select("id");

  if (error?.code === CHECK_VIOLATION) {
    return { ok: false, error: STAGE_MISMATCH_MESSAGE };
  }
  if (error) {
    console.error("updateStage failed:", error.message);
    return { ok: false, error: STAGE_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) return { ok: false, error: GONE_MESSAGE };

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}

/**
 * Switches a contact between B2C and B2B. Only the type and stage change:
 * the other type's fields stay on the row, hidden, so converting back
 * loses nothing.
 */
export async function convertContactType(
  id: string,
  clientType: ClientType,
  stage: ContactStage
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const parsed = convertSchema.safeParse({ clientType, stage });
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ client_type: parsed.data.clientType, stage: parsed.data.stage })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("convertContactType failed:", error.message);
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) return { ok: false, error: GONE_MESSAGE };

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}

/** Removed in Task 6 of the contacts B2C/B2B plan, with lib/crm/status.ts. */
export async function updateStatus(
  id: string,
  status: ContactStatus
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { ok: false, error: STATUS_ERROR_MESSAGE };
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}
```

- [ ] **Step 2: Create `components/admin/contact-tag-picker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from "@/lib/crm/tags";

/**
 * Tags for one contact. Typing filters the tags already in use so staff
 * reuse them; a tag that doesn't exist yet is created with Enter, a comma,
 * or the "Create" suggestion.
 */
export function ContactTagPicker({
  id,
  value,
  onChange,
  existingTags,
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  existingTags: string[];
}) {
  const [draft, setDraft] = useState("");

  const atLimit = value.length >= MAX_TAGS;
  const query = draft.trim().toLowerCase();
  const selected = new Set(value.map((tag) => tag.toLowerCase()));
  const suggestions = existingTags
    .filter(
      (tag) =>
        !selected.has(tag.toLowerCase()) && tag.toLowerCase().includes(query)
    )
    .slice(0, 12);
  const isNew =
    query !== "" &&
    !selected.has(query) &&
    !existingTags.some((tag) => tag.toLowerCase() === query);

  function add(tag: string) {
    if (atLimit) return;
    onChange(normalizeTags([...value, tag], existingTags));
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter must never submit the surrounding form from this field.
      event.preventDefault();
      if (draft.trim()) add(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => remove(tag)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_TAG_LENGTH}
        disabled={atLimit}
        placeholder={
          atLimit
            ? `Up to ${MAX_TAGS} tags`
            : "Type to find a tag or create one"
        }
        autoComplete="off"
      />

      {!atLimit && (suggestions.length > 0 || isNew) ? (
        <div className="flex flex-wrap gap-1">
          {isNew ? (
            <button type="button" onClick={() => add(draft)}>
              <Badge variant="secondary">Create “{draft.trim()}”</Badge>
            </button>
          ) : null}
          {suggestions.map((tag) => (
            <button key={tag} type="button" onClick={() => add(tag)}>
              <Badge variant="outline" className="hover:bg-muted">
                + {tag}
              </Badge>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/admin/contact-form-fields.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { ContactTagPicker } from "./contact-tag-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { ContactFormValues } from "@/lib/crm/contact-schema";
import { SERVICE_KEYS, SERVICE_LABELS } from "@/lib/crm/services";

/**
 * Field groups shared by ContactEditForm and ContactAddDialog. Each reads
 * the form from context, so it must render inside a <Form> built on
 * ContactFormValues.
 */

/** Name, email, phone and tags -- the fields every contact has. */
export function ContactCoreFields({
  nameLabel,
  existingTags,
  duplicateContactId,
}: {
  nameLabel: string;
  existingTags: string[];
  /** Set when the server reported another contact already uses this email. */
  duplicateContactId: string | null;
}) {
  const form = useFormContext<ContactFormValues>();

  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{nameLabel}</FormLabel>
            <FormControl>
              <Input {...field} type="text" autoComplete="off" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" autoComplete="off" />
              </FormControl>
              <FormMessage />
              {duplicateContactId ? (
                <Link
                  href={`/admin/crm/${duplicateContactId}`}
                  className="text-sm text-primary underline underline-offset-4"
                >
                  Open the existing contact
                </Link>
              ) : null}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input {...field} type="tel" autoComplete="off" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="tags"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tags</FormLabel>
            <ContactTagPicker
              value={field.value}
              onChange={field.onChange}
              existingTags={existingTags}
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

/** B2C: what the customer availed, with a free-text box when Other is ticked. */
export function ContactServicesFields() {
  const form = useFormContext<ContactFormValues>();
  const services = useWatch({ control: form.control, name: "servicesAvailed" });

  return (
    <>
      <FormField
        control={form.control}
        name="servicesAvailed"
        render={({ field }) => (
          <FormItem>
            <p className="text-sm font-medium">Services availed</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SERVICE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value.includes(key)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...field.value, key]
                        : field.value.filter((k) => k !== key);
                      // Keep the stored order the same as the list's.
                      field.onChange(SERVICE_KEYS.filter((k) => next.includes(k)));
                    }}
                  />
                  {SERVICE_LABELS[key]}
                </label>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {services.includes("other") ? (
        <FormField
          control={form.control}
          name="servicesOther"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Other services</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={500}
                  placeholder="Describe what else this customer availed"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </>
  );
}

/** B2B: the authorized representative. */
export function ContactRepFields() {
  const form = useFormContext<ContactFormValues>();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="repName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Authorized representative</FormLabel>
            <FormControl>
              <Input {...field} type="text" autoComplete="off" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="repPosition"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Position</FormLabel>
            <FormControl>
              <Input {...field} type="text" autoComplete="off" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function LabeledListField({
  name,
  title,
  addLabel,
  inputType,
}: {
  name: "otherEmails" | "otherPhones";
  title: string;
  addLabel: string;
  inputType: "email" | "tel";
}) {
  const form = useFormContext<ContactFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name,
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      {fields.map((item, index) => (
        <div key={item.id} className="flex items-start gap-2">
          <FormField
            control={form.control}
            name={`${name}.${index}.label`}
            render={({ field }) => (
              <FormItem className="w-32 shrink-0">
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    aria-label="Label"
                    placeholder="Label"
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`${name}.${index}.value`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    type={inputType}
                    aria-label={title}
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove"
            onClick={() => remove(index)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      {fields.length < 10 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => append({ label: "", value: "" })}
        >
          <PlusIcon />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** B2B: extra emails and numbers, and the contract dates. */
export function ContactB2bDetailFields() {
  const form = useFormContext<ContactFormValues>();

  return (
    <>
      <LabeledListField
        name="otherEmails"
        title="Other emails"
        addLabel="Add email"
        inputType="email"
      />
      <LabeledListField
        name="otherPhones"
        title="Other numbers"
        addLabel="Add number"
        inputType="tel"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="contractStart"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contract start</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="contractEnd"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contract end</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormDescription>
                Turns yellow 3 months before and red 1 month before.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Replace `components/admin/contact-edit-form.tsx` and delete the old schema**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateContact } from "@/actions/crm";
import {
  ContactB2bDetailFields,
  ContactCoreFields,
  ContactRepFields,
  ContactServicesFields,
} from "./contact-form-fields";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  contactFormSchema,
  type ContactFormValues,
} from "@/lib/crm/contact-schema";
import type { ClientType } from "@/lib/crm/stage";

const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

/**
 * Edits one contact. Shows the fields for the contact's client type; the
 * other type's values stay in `defaultValues` and are saved back unchanged.
 */
export function ContactEditForm({
  contactId,
  clientType,
  defaultValues,
  existingTags,
  onSuccess,
}: {
  contactId: string;
  clientType: ClientType;
  defaultValues: ContactFormValues;
  existingTags: string[];
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateContactId, setDuplicateContactId] = useState<string | null>(
    null
  );

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues,
  });

  async function onSubmit(values: ContactFormValues) {
    setIsSubmitting(true);
    setDuplicateContactId(null);
    try {
      const result = await updateContact(contactId, values);
      if (result.ok) {
        toast.success("Contact updated.");
        onSuccess();
      } else if (result.existingContactId) {
        form.setError("email", { message: result.error });
        setDuplicateContactId(result.existingContactId);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(CONTACT_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <ContactCoreFields
          nameLabel={clientType === "b2b" ? "Company name" : "Name"}
          existingTags={existingTags}
          duplicateContactId={duplicateContactId}
        />

        {clientType === "b2c" ? (
          <ContactServicesFields />
        ) : (
          <>
            <ContactRepFields />
            <ContactB2bDetailFields />
          </>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-end"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
}
```

```bash
git rm components/admin/contact-edit-form-schema.ts
```

- [ ] **Step 5: Pass the new props through the contact page**

These are interim edits; Task 6 replaces both files.

In `app/admin/(dashboard)/crm/[id]/page.tsx`:

Add imports:

```ts
import { contactRowToFormValues } from "@/lib/crm/contact-schema";
import { toClientType } from "@/lib/crm/stage";
```

After `const contact = data as unknown as ContactDetail;` add:

```ts
  const { data: existingTags, error: tagsError } =
    await supabase.rpc("list_contact_tags");
  if (tagsError) console.error("Failed to load tags:", tagsError.message);
```

and pass three more props to `<CrmDetail>`:

```tsx
      clientType={toClientType(contact.client_type)}
      formValues={contactRowToFormValues(contact)}
      existingTags={existingTags ?? []}
```

In `components/admin/crm-detail.tsx`:

Add imports:

```ts
import type { ContactFormValues } from "@/lib/crm/contact-schema";
import type { ClientType } from "@/lib/crm/stage";
```

Add to the component's props (both the destructuring and the type):

```ts
  clientType: ClientType;
  formValues: ContactFormValues;
  existingTags: string[];
```

Replace `<DialogContent className="sm:max-w-md">` (the edit dialog's) with `<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">`, and replace the `<ContactEditForm ... />` element with:

```tsx
                <ContactEditForm
                  contactId={contact.id}
                  clientType={clientType}
                  defaultValues={formValues}
                  existingTags={existingTags}
                  onSuccess={() => {
                    setIsEditOpen(false);
                    router.refresh();
                  }}
                />
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three succeed.

- [ ] **Step 7: Commit**

```bash
git add actions/crm.ts components/admin/contact-tag-picker.tsx components/admin/contact-form-fields.tsx components/admin/contact-edit-form.tsx components/admin/crm-detail.tsx "app/admin/(dashboard)/crm/[id]/page.tsx"
git commit -m "feat: contact actions, tag picker and a type-aware edit form"
```

---

### Task 5: Revamped main Contacts page

**Files:**
- Create: `components/admin/contact-stage-chip.tsx`
- Create: `components/admin/contract-end-chip.tsx`
- Create: `components/admin/contact-add-dialog.tsx`
- Create: `components/admin/crm-contacts-view.tsx`
- Modify: `components/admin/crm-table.tsx` (replaced)
- Modify: `app/admin/(dashboard)/crm/page.tsx` (replaced)

**Interfaces:**
- Consumes: `createContact` and the form field groups (Task 4); everything in `lib/crm/` (Task 1).
- Produces:
  - `ContactStageChip({ stage, className? })`
  - `ContractEndChip({ end })`
  - `ContactAddDialog({ open, onOpenChange, defaultType, existingTags })`
  - `type AdminContactListItem` (below), exported from `crm-table.tsx`
  - `CrmTable({ type, contacts, rowSelection, onRowSelectionChange })`
  - `CrmContactsView({ contacts, initialType, canEdit })`

- [ ] **Step 1: Read the two Next guides this task relies on**

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` — confirm `searchParams` is a `Promise` that the page awaits (as `app/unsubscribe/page.tsx` already does).
- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`, the "Native History API" section — confirm `window.history.replaceState` is supported for updating the URL without a server round trip. The tab switch below uses it. If the installed docs say otherwise, use `router.replace(\`/admin/crm?type=${next}\`, { scroll: false })` from `next/navigation` instead.

- [ ] **Step 2: Create `components/admin/contact-stage-chip.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import {
  STAGE_CHIP_CLASSNAME,
  STAGE_LABELS,
  type ContactStage,
} from "@/lib/crm/stage";
import { cn } from "@/lib/utils";

/** A contact's stage as a coloured chip. */
export function ContactStageChip({
  stage,
  className,
}: {
  stage: ContactStage;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(STAGE_CHIP_CLASSNAME[stage], className)}
    >
      {STAGE_LABELS[stage]}
    </Badge>
  );
}
```

- [ ] **Step 3: Create `components/admin/contract-end-chip.tsx`**

```tsx
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import {
  CONTRACT_END_CLASSNAME,
  contractEndTone,
  todayInManila,
} from "@/lib/crm/contract";

/**
 * A contract end date, yellow from 3 months before, red from 1 month
 * before, and red with "Expired" once it has passed.
 */
export function ContractEndChip({ end }: { end: string | null }) {
  if (!end) return <span className="text-muted-foreground">—</span>;

  const tone = contractEndTone(end, todayInManila());

  return (
    <Badge variant="outline" className={CONTRACT_END_CLASSNAME[tone]}>
      {format(parseISO(end), "MMM d, yyyy")}
      {tone === "expired" ? " · Expired" : null}
    </Badge>
  );
}
```

- [ ] **Step 4: Create `components/admin/contact-add-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createContact } from "@/actions/crm";
import { ContactCoreFields, ContactRepFields } from "./contact-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import {
  EMPTY_CONTACT_VALUES,
  contactFormSchema,
  type ContactFormValues,
} from "@/lib/crm/contact-schema";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  type ClientType,
} from "@/lib/crm/stage";

const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const TYPE_DESCRIPTIONS: Record<ClientType, string> = {
  b2c: "An individual traveller",
  b2b: "A company or partner",
};

function AddContactForm({
  defaultType,
  existingTags,
}: {
  defaultType: ClientType;
  existingTags: string[];
}) {
  const router = useRouter();
  const [clientType, setClientType] = useState<ClientType>(defaultType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateContactId, setDuplicateContactId] = useState<string | null>(
    null
  );

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: EMPTY_CONTACT_VALUES,
  });

  async function onSubmit(values: ContactFormValues) {
    setIsSubmitting(true);
    setDuplicateContactId(null);
    try {
      const result = await createContact(clientType, values);
      if (result.ok) {
        toast.success("Contact added.");
        // The rest of the fields are filled in on the contact's own page.
        router.push(`/admin/crm/${result.id}`);
      } else if (result.existingContactId) {
        form.setError("email", { message: result.error });
        setDuplicateContactId(result.existingContactId);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(CONTACT_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Client type">
          {CLIENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={clientType === type}
              onClick={() => setClientType(type)}
              className={
                clientType === type
                  ? "rounded-lg border border-primary bg-primary/5 p-3 text-left"
                  : "rounded-lg border border-border p-3 text-left hover:bg-muted/50"
              }
            >
              <span className="block text-sm font-semibold">
                {CLIENT_TYPE_LABELS[type]}
              </span>
              <span className="block text-sm text-muted-foreground">
                {TYPE_DESCRIPTIONS[type]}
              </span>
            </button>
          ))}
        </div>

        <ContactCoreFields
          nameLabel={clientType === "b2b" ? "Company name" : "Name"}
          existingTags={existingTags}
          duplicateContactId={duplicateContactId}
        />

        {clientType === "b2b" ? <ContactRepFields /> : null}

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="self-end"
        >
          {isSubmitting ? "Adding..." : "Add Contact"}
        </Button>
      </form>
    </Form>
  );
}

/**
 * Adds a B2C or B2B contact by hand. The form is a child component so it
 * mounts fresh (empty fields, the current tab's type) every time the
 * dialog opens.
 */
export function ContactAddDialog({
  open,
  onOpenChange,
  defaultType,
  existingTags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: ClientType;
  existingTags: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            An email or a phone number is required.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AddContactForm defaultType={defaultType} existingTags={existingTags} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Replace `components/admin/crm-table.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

import { ContactStageChip } from "./contact-stage-chip";
import { ContractEndChip } from "./contract-end-chip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SERVICE_LABELS, type ServiceKey } from "@/lib/crm/services";
import type { ClientType, ContactStage } from "@/lib/crm/stage";

export type AdminContactListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  clientType: ClientType;
  stage: ContactStage;
  tags: string[];
  opted_out: boolean;
  servicesAvailed: ServiceKey[];
  servicesOther: string | null;
  repName: string | null;
  contractEnd: string | null;
  createdAt: string;
};

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<AdminContactListItem, unknown>;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 [&>svg]:hover:text-foreground"
      onClick={() => column.toggleSorting()}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />
      )}
    </button>
  );
}

function TagList({ contact }: { contact: AdminContactListItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      {contact.tags.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
      {contact.opted_out ? <Badge variant="outline">Opted out</Badge> : null}
    </div>
  );
}

function ServiceList({ contact }: { contact: AdminContactListItem }) {
  if (contact.servicesAvailed.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {contact.servicesAvailed.map((key) => (
        <Badge
          key={key}
          variant="secondary"
          title={
            key === "other" ? (contact.servicesOther ?? undefined) : undefined
          }
        >
          {SERVICE_LABELS[key]}
        </Badge>
      ))}
    </div>
  );
}

const selectColumn: ColumnDef<AdminContactListItem> = {
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={
        !table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()
      }
      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(!!checked)}
      aria-label="Select all"
    />
  ),
  cell: ({ row }) => (
    <div onClick={(e) => e.stopPropagation()} className="inline-flex">
      {row.original.opted_out ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Checkbox checked={false} disabled aria-label="Opted out" />
          </TooltipTrigger>
          <TooltipContent>Opted out — excluded from bulk sends</TooltipContent>
        </Tooltip>
      ) : (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          aria-label="Select row"
        />
      )}
    </div>
  ),
};

const stageColumn: ColumnDef<AdminContactListItem> = {
  accessorKey: "stage",
  header: "Stage",
  cell: ({ row }) => <ContactStageChip stage={row.original.stage} />,
};

const tagsColumn: ColumnDef<AdminContactListItem> = {
  id: "tags",
  header: "Tags",
  cell: ({ row }) => <TagList contact={row.original} />,
};

const createdColumn: ColumnDef<AdminContactListItem> = {
  accessorKey: "createdAt",
  header: ({ column }) => <SortableHeader label="Created" column={column} />,
  cell: ({ row }) => (
    <span title={new Date(row.original.createdAt).toLocaleString()}>
      {formatDistanceToNow(new Date(row.original.createdAt), {
        addSuffix: true,
      })}
    </span>
  ),
};

const COLUMNS: Record<ClientType, ColumnDef<AdminContactListItem>[]> = {
  b2c: [
    selectColumn,
    {
      accessorKey: "name",
      header: ({ column }) => <SortableHeader label="Name" column={column} />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "contact",
      header: "Email / phone",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.email ?? row.original.phone ?? "—"}</span>
          {row.original.email && row.original.phone ? (
            <span className="text-muted-foreground">{row.original.phone}</span>
          ) : null}
        </div>
      ),
    },
    stageColumn,
    {
      id: "services",
      header: "Services",
      cell: ({ row }) => <ServiceList contact={row.original} />,
    },
    tagsColumn,
    createdColumn,
  ],
  b2b: [
    selectColumn,
    {
      accessorKey: "name",
      header: ({ column }) => <SortableHeader label="Company" column={column} />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "repName",
      header: "Representative",
      cell: ({ row }) => row.original.repName ?? "—",
    },
    stageColumn,
    {
      id: "contractEnd",
      // undefined (not null) so `sortUndefined` applies: contacts with no
      // contract end sort last, whichever way the column is sorted.
      accessorFn: (contact) => contact.contractEnd ?? undefined,
      sortUndefined: "last",
      header: ({ column }) => (
        <SortableHeader label="Contract end" column={column} />
      ),
      cell: ({ row }) => <ContractEndChip end={row.original.contractEnd} />,
    },
    tagsColumn,
    createdColumn,
  ],
};

/**
 * The contacts table (desktop) and cards (mobile) for one client type.
 * Filtering and the selection state live in CrmContactsView; this owns
 * only sorting and layout.
 */
export function CrmTable({
  type,
  contacts,
  rowSelection,
  onRowSelectionChange,
}: {
  type: ClientType;
  contacts: AdminContactListItem[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(() => COLUMNS[type], [type]);

  const table = useReactTable({
    data: contacts,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange,
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    enableRowSelection: (row) => !row.original.opted_out,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/admin/crm/${row.original.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const contact = row.original;
          const selectCell = row
            .getVisibleCells()
            .find((cell) => cell.column.id === "select")!;
          return (
            <Card
              key={row.id}
              className="cursor-pointer p-4 transition-colors hover:bg-muted/50 active:bg-muted"
              onClick={() => router.push(`/admin/crm/${contact.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                {flexRender(
                  selectCell.column.columnDef.cell,
                  selectCell.getContext()
                )}
                <div className="flex-1">
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {type === "b2b"
                      ? (contact.repName ?? contact.email ?? contact.phone ?? "—")
                      : (contact.email ?? contact.phone ?? "—")}
                  </p>
                </div>
                <ContactStageChip stage={contact.stage} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {type === "b2b" && contact.contractEnd ? (
                  <ContractEndChip end={contact.contractEnd} />
                ) : null}
                <TagList contact={contact} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Create `components/admin/crm-contacts-view.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SearchIcon } from "lucide-react";
import type { RowSelectionState } from "@tanstack/react-table";

import { ContactAddDialog } from "./contact-add-dialog";
import { CrmTable, type AdminContactListItem } from "./crm-table";
import { MessageComposeDialog } from "./message-compose-dialog";
import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  STAGES_BY_TYPE,
  STAGE_CHIP_CLASSNAME,
  STAGE_LABELS,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";
import { cn } from "@/lib/utils";

const TAG_FILTER_ALL = "__all__";

const EMPTY_COPY: Record<ClientType, { title: string; body: string }> = {
  b2c: {
    title: "No B2C contacts yet",
    body: "Contacts appear here as soon as someone submits an inquiry on the public site, or when you add one.",
  },
  b2b: {
    title: "No B2B clients yet",
    body: "Add a company you work with, or convert an existing contact to B2B from its page.",
  },
};

function matchesSearch(contact: AdminContactListItem, query: string): boolean {
  if (!query) return true;
  return [
    contact.name,
    contact.email,
    contact.phone,
    contact.repName,
    ...contact.tags,
  ].some((value) => value?.toLowerCase().includes(query));
}

/**
 * The main Contacts page: B2C / B2B tabs, a row of stage chips that both
 * shows how many contacts sit in each stage and filters the table, search,
 * a tag filter, and bulk messaging.
 */
export function CrmContactsView({
  contacts,
  initialType,
  canEdit,
}: {
  contacts: AdminContactListItem[];
  initialType: ClientType;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<ClientType>(initialType);
  const [stageFilter, setStageFilter] = useState<ContactStage | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState(TAG_FILTER_ALL);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const byType = useMemo(
    () => ({
      b2c: contacts.filter((contact) => contact.clientType === "b2c"),
      b2b: contacts.filter((contact) => contact.clientType === "b2b"),
    }),
    [contacts]
  );
  const tabContacts = byType[type];

  // Every tag in use, across both types, for the Add dialog's suggestions.
  const allTags = useMemo(
    () =>
      [...new Set(contacts.flatMap((contact) => contact.tags))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [contacts]
  );
  const tabTags = useMemo(
    () =>
      [...new Set(tabContacts.flatMap((contact) => contact.tags))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [tabContacts]
  );

  // Counts ignore the search box and tag filter: they describe the pipeline.
  const stageCounts = useMemo(() => {
    const counts = new Map<ContactStage, number>();
    for (const contact of tabContacts) {
      counts.set(contact.stage, (counts.get(contact.stage) ?? 0) + 1);
    }
    return counts;
  }, [tabContacts]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      tabContacts.filter(
        (contact) =>
          (stageFilter === null || contact.stage === stageFilter) &&
          (tagFilter === TAG_FILTER_ALL || contact.tags.includes(tagFilter)) &&
          matchesSearch(contact, query)
      ),
    [tabContacts, stageFilter, tagFilter, query]
  );

  const selected = tabContacts.filter((contact) => rowSelection[contact.id]);
  const isFiltered =
    stageFilter !== null || tagFilter !== TAG_FILTER_ALL || query !== "";

  function handleTypeChange(next: ClientType) {
    setType(next);
    setStageFilter(null);
    setTagFilter(TAG_FILTER_ALL);
    setRowSelection({});
    // Keeps the tab across a refresh or a shared link without a server
    // round trip (Next's router picks up native history updates).
    window.history.replaceState(null, "", `?type=${next}`);
  }

  function handleClearFilters() {
    setStageFilter(null);
    setTagFilter(TAG_FILTER_ALL);
    setSearch("");
  }

  const tagFilterItems = {
    [TAG_FILTER_ALL]: "All tags",
    ...Object.fromEntries(tabTags.map((tag) => [tag, tag])),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Contacts
        </h1>
        {canEdit ? (
          <Button onClick={() => setIsAddOpen(true)}>
            <PlusIcon className="size-4" />
            Add Contact
          </Button>
        ) : null}
      </div>

      <Tabs
        value={type}
        onValueChange={(value) => handleTypeChange(value as ClientType)}
        className="gap-4"
      >
        <TabsList>
          {CLIENT_TYPES.map((clientType) => (
            <TabsTrigger key={clientType} value={clientType} className="px-3">
              {CLIENT_TYPE_LABELS[clientType]}
              <span className="text-muted-foreground">
                {byType[clientType].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={type} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" aria-label="Filter by stage">
            <button
              type="button"
              aria-pressed={stageFilter === null}
              onClick={() => setStageFilter(null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium transition",
                stageFilter === null
                  ? "bg-foreground text-background"
                  : "bg-background hover:bg-muted"
              )}
            >
              All
              <span>{tabContacts.length}</span>
            </button>
            {STAGES_BY_TYPE[type].map((stage) => (
              <button
                key={stage}
                type="button"
                aria-pressed={stageFilter === stage}
                onClick={() =>
                  setStageFilter(stageFilter === stage ? null : stage)
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                  STAGE_CHIP_CLASSNAME[stage],
                  stageFilter === stage
                    ? "ring-2 ring-foreground/40 ring-offset-1"
                    : stageFilter === null
                      ? "hover:brightness-95"
                      : "opacity-50 hover:opacity-100"
                )}
              >
                {STAGE_LABELS[stage]}
                <span>{stageCounts.get(stage) ?? 0}</span>
              </button>
            ))}
          </div>

          <DataTableToolbar>
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  type === "b2b"
                    ? "Search by company, representative, email, phone or tag..."
                    : "Search by name, email, phone or tag..."
                }
                className="pl-8"
              />
            </div>
            <Select
              items={tagFilterItems}
              value={tagFilter}
              onValueChange={(value) => setTagFilter(value as string)}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TAG_FILTER_ALL}>All tags</SelectItem>
                {tabTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableToolbar>

          {selected.length > 0 ? (
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <span className="text-sm font-medium">
                {selected.length} selected
              </span>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => setRowSelection({})}>
                Clear
              </Button>
              <Button onClick={() => setIsComposeOpen(true)}>
                Message Selected
              </Button>
            </div>
          ) : null}

          {tabContacts.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
              <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
                {EMPTY_COPY[type].title}
              </h2>
              <p className="text-base leading-[1.5] text-muted-foreground">
                {EMPTY_COPY[type].body}
              </p>
              {canEdit ? (
                <Button variant="secondary" onClick={() => setIsAddOpen(true)}>
                  Add Contact
                </Button>
              ) : null}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
              <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
                No contacts match your filters
              </h2>
              <p className="text-base leading-[1.5] text-muted-foreground">
                Try a different stage, tag or search.
              </p>
              {isFiltered ? (
                <Button variant="secondary" onClick={handleClearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <CrmTable
              type={type}
              contacts={visible}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            />
          )}
        </TabsContent>
      </Tabs>

      <MessageComposeDialog
        contacts={selected}
        mode="bulk"
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        onSuccess={() => {
          setRowSelection({});
          setIsComposeOpen(false);
          router.refresh();
        }}
      />

      <ContactAddDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        defaultType={type}
        existingTags={allTags}
      />
    </div>
  );
}
```

- [ ] **Step 7: Replace `app/admin/(dashboard)/crm/page.tsx`**

```tsx
import type { Metadata } from "next";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CrmContactsView } from "@/components/admin/crm-contacts-view";
import type { AdminContactListItem } from "@/components/admin/crm-table";
import { toServiceKeys } from "@/lib/crm/services";
import { isClientType, toClientType, toContactStage } from "@/lib/crm/stage";

export const metadata: Metadata = {
  title: "Contacts | TravelSentro Admin",
};

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  // CRM-03: read access is universal for every authenticated Staff/Admin,
  // regardless of can_edit_crm -- session validation only, no permission
  // gate. can_edit_crm only decides whether "Add Contact" shows.
  const profile = await getProfile();
  const { type } = await searchParams;

  const supabase = await createClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select(
      "id, name, email, phone, client_type, stage, tags, opted_out, services_availed, services_other, rep_name, contract_end, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load contacts:", error.message);
  }

  const items: AdminContactListItem[] = (contacts ?? []).map((contact) => {
    const clientType = toClientType(contact.client_type);
    return {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      clientType,
      stage: toContactStage(clientType, contact.stage),
      tags: contact.tags,
      opted_out: contact.opted_out,
      servicesAvailed: toServiceKeys(contact.services_availed),
      servicesOther: contact.services_other,
      repName: contact.rep_name,
      contractEnd: contact.contract_end,
      createdAt: contact.created_at,
    };
  });

  return (
    <CrmContactsView
      contacts={items}
      initialType={isClientType(type) ? type : "b2c"}
      canEdit={profile.role === "admin" || profile.can_edit_crm}
    />
  );
}
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three succeed. `lib/crm/status.ts` is now imported only by `components/admin/crm-detail.tsx`, `app/admin/(dashboard)/crm/[id]/page.tsx` and `actions/crm.ts`; Task 6 removes those.

- [ ] **Step 9: Commit**

```bash
git add components/admin/contact-stage-chip.tsx components/admin/contract-end-chip.tsx components/admin/contact-add-dialog.tsx components/admin/crm-contacts-view.tsx components/admin/crm-table.tsx "app/admin/(dashboard)/crm/page.tsx"
git commit -m "feat: contacts page with B2C and B2B tabs, stage chips and add contact"
```

---

### Task 6: Contact page — type-aware layout, B2B details, convert

**Files:**
- Create: `components/admin/contact-activity.tsx`
- Create: `components/admin/contact-b2b-card.tsx`
- Create: `components/admin/contact-convert-dialog.tsx`
- Modify: `components/admin/crm-detail.tsx` (replaced)
- Modify: `app/admin/(dashboard)/crm/[id]/page.tsx` (replaced)
- Modify: `actions/crm.ts` (remove `updateStatus`)
- Modify: `lib/vouchers/status.ts` (comment only)
- Delete: `lib/crm/status.ts`

**Interfaces:**
- Consumes: `updateStage`, `convertContactType`, `ContactEditForm` (Task 4); `ContactStageChip`, `ContractEndChip` (Task 5).
- Produces:
  - `ContactActivity({ inquiries, messages })` and the types `CrmDetailInquiry`, `CrmDetailMessage`, exported from `contact-activity.tsx`
  - `ContactB2bCard({ repName, repPosition, otherEmails, otherPhones, contractStart, contractEnd })`
  - `ContactConvertDialog({ contactId, contactName, currentType, open, onOpenChange })`
  - `type CrmDetailContact` (below) and `CrmDetail({ contact, formValues, existingTags, inquiries, messages, canEdit, quotesSlot?, documentsSlot? })`. `quotesSlot` renders for B2C under Contact Info; `documentsSlot` renders for B2B under the B2B card. Tasks 7 and 8 fill them from the page.

- [ ] **Step 1: Create `components/admin/contact-activity.tsx`**

This is the timeline that lives in `crm-detail.tsx` today, moved unchanged.

```tsx
"use client";

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { MailIcon, MessageSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CHANNEL_LABELS,
  type MessageChannel,
  type MessageStatus,
} from "@/lib/crm/messages";

export type CrmDetailInquiry = {
  id: string;
  message: string;
  created_at: string;
  package_id: string | null;
  packages: { id: string; name: string; slug: string } | null;
};

export type CrmDetailMessage = {
  id: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  status: MessageStatus;
  created_at: string;
  sent_by_name: string | null;
};

type ActivityItem =
  | ({ kind: "inquiry" } & CrmDetailInquiry)
  | ({ kind: "message" } & CrmDetailMessage);

/** A contact's inquiries and sent messages, newest first. */
export function ContactActivity({
  inquiries,
  messages,
}: {
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
}) {
  const activity: ActivityItem[] = [
    ...inquiries.map((i) => ({ kind: "inquiry" as const, ...i })),
    ...messages.map((m) => ({ kind: "message" as const, ...m })),
  ].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
        Activity
      </h2>

      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No inquiries or messages yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-6">
          {activity.map((item) => (
            <li key={item.id} className="border-l-2 border-border pl-4">
              <div className="flex flex-col gap-1">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="w-fit text-sm font-semibold text-muted-foreground" />
                    }
                  >
                    {formatDistanceToNow(new Date(item.created_at), {
                      addSuffix: true,
                    })}
                  </TooltipTrigger>
                  <TooltipContent>
                    {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                  </TooltipContent>
                </Tooltip>
                {item.kind === "inquiry" ? (
                  <>
                    <p className="text-base leading-[1.5]">{item.message}</p>
                    {item.package_id && item.packages ? (
                      <Link
                        href={`/admin/packages/${item.packages.id}`}
                        className="w-fit"
                      >
                        <Badge variant="secondary">{item.packages.name}</Badge>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        General inquiry
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {item.channel === "email" ? (
                        <MailIcon className="size-4 text-muted-foreground" />
                      ) : (
                        <MessageSquareIcon className="size-4 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        {CHANNEL_LABELS[item.channel]}
                      </span>
                    </div>
                    {item.channel === "email" && item.subject ? (
                      <p className="text-base leading-[1.5] font-semibold">
                        {item.subject}
                      </p>
                    ) : null}
                    <p className="text-base leading-[1.5]">{item.body}</p>
                    {item.status === "failed" ? (
                      <Badge variant="destructive" className="w-fit">
                        Failed to send
                      </Badge>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Sent by {item.sent_by_name ?? "a staff member"}
                    </p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/admin/contact-b2b-card.tsx`**

```tsx
import { format, parseISO } from "date-fns";

import { ContractEndChip } from "./contract-end-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LabeledValue } from "@/lib/crm/contact-schema";

function LabeledList({
  title,
  entries,
}: {
  title: string;
  entries: LabeledValue[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{title}</span>
      <ul className="flex flex-col gap-0.5">
        {entries.map((entry, index) => (
          <li key={`${entry.value}-${index}`}>
            {entry.value}
            {entry.label ? (
              <span className="text-muted-foreground"> · {entry.label}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A B2B client's representative, extra contact details and contract dates. */
export function ContactB2bCard({
  repName,
  repPosition,
  otherEmails,
  otherPhones,
  contractStart,
  contractEnd,
}: {
  repName: string | null;
  repPosition: string | null;
  otherEmails: LabeledValue[];
  otherPhones: LabeledValue[];
  contractStart: string | null;
  contractEnd: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          <span className="text-muted-foreground">
            Authorized representative:{" "}
          </span>
          {repName ?? "—"}
          {repName && repPosition ? (
            <span className="text-muted-foreground"> · {repPosition}</span>
          ) : null}
        </p>

        <LabeledList title="Other emails" entries={otherEmails} />
        <LabeledList title="Other numbers" entries={otherPhones} />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p>
            <span className="text-muted-foreground">Contract start: </span>
            {contractStart ? format(parseISO(contractStart), "MMM d, yyyy") : "—"}
          </p>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">Contract end:</span>
            <ContractEndChip end={contractEnd} />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `components/admin/contact-convert-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { convertContactType } from "@/actions/crm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLIENT_TYPE_LABELS,
  STAGES_BY_TYPE,
  STAGE_LABELS,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";

const CONVERT_ERROR_MESSAGE =
  "Something went wrong converting this contact. Please try again.";

/**
 * Switches a contact to the other client type. The two pipelines don't
 * line up, so staff pick where the contact sits in the new one (New by
 * default). Nothing is deleted: the other type's fields stay stored.
 */
export function ContactConvertDialog({
  contactId,
  contactName,
  currentType,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  currentType: ClientType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const targetType: ClientType = currentType === "b2c" ? "b2b" : "b2c";
  const [stage, setStage] = useState<ContactStage>("new");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stageItems = Object.fromEntries(
    STAGES_BY_TYPE[targetType].map((s) => [s, STAGE_LABELS[s]])
  );

  function handleOpenChange(next: boolean) {
    if (!next) setStage("new");
    onOpenChange(next);
  }

  async function handleConvert() {
    setIsSubmitting(true);
    try {
      const result = await convertContactType(contactId, targetType, stage);
      if (result.ok) {
        toast.success(`Converted to ${CLIENT_TYPE_LABELS[targetType]}.`);
        handleOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(CONVERT_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Convert to {CLIENT_TYPE_LABELS[targetType]}
          </DialogTitle>
          <DialogDescription>
            {contactName} moves to the {CLIENT_TYPE_LABELS[targetType]} list
            and pipeline. Its {CLIENT_TYPE_LABELS[currentType]} details are
            kept and come back if you convert it again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Stage in the {CLIENT_TYPE_LABELS[targetType]} pipeline
          </span>
          <Select
            items={stageItems}
            value={stage}
            onValueChange={(value) => setStage(value as ContactStage)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES_BY_TYPE[targetType].map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={isSubmitting}>
            {isSubmitting ? "Converting..." : "Convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Replace `components/admin/crm-detail.tsx`**

```tsx
"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";

import { updateStage } from "@/actions/crm";
import { updateOptOut } from "@/actions/messages";
import {
  ContactActivity,
  type CrmDetailInquiry,
  type CrmDetailMessage,
} from "./contact-activity";
import { ContactB2bCard } from "./contact-b2b-card";
import { ContactConvertDialog } from "./contact-convert-dialog";
import { ContactEditForm } from "./contact-edit-form";
import { ContactStageChip } from "./contact-stage-chip";
import { MessageComposeDialog } from "./message-compose-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ContactFormValues, LabeledValue } from "@/lib/crm/contact-schema";
import { SERVICE_LABELS, type ServiceKey } from "@/lib/crm/services";
import {
  CLIENT_TYPE_LABELS,
  STAGES_BY_TYPE,
  STAGE_CHIP_CLASSNAME,
  STAGE_LABELS,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";
import { cn } from "@/lib/utils";

const STAGE_ERROR_MESSAGE =
  "Something went wrong updating the stage. Please try again.";
const OPT_OUT_ERROR_MESSAGE =
  "Something went wrong updating this contact's opt-out status. Please try again.";

export type CrmDetailContact = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  clientType: ClientType;
  stage: ContactStage;
  tags: string[];
  opted_out: boolean;
  servicesAvailed: ServiceKey[];
  servicesOther: string | null;
  repName: string | null;
  repPosition: string | null;
  otherEmails: LabeledValue[];
  otherPhones: LabeledValue[];
  contractStart: string | null;
  contractEnd: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
};

/**
 * The contact page's layout. Sections that need their own data (linked
 * quotes, documents) are rendered by the page and passed in as slots, so
 * this component stays a layout and never grows a section's logic.
 */
export function CrmDetail({
  contact,
  formValues,
  existingTags,
  inquiries,
  messages,
  canEdit,
  quotesSlot,
  documentsSlot,
}: {
  contact: CrmDetailContact;
  formValues: ContactFormValues;
  existingTags: string[];
  inquiries: CrmDetailInquiry[];
  messages: CrmDetailMessage[];
  canEdit: boolean;
  quotesSlot?: ReactNode;
  documentsSlot?: ReactNode;
}) {
  const router = useRouter();
  // Shows the picked stage at once; when the action settles it falls back
  // to contact.stage, which the action's revalidation has refreshed (or
  // left alone, on failure).
  const [stage, setOptimisticStage] = useOptimistic(contact.stage);
  const [optedOut, setOptedOut] = useState(contact.opted_out);
  const [isPending, startTransition] = useTransition();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);

  const isB2b = contact.clientType === "b2b";
  const otherType: ClientType = isB2b ? "b2c" : "b2b";
  const stageItems = Object.fromEntries(
    STAGES_BY_TYPE[contact.clientType].map((s) => [s, STAGE_LABELS[s]])
  );

  function handleStageChange(next: ContactStage) {
    startTransition(async () => {
      setOptimisticStage(next);
      try {
        const result = await updateStage(contact.id, next);
        if (!result.ok) toast.error(result.error);
      } catch {
        toast.error(STAGE_ERROR_MESSAGE);
      }
    });
  }

  function handleOptOutChange(checked: boolean) {
    const previous = optedOut;
    setOptedOut(checked);
    startTransition(async () => {
      try {
        const result = await updateOptOut(contact.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          setOptedOut(previous);
        }
      } catch {
        toast.error(OPT_OUT_ERROR_MESSAGE);
        setOptedOut(previous);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[20px] leading-[1.2] font-semibold">
            {contact.name}
          </h1>
          <Badge variant="secondary">
            {CLIENT_TYPE_LABELS[contact.clientType]}
          </Badge>
          {canEdit ? (
            <Select
              items={stageItems}
              value={stage}
              onValueChange={(value) => handleStageChange(value as ContactStage)}
              disabled={isPending}
            >
              <SelectTrigger
                aria-label="Stage"
                className={cn("w-44", STAGE_CHIP_CLASSNAME[stage])}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES_BY_TYPE[contact.clientType].map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ContactStageChip stage={stage} />
          )}
          <Button onClick={() => setIsMessageOpen(true)}>
            <SendIcon className="size-4" />
            Message
          </Button>
          {canEdit ? (
            <Button variant="outline" onClick={() => setIsConvertOpen(true)}>
              Convert to {CLIENT_TYPE_LABELS[otherType]}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
          {contact.created_by ? (
            <p>
              Added by {contact.created_by_name ?? "a staff member"} on{" "}
              {format(new Date(contact.created_at), "MMM d, yyyy")}
            </p>
          ) : (
            <p>Added {formatDistanceToNow(new Date(contact.created_at))} ago</p>
          )}
          {contact.updated_by ? (
            <p>
              Last updated by {contact.updated_by_name ?? "a staff member"}{" "}
              {formatDistanceToNow(new Date(contact.updated_at))} ago
            </p>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Contact Info</CardTitle>
          {canEdit ? (
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger render={<Button variant="secondary" size="sm" />}>
                Edit Contact
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Contact</DialogTitle>
                </DialogHeader>
                <ContactEditForm
                  contactId={contact.id}
                  clientType={contact.clientType}
                  defaultValues={formValues}
                  existingTags={existingTags}
                  onSuccess={() => {
                    setIsEditOpen(false);
                    router.refresh();
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Email: </span>
            {contact.email ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Phone: </span>
            {contact.phone ?? "—"}
          </p>
          {contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          {!isB2b ? (
            <div className="flex flex-col gap-1 pt-2">
              <span className="text-muted-foreground">Services availed</span>
              {contact.servicesAvailed.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {contact.servicesAvailed.map((key) => (
                    <Badge key={key} variant="secondary">
                      {SERVICE_LABELS[key]}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span>—</span>
              )}
              {contact.servicesAvailed.includes("other") &&
              contact.servicesOther ? (
                <p className="whitespace-pre-wrap">{contact.servicesOther}</p>
              ) : null}
            </div>
          ) : null}

          {canEdit ? (
            <div className="flex items-center gap-2 pt-2">
              <Switch
                checked={optedOut}
                onCheckedChange={handleOptOutChange}
                disabled={isPending}
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  Opted out of bulk messages
                </span>
                <span className="text-sm text-muted-foreground">
                  This contact won&apos;t receive bulk email or SMS sends.
                  Individual messages are still allowed.
                </span>
              </div>
            </div>
          ) : optedOut ? (
            <Badge variant="outline" className="w-fit">
              Opted out
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {isB2b ? (
        <>
          <ContactB2bCard
            repName={contact.repName}
            repPosition={contact.repPosition}
            otherEmails={contact.otherEmails}
            otherPhones={contact.otherPhones}
            contractStart={contact.contractStart}
            contractEnd={contact.contractEnd}
          />
          {documentsSlot}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Transaction history will appear here.
            </CardContent>
          </Card>
        </>
      ) : (
        quotesSlot
      )}

      <ContactActivity inquiries={inquiries} messages={messages} />

      <MessageComposeDialog
        contacts={[
          {
            id: contact.id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            opted_out: optedOut,
          },
        ]}
        mode="individual"
        open={isMessageOpen}
        onOpenChange={setIsMessageOpen}
        onSuccess={() => {
          setIsMessageOpen(false);
          router.refresh();
        }}
      />

      <ContactConvertDialog
        contactId={contact.id}
        contactName={contact.name}
        currentType={contact.clientType}
        open={isConvertOpen}
        onOpenChange={setIsConvertOpen}
      />
    </div>
  );
}
```

- [ ] **Step 5: Replace `app/admin/(dashboard)/crm/[id]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CrmDetail, type CrmDetailContact } from "@/components/admin/crm-detail";
import type {
  CrmDetailInquiry,
  CrmDetailMessage,
} from "@/components/admin/contact-activity";
import {
  contactRowToFormValues,
  parseLabeledList,
} from "@/lib/crm/contact-schema";
import type { MessageChannel, MessageStatus } from "@/lib/crm/messages";
import { toServiceKeys } from "@/lib/crm/services";
import { toClientType, toContactStage } from "@/lib/crm/stage";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Contact | TravelSentro Admin",
};

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];
type PackageRow = Database["public"]["Tables"]["packages"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

type ContactDetail = ContactRow & {
  inquiries: (InquiryRow & {
    packages: Pick<PackageRow, "id" | "name" | "slug"> | null;
  })[];
  messages: Pick<
    MessageRow,
    "id" | "channel" | "subject" | "body" | "status" | "created_at" | "sent_by_name"
  >[];
};

/**
 * CRM-03: universal-read guard (getProfile() session validation only, no
 * redirect-based permission gate) — every authenticated Staff/Admin can view
 * a contact's page regardless of can_edit_crm; only the edit affordances
 * are permission-gated inside CrmDetail.
 */
export default async function CrmContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();

  const { id } = await params;
  const supabase = await createClient();

  const [contactResult, tagsResult] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "*, inquiries(id, contact_id, request_id, message, created_at, package_id, packages(id, name, slug)), messages(id, channel, subject, body, status, created_at, sent_by_name)"
      )
      .eq("id", id)
      .order("created_at", { referencedTable: "inquiries", ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: false })
      .single(),
    supabase.rpc("list_contact_tags"),
  ]);

  if (contactResult.error || !contactResult.data) notFound();
  if (tagsResult.error) {
    console.error("Failed to load tags:", tagsResult.error.message);
  }

  const contact = contactResult.data as unknown as ContactDetail;
  const canEdit = profile.role === "admin" || profile.can_edit_crm;
  const clientType = toClientType(contact.client_type);

  const detailContact: CrmDetailContact = {
    id: contact.id,
    email: contact.email,
    name: contact.name,
    phone: contact.phone,
    clientType,
    stage: toContactStage(clientType, contact.stage),
    tags: contact.tags,
    opted_out: contact.opted_out,
    servicesAvailed: toServiceKeys(contact.services_availed),
    servicesOther: contact.services_other,
    repName: contact.rep_name,
    repPosition: contact.rep_position,
    otherEmails: parseLabeledList(contact.other_emails),
    otherPhones: parseLabeledList(contact.other_phones),
    contractStart: contact.contract_start,
    contractEnd: contact.contract_end,
    created_at: contact.created_at,
    created_by: contact.created_by,
    created_by_name: contact.created_by_name,
    updated_at: contact.updated_at,
    updated_by: contact.updated_by,
    updated_by_name: contact.updated_by_name,
  };

  const detailInquiries: CrmDetailInquiry[] = contact.inquiries.map(
    (inquiry) => ({
      id: inquiry.id,
      message: inquiry.message,
      created_at: inquiry.created_at,
      package_id: inquiry.package_id,
      packages: inquiry.packages,
    })
  );

  const detailMessages: CrmDetailMessage[] = contact.messages.map((m) => ({
    id: m.id,
    channel: m.channel as MessageChannel,
    subject: m.subject,
    body: m.body,
    status: m.status as MessageStatus,
    created_at: m.created_at,
    sent_by_name: m.sent_by_name,
  }));

  return (
    <CrmDetail
      contact={detailContact}
      formValues={contactRowToFormValues(contact)}
      existingTags={tagsResult.data ?? []}
      inquiries={detailInquiries}
      messages={detailMessages}
      canEdit={canEdit}
    />
  );
}
```

- [ ] **Step 6: Remove the old status code**

- In `actions/crm.ts`, delete the `updateStatus` function together with its doc comment, the `STATUS_ERROR_MESSAGE` constant, and the `import type { ContactStatus } from "@/lib/crm/status";` line.
- Delete the file: `git rm lib/crm/status.ts`
- In `lib/vouchers/status.ts`, replace the comment

  ```ts
  // Redeemed's green mirrors lib/crm/status.ts's identical STATUS_BADGE_CLASSNAME
  // override -- a utility-class override on the `secondary` variant, not a new
  // badge.tsx cva variant, for the same single-use-case reason.
  ```

  with

  ```ts
  // Redeemed's green is a utility-class override on the `secondary` variant,
  // not a new badge.tsx cva variant: one status doesn't justify growing the
  // shared Badge component.
  ```

Run: `grep -rn "crm/status\|ContactStatus\|updateStatus" --include="*.ts" --include="*.tsx" app actions components lib scripts`
Expected: no output.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three succeed.

- [ ] **Step 8: Commit**

```bash
git add components/admin/contact-activity.tsx components/admin/contact-b2b-card.tsx components/admin/contact-convert-dialog.tsx components/admin/crm-detail.tsx "app/admin/(dashboard)/crm/[id]/page.tsx" actions/crm.ts lib/vouchers/status.ts
git commit -m "feat: contact page with stage pipeline, B2B details and convert"
```

---

### Task 7: Linked quotes on B2C contacts

**Files:**
- Modify: `actions/quotes.ts`
- Create: `components/admin/contact-quotes-card.tsx`
- Modify: `app/admin/(dashboard)/crm/[id]/page.tsx`
- Modify: `app/admin/(dashboard)/quotes/new/page.tsx`

**Interfaces:**
- Consumes: `CrmDetail`'s `quotesSlot` prop (Task 6).
- Produces:
  - `linkQuoteToContact(quoteId: string, contactId: string): Promise<ActionResult>`
  - `unlinkQuoteFromContact(quoteId: string, contactId: string): Promise<ActionResult>`
  - `ContactQuotesCard({ contactId, quotes, unlinkedQuotes })` with `type ContactQuote = { id; quoteNo; title; pricePerPax: number; updatedAt: string }` and `type UnlinkedQuote = { id; quoteNo; title; customerName: string | null }`
  - `/admin/quotes/new?contactId=<id>` opens the new-quote form with that contact and its name preset

- [ ] **Step 1: Add the two actions to `actions/quotes.ts`**

Append:

```ts
/**
 * Links a quote to a contact from the contact's page. Only a quote that is
 * not linked to anyone is changed, so a stale "Link existing" list can
 * never take a quote away from another contact.
 */
export async function linkQuoteToContact(
  quoteId: string,
  contactId: string
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ contact_id: contactId })
    .eq("id", quoteId)
    .is("contact_id", null)
    .select("id");

  if (error) {
    console.error("linkQuoteToContact failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "That quote is already linked to a contact. Refresh and try again.",
    };
  }

  revalidatePath(`/admin/crm/${contactId}`);
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

/** Removes a quote's link to this contact. The quote itself is untouched. */
export async function unlinkQuoteFromContact(
  quoteId: string,
  contactId: string
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { error } = await supabase
    .from("quotes")
    .update({ contact_id: null })
    .eq("id", quoteId)
    .eq("contact_id", contactId);

  if (error) {
    console.error("unlinkQuoteFromContact failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath(`/admin/crm/${contactId}`);
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}
```

- [ ] **Step 2: Create `components/admin/contact-quotes-card.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

import { linkQuoteToContact, unlinkQuoteFromContact } from "@/actions/quotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatPackagePrice } from "@/lib/packages/format-price";

const QUOTE_ERROR_MESSAGE =
  "Something went wrong updating that quote. Please try again.";

export type ContactQuote = {
  id: string;
  quoteNo: string;
  title: string;
  pricePerPax: number;
  updatedAt: string;
};

export type UnlinkedQuote = {
  id: string;
  quoteNo: string;
  title: string;
  customerName: string | null;
};

/**
 * The quotes written for one contact. Rendered only for viewers with
 * can_manage_quotes (the page decides), since quotes are not readable
 * without it.
 */
export function ContactQuotesCard({
  contactId,
  quotes,
  unlinkedQuotes,
}: {
  contactId: string;
  quotes: ContactQuote[];
  unlinkedQuotes: UnlinkedQuote[];
}) {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const query = search.trim().toLowerCase();
  const matches = unlinkedQuotes.filter((quote) =>
    [quote.quoteNo, quote.title, quote.customerName].some((value) =>
      value?.toLowerCase().includes(query)
    )
  );

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          toast.success(success);
          setIsLinkOpen(false);
          setSearch("");
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(QUOTE_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Quotes</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsLinkOpen(true)}
          >
            Link existing
          </Button>
          <Button
            size="sm"
            render={<Link href={`/admin/quotes/new?contactId=${contactId}`} />}
          >
            New quote
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {quotes.length === 0 ? (
          <p className="text-muted-foreground">
            No quotes linked to this contact yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
              >
                <Link
                  href={`/admin/quotes/${quote.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {quote.quoteNo}
                </Link>
                <span className="min-w-0 flex-1 truncate">{quote.title}</span>
                <span>{formatPackagePrice(quote.pricePerPax, null).final}</span>
                <span className="text-muted-foreground">
                  Updated {format(new Date(quote.updatedAt), "MMM d, yyyy")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () => unlinkQuoteFromContact(quote.id, contactId),
                      `${quote.quoteNo} unlinked.`
                    )
                  }
                >
                  Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link an existing quote</DialogTitle>
            <DialogDescription>
              Quotes that aren&apos;t linked to any contact yet.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by quote number, title or customer..."
          />
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {unlinkedQuotes.length === 0
                ? "Every quote is already linked to a contact."
                : "No quotes match your search."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {matches.map((quote) => (
                <li key={quote.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{quote.quoteNo}</p>
                    <p className="truncate text-muted-foreground">
                      {quote.title}
                      {quote.customerName ? ` · ${quote.customerName}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => linkQuoteToContact(quote.id, contactId),
                        `${quote.quoteNo} linked.`
                      )
                    }
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```

- [ ] **Step 3: Load quotes on the contact page**

In `app/admin/(dashboard)/crm/[id]/page.tsx`:

Add the import:

```ts
import { ContactQuotesCard } from "@/components/admin/contact-quotes-card";
```

After `const detailMessages = ...` and before the `return`, add:

```tsx
  // Quotes are readable only with can_manage_quotes (RLS), so the card is
  // not rendered at all for anyone else. B2C only, per the spec.
  const canManageQuotes = profile.role === "admin" || profile.can_manage_quotes;
  let quotesSlot: React.ReactNode = null;
  if (clientType === "b2c" && canManageQuotes) {
    const [linkedResult, unlinkedResult] = await Promise.all([
      supabase
        .from("quotes")
        .select("id, quote_no, title, price_per_pax, updated_at")
        .eq("contact_id", id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("quotes")
        .select("id, quote_no, title, customer_name")
        .is("contact_id", null)
        .order("updated_at", { ascending: false }),
    ]);
    if (linkedResult.error) {
      console.error("Failed to load linked quotes:", linkedResult.error.message);
    }
    if (unlinkedResult.error) {
      console.error("Failed to load unlinked quotes:", unlinkedResult.error.message);
    }

    quotesSlot = (
      <ContactQuotesCard
        contactId={id}
        quotes={(linkedResult.data ?? []).map((quote) => ({
          id: quote.id,
          quoteNo: quote.quote_no,
          title: quote.title,
          pricePerPax: quote.price_per_pax,
          updatedAt: quote.updated_at,
        }))}
        unlinkedQuotes={(unlinkedResult.data ?? []).map((quote) => ({
          id: quote.id,
          quoteNo: quote.quote_no,
          title: quote.title,
          customerName: quote.customer_name,
        }))}
      />
    );
  }
```

and add the prop to `<CrmDetail>`:

```tsx
      quotesSlot={quotesSlot}
```

- [ ] **Step 4: Preset the contact on the new-quote page**

In `app/admin/(dashboard)/quotes/new/page.tsx`:

Add the import:

```ts
import { EMPTY_QUOTE_VALUES } from "@/components/admin/quote-form-schema";
```

Change the component signature and read the param:

```tsx
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  await requirePermissionOrRedirect("can_manage_quotes");
  const { contactId } = await searchParams;
```

After the two `console.error` lines, add:

```ts
  const contacts = contactsResult.data ?? [];
  // Only a contact that really exists is preset; an unknown or tampered id
  // just opens the blank form.
  const presetContact = contactId
    ? contacts.find((contact) => contact.id === contactId)
    : undefined;
```

and replace `<QuoteForm contacts={contactsResult.data ?? []} />` with:

```tsx
        <QuoteForm
          contacts={contacts}
          defaultValues={
            presetContact
              ? {
                  ...EMPTY_QUOTE_VALUES,
                  contactId: presetContact.id,
                  customerName: presetContact.name,
                }
              : undefined
          }
        />
```

`QuoteForm` already keeps `customerName` and `contactId` when a flyer or package is imported (`preserveFields`), so the preset survives an import.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three succeed.

- [ ] **Step 6: Commit**

```bash
git add actions/quotes.ts components/admin/contact-quotes-card.tsx "app/admin/(dashboard)/crm/[id]/page.tsx" "app/admin/(dashboard)/quotes/new/page.tsx"
git commit -m "feat: link quotes to a contact from the contact page"
```

---

### Task 8: B2B documents in a private bucket

**Files:**
- Modify: `package.json`, `package-lock.json` (new dependency, script)
- Create: `lib/storage/r2-private.ts`
- Create: `scripts/verify-r2-private.ts`
- Create: `actions/contact-documents.ts`
- Create: `app/admin/(dashboard)/crm/[id]/documents/[documentId]/route.ts`
- Create: `components/admin/contact-documents-card.tsx`
- Modify: `app/admin/(dashboard)/crm/[id]/page.tsx`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `checkDocument`, `isAllowedDocumentType`, `MAX_DOCUMENT_BYTES`, `DOCUMENT_ACCEPT`, `sanitizeFileName`, `documentKeyPrefix`, `isDocumentKeyForContact`, `contentDisposition`, `formatBytes` (Task 1); `contact_documents` (Task 2); `CrmDetail`'s `documentsSlot` (Task 6).
- Produces:
  - `presignUpload(key: string, contentType: string): Promise<string>`, `presignDownload(key: string, disposition: string, contentType: string): Promise<string>`, `headObject(key: string): Promise<{ size: number; contentType: string } | null>`, `deletePrivateObject(key: string): Promise<void>`
  - `createDocumentUpload(contactId, file: { name; type; size }): Promise<{ ok: true; url: string; key: string; contentType: string } | { ok: false; error: string }>`
  - `confirmDocumentUpload(contactId: string, key: string, fileName: string): Promise<ActionResult>`
  - `deleteDocument(documentId: string): Promise<ActionResult>`
  - `GET /admin/crm/{id}/documents/{documentId}` → redirect to a 5-minute link
  - `ContactDocumentsCard({ contactId, documents, canEdit })` with `type ContactDocument = { id; fileName; sizeBytes: number; uploadedByName: string | null; createdAt: string }`

- [ ] **Step 1: Check the private bucket exists**

Run: `grep -Ec '^R2_PRIVATE_BUCKET_NAME=.+' .env.local`
Expected: `1`.

If it prints `0`, stop and give the user this setup, then wait:

1. Cloudflare dashboard → R2 → **Create bucket** (for example `travelsentro-private`). Leave the public development URL and custom domains **off**.
2. In the new bucket → Settings → **CORS policy**, paste:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://travelsentro.com",
         "https://www.travelsentro.com",
         "https://staging.travelsentro.com",
         "http://localhost:3000",
         "http://localhost:3100"
       ],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Only uploads need this: the browser sends the file straight to R2. Uploads will not work from Vercel preview URLs, which are not in the list.
3. R2 → Manage API tokens: if the token behind `R2_ACCESS_KEY_ID` is limited to specific buckets, add the new bucket with Object Read & Write.
4. Add `R2_PRIVATE_BUCKET_NAME=<bucket name>` to `.env.local`, and to Vercel for Production and Preview (`vercel env add R2_PRIVATE_BUCKET_NAME`).

- [ ] **Step 2: Install the presigner at the installed S3 client's version**

```bash
npm install "@aws-sdk/s3-request-presigner@$(node -p "require('@aws-sdk/client-s3/package.json').version")"
```

Expected: `package.json` gains `@aws-sdk/s3-request-presigner` and nothing else changes in `dependencies`.

- [ ] **Step 3: Write the failing live script**

Create `scripts/verify-r2-private.ts`:

```ts
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
```

In `package.json`, add to `"scripts"` after `"verify:r2-storage"`:

```json
    "verify:r2-private": "tsx --env-file=.env.local scripts/verify-r2-private.ts",
```

Run: `npm run verify:r2-private`
Expected: FAIL with `Cannot find module '../lib/storage/r2-private'`.

- [ ] **Step 4: Create `lib/storage/r2-private.ts`**

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * The private documents bucket (B2B contracts and the like). Unlike
 * lib/storage/r2-client.ts's media bucket it has no public URL: files go
 * in and come out only through short-lived presigned URLs handed out
 * after a session check. Server-only by use (it reads the R2 secret), but
 * deliberately not marked `server-only` so scripts/verify-r2-private.ts
 * can import it.
 */
const URL_TTL_SECONDS = 300;

function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // By default the SDK adds a CRC32 checksum to every upload. On a
    // presigned URL that becomes a signed parameter a plain browser PUT
    // cannot satisfy, and R2 rejects the upload.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function privateBucket(): string {
  const name = process.env.R2_PRIVATE_BUCKET_NAME;
  if (!name) throw new Error("R2_PRIVATE_BUCKET_NAME is not set");
  // A copy-paste slip here would publish contracts on the CDN.
  if (name === process.env.R2_BUCKET_NAME) {
    throw new Error("R2_PRIVATE_BUCKET_NAME must not be the public media bucket");
  }
  return name;
}

/** A URL the browser can PUT one file to, valid for 5 minutes. */
export async function presignUpload(
  key: string,
  contentType: string
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: URL_TTL_SECONDS }
  );
}

/** A URL that serves one file, valid for 5 minutes. */
export async function presignDownload(
  key: string,
  disposition: string,
  contentType: string
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      ResponseContentDisposition: disposition,
      ResponseContentType: contentType,
    }),
    { expiresIn: URL_TTL_SECONDS }
  );
}

/** The stored object's real size and type, or null if it does not exist. */
export async function headObject(
  key: string
): Promise<{ size: number; contentType: string } | null> {
  try {
    const result = await getClient().send(
      new HeadObjectCommand({ Bucket: privateBucket(), Key: key })
    );
    return {
      size: result.ContentLength ?? 0,
      contentType: result.ContentType ?? "",
    };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

export async function deletePrivateObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: privateBucket(), Key: key })
  );
}
```

- [ ] **Step 5: Run the live script**

This writes one small test object to the real private bucket and deletes it. Tell the user before running it.

Run: `npm run verify:r2-private`
Expected: `PASS: 7/7 checks passed`.

If the first check fails with a signature or checksum error, the checksum options in `getClient()` are not being applied — confirm both are set. If the public-URL check fails, `R2_PRIVATE_BUCKET_NAME` is pointing at a publicly served bucket: stop and tell the user.

- [ ] **Step 6: Create `actions/contact-documents.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  MAX_DOCUMENT_BYTES,
  checkDocument,
  documentKeyPrefix,
  isAllowedDocumentType,
  isDocumentKeyForContact,
  sanitizeFileName,
} from "@/lib/crm/documents";
import {
  deletePrivateObject,
  headObject,
  presignUpload,
} from "@/lib/storage/r2-private";

const UPLOAD_ERROR_MESSAGE =
  "Something went wrong uploading that document. Please try again.";
const DELETE_ERROR_MESSAGE =
  "Something went wrong deleting that document. Please try again.";

const idSchema = z.uuid();

export type DocumentUploadStart =
  | { ok: true; url: string; key: string; contentType: string }
  | { ok: false; error: string };

/**
 * Step 1 of an upload: checks the file's claimed type and size and hands
 * back a URL the browser PUTs the file to. The file goes straight to R2,
 * never through this app (Vercel caps a function's request body at 4.5 MB).
 * Nothing is recorded yet -- confirmDocumentUpload() does that.
 */
export async function createDocumentUpload(
  contactId: string,
  file: { name: string; type: string; size: number }
): Promise<DocumentUploadStart> {
  await requirePermission("can_edit_crm");

  if (!idSchema.safeParse(contactId).success) {
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }

  const checked = checkDocument({
    name: String(file?.name ?? ""),
    type: String(file?.type ?? ""),
    size: Number(file?.size),
  });
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("client_type")
    .eq("id", contactId)
    .maybeSingle();

  if (!contact) return { ok: false, error: "That contact no longer exists." };
  if (contact.client_type !== "b2b") {
    return {
      ok: false,
      error: "Documents can only be attached to B2B clients.",
    };
  }

  const key = `${documentKeyPrefix(contactId)}${randomUUID()}.${checked.extension}`;
  try {
    const url = await presignUpload(key, checked.contentType);
    return { ok: true, url, key, contentType: checked.contentType };
  } catch (err) {
    console.error("createDocumentUpload failed:", err);
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }
}

/**
 * Step 2 of an upload: records the document. The size and type come from
 * the stored object itself, not from the browser, so a file that lied in
 * step 1 is deleted here instead of being listed.
 */
export async function confirmDocumentUpload(
  contactId: string,
  key: string,
  fileName: string
): Promise<ActionResult> {
  const profile = await requirePermission("can_edit_crm");

  if (
    !idSchema.safeParse(contactId).success ||
    typeof key !== "string" ||
    !isDocumentKeyForContact(key, contactId)
  ) {
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }

  let stored: Awaited<ReturnType<typeof headObject>>;
  try {
    stored = await headObject(key);
  } catch (err) {
    console.error("confirmDocumentUpload head failed:", err);
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }
  if (!stored) {
    return { ok: false, error: "The upload didn't finish. Please try again." };
  }

  const removeStored = () =>
    deletePrivateObject(key).catch((err) =>
      console.error(`Orphaned private object ${key}:`, err)
    );

  if (
    !isAllowedDocumentType(stored.contentType) ||
    stored.size <= 0 ||
    stored.size > MAX_DOCUMENT_BYTES
  ) {
    await removeStored();
    return {
      ok: false,
      error: "That file isn't an allowed type or is larger than 20 MB.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contact_documents").insert({
    contact_id: contactId,
    file_name: sanitizeFileName(String(fileName ?? "")),
    storage_key: key,
    content_type: stored.contentType,
    size_bytes: stored.size,
    uploaded_by_name: profile.name,
  });

  // 23505 = this key is already recorded (a double submit): that is success.
  if (error && error.code !== "23505") {
    console.error("confirmDocumentUpload insert failed:", error.message);
    await removeStored();
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }

  revalidatePath(`/admin/crm/${contactId}`);
  return { ok: true };
}

/** Removes the document's row, then its file. */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  if (!idSchema.safeParse(documentId).success) {
    return { ok: false, error: DELETE_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_documents")
    .delete()
    .eq("id", documentId)
    .select("contact_id, storage_key");

  if (error) {
    console.error("deleteDocument failed:", error.message);
    return { ok: false, error: DELETE_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "That document no longer exists." };
  }

  // The row is gone, so the document is no longer listed or reachable. A
  // failed object delete only leaves an orphan in a private bucket.
  try {
    await deletePrivateObject(data[0].storage_key);
  } catch (err) {
    console.error(`Orphaned private object ${data[0].storage_key}:`, err);
  }

  revalidatePath(`/admin/crm/${data[0].contact_id}`);
  return { ok: true };
}
```

- [ ] **Step 7: Create the download Route Handler**

First read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (the `params` section and the redirect example) and the "Behavior" section of `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`. Confirm: `params` is a `Promise`, and `redirect()` from `next/navigation` works in a Route Handler but must be called outside any `try` block. The code below depends on both.

Create `app/admin/(dashboard)/crm/[id]/documents/[documentId]/route.ts`:

```ts
import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth/dal";
import { contentDisposition } from "@/lib/crm/documents";
import { presignDownload } from "@/lib/storage/r2-private";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens one contact document. The file lives in a private bucket, so this
 * validates the session (any active staff member may read, the same rule
 * as the contact itself -- CRM-03), finds the document through the
 * caller's own Supabase client so RLS applies, and redirects to a link
 * that expires in 5 minutes. getProfile() redirects a logged-out visitor
 * to the login page.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  await getProfile();

  const { id, documentId } = await params;
  const supabase = await createClient();

  // A malformed id makes the query error; that is a 404 like any other miss.
  const { data: document, error } = await supabase
    .from("contact_documents")
    .select("storage_key, file_name, content_type")
    .eq("id", documentId)
    .eq("contact_id", id)
    .maybeSingle();

  if (error || !document) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let url: string;
  try {
    url = await presignDownload(
      document.storage_key,
      contentDisposition(document.file_name),
      document.content_type
    );
  } catch (err) {
    console.error(`Document link failed for ${documentId}:`, err);
    return Response.json({ error: "Failed to open document" }, { status: 500 });
  }

  // Outside the try: redirect() works by throwing.
  redirect(url);
}
```

- [ ] **Step 8: Create `components/admin/contact-documents-card.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FileTextIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import {
  confirmDocumentUpload,
  createDocumentUpload,
  deleteDocument,
} from "@/actions/contact-documents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DOCUMENT_ACCEPT,
  checkDocument,
  formatBytes,
} from "@/lib/crm/documents";

const UPLOAD_ERROR_MESSAGE =
  "Something went wrong uploading. Please try again.";
const DELETE_ERROR_MESSAGE =
  "Something went wrong deleting that document. Please try again.";

export type ContactDocument = {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
};

/**
 * A B2B client's documents. Anyone who can see the contact can open one;
 * uploading and deleting need can_edit_crm. Files travel browser -> R2
 * directly through a presigned URL, then are confirmed with the server.
 */
export function ContactDocumentsCard({
  contactId,
  documents,
  canEdit,
}: {
  contactId: string;
  documents: ContactDocument[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContactDocument | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  async function uploadOne(file: File): Promise<boolean> {
    const fail = (message: string) => {
      toast.error(`${file.name}: ${message}`);
      return false;
    };

    const checked = checkDocument(file);
    if (!checked.ok) return fail(checked.error);

    const started = await createDocumentUpload(contactId, {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!started.ok) return fail(started.error);

    const put = await fetch(started.url, {
      method: "PUT",
      headers: { "Content-Type": started.contentType },
      body: file,
    });
    if (!put.ok) return fail("The upload failed. Please try again.");

    const confirmed = await confirmDocumentUpload(
      contactId,
      started.key,
      file.name
    );
    if (!confirmed.ok) return fail(confirmed.error);

    return true;
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";

    let uploaded = 0;
    try {
      for (const file of files) {
        setUploadingName(file.name);
        if (await uploadOne(file)) uploaded += 1;
      }
    } catch {
      toast.error(UPLOAD_ERROR_MESSAGE);
    } finally {
      setUploadingName(null);
    }

    if (uploaded > 0) {
      toast.success(
        uploaded === 1 ? "Document uploaded." : `${uploaded} documents uploaded.`
      );
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const result = await deleteDocument(pendingDelete.id);
      if (result.ok) {
        toast.success("Document deleted.");
        setPendingDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(DELETE_ERROR_MESSAGE);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Documents</CardTitle>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={DOCUMENT_ACCEPT}
              className="hidden"
              onChange={handleFiles}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={uploadingName !== null}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon />
              {uploadingName !== null ? "Uploading..." : "Upload"}
            </Button>
          </>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        {uploadingName !== null ? (
          <p className="pb-2 text-muted-foreground">
            Uploading {uploadingName}...
          </p>
        ) : null}

        {documents.length === 0 ? (
          <p className="text-muted-foreground">
            No documents yet.
            {canEdit
              ? " Upload PDFs, images, Word or Excel files up to 20 MB each."
              : ""}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-3 py-2">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/admin/crm/${contactId}/documents/${document.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {document.fileName}
                  </a>
                  <p className="text-muted-foreground">
                    {formatBytes(document.sizeBytes)} · Uploaded by{" "}
                    {document.uploadedByName ?? "a staff member"} on{" "}
                    {format(new Date(document.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${document.fileName}`}
                    onClick={() => setPendingDelete(document)}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.fileName} will be removed for everyone. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

- [ ] **Step 9: Load documents on the contact page and document the env var**

In `app/admin/(dashboard)/crm/[id]/page.tsx`:

Add the import:

```ts
import { ContactDocumentsCard } from "@/components/admin/contact-documents-card";
```

After the quotes block from Task 7 and before the `return`, add:

```tsx
  let documentsSlot: React.ReactNode = null;
  if (clientType === "b2b") {
    const { data: documentRows, error: documentsError } = await supabase
      .from("contact_documents")
      .select("id, file_name, size_bytes, uploaded_by_name, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false });
    if (documentsError) {
      console.error("Failed to load documents:", documentsError.message);
    }

    documentsSlot = (
      <ContactDocumentsCard
        contactId={id}
        canEdit={canEdit}
        documents={(documentRows ?? []).map((document) => ({
          id: document.id,
          fileName: document.file_name,
          sizeBytes: document.size_bytes,
          uploadedByName: document.uploaded_by_name,
          createdAt: document.created_at,
        }))}
      />
    );
  }
```

and add the prop to `<CrmDetail>`:

```tsx
      documentsSlot={documentsSlot}
```

In `.env.local.example`, add after the `R2_BUCKET_NAME=` line:

```bash

# Private R2 bucket for B2B contact documents (contracts and the like).
# Public access must stay OFF on this bucket: files are served only through
# short-lived signed links after a staff login check. Must not be the same
# bucket as R2_BUCKET_NAME. Needs a CORS rule allowing PUT with the
# content-type header from the site's origins (see the contacts B2C/B2B plan).
R2_PRIVATE_BUCKET_NAME=
```

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three succeed; the build's route list includes `/admin/crm/[id]/documents/[documentId]`.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json lib/storage/r2-private.ts scripts/verify-r2-private.ts actions/contact-documents.ts "app/admin/(dashboard)/crm/[id]/documents/[documentId]/route.ts" components/admin/contact-documents-card.tsx "app/admin/(dashboard)/crm/[id]/page.tsx" .env.local.example
git commit -m "feat: B2B contact documents in a private bucket"
```

---

### Task 9: Browser pass

**Files:** none created; fixes go wherever a check fails.

**Interfaces:**
- Consumes: everything from Tasks 1–8.

- [ ] **Step 1: Re-run every automated check**

In a shell with the local-stack exports:

```bash
npm run verify:contact-helpers && npm run verify:contacts-rls && npx tsc --noEmit && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 2: Start a scratch copy of the app on port 3100 against the local stack**

Replace `<scratch>` with the session scratchpad directory. Run from the worktree root, in a shell that has the local-stack exports:

```bash
rsync -a --delete --exclude .next --exclude node_modules --exclude .git ./ <scratch>/travelsentro/
cp -Rc node_modules <scratch>/travelsentro/node_modules
npm run seed:admin
(cd <scratch>/travelsentro && npx next dev -p 3100)
```

`npm run seed:admin` creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local` on the local stack (the exported variables win over `.env.local`'s Supabase values). Run the dev server in the background and wait for "Ready". The R2 variables still come from `.env.local`, so document uploads in this pass go to the real private bucket; every test file is deleted in Step 6.

Seed a few contacts to look at:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
insert into contacts (name, email, phone, client_type, stage, tags, contract_end) values
  ('Maria Santos', 'maria@example.com', '09171110001', 'b2c', 'new', '{honeymoon}', null),
  ('Jose Reyes', 'jose@example.com', null, 'b2c', 'quotation', '{repeat}', null),
  ('Phone Only Lead', null, '09171110002', 'b2c', 'inquiry', '{}', null),
  ('Acme Travel', 'ops@acme.example', null, 'b2b', 'follow_up', '{corporate}', (current_date + interval '5 months')::date),
  ('Sunrise Tours', 'hi@sunrise.example', null, 'b2b', 'won', '{agency}', (current_date + interval '2 months')::date),
  ('Blue Reef Inc', 'hi@bluereef.example', null, 'b2b', 'contract_review', '{}', (current_date + interval '10 days')::date),
  ('Old Partner Co', 'hi@oldpartner.example', null, 'b2b', 'lost', '{}', (current_date - interval '40 days')::date);"
```

- [ ] **Step 3: Drive the Contacts page**

Log in at `http://localhost:3100/admin/login` with the seeded admin and open **Contacts**. Drive this by hand or with `playwright-core` (`channel: "chrome"`). Every line must hold:

1. Two tabs, **B2C 3** and **B2B 4**. B2C is selected and the URL has no `type` or `?type=b2c`.
2. The B2C chip row reads All 3, New 1, Inquiry 1, Quotation 1, Confirmation 0, Lost 0, each stage a different colour. Clicking **Quotation** leaves only Jose Reyes; clicking it again, or **All**, restores all three. The counts do not change while a chip is active.
3. `Phone Only Lead` shows its number where the others show an email.
4. Clicking **B2B** changes the URL to `?type=b2b`; reloading the page stays on B2B. The chip row is now New, Contacted, Follow-up, Discovery, Contract Review, Won, Lost.
5. Contract end colours: Acme Travel plain, Sunrise Tours yellow, Blue Reef Inc red, Old Partner Co red with "Expired". Sorting by **Contract end** orders them by date.
6. Searching `acme` on the B2B tab leaves one row; searching `agency` (a tag) leaves Sunrise Tours. The tag select lists only `agency` and `corporate`.
7. On B2C, tick Maria Santos and Phone Only Lead → **Message Selected**. The Email tab says "1 selected contact(s) have no email address and will be skipped."; the confirmation says "Send to 1 contacts?". Close without sending.
8. Narrow the window to phone width: cards replace the table, each with its stage chip; B2B cards show the contract end chip.

- [ ] **Step 4: Drive add, edit and convert**

1. **Add, B2B:** on the B2B tab, **Add Contact**. B2B is preselected and the name field reads "Company name". Save with everything blank: "Please enter a name" and "Enter an email address or a phone number" show. Enter company `Test Corp`, phone `09170000009`, representative `Ana Cruz`, type `corp` in tags and pick the **+ corporate** suggestion. Save → lands on Test Corp's page, type badge **B2B**, stage **New**.
2. **Duplicate email:** Add Contact with name `Dup` and email `MARIA@example.com `. The email field shows "A contact with this email already exists." with an **Open the existing contact** link that opens Maria Santos.
3. **Edit, B2B:** on Test Corp → Edit Contact. Add an email `ops@testcorp.example`, an extra email (label `Billing`, value `billing@testcorp.example`), an extra number, contract start today and contract end two months from now. Save. The Company Details card shows all of it, with the end date yellow. Setting contract end before start shows "The contract can't end before it starts" and does not save.
4. **Tags:** in Edit, type `Corporate` and press Enter → the existing `corporate` spelling is added once, not a second tag. Type `vip` and press Enter → form does not submit; `vip` is added. Backspace on the empty tag box removes the last tag.
5. **Stage:** change Test Corp's stage to **Contract Review**. The select takes the stage's colour; reload — it persists; the B2B tab counts it under Contract Review.
6. **Edit, B2C:** on Maria Santos → Edit. Tick **Visa Services** and **Other**; a text box appears. Save without filling it: "Please describe the other service". Fill it with `Travel insurance` and save. The Contact Info card lists both services and the text. Untick Other and save: the text is gone.
7. **Convert:** on Maria Santos → **Convert to B2B**, stage **Contacted** → the page shows B2B, Contacted, the Company Details card and the Transaction History card ("Transaction history will appear here."). Convert back to B2C with stage **Inquiry**: Visa Services is still ticked.
8. **Stale stage:** open Jose Reyes in two tabs. In tab A convert to B2B. In tab B (not reloaded) pick **Confirmation**. A toast says the stage doesn't belong to this contact's pipeline anymore; nothing changes. Convert Jose back to B2C afterwards.
9. **Phone-only message:** on Phone Only Lead → **Message**. The dialog opens on SMS and the Email tab is disabled with the "no email address on file" tooltip. Close without sending.
10. Check the old column stayed in step: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select name, client_type, stage, status from contacts where name in ('Test Corp', 'Maria Santos');"` → Test Corp `b2b / contract_review / qualified`, Maria Santos `b2c / inquiry / contacted`.

- [ ] **Step 5: Drive quotes and documents**

1. **New quote:** on Maria Santos (B2C) the Quotes card shows "No quotes linked to this contact yet." **New quote** opens `/admin/quotes/new?contactId=…` with the CRM contact and customer name filled in. Give it a title, price `5000` and duration `3D2N`, save, and go back to Maria: the quote is listed with its `TSQ-` number and price.
2. **Unlink / link:** **Unlink** removes it from the card. **Link existing** lists it; searching its number finds it; **Link** puts it back.
3. Test Corp (B2B) has no Quotes card.
4. **Upload:** on Test Corp, Documents → **Upload** a PDF under 20 MB. Toast "Document uploaded."; the row shows the name, size, "Uploaded by" and today's date. Check `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select file_name, content_type, size_bytes, storage_key from contact_documents;"` — the key starts with `contacts/<Test Corp's id>/`.
5. **Open:** click the document name → it opens in a new tab from an `r2.cloudflarestorage.com` URL. Copy that URL, wait 6 minutes, load it again → R2 refuses it (expired).
6. **Rejected files:** upload a `.txt` file (switch the picker to "All files") → toast "…: Documents must be a PDF, an image (JPG, PNG, WebP), or a Word or Excel file." and nothing is listed. Upload a file over 20 MB → "…: Documents must be 20 MB or smaller."
7. **Logged out:** copy the document's `/admin/crm/…/documents/…` link, log out, open it → the login page, not the file.
8. **Wrong contact:** logged in again, replace the contact id in that link with Maria Santos's id → `{"error":"Not found"}` with status 404.
9. **Delete:** delete the document (the dialog names it). It disappears; `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select count(*) from contact_documents;"` prints `0`.

- [ ] **Step 6: Check a user without edit rights, then clean up**

The `prevent_self_last_admin_lockout` trigger refuses to demote the last admin, so it is switched off for the duration of this check — on the **local** database only. Replace `<ADMIN_EMAIL>` with the value from `.env.local`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "alter table profiles disable trigger prevent_self_last_admin_lockout; update profiles set role = 'staff', can_edit_crm = false, can_manage_quotes = false where email = '<ADMIN_EMAIL>';"
```

Reload Contacts. Expected: both tabs and every contact still load; there is no **Add Contact** button. On Test Corp there is no Edit, Convert, Upload or delete control and the stage is a chip, not a select. On Maria Santos there is no Quotes card. Then restore:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "update profiles set role = 'admin' where email = '<ADMIN_EMAIL>'; alter table profiles enable trigger prevent_self_last_admin_lockout;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select role from profiles where email = '<ADMIN_EMAIL>'; select tgenabled from pg_trigger where tgname = 'prevent_self_last_admin_lockout';"
```

Expected: `admin`, and `tgenabled` = `O`.

If any document from Step 5 was left in the list, delete it through the page now (that also removes it from the private bucket). Then stop the port-3100 server.

- [ ] **Step 7: Fix anything that failed**

For each failed check: fix it in the worktree (not the scratch copy), re-run `npx tsc --noEmit && npm run lint`, re-sync with the `rsync` line from Step 2, re-check, and commit the fix with a `fix:` message.

---

## Rollout handoff

Do not push. Report this to the user:

1. **Before pushing:** the private bucket, its CORS rule and `R2_PRIVATE_BUCKET_NAME` (in Vercel for Production and Preview) must be in place — Task 8 Step 1.
2. **Push to `staging`.** The "Supabase migrations" workflow applies the migration to the database production also uses. Production keeps running its current code against the untouched `status` column; the trigger keeps `stage` in step with whatever it writes.
3. **Between that push and the `master` release, do not create a phone-only contact on staging.** Production's current code would list it with a blank email and log a failed send if it were included in a bulk email.
4. **Verify on staging, then merge to `master`.**
5. **Afterwards, as a separate change:** a migration that drops `contacts.status`, its check constraint, and the `contacts_sync_status_stage` trigger and function.
