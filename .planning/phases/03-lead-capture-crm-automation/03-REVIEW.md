---
phase: 03-lead-capture-crm-automation
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - actions/crm.ts
  - app/(public)/packages/[slug]/page.tsx
  - app/admin/(dashboard)/crm/[id]/loading.tsx
  - app/admin/(dashboard)/crm/[id]/page.tsx
  - app/admin/(dashboard)/crm/loading.tsx
  - app/admin/(dashboard)/crm/page.tsx
  - app/admin/(dashboard)/layout.tsx
  - app/api/inquiries/route.ts
  - components/admin/contact-edit-form-schema.ts
  - components/admin/contact-edit-form.tsx
  - components/admin/crm-detail.tsx
  - components/admin/crm-table.tsx
  - components/email/auto-reply-email.tsx
  - components/email/internal-notification-email.tsx
  - components/inquiry/inquiry-form.tsx
  - lib/crm/inquiry-schema.ts
  - lib/crm/notify-staff.ts
  - lib/crm/status.ts
  - lib/resend.ts
  - scripts/verify-inquiry-ingestion.ts
  - supabase/migrations/20260720121436_create_crm_schema.sql
  - types/database.ts
findings:
  critical: 3
  warning: 5
  info: 2
  total: 10
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Reviewed the lead-capture/CRM automation phase: the public inquiry form and its
Route Handler, the `record_inquiry`/`get_notification_recipients` SQL
migration, the admin CRM list/detail pages, contact edit/status Server
Actions, and the auto-reply/internal-notification email templates.

The happy-path flow (submit inquiry → `record_inquiry()` → conditional
auto-reply/internal-notification/Formspree forward on `is_new`) is
well-structured and the idempotency/honeypot mechanics work as documented.
However, three defects in the database layer undermine the CRM's core
promise ("no lead is lost" / one record per customer) and its stated
security model:

1. `contacts.email` is never case/whitespace-normalized before the
   `on conflict (email)` dedup, so the same person can end up as two
   separate contact records.
2. Every repeat inquiry silently overwrites a staff-corrected `name`/`phone`
   on the `contacts` row, and the UI's own "last updated by" attribution
   logic hides that this happened when the overwrite came from an anonymous
   submitter.
3. The `anon`/`authenticated` `INSERT` RLS policies on `contacts` and
   `inquiries` are wide open (`with check (true)`) and are not actually
   needed by the application (the only write path, `record_inquiry()`, is
   `SECURITY DEFINER` and bypasses RLS already) — they exist purely as an
   unauthenticated bypass of the Route Handler's honeypot/rate-limit/Zod
   validation via direct PostgREST calls.

Several additional warnings cover missing server-side validation on the
`updateContact`/`updateStatus` Server Actions, absence of any rate limiting
on the public inquiry endpoint (relevant given this project's documented
100/day Resend cap), an unverified client-supplied `packageName` reaching
outbound emails, and a swallowed Supabase read error in the admin contacts
list that renders a misleading empty state.

## Critical Issues

### CR-01: Contact email is never normalized before dedup, breaking the "one contact per person" invariant

**File:** `supabase/migrations/20260720121436_create_crm_schema.sql:104-153` (also `lib/crm/inquiry-schema.ts:9-18`, `app/api/inquiries/route.ts:41-49`)
**Issue:** `contacts.email` has a plain `unique` constraint (case-sensitive,
whitespace-sensitive text comparison), and `record_inquiry()` inserts with
`on conflict (email) do update` using `p_email` exactly as submitted. Neither
`inquiryRequestSchema` (`lib/crm/inquiry-schema.ts`) nor the public
`inquirySchema` (`components/inquiry/inquiry-schema.ts`) lowercases or trims
the email before it reaches the RPC. A customer who submits
`Jane@Gmail.com` on one visit and `jane@gmail.com` (or `jane@gmail.com ` with
trailing whitespace) on another gets **two separate `contacts` rows**, each
with only part of their inquiry history — directly contradicting the
migration's own stated design ("`contacts` — one row per unique email
address") and the product's core value prop ("that inquiry reliably lands in
the business's CRM so no lead is lost").
**Fix:** Normalize the email server-side before it's used as the conflict
key, e.g. in `record_inquiry()`:
```sql
p_email := lower(trim(p_email));
...
insert into contacts (email, name, phone, created_by, created_by_name)
values (p_email, p_name, p_phone, auth.uid(), v_caller_name)
on conflict (email) do update ...
```
or normalize in the Route Handler (`parsed.data.email.trim().toLowerCase()`)
before calling `supabase.rpc("record_inquiry", ...)`. Either way, do it in
exactly one place so all callers get the same identity key.

