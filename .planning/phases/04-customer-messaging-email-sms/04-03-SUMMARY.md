---
phase: 04-customer-messaging-email-sms
plan: 03
subsystem: messaging
tags: [server-actions, zod, tanstack-table, base-ui, resend, semaphore, rls]

requires:
  - phase: 04-customer-messaging-email-sms (plan 01)
    provides: messages table schema, contacts.opted_out column, can_message_customers-scoped RLS INSERT policy
  - phase: 04-customer-messaging-email-sms (plan 02)
    provides: lib/crm/messages.ts, lib/sms/semaphore.ts, lib/resend.ts's sendBatchEmails, lib/unsubscribe-token.ts, components/email/customer-message-email.tsx
provides:
  - lib/crm/message-schema.ts (emailComposeSchema, smsComposeSchema, recipientIdsSchema)
  - actions/messages.ts (sendIndividualEmail, sendIndividualSms, getRemainingEmailQuota, sendBulkEmail, sendBulkSms, BulkSendResult)
  - actions/auth.ts's getSiteOrigin() now exported for reuse
  - components/admin/message-compose-dialog.tsx (MessageComposeDialog, shared individual/bulk UI)
  - crm-table.tsx bulk row selection + "Message Selected" entry point
  - crm-detail.tsx "Message" button entry point
  - components/ui/checkbox.tsx (first use in codebase)
affects: [04-04]

tech-stack:
  added: []
  patterns:
    - "@tanstack/react-table's built-in rowSelection state + enableRowSelection(row) predicate to exclude opted-out rows from bulk selection, instead of a custom selection tracking mechanism"
    - "One shared compose dialog component (message-compose-dialog.tsx) parameterized by mode: 'individual' | 'bulk' and a contacts[] prop (length 1 for individual), per D-06/UI-SPEC's explicit instruction"
    - "Bulk Server Actions always re-query recipients server-side by id list + .eq('opted_out', false) rather than trusting the client-submitted selection (D-03/T-04-10)"

key-files:
  created:
    - lib/crm/message-schema.ts
    - actions/messages.ts
    - components/admin/message-compose-dialog.tsx
    - components/ui/checkbox.tsx
  modified:
    - actions/auth.ts
    - components/admin/crm-table.tsx
    - components/admin/crm-detail.tsx
    - "app/admin/(dashboard)/crm/page.tsx"
    - "app/admin/(dashboard)/crm/[id]/page.tsx"

key-decisions:
  - "base-ui's Checkbox.Root uses a separate `indeterminate` boolean prop, not Radix's overloaded `checked=\"indeterminate\"` string -- confirmed via node_modules/@base-ui/react type declarations before wiring the select-all header checkbox, per Task 2's read_first instruction to verify the installed primitive's real API rather than assume Radix's shape"
  - "sendBulkEmail's rolling-24h quota check is inlined (duplicated query logic) rather than calling getRemainingEmailQuota() directly, to avoid a second requirePermission() round-trip within the same action, exactly as the plan specified"
  - "sent_by_name stored as profile.name verbatim (nullable), matching the plan's explicit instruction and the messages table's nullable sent_by_name column -- display-time null-coalescing (if any) is 04-04's concern (Activity timeline), not this plan's"

patterns-established: []

requirements-completed: [MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06]

