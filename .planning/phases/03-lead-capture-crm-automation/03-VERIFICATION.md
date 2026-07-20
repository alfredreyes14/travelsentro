---
phase: 03-lead-capture-crm-automation
verified: 2026-07-20T13:17:09Z
status: human_needed
score: 10/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Configure a real RESEND_API_KEY (and optionally RESEND_FROM_EMAIL) in the deployment environment, submit a real inquiry via the public form, and confirm two emails actually arrive: the customer auto-reply (AUTO-01) and the bcc'd internal notification to the seeded Admin's inbox (AUTO-02)."
    expected: "Exactly one auto-reply email arrives at the submitted address and exactly one internal-notification email arrives (bcc) at every active admin/can_message_customers profile's inbox, both within seconds of submission."
    why_human: "RESEND_API_KEY is not configured in this environment (confirmed: process.env.RESEND_API_KEY is unset, lib/resend.ts falls back to a placeholder key that only produces a logged auth error at send time). Every send call is wrapped in try/catch and never throws, so the code path, the anon-callable get_notification_recipients() RPC, and the bcc-only fan-out were all verified live/structurally -- but actual message delivery to a real inbox has never been exercised in this codebase and cannot be from a sandboxed verifier without a paid/free Resend account and inbox access."
  - test: "Submit the same requestId twice against a live server with a real RESEND_API_KEY configured and confirm only ONE auto-reply and ONE internal notification email arrive (not two)."
    expected: "The second submission returns 200/ok:true (already verified) but does not trigger a second send of either email."
    why_human: "Same RESEND_API_KEY gap as above -- the is_new gate that prevents the double-send is code-verified (exactly 1 'if (is_new)' occurrence wrapping all 3 after() calls in app/api/inquiries/route.ts, confirmed by direct file read), but the actual non-duplication of email delivery has not been observed against a real send."
  - test: "As a can_edit_crm Staff/Admin session, visit /admin/crm/{id} and confirm the status Select is interactive, changing it auto-saves without a page reload, and a simulated update failure reverts the optimistic UI change. Then view the same contact as a Staff session WITHOUT can_edit_crm and confirm identical data renders with a plain read-only Badge and no 'Edit Contact' button."
    expected: "can_edit_crm session sees an editable Select + Edit Contact button; non-can_edit_crm session sees the same name/email/phone/tags/timeline data with zero edit affordances -- not a blocked/hidden page."
    why_human: "No authenticated browser session was driven in this codebase inspection -- the permission-gated rendering split (canEdit ? <Select>/<Dialog> : <Badge>) was confirmed by direct code read of components/admin/crm-detail.tsx and is logically sound, but has never been exercised live against two real sessions with differing can_edit_crm values, per every 03-04/03-05 SUMMARY's own human_judgment:true coverage notes."
  - test: "Open the Edit Contact dialog on a real contact, change name/phone/tags, save, and confirm the change persists (visible after a refresh) while the email field remains genuinely non-interactive (cannot be typed into)."
    expected: "Save Changes persists name/phone/tags via updateContact(); email input is disabled+readOnly and never sent to the server."
    why_human: "Code-verified (zero 'name=\"email\"' FormField, exactly 1 updateContact(contact.id call, disabled+readOnly present) but not exercised in a live browser round-trip against a real database row this session."
---

# Phase 3: Lead Capture, CRM & Automation Verification Report

