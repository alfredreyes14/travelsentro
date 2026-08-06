---
phase: 03-lead-capture-crm-automation
audited: 2026-07-24
asvs_level: 1
block_on: high
threats_total: 16
threats_closed: 16
threats_open: 0
disposition_summary:
  mitigate: 12
  accept: 4
  transfer: 0
unregistered_flags: 2
status: SECURED
---

# Phase 3 (Lead Capture / CRM Automation) — Security Audit

Retroactive audit (State B: no prior SECURITY.md existed for this phase). Threat
register sourced from `<threat_model>` blocks in 03-01 through 03-05 PLAN.md.
Verified against the **current live schema state** — both
`supabase/migrations/20260720121436_create_crm_schema.sql` (original) and
`supabase/migrations/20260720130816_fix_crm_schema_review_findings.sql`
(post-code-review fix, applied after `03-REVIEW.md` found 3 Critical issues) —
in migration-application order, not just the original migration's text.

## Threat Verification

| Threat ID | Category | Severity | Disposition | Status | Evidence |
|-----------|----------|----------|--------------|--------|----------|
| T-03-01 | Elevation of Privilege | high | mitigate | **CLOSED** | `record_inquiry()` is `security definer`/`set search_path = public` (`20260720121436_create_crm_schema.sql:104-153`, re-`create or replace`d unchanged-signature in `20260720130816_...sql:34-90`); body only touches `contacts`/`inquiries`, a read-only `packages` existence check, a read-only `profiles` name lookup — no dynamic SQL. `grant execute ... to anon, authenticated` present (`:155`). Confirmed via grep: **zero** `for update to anon` / `for delete` policies exist on `contacts` or `inquiries` in either migration file — the only anon-triggerable UPDATE path is the RPC's own narrow email-matched upsert. |
| T-03-02 | Elevation of Privilege | medium | mitigate | **CLOSED** | `get_notification_recipients()` body: `select p.email from profiles p where p.is_active = true and (p.role = 'admin' or p.can_message_customers = true)` (`20260720121436_create_crm_schema.sql:164-173`) — email column only, correctly scoped filter. Unchanged by the fix migration. |
| T-03-03 | Tampering | high | mitigate | **CLOSED (stronger than planned)** | Original migration's anon/authenticated `INSERT ... with check (true)` policies on `contacts`/`inquiries` (`:182-186`) were **dropped live** by the fix migration (`20260720130816_...sql:97-98`, `drop policy "anyone can create a contact via inquiry" on contacts;` / `drop policy "anyone can create an inquiry" on inquiries;`) after `03-REVIEW.md`'s CR-03 finding that they were dead code enabling unauthenticated direct-PostgREST writes bypassing Zod/honeypot. Current live state: **zero** anon/public write policy of any kind on either table — `record_inquiry()` (SECURITY DEFINER, bypasses RLS) is the sole write path, confirmed by full `create policy`/`drop policy` grep across both migrations in order. |
| T-03-04 | Information Disclosure | medium | accept | **CLOSED** | Formally accepted below in Accepted Risks Log. `contacts`/`inquiries` SELECT policy: `for select to authenticated using (true)` (`:190-194`), unchanged by fix migration — matches CRM-03's explicit universal-read requirement. |
| T-03-05 | Denial of Service | medium | mitigate | **CLOSED (partial, as declared)** | Honeypot: `app/api/inquiries/route.ts:37-39` returns fake-success 200 without writing when `_gotcha` is truthy. Length caps: `lib/crm/inquiry-schema.ts:11-16` (`name` max 200, `message` max 5000, `phone` max 30). The mitigation plan itself only ever claimed honeypot + length caps, explicitly deferring full IP rate limiting as a post-launch fast-follow — that deferral is unchanged and is also flagged as `03-REVIEW.md` WR-02 (open, non-blocking, tracked below). |
| T-03-06 | Tampering | medium | mitigate | **CLOSED** | Pitfall-6 existence check preserved verbatim in the fix migration: `if p_package_id is not null and exists (select 1 from packages where id = p_package_id) then v_package_id := p_package_id; else v_package_id := null; end if;` (`20260720130816_...sql:60-68`). |
| T-03-07 | Information Disclosure | low | mitigate | **CLOSED** | `app/api/inquiries/route.ts:51-54`: `if (error || !data?.[0]) { console.error("record_inquiry failed", error); return Response.json({ ok: false }, { status: 500 }); }` — raw error only reaches `console.error`, response body is `{ ok: false }` only. |
| T-03-08 | Repudiation / Tampering | high | mitigate | **CLOSED** | `components/inquiry/inquiry-form.tsx:35`: `const [requestId, setRequestId] = useState(() => crypto.randomUUID());` — lazy initializer, stable across re-renders/double-clicks, rotated only on successful submit (`:61`). DB side: `on conflict (request_id) do nothing` preserved unchanged in both migrations. `route.ts:58-110`: all three `after()` side effects (Formspree, auto-reply, internal notification) nested inside the single `if (is_new)` block. |
| T-03-09 | Information Disclosure | medium | mitigate | **CLOSED** | `lib/crm/notify-staff.ts:38-47`: `resend.emails.send({ ..., to: FROM_EMAIL, bcc: recipients.map((r) => r.email), ... })` — real staff audience is exclusively in `bcc`; `to` is the inert `FROM_EMAIL` placeholder. |
| T-03-10 | Information Disclosure | high | mitigate | **CLOSED** | `lib/resend.ts` reads `process.env.RESEND_API_KEY` (no `NEXT_PUBLIC_` prefix), file has no `"use client"` directive. Grep across the repo for importers of `lib/resend` returns exactly `app/api/inquiries/route.ts` and `lib/crm/notify-staff.ts` (both server-only: Route Handler + a plain server module with no `"use client"` directive) — the key never reaches a client bundle. |
| T-03-11 | Repudiation | high | mitigate | **CLOSED** | `app/api/inquiries/route.ts` contains exactly one `if (is_new)` block; all three `after()` calls (Formspree, auto-reply `resend.emails.send`, `sendInternalNotificationEmails`) are nested inside it — no independent/duplicate dedup gate. |
| T-03-12 | Information Disclosure | low | accept | **CLOSED** | Formally accepted below in Accepted Risks Log. `components/admin/crm-table.tsx`'s `getFilteredRowModel`/`globalFilterFn` operate client-side only over the `contacts` array already fetched server-side under the `authenticated` `using (true)` SELECT policy (T-03-04) — no new data path opened. |
| T-03-13 | Access Control | low | accept | **CLOSED** | Formally accepted below in Accepted Risks Log. `app/admin/(dashboard)/layout.tsx` "Contacts" nav item has no `canViewCrm &&` guard (grep confirms zero `canViewCrm` occurrences) while `canManagePackages`/`canManageUsers` gates on the other two items are untouched — matches CRM-03's explicit universal-read design; write actions remain independently gated via T-03-14. |
| T-03-14 | Elevation of Privilege | high | mitigate | **CLOSED** | `actions/crm.ts`: both `updateStatus()` (`:15-34`) and `updateContact()` (`:36-55`) open with `await requirePermission("can_edit_crm");` (throws `"Forbidden"` before any Supabase call — `lib/auth/dal.ts:54-64`). Independently, `contacts`' UPDATE RLS policy (`20260720121436_...sql:199-202`, untouched by the fix migration) requires `public.has_permission(auth.uid(), 'can_edit_crm')` in both `using` and `with check` — confirmed double-gated at both the Server Action and RLS layers. |
| T-03-15 | Tampering | medium | mitigate | **CLOSED** | `contacts.status` column: `text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost'))` (`20260720121436_...sql:35`), unchanged by the fix migration — DB-layer rejection independent of any application check. |
| T-03-16 | Information Disclosure | low | accept | **CLOSED** | Formally accepted below in Accepted Risks Log. `created_by_name`/`updated_by_name` are plain denormalized `text` columns on `contacts`, captured at write time inside `record_inquiry()`/`set_updated_by()` — no new `profiles`-table read path opened for non-admin Staff viewers. |