### CR-02: Repeat inquiries silently overwrite staff-corrected contact `name`/`phone`, with no audit trail for anonymous overwrites

**File:** `supabase/migrations/20260720121436_create_crm_schema.sql:136-144` and `:70-88`; UI symptom in `components/admin/crm-detail.tsx:145-150`
**Issue:** `record_inquiry()`'s `on conflict (email) do update set name =
excluded.name, phone = excluded.phone` means **every** subsequent inquiry
from the same email address overwrites `contacts.name`/`contacts.phone`,
even after staff has manually corrected a typo via `updateContact()`
(CRM-07's contact-edit feature). Because this UPDATE is triggered by an
anonymous (or non-staff) public submitter, `set_updated_by()`'s
`auth.uid()` is `NULL`, so `contacts.updated_by` is set to `NULL` even
though `updated_at` changes. `CrmDetail`'s rendering (`crm-detail.tsx:145`)
only shows the "Last updated by …" line `if (contact.updated_by)` — so the
overwrite happens with **zero visible trace** in the admin UI: staff will
see a corrected name silently revert to the customer's original typo the
next time that customer inquires again, with no indication anything
changed.
**Fix:** Decide the intended precedence explicitly rather than "last
inquiry always wins": e.g. only update `name`/`phone` on conflict when the
existing values are null/empty (`coalesce(contacts.name, excluded.name)`
reversed — i.e. prefer the existing DB value unless it's blank), or always
overwrite but make the change visible (e.g. don't let anon submissions
silently null out `updated_by`; instead track "last inquiry submitted by
customer" separately from "last staff edit"). At minimum, make the
overwrite show up in the CRM UI so staff aren't silently reverted.

### CR-03: Public anon `INSERT` RLS policies on `contacts`/`inquiries` are unnecessary and bypass all app-layer validation

**File:** `supabase/migrations/20260720121436_create_crm_schema.sql:182-186`
**Issue:** The migration grants
`for insert to anon, authenticated with check (true)` on both `contacts`
and `inquiries`. This is not required for the application to function:
`record_inquiry()` is declared `security definer`, so it runs with the
function owner's privileges and bypasses RLS entirely — confirmed by a
codebase-wide search showing no code path anywhere calls
`.from("contacts").insert(...)` or `.from("inquiries").insert(...)`
directly; every write goes through the RPC. Because the Supabase anon key
is public (shipped in the client bundle), these policies give any caller
**direct, unauthenticated PostgREST write access** to both tables that
completely bypasses: the Route Handler's Zod validation (email format,
message length ≤5000, phone length, uuid format for `request_id`), the
honeypot check, and any future rate limiting added to `/api/inquiries`.
An attacker can insert an `inquiries` row with an arbitrary `message` and a
`contact_id` pointing at *any* existing customer's contact (there is no
check binding the caller to "their own" contact), injecting arbitrary
content into a real customer's inquiry history that staff will read in the
CRM.
**Fix:** Drop these two `INSERT` policies entirely (the RPC doesn't need
them) so `contacts`/`inquiries` have no anon/public write surface outside
`record_inquiry()`:
```sql
drop policy "anyone can create a contact via inquiry" on contacts;
drop policy "anyone can create an inquiry" on inquiries;
```
If direct-table inserts are wanted for some other reason, at minimum add
`length()` CHECK constraints mirroring the Zod bounds and restrict
`inquiries.contact_id` to rows the caller is provably associated with.

## Warnings

### WR-01: `updateContact`/`updateStatus` Server Actions have no server-side input validation

**File:** `actions/crm.ts:15-55`
**Issue:** Both Server Actions accept `values`/`status` typed only via
TypeScript (`{ name: string; phone: string | null; tags: string[] }` /
`ContactStatus`) and pass them straight to `supabase.from("contacts").update(...)`.
The actual validation (`contactEditSchema`'s `name.min(1)`, etc.) lives only
in `components/admin/contact-edit-form.tsx` via `zodResolver`. Server
Actions are directly callable (e.g. via a crafted POST to the action's
encoded reference) by any authenticated `can_edit_crm` user bypassing the
React form entirely, letting them write an empty `name`, unbounded-length
strings, or an arbitrarily large `tags` array with no server-side check.
**Fix:** Re-validate with `contactEditSchema` (or an equivalent server
schema) inside `updateContact()`/`updateStatus()` before the Supabase call,
returning `{ ok: false, error }` on failure — the same defense-in-depth
pattern already used for the public `/api/inquiries` route.

### WR-02: No rate limiting on the public `/api/inquiries` endpoint

**File:** `app/api/inquiries/route.ts:23-113`
**Issue:** The only anti-abuse mechanism is the honeypot field. There is no
IP/requestId-based rate limiting. Per this project's own documented
constraint (`CLAUDE.md`), Resend's free tier caps outbound email at
**100/day**; a trivial scripted flood of unique `requestId`s (bypassing the
`AUTO-03` idempotency guard, which only dedupes identical `requestId`s) to
this unauthenticated endpoint will exhaust the daily send quota within
minutes, silently breaking the auto-reply/internal-notification automation
for real customers for the rest of the day, and will also spam the
Formspree forward.
**Fix:** Add basic rate limiting (e.g. IP-based token bucket via Vercel
KV/Upstash, or Vercel's Firewall rate-limiting rules) in front of or inside
this route.

### WR-03: Client-supplied `packageName` is trusted and forwarded into outbound emails/Formspree without server-side verification

**File:** `app/api/inquiries/route.ts:41-109`, `lib/crm/inquiry-schema.ts:16`
**Issue:** `packageId` is checked for existence server-side inside
`record_inquiry()` (and silently nulled if stale/invalid), but
`packageName` is taken verbatim from the request body and used as-is in the
Formspree forward, the customer auto-reply email
(`AutoReplyEmail`'s `packageName` prop), and the internal staff
notification email — with no cross-check that it actually matches the
package referenced by `packageId` (or matches any real package at all when
`packageId` is omitted). A caller can submit `packageId: null,
packageName: "<anything up to 200 chars>"`, which then appears verbatim in
the subject/body of the internal notification staff read, unverified.
**Fix:** When `packageId` is present, look up the canonical package name
server-side (the existence check already queries `packages`) and use that
value instead of trusting the client's `packageName`; when `packageId` is
absent, drop `packageName` entirely rather than passing through freeform
client text as if it were validated package context.

### WR-04: Supabase read errors on the admin contacts list are swallowed and rendered as an empty state

**File:** `app/admin/(dashboard)/crm/page.tsx:20-27`
**Issue:** When `supabase.from("contacts").select(...)` returns an `error`,
the code only `console.error`s it and falls through to
`const items = (contacts ?? []).map(...)`, which renders the "No contacts
yet" empty state (`page.tsx:47-56`) — visually indistinguishable from the
legitimately-empty case. Staff have no way to tell "there really are no
contacts yet" apart from "the contacts query just failed" (e.g. RLS
misconfiguration, DB outage), which is a meaningfully different situation
for an internal CRM tool whose whole purpose is not losing leads.
**Fix:** Render a distinct error state when `error` is set, e.g.:
```tsx
if (error) {
  return <ErrorState message="Couldn't load contacts. Please refresh or contact support." />;
}
```

### WR-05: Contact-edit validation is inconsistent with (looser than) the public inquiry form's validation

**File:** `components/admin/contact-edit-form-schema.ts:10-14`
**Issue:** The public `inquirySchema` requires `phone: z.string().min(7, ...)`,
but `contactEditSchema` declares `phone: z.string().optional()` with no
length/format constraint at all — an admin can save a 1-character phone
number (or, combined with WR-01, bypass this check entirely). `tags` is
similarly unconstrained free text split on `,` with no per-tag length cap.
This isn't necessarily wrong (the code comment explains the "lenient by
design" intent), but it means data quality guarantees established on the
public-facing form silently don't apply once a record is edited by staff.
**Fix:** If leniency is intentional, at least mirror the public form's
minimum phone length so admins don't accidentally save unusably-short phone
numbers; document the asymmetry if it's deliberate.

## Info

### IN-01: Tags containing a literal comma are silently mis-split on re-edit

**File:** `components/admin/contact-edit-form.tsx:41-52`
**Issue:** `ContactEditForm` joins `contact.tags` with `", "` for display
(`contact.tags.join(", ")`) and re-splits the raw text on `,` at submit
time (`values.tags.split(",")`). A tag that itself contains a comma (e.g.
one created by a future bulk-import feature) round-trips into multiple
tags the first time an admin opens and saves the edit dialog, with no
warning.
**Fix:** Either disallow commas in individual tag values at creation time,
or switch the tags editor to a proper multi-value input (e.g. a tag/chip
input) instead of a single comma-separated text field.

### IN-02: Unused columns selected in the contact-detail query

**File:** `app/admin/(dashboard)/crm/[id]/page.tsx:41-48`
**Issue:** The `inquiries(...)` select includes `contact_id` and
`request_id`, but `CrmDetailInquiry` (`components/admin/crm-detail.tsx:59-65`)
and the `detailInquiries` mapping (`page.tsx:70-78`) never reference either
field.
**Fix:** Trim the select list to just the columns actually consumed
(`id, message, created_at, package_id, packages(id, name, slug)`), or add
them to `CrmDetailInquiry` if they're meant to be used soon.

---

_Reviewed: 2026-07-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
