# Contacts: B2C and B2B Clients — Design

## Purpose

Let staff manage two kinds of client in **Contacts**: individual travellers
(B2C) and companies TravelSentro has an agreement with (B2B). Each kind
has its own sales pipeline and its own fields, and the main Contacts page
shows where every lead stands at a glance.

Today a contact is created only by the public inquiry form (one row per
unique email), has one five-step status shared by everyone, free-typed
comma-separated tags, and no link back to the quotes written for it. There
is nowhere to record a company's representative, contract dates or
documents, and no way to add a lead that arrived by WhatsApp or Facebook.

Success looks like:

- A staff member opens **Contacts**, sees B2C and B2B tabs with coloured
  stage chips, and can filter either list by stage in one click.
- They add a B2B client by hand, record its representative, extra emails
  and numbers, contract dates and documents, and the contract end date
  turns yellow, then red, as renewal approaches.
- They open a B2C contact, tick what the customer availed, pick tags from
  the ones already in use, and see every quote written for that customer.
- Nothing a contact can do today (inquiry timeline, individual and bulk
  messaging, opt-out) stops working.

## Scope

- Client type (B2C / B2B) on every contact, with a stage pipeline per type.
- Manual **Add contact**, and **Convert** between B2C and B2B.
- Email becomes optional and editable; email or phone is required.
- Tag picker that suggests existing tags and creates new ones.
- B2C: services availed (multi-select with an Other text box), linked
  quotes card.
- B2B: authorized representative, extra emails and numbers, contract start
  and end with colour warnings, documents, transaction history placeholder.
- Revamped main Contacts page: tabs, stage chips with counts, per-type
  columns.
- Private R2 bucket for documents.

Out of scope:

- Any transaction history behaviour. The B2B page shows an empty
  "Transaction history" card and nothing else; no table is created.
- Messaging a B2B client's extra emails or numbers. Messaging keeps using
  the primary email and phone only.
- Deleting contacts (not possible today either).
- A new permission toggle. Everything reuses `can_edit_crm` and, for
  quotes, `can_manage_quotes`.
- Dropping the old `status` column. It stays, kept in sync, until this
  work is live on `master`; removing it is a follow-up migration.
- Linked quotes on B2B contacts. Quotes stay linked if a contact is
  converted, they are just not listed on the B2B page.

## Decisions made with the user

| Question | Decision |
|----------|----------|
| How B2B clients enter Contacts | Manual add, plus convert an existing contact |
| Document storage | New private R2 bucket, short-lived links after a login check |
| Main page layout | B2C / B2B tabs over a table, stage chips as the filter |
| Email on manual add | Email or phone required, not both |
| Existing contacts | All become B2C; `contacted → inquiry`, `qualified → quotation`, `won → confirmation` |
| Services availed | Multi-select |
| Contract end colours | Yellow from 3 months before, red from 1 month before, red and "Expired" after |
| Who can open documents | Any logged-in staff member (same as the rest of a contact); changes need `can_edit_crm` |

## Stages

| Type | Stages, in order |
|------|------------------|
| B2C | `new`, `inquiry`, `quotation`, `confirmation`, `lost` |
| B2B | `new`, `contacted`, `follow_up`, `discovery`, `contract_review`, `won`, `lost` |

Labels: New, Inquiry, Quotation, Confirmation, Lost; New, Contacted,
Follow-up, Discovery, Contract Review, Won, Lost.

Chip colours (Tailwind `bg-*-100 text-*-800 border-*-200` on the `outline`
Badge, the same class-override approach `lib/crm/status.ts` uses today, so
`badge.tsx` gains no variants):

| Stage | Colour |
|-------|--------|
| New | blue |
| Inquiry (B2C), Discovery (B2B) | violet |
| Quotation (B2C), Follow-up (B2B) | amber |
| Contacted (B2B) | cyan |
| Contract Review (B2B) | fuchsia |
| Confirmation (B2C), Won (B2B) | green |
| Lost | red |

## Data model

One new migration, `supabase/migrations/20261013120000_contacts_b2c_b2b.sql`.
Everything is additive. B2C and B2B share the `contacts` table because
inquiries, messages, quotes and vouchers already reference it, and
conversion becomes a field change rather than a record move.

### New columns on `contacts`

| Column | Type | Notes |
|--------|------|-------|
| `client_type` | `text not null default 'b2c'` | `check in ('b2c','b2b')` |
| `stage` | `text not null default 'new'` | Must belong to the row's type (check below) |
| `services_availed` | `text[] not null default '{}'` | Subset of `tour_package`, `visa_services`, `custom_tour`, `flight_accommodation`, `other` |
| `services_other` | `text` | Only allowed when `other` is in `services_availed` |
| `rep_name` | `text` | Authorized representative |
| `rep_position` | `text` | |
| `other_emails` | `jsonb not null default '[]'` | Array of `{ "label": string, "value": string }` |
| `other_phones` | `jsonb not null default '[]'` | Same shape |
| `contract_start` | `date` | |
| `contract_end` | `date` | `check (contract_end >= contract_start)` when both are set |