coverage:
  - id: D1
    description: "actions/messages.ts exports 5 requirePermission('can_message_customers')-gated Server Actions, all awaited inline (zero after() usage), matching Pitfall 4/T-04-11's no-silent-failure requirement"
    requirement: "MSG-01"
    verification:
      - kind: unit
        ref: "grep -c 'requirePermission(\"can_message_customers\")' actions/messages.ts == 5; grep -c 'after(' actions/messages.ts == 0; npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "sendBulkEmail/sendBulkSms re-query contacts server-side with .eq('opted_out', false), never trusting the client-submitted id list (D-03/T-04-10)"
    requirement: "MSG-05"
    verification:
      - kind: unit
        ref: "grep -c '.eq(\"opted_out\", false)' actions/messages.ts == 2; npm run build"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every send function (individual email/SMS, bulk email/SMS) inserts one messages row per recipient with accurate sent/failed status"
    requirement: "MSG-06"
    verification:
      - kind: unit
        ref: "grep -c '\\.insert(' actions/messages.ts == 4 (one per function); npm run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "sendBulkEmail rejects a bulk send that would exceed the rolling-24h 100-email quota before the confirmation dialog opens, with exact UI-SPEC copy"
    requirement: "MSG-03"
    verification:
      - kind: unit
        ref: "grep -c 'export async function getRemainingEmailQuota' actions/messages.ts == 1; code inspection of sendBulkEmail's inline quota check and message-compose-dialog.tsx's handleBulkSubmitAttempt pre-confirmation gate"
        status: pass
    human_judgment: false
  - id: D5
    description: "Message button (crm-detail.tsx) and Message Selected (crm-table.tsx) are both reachable, the compose dialog enforces Tabs/quota banner/bulk confirmation/failure-toast per UI-SPEC's Copywriting Contract, and opted-out rows render disabled checkboxes with a tooltip"
    verification: []
    human_judgment: true
    rationale: "Requires live UI interaction (clicking Message/Message Selected, observing toast copy, sending a real email/SMS, seeding 100+ messages rows to trigger the quota banner, toggling a contact's opted_out) -- this project's workflow.human_verify_mode=end-of-phase config defers this to the phase's end-of-phase human verification pass, per this plan's own Task 2 human-check and 04-02's RESEND_API_KEY/Semaphore precedent."
  - id: D6
    description: "Authenticated-session RLS INSERT differential on the messages table (can_message_customers=true succeeds vs a session lacking it is rejected) exercised live now that actions/messages.ts exists"
    verification: []
    human_judgment: true
    rationale: "Carried forward from 04-01 SUMMARY's coverage D2 (deferred there because actions/messages.ts didn't exist yet). This session also had no .env.local read access (same constraint noted in 04-01/04-02), so no real staff/admin Supabase Auth session could be exercised to test the permission differential live. The RLS policy text (has_permission(auth.uid(), 'can_message_customers')) is confirmed present and correct via 04-01's static SQL inspection and anon-path live checks; the authenticated differential itself remains unexercised. Recommend closing this via 04-04's plan or the phase's end-of-phase human verification pass, once a session with .env.local/Supabase credential access is available."

duration: 10min
completed: 2026-07-24
status: complete
---

# Phase 4 Plan 03: Message Send Actions + Compose UI Summary

**Five permission-gated Server Actions (individual/bulk email+SMS send, rolling-24h quota check) plus a shared compose dialog wired into both crm-detail.tsx's "Message" button and crm-table.tsx's new bulk row-selection "Message Selected" flow — every send awaited inline and logged to the messages table.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-24T10:15:38Z
- **Completed:** 2026-07-24T10:25:00Z
- **Tasks:** 2 completed
- **Files modified:** 9 (5 created, 4 modified, plus 1 checkbox primitive installed)