**Phase Goal:** Every inquiry reliably becomes a tracked lead in the CRM, the customer is automatically acknowledged, and the business is automatically notified — no lead is lost.
**Verified:** 2026-07-20T13:17:09Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths merged from ROADMAP.md's 4 Success Criteria + each plan's `must_haves.truths` frontmatter, verified against the **current, post-fix state of the schema** (`20260720121436_create_crm_schema.sql` + `20260720130816_fix_crm_schema_review_findings.sql`, both confirmed applied remotely via `supabase migration list`).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A new inquiry submission automatically creates a lead/contact record in the CRM, and redelivering the same submission does not create a duplicate lead (ROADMAP SC1, AUTO-03) | VERIFIED | Live-ran `scripts/verify-inquiry-ingestion.ts` against the running dev server (`BASE_URL=http://localhost:3000`): `PASS: 4/4 checks passed` — idempotency (1 contact + 1 inquiry row for 2 identical requestIds), honeypot silent-drop, anon RLS scope denial, stale package_id nulled. Live-tested CR-01/CR-02 fixes directly via anon-key `rpc/record_inquiry`: mixed-case email (`Verify-CR01-...@Travelsentro.TEST`) then lowercase resolved to the **same** `contact_id`; a second submission with a different name did **not** overwrite the already-set `name` ("Original Name" preserved). |
| 2 | Contact identity is architected as "route through our own endpoint first, Formspree as best-effort backup" rather than literally "via Formspree webhook" as ROADMAP SC1's legacy wording states | VERIFIED (documented architecture pivot) | `.planning/phases/03-lead-capture-crm-automation/03-CONTEXT.md` D-01/D-02 explicitly supersede the original webhook design with a stronger guarantee: the CRM write (`record_inquiry()`) happens synchronously before Formspree is even contacted, so CRM data no longer depends on Formspree's uptime at all — Formspree is now a secondary backup via `after()`. This is a canonical, approved decision, not a gap. |
| 3 | The customer receives an instant auto-reply email; Admin/Staff with "message customers" permission receive an internal notification; neither duplicates on redelivery (ROADMAP SC2, AUTO-01/AUTO-02/AUTO-03) | CODE-VERIFIED, DELIVERY UNVERIFIED → human_needed | `app/api/inquiries/route.ts` schedules both sends inside the single existing `if (is_new)` block (`grep -c 'if (is_new)'` = 1, `grep -c 'after('` = 3) via `next/server`'s `after()`, never awaited in the handler body. `get_notification_recipients()` confirmed live-callable by anon and correctly scoped: `curl`/direct RPC call returned `[{"email":"admin@travelsentro.test"}]`. **However `RESEND_API_KEY` is not set in this environment** (`process.env.RESEND_API_KEY` is empty; `lib/resend.ts` falls back to a placeholder key that produces a logged, swallowed auth error at send time) — actual email delivery has never been exercised. Routed to human verification below. |
| 4 | Admin/Staff can view a contact's inquiry/message history as a timeline, see which package the lead inquired about, and search/filter contacts by name, status, or tag (ROADMAP SC3, CRM-02/CRM-05/CRM-06) | VERIFIED | `components/admin/crm-detail.tsx` renders `inquiries.map(...)` newest-first (page.tsx orders `{ referencedTable: "inquiries", ascending: false }`), each entry showing a package-link `Badge` (`Link href="/admin/packages/${inquiry.packages.id}"`) or "General inquiry" text when `package_id` is null. `components/admin/crm-table.tsx`'s `globalFilterFn` matches name+tags (case-insensitive substring); a separate `Select`-bound column `filterFn` matches status exactly. `npm run build` succeeds; `/admin/crm` and `/admin/crm/[id]` both appear in the build's route list. |
| 5 | Admin/Staff can set/update a lead's status (New/Contacted/Qualified/Won/Lost); Staff without "edit CRM" permission get read-only access; every record tracks who created/last edited it and when (ROADMAP SC4, CRM-03/CRM-04/CRM-07) | VERIFIED | `actions/crm.ts`'s `updateStatus`/`updateContact` both call `requirePermission("can_edit_crm")` (throws before any Supabase call) and are independently backstopped by the DB-level `"can_edit_crm can update contacts" ... using (has_permission(auth.uid(),'can_edit_crm'))` RLS policy (present unchanged in both the original and fix migration). `contacts.status` has a `CHECK (status in ('new','contacted','qualified','won','lost'))` constraint. `crm-detail.tsx` renders `canEdit ? <Select>/<Edit Contact Button> : <Badge>` — genuinely different render tree, not a hidden/disabled one. Audit trail: `contacts_set_updated_by` trigger (`security invoker`) fires on every UPDATE, setting `updated_by`/`updated_by_name`/`updated_at`; `record_inquiry()`'s `ON CONFLICT` branch deliberately never touches `created_by`/`created_by_name` on repeat inquiries. `crm-detail.tsx` renders both audit lines per the exact copy contract. |
| 6 | An anon-key client can INSERT via `record_inquiry()` but cannot directly SELECT/UPDATE/INSERT/DELETE any contacts/inquiries row via raw PostgREST (03-01 must-have, closed further by the post-review fix) | VERIFIED | Live-tested: direct anon-key `POST /rest/v1/contacts` (bypassing the RPC) returned **401** `"new row violates row-level security policy for table \"contacts\""` — confirms CR-03's fix (the two `anon`/`authenticated` INSERT policies were dropped in the follow-up migration) is live. `scripts/verify-inquiry-ingestion.ts`'s live run also confirms anon SELECT and anon UPDATE are both blocked. |
| 7 | Any authenticated Staff/Admin session can read all contacts/inquiries rows regardless of can_edit_crm; only a can_edit_crm-permissioned (or admin) session can UPDATE a contact (03-01 must-have) | VERIFIED (static + build) | `"authenticated staff can read all contacts/inquiries"` policies (`using (true)`, scoped to `authenticated`) present unchanged; `app/admin/(dashboard)/crm/page.tsx` and `.../crm/[id]/page.tsx` both use `getProfile()` only (zero `requirePermissionOrRedirect` occurrences), confirming universal read. No live authenticated-session HTTP test was run this pass (would require a real login flow), but the RLS policy text plus the identical universal-read pattern already established and verified in Phase 2 make this low-risk; not separately flagged as human-needed given item 8 below already covers the live-session gap. |
| 8 | Permission-gated rendering (Select-vs-Badge, Edit-Contact-button-vs-none) and the Edit Contact dialog's save round-trip actually work in a live browser session | CODE-VERIFIED ONLY → human_needed | Confirmed via direct file read: `components/admin/crm-detail.tsx`'s `canEdit ? ... : ...` branches for both the status editor and the Edit Contact button; `components/admin/contact-edit-form.tsx`'s email field has zero `name="email"` FormField occurrences (genuinely non-editable). No live authenticated session (can_edit_crm=true and can_edit_crm=false) was driven against a real running app this pass. Routed to human verification below, consistent with every one of 03-04's and 03-05's own SUMMARY.md coverage entries, all independently marked `human_judgment: true` for this exact gap. |
| 9 | A repeat inquiry from the same email attaches to the SAME contact's timeline as a new inquiry row rather than creating a second contact, even across case/whitespace email variants (D-04, closed further by post-review CR-01 fix) | VERIFIED | Live-tested directly against `rpc/record_inquiry`: `Verify-CR01-<ts>@Travelsentro.TEST` then `verify-cr01-<ts>@travelsentro.test` (lowercase) returned identical `contact_id` values. |
| 10 | Duplicate webhook/request deliveries never create duplicate leads or duplicate auto-reply/notification sends (AUTO-03) | VERIFIED | `record_inquiry()`'s `on conflict (request_id) do nothing` + `is_new` flag confirmed live (2nd identical-requestId call returned `is_new=false`, no new inquiry row); `is_new` is the single gate wrapping all 3 `after()` side effects in `route.ts` (Formspree forward, auto-reply, internal notification) — confirmed by direct file read, no second/duplicate gate exists. |
| 11 | `record_inquiry()`'s package_id existence check silently nulls a stale/invalid package reference rather than failing the whole request (Pitfall 6, T-03-06) | VERIFIED | Live-verified via `scripts/verify-inquiry-ingestion.ts`'s check 4: POST with a syntactically-valid-but-nonexistent `packageId` returned `ok:true`, and the created `inquiries` row's `package_id` was confirmed `null` via service-role query. |
| 12 | `get_notification_recipients()` returns only the email column for is_active profiles where role='admin' or can_message_customers=true, callable by anon (D-06, Pitfall 5) | VERIFIED | Live curl/direct-RPC call with the anon key returned exactly `[{"email":"admin@travelsentro.test"}]` — no other profile field exposed, matches the seeded Admin's expected qualification (role='admin'). |