Constraints:

```sql
constraint contacts_stage_matches_type check (
  (client_type = 'b2c' and stage in
    ('new','inquiry','quotation','confirmation','lost'))
  or
  (client_type = 'b2b' and stage in
    ('new','contacted','follow_up','discovery','contract_review','won','lost'))
)
```

`email` drops `not null` (the unique constraint stays; Postgres allows
many nulls). A new check requires a non-blank email or a non-blank phone.
Every existing row has an email, so the check passes on current data.

Type-specific columns are **not** nulled by the database when the type
changes. Converting a contact keeps the other type's data and simply hides
it, so converting back loses nothing.

`other_emails` / `other_phones` are jsonb on the row rather than a child
table: they are written with the rest of the edit form in one statement
and never queried on their own, the same reasoning the `quotes` table uses
for its jsonb columns. Their shape is enforced by the zod schema on every
write.

### Backfill and the old `status` column

Staging and production share one database, and a migration pushed to
`staging` runs against it while `master` still serves the old code. That
code reads and writes `status` with the values `new / contacted /
qualified / won / lost`. So:

- `status` and its check constraint are left exactly as they are.
- `stage` is backfilled from `status` for every row: `new → new`,
  `contacted → inquiry`, `qualified → quotation`, `won → confirmation`,
  `lost → lost`.