## Accomplishments
- `lib/crm/message-schema.ts`: `emailComposeSchema`, `smsComposeSchema`, `recipientIdsSchema` — shared server+client zod validation closing WR-01's client-only-validation gap for this phase's new actions.
- `actions/messages.ts`: `sendIndividualEmail`, `sendIndividualSms`, `getRemainingEmailQuota`, `sendBulkEmail`, `sendBulkSms` — all `requirePermission("can_message_customers")`-gated, all awaited inline (zero `after()` usage, Pitfall 4/T-04-11), bulk sends re-query recipients server-side filtered on `opted_out` (D-03/T-04-10), bulk email enforces the rolling-24h 100-email quota (D-07/Pitfall 1) before ever attempting a send.
- `actions/auth.ts`: `getSiteOrigin()` exported (previously module-private) so `sendBulkEmail` can build unsubscribe links without duplicating the origin-resolution logic.
- `components/ui/checkbox.tsx`: installed via `npx shadcn@latest add checkbox` — first use of this primitive in the codebase; confirmed its real base-ui prop shape (`checked`, `onCheckedChange`, `disabled`, separate `indeterminate` prop) before wiring rather than assuming Radix's API.
- `components/admin/message-compose-dialog.tsx`: shared `MessageComposeDialog({ contacts, mode, open, onOpenChange, onSuccess })` — Email/SMS Tabs (default Email), opted-out informational notice (individual mode only), bulk SMS no-phone-skip notice, character-count caption, quota banner rendered inside the dialog before the confirmation `AlertDialog` ever opens, individual sends awaited inline with `toast.error`-on-failure and dialog-stays-open retry, bulk sends gated behind a confirmation `AlertDialog` with exact UI-SPEC copy.
- `components/admin/crm-table.tsx`: leading checkbox column via TanStack Table's built-in `rowSelection` state, `enableRowSelection` excludes `opted_out` rows, opted-out rows render a disabled checkbox with a "Opted out — excluded from bulk sends" tooltip, bulk-selection bar ("{n} selected" / Clear / Message Selected) appears only when rows are selected, wired to `MessageComposeDialog` in bulk mode.
- `components/admin/crm-detail.tsx`: "Message" button (SendIcon, next to the status control) opens `MessageComposeDialog` in individual mode.
- `app/admin/(dashboard)/crm/page.tsx` and `.../[id]/page.tsx`: both now select/map `opted_out` into their respective client-facing types.
- `npm run build` and `npx eslint` (0 errors) pass cleanly after both tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Send actions (individual/bulk email+SMS, quota gate, D-03 filter) + compose dialog** - `87a29ca` (feat)
2. **Task 2: message-compose-dialog.tsx UI + crm-table.tsx bulk selection + crm-detail.tsx individual entry point** - `6105242` (feat)

**Plan metadata:** (this commit, following SUMMARY.md creation)

## Files Created/Modified
- `lib/crm/message-schema.ts` - shared email/SMS compose zod schemas + recipient-id-list schema
- `actions/messages.ts` - 5 permission-gated Server Actions for individual/bulk email+SMS send + quota check
- `actions/auth.ts` - `getSiteOrigin()` exported (no other change)
- `components/admin/message-compose-dialog.tsx` - shared individual/bulk compose UI
- `components/admin/crm-table.tsx` - row-selection checkbox column, bulk-selection bar, `opted_out` field
- `components/admin/crm-detail.tsx` - "Message" button entry point, `opted_out` field
- `app/admin/(dashboard)/crm/page.tsx` - `opted_out` added to select + mapping
- `app/admin/(dashboard)/crm/[id]/page.tsx` - `opted_out` added to `detailContact`
- `components/ui/checkbox.tsx` - new shadcn primitive

## Decisions Made
- base-ui's `Checkbox.Root` exposes a separate `indeterminate` boolean prop rather than Radix's `checked="indeterminate"` string overload — the header select-all checkbox uses `checked={table.getIsAllPageRowsSelected()}` + `indeterminate={!allSelected && someSelected}`, confirmed against `node_modules/@base-ui/react`'s type declarations before wiring (Task 2's read_first instruction anticipated this exact divergence).
- `sendBulkEmail`'s rolling-24h quota check is inlined (duplicate query) rather than calling `getRemainingEmailQuota()`, avoiding a second `requirePermission()` round-trip within the same action — matches the plan's explicit instruction.
- `sent_by_name` is stored as `profile.name` verbatim (nullable) rather than `profile.name ?? profile.email` — matches both the plan's literal instruction and the `messages.sent_by_name` column's nullable type; any display-time fallback is 04-04's Activity timeline concern, not this plan's write path.
- Individual sends never carry an `unsubscribeUrl` (only bulk emails do) and are never filtered by `opted_out` — the compose dialog surfaces an informational notice instead, per Open Question 1/UI-SPEC's explicit scoping.

## Deviations from Plan

None functionally — both tasks implemented exactly as specified in `<action>`, all acceptance-criteria intent (permission gating, no fire-and-forget sends, D-03 server-side re-filtering, quota enforcement, per-recipient message logging) was met and verified via `npm run build` + targeted grep checks.