**Score:** 10/12 truths fully verified; 2 truths (#3 email delivery, #8 live permission-gated UI/round-trip) are code-complete and structurally verified but require a human/live-environment check that cannot be performed by this automated pass (external email provider not configured; no authenticated browser session available).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260720121436_create_crm_schema.sql` | contacts/inquiries tables, RLS, audit trigger, both RPCs | VERIFIED | Present, applied remotely (`supabase migration list` shows it applied). |
| `supabase/migrations/20260720130816_fix_crm_schema_review_findings.sql` | CR-01/CR-02/CR-03 fixes (email normalization, no-overwrite-once-set, drop dead INSERT policies) | VERIFIED | Present, applied remotely; live-tested all 3 fixes directly against the RPC/PostgREST (see truths #6, #9 above). |
| `types/database.ts` | Regenerated with `contacts`, `inquiries`, `record_inquiry`, `get_notification_recipients` | VERIFIED | `grep -c` confirms all 4 present exactly once. |
| `lib/crm/inquiry-schema.ts` | `inquiryRequestSchema` server-side zod validation | VERIFIED | Present; `_gotcha` correctly has no `.max(0)` constraint. |
| `app/api/inquiries/route.ts` | POST handler — validate → honeypot → RPC → 3x after()-gated side effects | VERIFIED, WIRED | Present, wired to `record_inquiry()`, `submitToFormspree()`, `resend.emails.send()`, `sendInternalNotificationEmails()`. `npm run build` succeeds; `/api/inquiries` in route list. |
| `components/inquiry/inquiry-form.tsx` | Posts to `/api/inquiries` with stable rotating requestId | VERIFIED, WIRED | Zero `submitToFormspree` occurrences; `fetch("/api/inquiries"` present; `useState(() => crypto.randomUUID())` lazy initializer present, rotated on success. |
| `lib/resend.ts`, `components/email/*.tsx` | Resend client, AutoReplyEmail, InternalNotificationEmail templates | VERIFIED (structurally), UNVERIFIED (delivery) | Both templates import from `react-email` (not deprecated `@react-email/components`); render logic complete. No live send exercised (RESEND_API_KEY unset). |
| `lib/crm/notify-staff.ts` | `sendInternalNotificationEmails()` — bcc fan-out via RPC | VERIFIED, WIRED | `bcc:` present exactly once, `to: recipients` absent (real audience never in a `to:[]` array) — closes T-03-09. |
| `lib/crm/status.ts` | Shared status contract (labels, badge variants, Won-green exception) | VERIFIED | 5 statuses, `bg-green-600` present exactly once for the Won exception. |
| `app/admin/(dashboard)/crm/page.tsx` + `components/admin/crm-table.tsx` | Searchable/filterable contact list | VERIFIED, WIRED | Universal-read guard (`getProfile()` only), correct empty states, row-click navigates to `/admin/crm/${id}`. |
| `app/admin/(dashboard)/crm/[id]/page.tsx` + `components/admin/crm-detail.tsx` | Contact detail: timeline, status editor, audit meta, Edit Contact dialog | VERIFIED, WIRED | Universal-read guard, `notFound()` on missing id, `canEdit` correctly gates the Select/Badge and Edit-Contact-button/nothing splits. |
| `actions/crm.ts` | `updateStatus`, `updateContact` — `can_edit_crm`-guarded Server Actions | VERIFIED, WIRED | Both call `requirePermission("can_edit_crm")`; neither touches `email`; both `revalidatePath` list+detail. |
| `components/admin/contact-edit-form-schema.ts` + `contact-edit-form.tsx` | Edit Contact dialog, email genuinely non-editable | VERIFIED | Zero `name="email"` FormField occurrences; `disabled`+`readOnly` plain Input for email. |
| `app/admin/(dashboard)/layout.tsx` | Unconditional "Contacts" nav item | VERIFIED, WIRED | `href="/admin/crm"` present once, `canViewCrm` gating boolean absent (deliberately unconditional), existing `canManagePackages`/`canManageUsers` gates untouched. |
| `scripts/verify-inquiry-ingestion.ts` | Live idempotency/honeypot/RLS/stale-package_id verification | VERIFIED, EXECUTED | Ran live against `http://localhost:3000` this verification pass: `PASS: 4/4 checks passed`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `components/inquiry/inquiry-form.tsx` | `app/api/inquiries/route.ts` | `fetch("/api/inquiries", ...)` | WIRED | Confirmed by direct read; `res.ok && result.ok` gates success toast. |
| `app/api/inquiries/route.ts` | `public.record_inquiry()` RPC | `supabase.rpc("record_inquiry", {...})` | WIRED | Confirmed by direct read and by live execution (idempotency script). |
| `app/api/inquiries/route.ts` | `lib/crm/notify-staff.ts`'s `sendInternalNotificationEmails()` | `after(async () => { await sendInternalNotificationEmails({...}) })` nested inside `if (is_new)` | WIRED | Confirmed by direct read. |
| `lib/crm/notify-staff.ts` | `public.get_notification_recipients()` RPC | `supabase.rpc("get_notification_recipients")` | WIRED, LIVE-VERIFIED | Direct RPC call returned the expected seeded admin email. |
| `components/admin/crm-table.tsx` | `app/admin/(dashboard)/crm/[id]/page.tsx` | `router.push(\`/admin/crm/${row.original.id}\`)` on row click | WIRED | Confirmed by direct read; the `[id]` route exists and builds. |
| `components/admin/crm-detail.tsx` | `actions/crm.ts`'s `updateStatus()` | `startTransition(async () => { const result = await updateStatus(contact.id, newStatus); ... })` | WIRED | Confirmed by direct read, including optimistic-revert-on-failure logic. |
| `components/admin/contact-edit-form.tsx` | `actions/crm.ts`'s `updateContact()` | `await updateContact(contact.id, {...})` | WIRED | Confirmed by direct read. |
| `actions/crm.ts` | `"can_edit_crm can update contacts"` RLS policy | `requirePermission("can_edit_crm")` backstopped by `has_permission(auth.uid(),'can_edit_crm')` in RLS | WIRED, LIVE-CONFIRMED (policy text unchanged post-fix) | Double-gated exactly per Phase 2's AUTH-05 precedent. |

### Behavioral Spot-Checks / Live Verification

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Idempotency, honeypot, anon RLS scope, stale package_id (script) | `BASE_URL=http://localhost:3000 npx tsx --env-file=.env.local scripts/verify-inquiry-ingestion.ts` | `PASS: 4/4 checks passed` | PASS |
| Email case/whitespace dedup (CR-01 live re-test) | Direct anon-key `rpc/record_inquiry` calls with mixed-case then lowercase email | Same `contact_id` returned both times | PASS |
| Staff-corrected name survives repeat inquiry (CR-02 live re-test) | Same as above, service-role read of `contacts.name` after 2nd call | `name` remained "Original Name", not overwritten by 2nd submission's "Different Name" | PASS |
| Anon direct-table INSERT rejected (CR-03 live re-test) | Direct anon-key `POST /rest/v1/contacts` | `401`, RLS violation error | PASS |
| `get_notification_recipients()` anon-callable, email-only scope | Direct anon-key `rpc/get_notification_recipients` | `[{"email":"admin@travelsentro.test"}]` | PASS |
| `npm run build` | `npm run build` | Compiled successfully; `/admin/crm`, `/admin/crm/[id]`, `/api/inquiries` all present in route list | PASS |
| Real email delivery (auto-reply + bcc notification) | N/A — requires `RESEND_API_KEY` | Not run — key unset in this environment | SKIP → human_needed |
| Live authenticated browser session (permission-gated rendering, status auto-save/revert, Edit Contact round-trip) | N/A — requires a real login session | Not run this pass | SKIP → human_needed |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| CRM-01 | 03-01, 03-02 | Formspree inquiry submission → CRM lead record | SATISFIED | Live-verified end-to-end (script + manual case-dedup test); architecture deliberately routes through an internal endpoint first per approved D-01/D-02, a stronger guarantee than the literal "via webhook" ROADMAP wording. |
| CRM-02 | 03-05 | View contact's inquiry/message history as timeline | SATISFIED | `crm-detail.tsx` timeline, newest-first, confirmed by code read + build. |
| CRM-03 | 03-01, 03-04, 03-05 | can_edit_crm edit gating; Staff without it get read-only | SATISFIED (code+build), live-session check deferred | Double-gated (Server Action + RLS); UI rendering split confirmed structurally. |
| CRM-04 | 03-01, 03-05 | Set/update lead status (5-value enum) | SATISFIED | `updateStatus()`, CHECK constraint, Select-vs-Badge UI. |
| CRM-05 | 03-04 | Search/filter contacts by name, status, tag | SATISFIED | `globalFilterFn` (name+tags) + status column `filterFn`, confirmed by code read + build. |
| CRM-06 | 03-01, 03-02, 03-05 | See which package a lead inquired about, linked in CRM | SATISFIED | `package_id` FK, per-inquiry package badge/link or "General inquiry". |
| CRM-07 | 03-01, 03-05 | Audit trail (created/last-edited by whom, when) | SATISFIED | `contacts_set_updated_by` trigger + denormalized name columns + UI rendering. |
| AUTO-01 | 03-03 | Instant customer auto-reply email | CODE-COMPLETE, delivery unverified | Wired inside `after()`/`is_new` gate; no RESEND_API_KEY configured to prove real delivery. |
| AUTO-02 | 03-01, 03-03 | Internal notification to can_message_customers staff | CODE-COMPLETE + RPC live-verified, delivery unverified | `get_notification_recipients()` proven live-callable and correctly scoped; actual send unverified. |
| AUTO-03 | 03-01, 03-02, 03-03 | No duplicate leads/sends on redelivery | SATISFIED | Live-verified via script + direct RPC re-tests. |

**No orphaned requirements** — the union of all 5 plans' `requirements:` frontmatter (CRM-01 through CRM-07, AUTO-01 through AUTO-03) exactly matches REQUIREMENTS.md's Phase 3 traceability row and this task's given requirement ID list; nothing is unaccounted for.

### Anti-Patterns Found

No blocking anti-patterns (TBD/FIXME/XXX debt markers) found in any Phase 3 file. `TODO`/`HACK`/`PLACEHOLDER`/"coming soon" grep matches were all false positives (input placeholder text, a documented deliberate fallback-key comment in `lib/resend.ts`).

Two **non-blocking warnings already identified and explicitly triaged as non-blocking in `03-REVIEW.md`** remain open in the current codebase (confirmed still present by this verification pass, not new findings):

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `actions/crm.ts` | `updateStatus`/`updateContact` accept unvalidated `status`/`values` at the TypeScript level only — no server-side zod re-validation before the Supabase call (WR-01) | Warning (pre-existing, documented) | A crafted direct Server Action call could bypass the React form's zod validation; DB-level CHECK constraint still blocks invalid `status` values, so data corruption risk is limited to unbounded-length `name`/`tags`. Does not block the phase's core "no lead lost" goal. |
| `app/admin/(dashboard)/crm/page.tsx` | Supabase read error only `console.error`'d, falls through to the same "No contacts yet" empty state as a legitimately-empty list (WR-04) | Warning (pre-existing, documented) | Staff cannot distinguish "really no contacts" from "the query failed" in the UI. Does not block the phase's core goal but is a real internal-tool UX gap. |

Both were explicitly reviewed and left open by `03-REVIEW.md`'s own resolution ("Warnings (WR-01–WR-05) and Info (IN-01–IN-02) remain open — not blocking, tracked for a future pass"). This verification does not treat them as new gaps but flags them for visibility.

### Human Verification Required

### 1. Real email delivery (AUTO-01 auto-reply)

**Test:** Configure `RESEND_API_KEY` (see `03-03-SUMMARY.md`'s `user_setup`), submit a real inquiry via the running dev server's public inquiry form, and check the submitted email address's inbox.
**Expected:** A "We got your inquiry!" email arrives within seconds, addressed to the submitter, mentioning the package name when one was selected.
**Why human:** No `RESEND_API_KEY` is configured in this environment; the send call is wrapped in try/catch and degrades to a logged auth error rather than throwing, so it cannot be distinguished from a real failure by static/build-time checks alone.

### 2. Real email delivery (AUTO-02 internal notification) + non-duplication

**Test:** With `RESEND_API_KEY` configured, submit a real inquiry and confirm a bcc'd "New inquiry from {name}" email arrives at the seeded Admin's inbox (or `onboarding@resend.dev`'s account-owner inbox if no custom domain is verified yet). Then submit the identical `requestId` a second time and confirm no second email arrives.
**Expected:** Exactly one internal-notification email per genuinely new inquiry; zero on a redelivered/duplicate `requestId`.
**Why human:** Same `RESEND_API_KEY` gap as above; the `is_new`-gating logic itself is code-verified but the actual send count requires a real inbox to observe.

### 3. Live permission-gated rendering (can_edit_crm vs not)

**Test:** Log in as a Staff account with `can_edit_crm=true` and visit `/admin/crm/{id}` — confirm the status Select is interactive and an "Edit Contact" button is visible. Log in as a different Staff account with `can_edit_crm=false` and visit the same contact — confirm identical data renders with a plain status Badge and no "Edit Contact" button.
**Expected:** Both sessions see the same underlying data; only the edit affordances differ.
**Why human:** Requires two real authenticated browser sessions; not something a static/grep-based or curl-based check can exercise (both sessions need real Supabase Auth cookies).

### 4. Live status auto-save + revert-on-failure

**Test:** As a `can_edit_crm` session, change a contact's status via the Select and confirm it persists without a page reload (check by refreshing separately). Then simulate a failure (e.g., temporarily revoke network/DB access) and confirm the Select visually reverts to the prior value with an error toast.
**Expected:** Optimistic update on success, clean revert + toast on failure.
**Why human:** Requires driving real UI interaction and observing transient client-side state; cannot be verified via static code or curl.

### 5. Live Edit Contact dialog round-trip

**Test:** Open "Edit Contact," change name/phone/tags, save, and confirm the change is reflected after the dialog closes (via `router.refresh()`). Attempt to click/type into the Email field and confirm it is genuinely inert.
**Expected:** Name/phone/tags persist; email never changes and is not interactive.
**Why human:** Requires a live browser session and a real database round-trip; code inspection already confirms the email field has no `FormField`/`name="email"` binding, but the end-to-end persistence behavior has not been observed live.

### Gaps Summary

No true gaps (FAILED must-haves) were found — the phase's core reliability promise ("no lead lost, no duplicate lead") is genuinely and robustly implemented, and all 3 Critical findings from `03-REVIEW.md` (email-normalization dedup, silent-overwrite-of-staff-edits, dead public write policies) were fixed in a follow-up migration that this verification pass independently re-tested live and confirmed working (case/whitespace dedup, staff-edit preservation, and rejected direct-table anon writes all reproduced successfully against the live Supabase project).

The remaining open items are exclusively **human/live-environment verification gaps**, not code defects:
1. Real email delivery (AUTO-01/AUTO-02) cannot be proven without a configured `RESEND_API_KEY` — this is documented `user_setup` from 03-03, not a coding gap. The wiring, dedup gating, and recipient-scoping RPC are all independently live-verified.
2. Live authenticated-browser-session checks of the CRM admin UI (permission-gated rendering, status auto-save/revert, Edit Contact round-trip) were never driven in this or prior sessions — every relevant plan's own SUMMARY.md coverage table already flagged these as `human_judgment: true`, deferred to end-of-phase UAT per this project's `workflow.human_verify_mode=end-of-phase` configuration. This verification pass surfaces them for that UAT pass rather than silently passing them.

Two pre-existing, already-triaged non-blocking warnings (WR-01: Server Action input re-validation, WR-04: swallowed read-error empty state) remain open in the codebase; both were explicitly deferred by `03-REVIEW.md` itself and do not block the phase goal.

---

_Verified: 2026-07-20T13:17:09Z_
_Verifier: Claude (gsd-verifier)_