**Result: 16/16 threats CLOSED. `threats_open` = 0 (block_on: high — no high/critical severity threats are open; in fact no threats of any severity are open).**

## Accepted Risks Log

The following threats carry an `accept` disposition per their originating PLAN.md `<threat_model>` blocks. Each is a deliberate, documented design decision, not an oversight:

| Threat ID | Risk | Rationale | Owner Decision |
|-----------|------|-----------|-----------------|
| T-03-04 | Any authenticated Staff/Admin can read the full `contacts`/`inquiries` table regardless of `can_edit_crm` | CRM-03's explicit requirement — "Staff without edit CRM permission get read-only access" implies universal read for any authenticated Staff. Internal tool; all staff are trusted to view lead data as part of their job. No per-resource ACL was requested by `03-CONTEXT.md`. | Accepted at plan time (03-01-PLAN.md) |
| T-03-12 | Client-side `@tanstack/react-table` search/filter runs over the full contact list already downloaded to the browser | Filtering happens entirely over data already authorized by the Server Component's RLS-scoped, `authenticated`-only fetch — no additional data is exposed beyond what the initial server fetch already returned. | Accepted at plan time (03-04-PLAN.md) |
| T-03-13 | "Contacts" sidebar nav item is unconditional (not permission-gated), unlike Packages/Users | Matches CRM-03's explicit universal-read requirement and `03-UI-SPEC.md`'s interaction note. Write actions (`updateStatus`/`updateContact`) remain independently gated at the Server Action + RLS layer (T-03-14) regardless of nav visibility — same defense-in-depth pattern as Phase 2's AUTH-05/D-13. | Accepted at plan time (03-04-PLAN.md) |
| T-03-16 | Audit trail (`created_by_name`/`updated_by_name`) is denormalized, not resolved live from `profiles` | Avoids reopening Phase 2's locked `profiles` SELECT RLS ("self or admin") for a display-only convenience — a non-admin Staff viewer could not otherwise resolve a different staff member's name. No new cross-table read path is opened. | Accepted at plan time (03-01/03-05-PLAN.md) |