Several of the plan's own literal acceptance-criteria grep counts were unsatisfiable as written without weakening the implementation, matching the same category of plan-authoring imprecision 04-02's SUMMARY documented and treating them the same way (functional correctness preserved, literal count not force-fit):

- **`actions/messages.ts` "exactly 1 occurrence of `sendBulkSmsProvider`"**: the plan's own `<action>` text requires the aliased import (`sendBulkSms as sendBulkSmsProvider`, needed to avoid colliding with this file's own exported `sendBulkSms`) AND a call site inside `sendBulkSms()` — 2 syntactically necessary lines matching the pattern (import + call). Implemented per the actual requirement (alias to avoid the name collision, then use it) rather than chasing the literal count.
- **`components/admin/message-compose-dialog.tsx` "exactly 1 occurrence of `getRemainingEmailQuota`"**: same shape — 1 import line + 1 call site inside `handleBulkSubmitAttempt()` = 2 matching lines, both required for the feature to function.
- **`components/admin/message-compose-dialog.tsx` "exactly 1 occurrence of `<AlertDialog`"**: the grep pattern `<AlertDialog` is a substring match that also matches `<AlertDialogContent`, `<AlertDialogHeader`, `<AlertDialogTitle`, `<AlertDialogDescription`, `<AlertDialogFooter`, `<AlertDialogCancel`, `<AlertDialogAction` (8 total lines) since every AlertDialog subcomponent shares that prefix — the actual root `<AlertDialog` element itself appears exactly once, matching `package-list-row.tsx`'s exact shell shape the plan asked this to mirror.
- **`components/admin/crm-table.tsx` / `crm-detail.tsx` "exactly 1 occurrence of `MessageComposeDialog`"**: both files necessarily have 1 import line + 1 JSX usage line = 2 matching lines.
- **`components/admin/crm-detail.tsx` "exactly 1 occurrence of `SendIcon`"**: 1 import line + 1 JSX usage line = 2 matching lines.
- **`app/admin/(dashboard)/crm/page.tsx` "exactly 1 occurrence of `opted_out`"**: the plan's own `<action>` text requires both the select-string change AND the mapping-object addition — 2 necessary lines.

None of these affect runtime behavior; all were verified functionally correct via `npm run build` (zero TypeScript errors) and `npx eslint` (zero errors) after each task, plus manual code-path tracing against the plan's `<action>` prose (the authoritative spec) rather than the grep shorthand.

## Issues Encountered
- No read access to `.env.local` in this session (same constraint 04-01/04-02 hit) — could not exercise a real authenticated Staff/Admin Supabase session to close 04-01 SUMMARY's deferred coverage D2 (the RLS INSERT permission differential: `can_message_customers=true` succeeds vs. a session lacking it is rejected). `actions/messages.ts` now exists and is the intended path to close this gap, but doing so requires either `.env.local` access or a session with real Supabase Auth credentials — neither was available here. Carried forward as this plan's own coverage D6; recommend closing via 04-04 or the phase's end-of-phase human verification pass.

## User Setup Required

None new this plan — `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`, `UNSUBSCRIBE_TOKEN_SECRET` (from 04-02) remain the phase's only outstanding external-service setup, still deferred to end-of-phase human verification.

## Next Phase Readiness
- The core vertical slice (compose → send → logged) is complete and functional per `npm run build`/lint; ready for 04-04's opt-out toggle, public unsubscribe route, and merged Activity timeline (which will read the `messages` rows this plan now writes).
- Two items remain open for the phase's end-of-phase human verification pass: (1) this plan's own Task 2 `<human-check>` (real email/SMS send, bulk confirmation flow, quota banner, opted-out row disabling — all deferred per `workflow.human_verify_mode=end-of-phase`), and (2) the RLS INSERT permission differential check carried forward from 04-01 (coverage D6 above).
- No blockers to starting 04-04.

---
*Phase: 04-customer-messaging-email-sms*
*Completed: 2026-07-24*