- A `before insert or update` trigger, `contacts_sync_status_stage`, keeps
  the two aligned:
  - On insert, or when `stage` changed, `status` is set from it (B2C: `inquiry →
    contacted`, `quotation → qualified`, `confirmation → won`; B2B:
    `contacted` and `follow_up → contacted`, `discovery` and
    `contract_review → qualified`, `won → won`; `new` and `lost` map to
    themselves).
  - Otherwise, if `status` changed (the old code wrote it), `stage` is set
    from it using the row's type (B2C as in the backfill; B2B: `contacted
    → contacted`, `qualified → discovery`, `won → won`).

New code reads and writes only `stage`. Once this release is on `master`,
a follow-up migration drops `status`, its constraint and the trigger.

One known gap during the window between the two deploys: a phone-only
contact created from staging appears in production's old list with a blank
email, and the old bulk-email action would log a failed send for it. Avoid
creating phone-only contacts until the release reaches `master`.

`record_inquiry()` is unchanged. Its insert names neither new column, so
inquiry-form contacts arrive as `b2c` / `new`, and `on conflict (email)`
keeps working with a nullable unique column. An inquiry whose email
matches a B2B contact attaches to that contact.

### `contact_documents`

```sql
create table contact_documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  file_name text not null check (length(trim(file_name)) > 0),
  storage_key text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid references profiles(id) on delete set null default auth.uid(),
  uploaded_by_name text,
  created_at timestamptz not null default now()
);
```

RLS enabled. `select` for every authenticated user (the same
universal-read rule as `contacts` and `inquiries`); `insert` and `delete`
only with `has_permission(auth.uid(), 'can_edit_crm')`. No `update`
policy and no anonymous policy of any kind.

### Existing tags

`tags` stays `text[]`. A `security invoker` SQL function
`list_contact_tags()` returns the distinct tags in use, sorted, for the
picker on the contact page. The list page derives the same set from the
rows it already loads.

## Document storage

A second R2 bucket with public access off, named by a new env var
`R2_PRIVATE_BUCKET_NAME`. It has no public URL and no CDN. A new module
`lib/storage/r2-private.ts` (server-only, alongside `r2-client.ts`) exposes
`presignUpload`, `presignDownload`, `headObject` and `deleteObject` for
that bucket. New dependency: `@aws-sdk/s3-request-presigner`.

Limits: 20 MB per file; PDF, JPEG, PNG, WebP, Word (`.doc`, `.docx`) and
Excel (`.xls`, `.xlsx`). The list lives in `lib/crm/documents.ts` so the
client and server check against the same values.

**Upload** goes browser → R2 directly, because Vercel caps a function's
request body at 4.5 MB:

1. `createDocumentUpload(contactId, { name, type, size })` — requires
   `can_edit_crm`, validates type and size, confirms the contact exists
   and is B2B, and returns a 5-minute presigned PUT URL for the key
   `contacts/{contactId}/{uuid}.{ext}`.
2. The browser PUTs the file to that URL.
3. `confirmDocumentUpload(contactId, key, name)` — requires
   `can_edit_crm`, rejects a key outside `contacts/{contactId}/`, reads
   the object's real size and type with `headObject`, deletes it and
   returns an error if either breaks the limits, otherwise inserts the
   `contact_documents` row.

A file that is uploaded but never confirmed is an orphan in a private
bucket; accepted, as with the existing public-bucket orphans.

**Open** is a Route Handler,
`app/admin/(dashboard)/crm/[id]/documents/[documentId]/route.ts`. It
validates the session with `getProfile()`, loads the row through the
session's Supabase client (so RLS applies) checking it belongs to that
contact, and redirects to a 5-minute presigned GET URL with an inline
content disposition carrying the original file name. Unknown id → 404.

**Delete** is `deleteDocument(documentId)`: requires `can_edit_crm`,
deletes the row, then the object. A failed object delete is logged and
does not fail the action.

Setup the user does once: create the bucket, add `R2_PRIVATE_BUCKET_NAME`
to `.env.local` and Vercel, make sure the existing R2 API token covers the
new bucket, and apply a CORS rule allowing `PUT` with the `content-type`
header from the production, staging and localhost origins. The plan
includes the exact rule. `.env.local.example` documents the variable.

## Server actions

`actions/crm.ts`, all requiring `can_edit_crm` and all validating input
with zod on the server (today's `updateContact` trusts its typed
arguments):

| Action | Behaviour |
|--------|-----------|
| `createContact(values)` | Inserts a contact of either type with `created_by` / `created_by_name`. Email is lower-cased and trimmed. A duplicate email returns an error plus the existing contact's id so the dialog can offer "Open contact". |
| `updateContact(id, values)` | Replaces today's version. Common fields plus the fields for the contact's type. Same duplicate-email handling. |
| `updateStage(id, stage)` | Replaces `updateStatus`. Rejects a stage outside the contact's pipeline. |
| `convertContactType(id, type, stage)` | Sets type and stage together. |
| `createDocumentUpload`, `confirmDocumentUpload`, `deleteDocument` | As above. |

`actions/quotes.ts`, requiring `can_manage_quotes`:

| Action | Behaviour |
|--------|-----------|
| `linkQuoteToContact(quoteId, contactId)` | Sets `contact_id` on a quote that currently has none. |
| `unlinkQuoteFromContact(quoteId)` | Clears `contact_id`. |

`actions/messages.ts`: the individual email send returns "This contact has
no email address on file." when there is none, and the bulk email query
adds `.not("email", "is", null)` before the quota check, mirroring the
existing phone filter for SMS.

## Shared logic

New pure modules in `lib/crm/`, each importable by client and server:

- `stage.ts` — replaces `status.ts`. Client types, stages per type,
  labels, chip classes, `isStageForType()`.
- `services.ts` — the five service keys and labels.
- `contract.ts` — `contractEndTone(end, today)` returning `none`,
  `warning`, `danger` or `expired`. `today > end` is `expired`; `today >=
  end − 1 month` is `danger`; `today >= end − 3 months` is `warning`.
  Calendar months via `date-fns`; `today` is passed in so the function is
  testable, and callers pass the viewer's local date.
- `tags.ts` — trims, drops blanks, removes case-insensitive duplicates
  and, when a typed tag matches an existing one ignoring case, reuses the
  existing spelling. At most 20 tags of 40 characters each.
- `contact-schema.ts` — the zod schemas for create, edit and convert,
  replacing `components/admin/contact-edit-form-schema.ts`. Rules: name
  required; email or phone required; email must be a valid address when
  present; when Other is ticked, the Other text is required (up to 500
  characters) and otherwise it is cleared; each extra email is a valid
  address and each extra number is non-blank; contract end is not before
  contract start.
- `documents.ts` — allowed types and the size limit.

## Main Contacts page

`app/admin/(dashboard)/crm/page.tsx` stays a Server Component that loads
all contacts in one query (now including the new columns) and hands them
to a client view. Access is unchanged: any logged-in staff member.

- **Tabs** B2C and B2B, each showing its count. The active tab is the
  `?type=` search param (default `b2c`) so a refresh or shared link keeps
  it. Switching tabs clears the row selection and the stage filter.
- **Stage chips** in pipeline order, preceded by All, each with the number
  of contacts of that type in that stage. Clicking one filters the table;
  clicking All clears it. Counts ignore the search box and tag filter.
- **Search** over name, email, phone, tags and representative, and a tag
  select listing the tags in use.
- **Columns** — B2C: name, email / phone, stage, services, tags, created.
  B2B: company, representative, stage, contract end, tags, created. The
  contract end cell uses yellow for `warning`, red for `danger`, and red
  with the word "Expired" for `expired`.
- **Bulk select** and **Message Selected** behave as today. The compose
  dialog warns how many selected contacts have no email, as it already
  does for missing phone numbers.
- **Add contact** button, shown to staff with `can_edit_crm`. The dialog
  asks for type (preset from the active tab), name or company name, email,
  phone and tags, plus representative name and position for B2B. On
  success it opens the new contact's page, where the remaining fields are
  filled in.
- The mobile card layout is kept, with the stage chip and, for B2B, the
  contract end date.
- Each tab has its own empty state.

`components/admin/crm-table.tsx` is split: `crm-contacts-view.tsx` owns
tabs, chips, search and selection; `crm-table.tsx` keeps the table and
cards and takes its columns from the active type.

## Contact page

`app/admin/(dashboard)/crm/[id]/page.tsx` additionally loads the contact's
documents, the tags in use and, when the viewer has `can_manage_quotes`,
the quotes linked to the contact and the quotes linked to nobody.

`crm-detail.tsx` has grown past one responsibility, so it becomes a thin
layout over focused components in `components/admin/`:

| Component | Shown for | Does |
|-----------|-----------|------|
| `contact-stage-chip.tsx` | both | The coloured chip, used on both pages |
| header in `crm-detail.tsx` | both | Name, type chip, stage select for that type's pipeline (chip only without edit rights), Message, Convert |
| `contact-edit-form.tsx` | both | One type-aware form in the existing dialog: name, email (now editable), phone, tags; then services for B2C, or representative, extra emails and numbers, and contract dates for B2B |
| `contact-tag-picker.tsx` | both | Multi-select combobox over existing tags with "Create …" for a new one |
| `contact-convert-dialog.tsx` | both | Confirms the switch and asks for the stage in the new pipeline, default New |
| `contact-quotes-card.tsx` | B2C, viewers with `can_manage_quotes` | Lists linked quotes (number, title, price, last updated), each opening the quote. "New quote" goes to `/admin/quotes/new?contactId=…`, which presets the contact and customer name. "Link existing" picks from unlinked quotes. Each row has "Unlink". |
| `contact-b2b-card.tsx` | B2B | Representative, extra emails and numbers, contract start and end with the coloured end date |
| `contact-documents-card.tsx` | B2B | Lists documents (name, size, uploader, date). Upload and delete need `can_edit_crm`; opening does not. |
| transaction history card | B2B | Heading and "Transaction history will appear here." Nothing else. |

Services availed shows on the B2C contact info card as chips, with the
Other text beneath when present. The activity timeline, opt-out switch and
message dialog are unchanged apart from handling a contact with no email.

Other screens that list contacts as `name (email)` — the quote form and
the vouchers page — fall back to the phone number when there is no email.

## Error handling

- Every action returns the existing `ActionResult` shape and the UI shows
  failures as toasts, as today.
- Duplicate email on create or edit: a specific message and a link to the
  existing contact, not the generic error.
- Stage, type and contract-date rules are enforced twice, in zod and in
  the database, so a stale tab or a direct API call cannot store an
  invalid combination.
- Upload failures (wrong type, too large, PUT failed, confirm failed)
  each show their own message and leave the document list unchanged.
- The optimistic stage select rolls back on failure, as the status select
  does today.

## Verification

The repo checks behaviour with `verify:*` scripts rather than a test
runner, so this follows suit:

- `verify:contact-helpers` (pure, no database) — stage membership per
  type and chip coverage for every stage; `contractEndTone` at each
  boundary (3 months and a day, exactly 3 months, exactly 1 month, the end
  date itself, the day after); tag normalisation; the contact schema's
  email-or-phone, Other-text, extra-contact and contract-date rules.
- `verify:contacts-rls` (local Supabase stack only, guarded like
  `verify:partners-rls`) — the database rejects a stage from the wrong
  pipeline, a contact with neither email nor phone, and a contract ending
  before it starts; the `status` / `stage` trigger syncs in both
  directions for both types; `record_inquiry()` still creates a `b2c` /
  `new` contact; an anonymous client reads no `contact_documents`; a
  staff session without `can_edit_crm` can read them but cannot insert or
  delete.
- Manual pass on a dev server pointed at the local stack: both tabs, chip
  filters and counts, add, edit, convert both ways, bulk message with a
  phone-only contact selected, quote link / unlink / new-quote preset,
  document upload, open and delete, and opening a document URL while
  logged out.
- `npm run lint` and `npm run build`.

`types/database.ts` is regenerated after the migration.

Per `AGENTS.md`, the relevant guides in `node_modules/next/dist/docs/` are
read before writing the Route Handler, the search-param handling and the
Server Actions.

## Rollout

1. User creates the private bucket, env var and CORS rule.
2. Merge to `staging`: the migration runs against the shared database.
   Production keeps working on the old `status` column.
3. Verify on staging, then merge to `master`.
4. Follow-up migration (separate change) drops `status`, its constraint
   and the sync trigger.
