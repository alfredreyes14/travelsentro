---
phase: 04-customer-messaging-email-sms
verified: 2026-07-24T11:15:00Z
status: gaps_found
score: 6/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
mode: mvp
gaps:
  - truth: "Every sent message (individual and bulk) is logged with an accurate sent/failed status, visible in the contact's Activity timeline (roadmap SC4 / MSG-06; 04-03-PLAN's own must-have truth #4: 'an accurate sent/failed status')"
    status: partial
    reason: "sendBulkEmail() (actions/messages.ts:241-260) discards the return value of sendBatchEmails() entirely and blanket-marks every recipient's messages row 'sent' whenever the batch call itself doesn't throw — a per-recipient failure inside a successful Resend batch call (e.g. a suppressed/invalid address) is silently recorded as 'sent'. This was independently confirmed by this phase's own 04-REVIEW.md (CR-02, still unaddressed — it is the most recent commit, with no fix commit after it) and verified directly by re-reading the current actions/messages.ts. Individual email/SMS and bulk SMS all correctly derive status from the real per-recipient/provider result; only bulk EMAIL has this defect."
    artifacts:
      - path: "actions/messages.ts"
        issue: "sendBulkEmail (lines 241-260) sets markAllStatus from whether sendBatchEmails() threw, never from its resolved per-item results; every contact in a batch gets the same status regardless of individual delivery outcome"
      - path: "lib/resend.ts"
        issue: "sendBatchEmails() returns the raw per-chunk Resend response array as designed (by 04-02-PLAN, intentionally not normalized) — the defect is entirely in the caller not inspecting it, not in this file"
    missing:
      - "Inspect sendBatchEmails()'s resolved per-chunk/per-item results in sendBulkEmail() and set each inserted messages row's status from that contact's actual result, not a single batch-wide flag"
  - truth: "The unsubscribe link's HMAC signature is unforgeable, so opt-outs can only be triggered by a link this system actually generated (roadmap SC3's 'opt-outs respected' framing; T-04-06's explicit disposition 'mitigate ... unforgeable without the server-only secret')"
    status: failed
    reason: "lib/unsubscribe-token.ts's SECRET falls back to the hardcoded literal string \"unconfigured-placeholder-secret\" whenever UNSUBSCRIBE_TOKEN_SECRET is unset. Because the same fallback is used for both signing and verifying, an unset secret does not fail closed (contrary to the file's own doc-comment claim) -- it silently succeeds using a value visible to anyone who has ever read this source file, letting that party forge signContactId(anyUuid) offline and hit /unsubscribe?cid=<uuid>&sig=<forged> to opt out an arbitrary real contact with zero authentication. Independently confirmed by 04-REVIEW.md (CR-01, unaddressed -- no fix commit exists after the review commit) and by direct reading of the current file. This is a code-level design defect (no fail-loud guard for a security-critical secret), not a live exploit contingent on this environment's current env-var state, though UNSUBSCRIBE_TOKEN_SECRET's configuration in production is itself unverified across all four of this phase's plans (each SUMMARY notes .env.local was unreadable in that session)."
    artifacts:
      - path: "lib/unsubscribe-token.ts"
        issue: "SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || \"unconfigured-placeholder-secret\" -- the same discipline used for RESEND_API_KEY's non-security-critical placeholder was copy-pasted onto a security-critical HMAC secret, where an unset value silently grants an authorization bypass instead of merely degrading a feature"
    missing:
      - "Fail loudly (throw, or log+refuse to sign/verify) when UNSUBSCRIBE_TOKEN_SECRET is unset in a non-dev environment, per 04-REVIEW.md CR-01's suggested fix, rather than falling back to a source-visible constant"
      - "Confirm UNSUBSCRIBE_TOKEN_SECRET is actually set in the production environment before any real unsubscribe link is generated/sent (flagged as human-verification, see below)"
