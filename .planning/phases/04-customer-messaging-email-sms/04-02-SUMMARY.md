---
phase: 04-customer-messaging-email-sms
plan: 02
subsystem: messaging
tags: [resend, semaphore, sms, email, hmac, react-email, crypto]

requires:
  - phase: 04-customer-messaging-email-sms (plan 01)
    provides: messages table schema, contacts.opted_out column (not consumed directly by this plan, but the schema this plan's service layer will be wired to in 04-03)
provides:
  - lib/crm/messages.ts (MESSAGE_CHANNELS, MessageChannel, MESSAGE_STATUSES, MessageStatus, CHANNEL_LABELS, applyNameTemplate)
  - lib/unsubscribe-token.ts (signContactId, verifyContactId) stateless HMAC-SHA256 pair
  - components/email/customer-message-email.tsx (CustomerMessageEmail React Email template)
  - lib/resend.ts sendBatchEmails() (chunked Resend Batch API helper)
  - lib/sms/semaphore.ts (sendSingleSms, sendBulkSms) thin fetch wrapper around Semaphore's API
affects: [04-03, 04-04]

tech-stack:
  added: []
  patterns:
    - "Node stdlib crypto (createHmac/timingSafeEqual) for a stateless, no-expiry, unforgeable signed token — no new package, no tokens table"
    - "Thin fetch wrapper (no SDK) for a provider with no official Node client, matching CLAUDE.md's D-05 guidance"
    - "Server-only service module doc-comment discipline (placeholder-fallback / never-imported-client-side) copied verbatim from lib/resend.ts's existing convention"

key-files:
  created:
    - lib/crm/messages.ts
    - lib/unsubscribe-token.ts
    - components/email/customer-message-email.tsx
    - lib/sms/semaphore.ts
  modified:
    - lib/resend.ts

key-decisions:
  - "lib/resend.ts's sendBatchEmails() imports ReactElement as a type from \"react\" (not React.ReactElement) since the file has no existing React namespace import — mirrors the codebase's existing named-import convention (createElement from \"react\") rather than introducing a new default/namespace import style"
  - "Deferred Semaphore sender-name/endpoint-base-URL live confirmation to end-of-phase human verification (workflow.human_verify_mode=end-of-phase), per this plan's own Task 2 human-check and 03-03's established precedent — SEMAPHORE_API_KEY/SEMAPHORE_SENDER_NAME are not set in this environment, so no live SMS send was attempted this session"

requirements-completed: [MSG-01, MSG-02, MSG-03, MSG-04]

coverage:
  - id: D1
    description: "lib/crm/messages.ts exports MESSAGE_CHANNELS/MessageChannel, MESSAGE_STATUSES/MessageStatus, CHANNEL_LABELS (Emailed/Texted per UI-SPEC Copywriting Contract), applyNameTemplate()"
    requirement: "MSG-01"
    verification:
      - kind: unit
        ref: "grep -c 'as const' lib/crm/messages.ts == 2; grep -c 'export function applyNameTemplate' == 1; npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/unsubscribe-token.ts's signContactId/verifyContactId pair uses HMAC-SHA256 with timing-safe comparison, no expiry, server-only placeholder-fallback discipline"
    requirement: "MSG-05"
    verification:
      - kind: unit
        ref: "grep -c 'timingSafeEqual' lib/unsubscribe-token.ts == 2 (import + call); grep -c ' === sig| sig ===' == 0; npm run build"
        status: pass
    human_judgment: false
  - id: D3
    description: "components/email/customer-message-email.tsx renders name/body/optional unsubscribeUrl via react-email JSX interpolation, never dangerouslySetInnerHTML, imports from \"react-email\" not @react-email/components"
    requirement: "MSG-03"
    verification:
      - kind: unit
        ref: "grep -c '@react-email/components' == 0; grep -c 'dangerouslySetInnerHTML' == 0; grep -c 'from \"react-email\"' == 1; npm run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "lib/resend.ts's sendBatchEmails() chunks recipients to Resend's documented 100-item batch limit and re-throws on whole-batch failure rather than swallowing"
    requirement: "MSG-03"
    verification:
      - kind: unit
        ref: "grep -c 'export async function sendBatchEmails' == 1; grep -c 'resend.batch.send' == 1; npm run build"
        status: pass
    human_judgment: false
  - id: D5
    description: "lib/sms/semaphore.ts's sendSingleSms/sendBulkSms POST to Semaphore's documented endpoint and throw on any non-OK HTTP response instead of silently swallowing a failed send; no unofficial third-party SMS package installed"
    requirement: "MSG-02"
    verification:
      - kind: unit
        ref: "grep -c 'https://semaphore.co/api/v4/messages' == 1; grep -c 'throw new Error' == 1; grep -c 'node-semaphore-sms|semaphore-sms' == 0; npm run build"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live Semaphore account has an approved/registered sender name, and the documented endpoint base URL (https://semaphore.co/api/v4/messages) is confirmed correct against a real account response, once 04-03's send actions exist to exercise a real test SMS"
    verification: []
    human_judgment: true
    rationale: "SEMAPHORE_API_KEY/SEMAPHORE_SENDER_NAME are not configured in this environment; this project's workflow.human_verify_mode=end-of-phase config supersedes 04-RESEARCH.md's generic mid-plan checkpoint suggestion (Pitfall 3), deferring live sender-name/endpoint confirmation to the phase's end-of-phase human verification pass, matching 03-03's RESEND_API_KEY precedent."

duration: 3min
completed: 2026-07-24
status: complete
---

# Phase 4 Plan 02: Messaging Service Layer Summary

**Semaphore SMS fetch wrapper, HMAC-SHA256 stateless unsubscribe-token pair, Resend Batch API helper, shared message constants, and the outbound customer-message React Email template — all compiling cleanly, no database or UI dependency.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-24T10:11:15Z
- **Completed:** 2026-07-24T10:13:51Z
- **Tasks:** 2 completed
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `lib/crm/messages.ts`: `MESSAGE_CHANNELS`/`MessageChannel`, `MESSAGE_STATUSES`/`MessageStatus`, `CHANNEL_LABELS` (`Emailed`/`Texted` per UI-SPEC's Copywriting Contract), `applyNameTemplate(body, name)` mirroring `lib/crm/status.ts`'s established enum+label-map shape.
- `lib/unsubscribe-token.ts`: stateless HMAC-SHA256 `signContactId`/`verifyContactId` pair using Node's built-in `crypto` module — byte-length check followed by `timingSafeEqual`, never plain string equality; no expiry, no new table.
- `components/email/customer-message-email.tsx`: `CustomerMessageEmail({ name, body, unsubscribeUrl? })` React Email template mirroring `auto-reply-email.tsx`'s navy/marigold/sand inline-style shell; optional muted-gray unsubscribe footer only rendered when `unsubscribeUrl` is passed.
- `lib/resend.ts`: extended (existing `resend`/`FROM_EMAIL` exports untouched) with `sendBatchEmails(items)`, chunking to Resend's documented 100-item batch limit via a local `chunkArray` helper, re-throwing on whole-batch failure.
- `lib/sms/semaphore.ts`: thin `fetch`-based wrapper around Semaphore's `POST /api/v4/messages`, exporting `sendSingleSms`/`sendBulkSms`; throws `Error` on any non-OK HTTP response rather than swallowing.
- `npm run build` succeeds cleanly after both tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared message constants, HMAC unsubscribe token, customer-message email template** - `69784fc` (feat)
2. **Task 2: Resend batch-email helper + Semaphore SMS wrapper** - `ea0533c` (feat)

**Plan metadata:** (this commit, following SUMMARY.md creation)

## Files Created/Modified
- `lib/crm/messages.ts` - shared message channel/status enums, channel labels, `applyNameTemplate()` merge-tag helper
- `lib/unsubscribe-token.ts` - stateless HMAC-signed unsubscribe token sign/verify pair
- `components/email/customer-message-email.tsx` - outbound customer-message React Email template with optional unsubscribe footer
- `lib/resend.ts` - adds `sendBatchEmails()` (chunked Resend Batch API helper) alongside existing exports
- `lib/sms/semaphore.ts` - Semaphore SMS wrapper (`sendSingleSms`, `sendBulkSms`)

## Decisions Made
- `sendBatchEmails()`'s `items` parameter types its `react` field via `import type { ReactElement } from "react"` rather than `React.ReactElement`, since `lib/resend.ts` had no existing React namespace import — matches the codebase's established named-import convention (`createElement` from `"react"` in `lib/crm/notify-staff.ts`/`app/api/inquiries/route.ts`) instead of introducing a new import style.
- Semaphore account/sender-name live confirmation deferred to end-of-phase human verification (`workflow.human_verify_mode=end-of-phase`), matching this plan's own Task 2 `<human-check>` and the 03-03 `RESEND_API_KEY` precedent — no live SMS send was attempted this session since `SEMAPHORE_API_KEY`/`SEMAPHORE_SENDER_NAME` are unset in this environment.

## Deviations from Plan

None functionally — both tasks implemented exactly as specified, all `<action>` requirements met, `npm run build` passes after each task.

Two of the plan's own literal acceptance-criteria grep counts were unsatisfiable as written without weakening the implementation, and were treated as plan-authoring imprecision rather than functional gaps:
- **`components/email/customer-message-email.tsx` "exactly 1 occurrence of `unsubscribeUrl`"**: the plan's own `<action>` text requires `unsubscribeUrl` in the prop destructure, its type annotation, the conditional render check, and the `href` attribute — 4 syntactically necessary occurrences on 4 separate lines (`grep -c` counts matching lines). Implemented per the `<action>` text's actual requirements (optional prop, conditionally rendered footer, never unconditionally required) rather than chasing the literal count.
- **`lib/resend.ts` "exactly 1 occurrence of `resend.batch.send`"**: initially had 2 occurrences (one in the JSDoc description, one in the implementation) — fixed by rewording the doc comment to avoid restating the literal API call, bringing the count to exactly 1 as specified. No functional change.

## Issues Encountered
None.

## User Setup Required

This plan's `user_setup` (SEMAPHORE_API_KEY, SEMAPHORE_SENDER_NAME, UNSUBSCRIBE_TOKEN_SECRET) was not performed in this session — none of these env vars are read at module-load time in a way that would crash `next build` (Semaphore wrapper reads `process.env` per-call; `lib/unsubscribe-token.ts` uses a placeholder-fallback secret mirroring `lib/resend.ts`'s discipline), so this plan's automated verification passed without them configured. Before any real SMS send or unsubscribe-link exercise:
- `SEMAPHORE_API_KEY` — Semaphore Dashboard → API Keys
- `SEMAPHORE_SENDER_NAME` — Semaphore Dashboard → Sender Names (must be pre-approved; confirm per this plan's Task 2 human-check, deferred to end-of-phase verification)
- `UNSUBSCRIBE_TOKEN_SECRET` — generate locally via `openssl rand -hex 32`, never reuse another project secret

## Next Phase Readiness
- Service layer is complete and ready for 04-03's `actions/messages.ts` send actions (permission gating, opt-out filtering, quota logic) and 04-04's unsubscribe route to import directly.
- No blockers. Live Semaphore sender-name/endpoint confirmation remains open, to be exercised via 04-03's real send actions during this phase's end-of-phase human verification pass (per this plan's Task 2 human-check and coverage D6's rationale).

---
*Phase: 04-customer-messaging-email-sms*
*Completed: 2026-07-24*

## Self-Check: PASSED

All claimed files and commits verified present:
- lib/crm/messages.ts — FOUND
- lib/unsubscribe-token.ts — FOUND
- components/email/customer-message-email.tsx — FOUND
- lib/resend.ts — FOUND
- lib/sms/semaphore.ts — FOUND
- .planning/phases/04-customer-messaging-email-sms/04-02-SUMMARY.md — FOUND
- Commit 69784fc — FOUND
- Commit ea0533c — FOUND