## Unregistered Flags

Two gaps identified by `03-REVIEW.md` (the phase's own code review) have no corresponding threat ID in any of the 5 plans' `<threat_model>` registers. Per this audit's scope, these are reported as **WARNING — not blockers** (no declared disposition to verify against; they represent attack surface that emerged during implementation but was never registered):

1. **`actions/crm.ts`'s `updateStatus()`/`updateContact()` have no server-side re-validation** (`03-REVIEW.md` WR-01). `contactEditSchema`'s validation (`name.min(1)`, etc.) lives only in the client form via `zodResolver` — the Server Actions pass `values`/`status` straight to `supabase.from("contacts").update(...)` with only TypeScript typing, no runtime schema check. `status` is independently protected by T-03-15's DB `CHECK` constraint, but `name`/`phone`/`tags` are not — a `can_edit_crm` caller invoking the Server Action directly (bypassing the React form) can write an empty `name` or unbounded-length `phone`/`tags`. This is a data-integrity/input-validation gap, not a privilege-escalation gap (T-03-14's double permission gate still holds — only `can_edit_crm` sessions can reach this code path at all). Recommend registering as a new threat (Tampering, low-medium) and re-validating with `contactEditSchema` server-side in a follow-up.
2. **Client-supplied `packageName` is trusted and forwarded verbatim into outbound emails without cross-checking against the validated `packageId`** (`03-REVIEW.md` WR-03). `packageId` is existence-checked server-side by `record_inquiry()` (T-03-06), but `packageName` (up to 200 chars, freeform) is taken as-is from the request body and appears unverified in the Formspree forward, the customer auto-reply email, and the internal staff notification email. A caller can submit `packageId: null, packageName: "<anything>"`, and that text reaches staff inboxes as if it were validated package context. Recommend registering as a new threat (Information Disclosure / Tampering, low) and either deriving the display name server-side from the existence-checked `packageId` or dropping `packageName` when `packageId` is absent.

Both are already tracked as open, non-blocking Warnings in `03-REVIEW.md` (WR-01, WR-02, WR-03, WR-04, WR-05) — this SECURITY.md does not duplicate that tracking, only cross-references it for the two items with a genuine security (not purely data-quality/UX) dimension. WR-02 (no rate limiting) is not listed here as unregistered because it maps directly to T-03-05, whose mitigation plan already explicitly deferred it. WR-04 (swallowed read error → misleading empty state) and WR-05 (looser admin-edit validation than the public form) are availability/data-quality concerns, not new attack surface, and are not elevated here.

## Notes on Register Integrity

- The threat register's own preface flagged that the post-review fix migration removed the anon INSERT policies T-03-03's original mitigation text described, and changed the `ON CONFLICT` branch's overwrite behavior (relevant to T-03-01's context). Both were verified against the **current, merged migration state** (both files, in application order) rather than the original migration's text alone — T-03-03 in particular closes on a *stronger* mitigation (zero anon write policies of any kind) than what was originally planned (anon INSERT-only policies). No threat regressed.
- No SUMMARY.md in this phase contains a `## Threat Flags` section (grep confirmed zero matches across all 5 SUMMARY files) — the phase's own code review (`03-REVIEW.md`) served as the source for the two unregistered flags above instead.

SECURITY.md: `.planning/phases/03-lead-capture-crm-automation/SECURITY.md`