human_verification:
  - test: "Confirm UNSUBSCRIBE_TOKEN_SECRET, SEMAPHORE_API_KEY, and SEMAPHORE_SENDER_NAME are set in the production/Vercel environment (not just locally), and that the Semaphore account has an approved/registered sender name"
    expected: "All three env vars present in production; a real test SMS via the admin compose dialog returns 'Queued' or 'Sent' status, not an API/sender-name error"
    why_human: "Requires live dashboard/environment access this verification session does not have (.env.local and Vercel project were both inaccessible); this is the exact human-check every one of this phase's four plans already deferred to end-of-phase verification"
  - test: "Send one real individual email and one real individual SMS from a contact's detail page; confirm delivery and that the Activity timeline shows the correct sender/channel/body"
    expected: "Email/SMS arrives at a real test inbox/phone; Activity timeline entry matches"
    why_human: "Real outbound provider delivery cannot be exercised without live SEMAPHORE_API_KEY/RESEND_API_KEY in this session"
  - test: "Confirm whether UNSUBSCRIBE_TOKEN_SECRET is configured in production RIGHT NOW (independent of the code-level fix recommended in the gaps above)"
    expected: "If set, today's exposure window is smaller (though the code still lacks a fail-loud guard for any future unset state); if unset, this is an active, exploitable gap and should be treated as urgent"
    why_human: "No production/Vercel environment access in this session"
---

# Phase 4: Customer Messaging (Email & SMS) Verification Report

**Phase Goal:** Admin/Staff can proactively reach out to customers individually or in bulk via email and SMS, with opt-outs respected and every message logged to CRM history.
**Verified:** 2026-07-24T11:15:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## User Flow Coverage

