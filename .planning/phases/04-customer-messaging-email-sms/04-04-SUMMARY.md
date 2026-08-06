---
phase: 04-customer-messaging-email-sms
plan: 04
subsystem: messaging
tags: [server-actions, hmac, unsubscribe, rls, activity-timeline]

requires:
  - phase: 04-customer-messaging-email-sms (plan 01)
    provides: contacts.opted_out column, set_contact_opted_out() SECURITY DEFINER RPC, can_edit_crm-scoped contacts UPDATE RLS policy
  - phase: 04-customer-messaging-email-sms (plan 02)
    provides: lib/unsubscribe-token.ts's verifyContactId() HMAC pair
  - phase: 04-customer-messaging-email-sms (plan 03)
    provides: actions/messages.ts, crm-detail.tsx, crm-table.tsx (this plan modifies all three, same-file overlap dependency)
provides:
  - app/unsubscribe/page.tsx (public unauthenticated Server Component)
  - actions/messages.ts's updateOptOut(contactId, optedOut)
  - crm-detail.tsx's opt-out Switch/badge, CrmDetailMessage type, merged "Activity" timeline
  - crm-table.tsx's "Opted out" badge in the tags cell
affects: []

tech-stack:
  added: []
  patterns:
    - "app/unsubscribe/page.tsx as an async Server Component OUTSIDE the (public) route group, rendering standalone under only the root layout -- not a Route Handler, since the endpoint's entire job is rendering visible HTML"
    - "HMAC signature verified BEFORE any Supabase RPC call, never after -- the verification IS the entire security boundary for this plan's one anonymous write surface"
    - "Merged-and-sorted ActivityItem union (kind: 'inquiry' | 'message') built client-side from two already-fetched arrays, rather than a second query or a SQL UNION"

key-files:
  created:
    - app/unsubscribe/page.tsx
  modified:
    - actions/messages.ts
    - components/admin/crm-detail.tsx
    - components/admin/crm-table.tsx
    - "app/admin/(dashboard)/crm/[id]/page.tsx"

key-decisions:
  - "updateOptOut() gated on can_edit_crm (not can_message_customers) since toggling opt-out is a contact-record edit, not a message send -- reuses the existing 03-01 contacts UPDATE RLS policy unchanged, no new policy"
  - "Used the codebase's established &apos; JSX-text convention (matching app/admin/(dashboard)/error.tsx, forbidden/page.tsx, contact/page.tsx) for apostrophes in the unsubscribe page's copy instead of a literal apostrophe character -- renders the exact UI-SPEC string but the literal-apostrophe grep in the plan's acceptance criteria doesn't match; see Deviations"
  - "Activity timeline built as a client-side merge-and-sort of two already-fetched, already-embedded arrays (inquiries + messages) rather than a second Supabase query or a SQL view/UNION -- both arrays are small per-contact lists, no pagination concern at this scale"

requirements-completed: [MSG-05, MSG-06]

coverage:
  - id: D1
    description: "A real signed unsubscribe link flips exactly the referenced contact's opted_out to true and renders success; a tampered/missing signature renders 'invalid link' and performs NO write"
    requirement: "MSG-05"
    verification:
      - kind: unit
        ref: "grep -c 'verifyContactId(' app/unsubscribe/page.tsx == 1 (called before the isValid-gated RPC branch); grep -c 'supabase.rpc(\"set_contact_opted_out\"' == 1, only reached inside `if (isValid)`; npm run build"
        status: pass
      - kind: integration
        ref: "Live click-through of a real signed link, a tampered link, and confirmation of the CRM badge/toggle state change"
        status: pending
    human_judgment: true
    rationale: "Deferred to end-of-phase human verification per this plan's own Task 2 human-check and workflow.human_verify_mode=end-of-phase -- no live email/browser session available in this execution context."
  - id: D2
    description: "A can_edit_crm-permissioned Staff/Admin can manually toggle a contact's opted-out status with optimistic-update-with-revert-on-failure behavior identical to the existing status editor"
    requirement: "MSG-05"
    verification:
      - kind: unit
        ref: "handleOptOutChange mirrors handleStatusChange's exact previous/setState/await/revert-on-catch-or-!ok shape; grep -c 'requirePermission(\"can_edit_crm\")' actions/messages.ts == 1 (in updateOptOut, alongside 5 existing can_message_customers occurrences); npm run build"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Activity timeline shows both inquiries and sent messages, newest-first, with failed sends visibly marked and each message's sender attributed"
    requirement: "MSG-06"
    verification:
      - kind: unit
        ref: "activity array sorts merged inquiry+message items by created_at descending; grep -c 'Failed to send' == 1; grep -c 'Sent by ' == 1; npm run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "A Staff session without can_edit_crm sees the read-only 'Opted out' badge, never the toggle Switch"
    requirement: "MSG-05"
    verification:
      - kind: unit
        ref: "Code inspection: canEdit ? <Switch .../> : optedOut ? <Badge>Opted out</Badge> : null -- same branching shape as the existing status Select/Badge split"
        status: pass
    human_judgment: false
  - id: D5
    description: "Authenticated-session RLS INSERT/UPDATE permission differential (can_message_customers/can_edit_crm session succeeds vs. a session lacking it is rejected) exercised live"
    verification: []
    human_judgment: true
    rationale: "Carried forward a third time from 04-01's coverage D2 and 04-03's coverage D6 -- no .env.local/Supabase credential access was available in this execution session either, so no real staff/admin Supabase Auth session could be exercised to test the permission differential live for either can_message_customers (messages INSERT) or can_edit_crm (contacts UPDATE, this plan's updateOptOut()). The RLS policy text and requirePermission() gating are confirmed present and correct via static code inspection across all three plans. This is now the phase's single most-recurring open item -- flagging explicitly for the phase's end-of-phase human verification pass, where a real logged-in Staff (without can_edit_crm) and Admin (with can_edit_crm) session should attempt updateOptOut() and confirm the differential."

duration: 6min
completed: 2026-07-24
status: complete
---

# Phase 4 Plan 04: Opt-Out Toggle, Public Unsubscribe Page, Merged Activity Timeline Summary

**Closes MSG-05's consent story (self-service unsubscribe link + staff-manual toggle) and MSG-06's "visible" half (merged inquiries+messages Activity timeline) -- the final plan of Phase 4.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-24T18:27:43+08:00 (approx., from prior plan's commit)
- **Completed:** 2026-07-24T18:33:04+08:00
- **Tasks:** 3 completed
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `actions/messages.ts`: added `updateOptOut(contactId, optedOut)`, gated on `can_edit_crm` (not `can_message_customers`), reusing the existing 03-01 `contacts` UPDATE RLS policy -- no new policy.
- `components/admin/crm-detail.tsx`: opt-out `Switch` (canEdit) with optimistic-update-with-revert-on-failure mirroring `handleStatusChange` exactly, read-only "Opted out" `Badge` for non-editors; the individual-mode `MessageComposeDialog` now receives the live `optedOut` state instead of the static `contact.opted_out` prop.
- `components/admin/crm-table.tsx`: "Opted out" badge appended to the existing tags cell.
- `app/unsubscribe/page.tsx`: new public, unauthenticated Server Component outside the `(public)` route group -- `verifyContactId()` checked before any Supabase call; `set_contact_opted_out()` RPC only fires when the signature is valid; success/invalid-link states share one centered-card shell with WhatsApp/Facebook fallback links.
- `app/admin/(dashboard)/crm/[id]/page.tsx`: contact query now embeds `messages` (newest-first), mapped to `detailMessages` and passed to `CrmDetail`.
- `components/admin/crm-detail.tsx`: new `CrmDetailMessage` type and `ActivityItem` union; the "Inquiry History" section is renamed "Activity" and merges inquiries + messages into one newest-first timeline -- inquiry rendering kept byte-for-byte identical, message entries add channel icon/label, subject (email only, semibold), body, "Failed to send" badge, and "Sent by {name}" caption.
- `npm run build` and `npx eslint` (0 errors) pass cleanly after every task.

## Task Commits

Each task was committed atomically:

1. **Task 1: updateOptOut() action + manual opt-out toggle + opted-out badges** - `1a24f00` (feat)
2. **Task 2: Public unsubscribe page (HMAC verify + RPC + confirmation UI)** - `ad8ee17` (feat)
3. **Task 3: Merge messages into the Activity timeline** - `0a75926` (feat)

**Plan metadata:** (this commit, following SUMMARY.md creation)

## Files Created/Modified
- `app/unsubscribe/page.tsx` - public unauthenticated Server Component; HMAC-verifies cid/sig before calling set_contact_opted_out(); success/invalid confirmation UI
- `actions/messages.ts` - adds `updateOptOut(contactId, optedOut)`, can_edit_crm-gated
- `components/admin/crm-detail.tsx` - opt-out Switch/Badge in Contact Info card; `CrmDetailMessage` type; merged "Activity" timeline
- `components/admin/crm-table.tsx` - "Opted out" badge in the tags cell
- `app/admin/(dashboard)/crm/[id]/page.tsx` - `messages` embedded in the contact query, mapped to `detailMessages`

## Decisions Made
- `updateOptOut()` gated on `can_edit_crm`, not `can_message_customers` -- per 04-CONTEXT.md's explicit Claude's-Discretion note, this is a contact-record edit, mirroring `updateStatus`/`updateContact` in `actions/crm.ts`.
- Unsubscribe page apostrophes use the codebase's established `&apos;` JSX-text convention (matching `app/admin/(dashboard)/error.tsx`, `forbidden/page.tsx`, `(public)/contact/page.tsx`) rather than a literal `'` character -- renders the exact UI-SPEC copy and passes `npx eslint` cleanly.
- Activity timeline is a client-side merge-and-sort of the two already-embedded arrays (inquiries + messages), not a second query or SQL UNION -- both lists are small per-contact sets.
- SMS inbound "STOP" keyword auto-opt-out remains explicitly deferred (not built this plan or phase) -- the staff-manual toggle (Task 1) is the only SMS opt-out path in v1, per 04-CONTEXT.md's Claude's-Discretion note and 04-RESEARCH.md's Deferred Ideas section.

## Deviations from Plan

None functionally -- all three tasks implemented exactly as specified in `<action>`, all acceptance-criteria intent (HMAC-before-RPC ordering, can_edit_crm gating, optimistic-revert toggle behavior, merged newest-first timeline with exact per-entry content) was met and verified via `npm run build` + `npx eslint` + targeted grep checks.

Three of the plan's own literal acceptance-criteria grep counts were unsatisfiable as written without weakening the implementation -- same category of plan-authoring imprecision 04-02/04-03's SUMMARYs documented and treated the same way (functional correctness preserved, literal count not force-fit):

- **`app/unsubscribe/page.tsx` "exactly 1 occurrence of `You've been unsubscribed`" / `"This link isn't valid"`**: implemented with the codebase's established `&apos;`/`&#39;`-equivalent JSX-text convention for apostrophes (matching 3 other existing files in this codebase), which a plain-apostrophe grep pattern doesn't match. The rendered page text is character-for-character the UI-SPEC's required copy; `npx eslint` (which does flag unescaped JSX entities in this project's config) passes cleanly on this exact form.
- **`components/admin/crm-detail.tsx` "exactly 1 occurrence of `"Activity"`"**: the plan's own grep pattern includes literal quote characters (`"Activity"`), but the heading is rendered as unquoted JSX text (`<h2>Activity</h2>`), matching the existing `<h2>Inquiry History</h2>` pattern it replaces (also never quoted). The actual heading text is "Activity", satisfying the UI-SPEC Copywriting Contract and the `grep -c 'Inquiry History' == 0` check.
- **`app/admin/(dashboard)/crm/[id]/page.tsx` "exactly 1 occurrence of `detailMessages`"**: the plan's own `<action>` text requires both the `const detailMessages: CrmDetailMessage[] = ...` declaration and the `messages={detailMessages}` JSX prop -- 2 syntactically necessary lines, both required for the feature to function (identical shape to 04-03 SUMMARY's documented `opted_out` example).