User story (from 04-01/02/03/04-PLAN.md's Objective, validated as a well-formed user story): «As a TravelSentro Admin or Staff member, I want to proactively reach out to customers individually or in bulk via email and SMS, with opt-outs respected and every message logged to CRM history, so that the business can follow up on leads without risking spam complaints, provider suspension, or losing a record of what was said.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open a contact's detail page | "Message" button visible next to status control | `components/admin/crm-detail.tsx:186-189` (`<Button onClick={...}><SendIcon/>Message</Button>`) | ✓ |
| Click Message, send individual email/SMS | Compose dialog opens (Email/SMS tabs), send succeeds, success toast, dialog closes | `components/admin/message-compose-dialog.tsx:110-136` + `actions/messages.ts:42-162` (`sendIndividualEmail`/`sendIndividualSms`, both `requirePermission("can_message_customers")`-gated, live RLS-tested below) | ✓ |
| Select 2+ contacts on /admin/crm | Row checkboxes selectable; opted-out rows disabled with tooltip | `components/admin/crm-table.tsx:63-99,173` (`enableRowSelection: (row) => !row.original.opted_out`) | ✓ |
| Click "Message Selected", send bulk email/SMS | Quota check (email only) → confirmation AlertDialog → send → success/partial-failure toast | `components/admin/message-compose-dialog.tsx:138-189` + `actions/messages.ts:189-345` (`sendBulkEmail`/`sendBulkSms`, server-side re-query `.eq("opted_out", false)`, live-tested below) | ✓ |
| Opted-out contact excluded from bulk send | A contact with `opted_out=true` never receives a bulk email/SMS, even if a stale client selection included it | `actions/messages.ts:203-211,293-302` re-queries server-side; **live-verified** — see Requirements Coverage below | ✓ |
| Contact opts out (self-service link or staff toggle) | Visiting a real signed `/unsubscribe` link flips `opted_out=true`; staff can also toggle it from crm-detail.tsx | `app/unsubscribe/page.tsx` + `actions/messages.ts:357-378` (`updateOptOut`, `can_edit_crm`-gated, live-tested below) | ⚠️ — mechanism works, but the signature that gates it is forgeable under a code-level defect (see Gaps CR-01) |
| Outcome: message logged and visible in history | Contact's "Activity" section merges inquiries + messages, newest-first, with "Failed to send" badge and "Sent by {name}" | `components/admin/crm-detail.tsx:280-364` merges `inquiries`+`messages`; **but** bulk email's status field is not reliably accurate (see Gaps CR-02) | ⚠️ — logged and visible, but not always accurately marked "Failed to send" for bulk email |

**Section 1 (user flow) mostly passes** — every entry point is reachable and wired end-to-end, permission-gated, and the opt-out exclusion is live-verified against the real database. Two steps are marked ⚠️ because the underlying code has a demonstrable defect (not a UI/UX gap) that undermines the accuracy/security of the outcome those steps promise. Per this project's gaps_found routing, proceeding to Section 2/3 checks below for completeness, but the phase does not yet fully achieve its goal.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (SC1) Admin/Staff with "message customers" permission can send an individual email or SMS to a contact | ✓ VERIFIED | `actions/messages.ts` `sendIndividualEmail`/`sendIndividualSms`, both gated by `requirePermission("can_message_customers")`; wired to `crm-detail.tsx`'s "Message" button via `MessageComposeDialog` (individual mode); **live-tested** RLS INSERT differential below |
| 2 | (SC2) Admin/Staff with "message customers" permission can send a bulk email or SMS to a selected/segmented set of contacts | ✓ VERIFIED | `actions/messages.ts` `sendBulkEmail`/`sendBulkSms`; wired to `crm-table.tsx`'s row-selection + "Message Selected" bar via `MessageComposeDialog` (bulk mode); confirmation `AlertDialog` gates every bulk send |
| 3 | (SC3) A contact who has opted out is excluded from all future bulk email/SMS sends | ✓ VERIFIED | `actions/messages.ts:203-211,293-302` re-query contacts server-side with `.eq("opted_out", false)` (never trusts client selection, D-03); **live-tested**: a throwaway contact with `opted_out=true` was correctly excluded from the exact filter query, while a `false` sibling was returned — see below |
| 4 | (SC4) Every sent message (individual and bulk) is logged and visible in the contact's history, with accurate status | ✗ FAILED (partial) | `messages` rows ARE created for every send attempt and rendered in `crm-detail.tsx`'s merged "Activity" timeline. **But** `sendBulkEmail` discards `sendBatchEmails()`'s per-item result and blanket-marks the whole batch "sent" unless the entire call throws — a per-recipient failure inside a successful batch is silently mis-logged as "sent". Individual email/SMS and bulk SMS all correctly derive per-recipient status. See Gaps. |
| 5 | An authenticated session lacking `can_message_customers` cannot INSERT into `messages`; a session with it can (04-01-PLAN truth, carried forward as an open item by every one of this phase's 4 SUMMARYs) | ✓ VERIFIED (live-tested) | Created a real disposable Supabase Auth test user, confirmed `messages` INSERT via PostgREST returns `403 42501 row-level security policy violation` with `can_message_customers=false`, then `201` success after flipping the profile flag to `true`. Test user and rows fully cleaned up afterward. |
| 6 | A `can_edit_crm`-permissioned session can toggle `contacts.opted_out`; a session without it cannot (04-04-PLAN truth) | ✓ VERIFIED (live-tested) | Same test session: `PATCH contacts?opted_out` with `can_edit_crm=false` returned `200` with an **empty array** (RLS silently filtered the row, no update applied); after flipping `can_edit_crm=true`, the same PATCH succeeded and returned the updated row. **Note:** this test was initially run against the first contact returned by an unfiltered query, which turned out to be a real customer record — it was fully reverted (`opted_out` reset to `false`, `updated_by` cleared) immediately upon discovery; see Issues note below. |
| 7 | `contacts.opted_out` can only be flipped to `true` for anon callers via `set_contact_opted_out()`; anon direct `INSERT` into `messages` is rejected (04-01-PLAN truth) | ✓ VERIFIED (live-tested) | Created a genuine throwaway test contact, called `rpc/set_contact_opted_out` with the anon key → `204`, confirmed `opted_out` flipped to `true` via service-role read; anon `POST /messages` → `401`/`42501` rejected. Throwaway contact deleted after. |
| 8 | The unsubscribe link's HMAC signature is unforgeable (opt-outs can only be triggered by a link this system generated) | ✗ FAILED | `lib/unsubscribe-token.ts`'s `SECRET` falls back to a hardcoded, source-visible string when `UNSUBSCRIBE_TOKEN_SECRET` is unset, silently defeating the "unforgeable without the server-only secret" claim in T-04-06's threat-model disposition instead of failing closed. Confirmed present in the current file (not fixed after 04-REVIEW.md flagged it as CR-01). |

**Score:** 6/8 truths verified (2 failed/partial — both independently confirmed by this phase's own 04-REVIEW.md code review and by direct re-reading of the current code)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260724100635_add_messaging_schema.sql` | `contacts.opted_out`, `messages` table + RLS, `set_contact_opted_out()` RPC | ✓ VERIFIED | Present, applied remotely (`supabase migration list` shows local == remote `20260724100635`); content matches spec exactly (grep counts all correct) |
| `types/database.ts` | Regenerated types for `messages`, `contacts.opted_out`, `set_contact_opted_out` | ✓ VERIFIED | All three present in generated types; `npm run build` type-checks cleanly against them |
| `lib/crm/messages.ts` | Channel/status enums, `CHANNEL_LABELS`, `applyNameTemplate` | ✓ VERIFIED | Matches spec exactly |
| `lib/unsubscribe-token.ts` | `signContactId`/`verifyContactId`, timing-safe HMAC | ⚠️ HOLLOW (security) | Timing-safe comparison correctly implemented, but the underlying secret has an insecure fallback (see Gaps CR-01) — the artifact exists and is wired, but its core security guarantee is not met |
| `components/email/customer-message-email.tsx` | React Email template, optional unsubscribe footer | ✓ VERIFIED | Matches spec; no `dangerouslySetInnerHTML`, imports from `react-email` |
| `lib/resend.ts` (sendBatchEmails) | Chunked ≤100/call, re-throws on whole-batch failure | ✓ VERIFIED | Implemented as specified; the CR-02 defect lives entirely in the caller (`actions/messages.ts`) not inspecting the returned per-item results, not in this file |
| `lib/sms/semaphore.ts` | Thin fetch wrapper, throws on non-OK | ✓ VERIFIED | Matches spec exactly |
| `actions/messages.ts` | 6 Server Actions (5 send/quota + `updateOptOut`), all permission-gated | ⚠️ WIRED with defect | All 6 exist, all permission-gated (`can_message_customers` x5, `can_edit_crm` x1 — live-tested), zero `after()` usage confirmed; `sendBulkEmail`'s status accuracy is the CR-02 gap above |
| `components/admin/message-compose-dialog.tsx` | Shared individual/bulk compose UI | ✓ VERIFIED (wired) | Fully wired to both entry points; quota banner correctly gates before confirmation dialog. Minor warning: submit handlers have no `catch` for a thrown (non-`ActionResult`) error (WR-01) — a narrower edge case than the primary provider-failure path, which IS handled |
| `components/admin/crm-table.tsx` | Bulk selection, opted-out disabled checkboxes, "Opted out" badge | ✓ VERIFIED | `enableRowSelection` excludes opted-out rows; badge renders; wired to `MessageComposeDialog` |
| `components/admin/crm-detail.tsx` | Message button, opt-out Switch/badge, merged Activity timeline | ✓ VERIFIED | All present and wired; canEdit-gated Switch/Badge split matches existing status-editor pattern |
| `app/unsubscribe/page.tsx` | Public Server Component, HMAC-gate before RPC | ⚠️ WIRED with defect | Signature check correctly precedes the RPC call in code order, but the signature itself is forgeable under CR-01; also mutates unconditionally on GET render (WR-02, a related but separate risk — email-scanner prefetch could cause unintended opt-outs) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| MSG-01 | 04-02, 04-03 | Individual email send | ✓ SATISFIED | `sendIndividualEmail`, wired, live RLS-tested |
| MSG-02 | 04-02, 04-03 | Individual SMS send | ✓ SATISFIED | `sendIndividualSms`, wired |
| MSG-03 | 04-02, 04-03 | Bulk email send | ⚠️ PARTIALLY SATISFIED | Reachable/wired/quota-gated, but per-recipient status accuracy defect (CR-02) |
| MSG-04 | 04-02, 04-03 | Bulk SMS send | ✓ SATISFIED | Reachable/wired; per-recipient status correctly derived |
| MSG-05 | 04-01, 04-03, 04-04 | Opt-out excludes from future bulk sends | ⚠️ PARTIALLY SATISFIED | Exclusion mechanism itself live-verified correct; but the self-service opt-out trigger (unsubscribe link) is forgeable (CR-01), undermining trust in *how* a contact becomes opted out |
| MSG-06 | 04-01, 04-03, 04-04 | Sent messages logged + visible in history | ⚠️ PARTIALLY SATISFIED | Logged/visible mechanism works; accuracy defect for bulk email (CR-02) |

No orphaned requirements — MSG-01 through MSG-06 are all claimed across the four plans and cross-checked against `.planning/REQUIREMENTS.md`'s Phase 4 mapping.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/unsubscribe-token.ts` | 14 | Insecure hardcoded secret fallback for a security-critical HMAC key | 🛑 Blocker | Defeats the unforgeability guarantee the whole unsubscribe design depends on (CR-01, 04-REVIEW.md) |
| `actions/messages.ts` | 241-260 | Discarded provider response, blanket status assignment | 🛑 Blocker | Bulk email log accuracy compromised — staff cannot trust "Failed to send" for bulk email (CR-02, 04-REVIEW.md) |
| `app/unsubscribe/page.tsx` | 29-32 | Mutates database state on a bare GET render | ⚠️ Warning | Email-scanner/security-gateway link prefetching (Defender for O365, Proofpoint, etc.) could trigger unintended opt-outs (WR-02, 04-REVIEW.md) |
| `components/admin/message-compose-dialog.tsx` | 110-189 | `try/finally` with no `catch` around Server Action calls | ⚠️ Warning | A thrown (non-`ActionResult`) error — e.g. permission revoked mid-session — fails silently with no toast (WR-01, 04-REVIEW.md) |
| `actions/messages.ts` / `lib/sms/semaphore.ts` | 306-324 / — | Bulk SMS status keyed by exact phone-string match against provider response | ⚠️ Warning | If Semaphore normalizes/reformats numbers in its response, a real "sent" could be mis-logged "failed" (WR-03, 04-REVIEW.md, unverified against a real account) |
| `actions/messages.ts` | 102-162 vs compose dialog 283-288 | `{{name}}` unsupported-for-SMS warning shown only in bulk mode | ℹ️ Info | Individual SMS silently sends literal `{{name}}` with no warning (WR-04, 04-REVIEW.md) |
| `actions/messages.ts` | 249-260, 326-337 | Bulk sends never persist `provider_message_id` per recipient | ℹ️ Info | Debugging bulk delivery problems is harder than it needs to be (WR-05, 04-REVIEW.md) |

No `TBD`/`FIXME`/`XXX` unresolved debt markers found in any file modified by this phase.

### Behavioral / Live Verification Performed This Session

All of the following were executed directly against the live, linked Supabase project (`wisesrmizzgfbwlktoxh`) using disposable test data, and fully cleaned up afterward:

1. **Migration applied remotely** — `supabase migration list` confirms local `20260724100635` == remote.
2. **RLS INSERT differential (messages, can_message_customers)** — created a real disposable Supabase Auth user; `POST /rest/v1/messages` → `403` without the permission, `201` after flipping it. Closes the item carried forward across all 4 SUMMARYs (04-01 D2 → 04-03 D6 → 04-04 D5).
3. **RLS UPDATE differential (contacts.opted_out, can_edit_crm)** — same test user; `PATCH` silently no-ops (`200`, empty array) without the permission, succeeds after flipping it.
4. **Anon RPC path** — `set_contact_opted_out` via anon key flips a throwaway contact's `opted_out` to `true` (`204`); anon direct `INSERT` into `messages` rejected (`401`/`42501`).
5. **Bulk-send opt-out filter** — reproduced `sendBulkEmail`/`sendBulkSms`'s exact `.eq("opted_out", false)` re-query against two throwaway contacts (one opted out, one not) — only the non-opted-out contact was returned.
6. **`npm run build`** — compiles cleanly, zero TypeScript errors, all 17 routes generate including `/unsubscribe`.

**Note on test hygiene:** step 3's first attempt queried `contacts?select=id&limit=1` without a filter and happened to return a real customer record ("Sheila Mae Reyes"). The UPDATE test was run against it before this was noticed. It was reverted immediately (`opted_out` reset to `false`, `updated_by`/`updated_at` restored to a clean state) and the test messages row created against that contact in an earlier step was deleted. All subsequent tests used explicitly-created, clearly-named throwaway contacts, and the test Supabase Auth user was deleted at the end of the session. No real customer data was left in a modified state.

### Gaps Summary

Phase 4's core vertical slice — individual/bulk email+SMS send, permission gating, opt-out exclusion from bulk sends, and Activity-timeline visibility — is genuinely built, live-wired end to end, and mostly verified directly against the real database (not just static code reading). The RLS permission differentials that every one of this phase's four SUMMARYs flagged as an unresolved, recurring open item are now closed via live testing.

However, this phase's own code review (`04-REVIEW.md`, dated the same day, and still the most recent commit with no fix afterward) found two **unaddressed critical defects** that this verification independently re-confirmed by reading the current code:

1. **CR-02** — bulk email's per-recipient send status is not actually derived from Resend's response; the entire batch is blanket-marked "sent" unless the whole call throws. This means MSG-06's "logged... with an accurate status" promise is broken specifically for bulk email (individual sends and bulk SMS are unaffected).
2. **CR-01** — the unsubscribe HMAC secret's fallback value is a hardcoded, source-visible string, which — when `UNSUBSCRIBE_TOKEN_SECRET` is unset — silently defeats the entire unforgeability guarantee the opt-out consent flow depends on, rather than failing loudly. This undermines confidence in "opt-outs respected" being a trustworthy, tamper-resistant signal.

Both are precisely-located, reproducible from the code as written (not requiring human judgment to establish that they exist), and neither has an existing override recorded. Recommend closing both before considering Phase 4 complete — 04-REVIEW.md already contains concrete, ready-to-apply fixes for each. Three further warnings (WR-01/02/03) and two info items are listed above for the developer's awareness but do not block the phase goal on their own.