None of these affect runtime behavior; all were verified functionally correct via `npm run build` (zero TypeScript errors) and `npx eslint` (zero errors) after each task, plus manual code-path tracing against the plan's `<action>` prose (the authoritative spec).

## Issues Encountered

- **Carried forward a third time**: no `.env.local`/Supabase credential access in this execution session (same constraint noted in 04-01, 04-02, 04-03), so the authenticated-session RLS permission differential (`can_message_customers`/`can_edit_crm` session succeeds vs. a session lacking it is rejected) remains unexercised live across the entire phase. Per the note carried into this plan's prompt: this is now surfaced explicitly (not silently dropped) as coverage D5 above, and should be the first thing checked in the phase's end-of-phase human verification pass -- a real logged-in Staff (without `can_edit_crm`) attempting `updateOptOut()` should be rejected, and a real Admin/`can_edit_crm` Staff session should succeed.

## User Setup Required

None new this plan. `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`, `UNSUBSCRIBE_TOKEN_SECRET` (from 04-02) remain the phase's only outstanding external-service setup, still deferred to end-of-phase human verification -- `UNSUBSCRIBE_TOKEN_SECRET` in particular should be set before any real unsubscribe link is generated/sent, since `lib/unsubscribe-token.ts` currently falls back to a placeholder secret.

## Next Phase Readiness

- This is the final plan of Phase 4. All three MSG-05 consent surfaces (schema in 04-01, self-service link in this plan, staff-manual toggle in this plan) and all of MSG-06 ("logged" in 04-03, "visible" in this plan) are now code-complete and build-clean.
- Phase 4's end-of-phase human verification pass (per `workflow.human_verify_mode=end-of-phase`) has a growing queue of deferred live checks to run together: (1) 04-02's Task 2 Semaphore sender-name/endpoint confirmation, (2) 04-03's Task 2 real email/SMS send + bulk confirmation + quota banner + opted-out row disabling, (3) this plan's Task 2 real unsubscribe link click-through (valid + tampered) and manual toggle, and (4) the RLS permission differential (coverage D5, carried forward three times now) -- recommend running all four in one session against a disposable test contact with real Supabase Auth credentials.
- No blockers. SMS inbound STOP-keyword auto-opt-out remains explicitly out of scope for this milestone (documented deferred, not silently missing).

---
*Phase: 04-customer-messaging-email-sms*
*Completed: 2026-07-24*

## Self-Check: PASSED

All claimed files and commits verified present:
- app/unsubscribe/page.tsx — FOUND
- actions/messages.ts — FOUND
- components/admin/crm-detail.tsx — FOUND
- components/admin/crm-table.tsx — FOUND
- app/admin/(dashboard)/crm/[id]/page.tsx — FOUND
- .planning/phases/04-customer-messaging-email-sms/04-04-SUMMARY.md — FOUND
- Commit 1a24f00 — FOUND
- Commit ad8ee17 — FOUND
- Commit 0a75926 — FOUND
