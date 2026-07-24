# Phase 4: Customer Messaging (Email & SMS) - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin/Staff with "message customers" permission can send an individual email or SMS to a single contact, and a bulk email or SMS to a selected/segmented set of contacts. A contact who has opted out is excluded from all future bulk email/SMS sends. Every sent message (individual and bulk) is logged and visible in the contact's history (matches Phase 3's inquiry-timeline pattern). This is proactive outreach layered on top of Phase 3's CRM — no drip/multi-step automated sequences (deferred to v2 per PROJECT.md), no granular per-contact scheduling, no marketing-campaign builder.

**Generated via `--auto` mode:** all gray areas below were auto-resolved by selecting the recommended option (grounded in CLAUDE.md's existing provider guidance and this project's established "smallest vertical slice, avoid premature complexity" pattern from Phases 1-3), not decided interactively with the user. Every auto-selection is logged with its rationale in `04-DISCUSSION-LOG.md` and below — review before/during planning and override any that don't match actual business intent.

</domain>

<decisions>
## Implementation Decisions

### Opt-Out Mechanism (MSG-05)
- **D-01 [auto-selected]:** Opt-out is a single combined flag per contact (`contacts.opted_out boolean not null default false`), not separate per-channel (email vs SMS) flags. Matches MSG-05's wording ("opt out of bulk email/SMS" as one concept) and this project's consistent "fixed, simple set over granular configurability" bias (mirrors Phase 2's 3-toggle permission decision). *Recommended because: per-channel opt-out is a real feature some CRMs offer, but nothing in REQUIREMENTS.md or PROJECT.md asks for it, and it roughly doubles the opt-out UI/logic surface for no requested benefit.*
- **D-02 [auto-selected]:** Opt-out has TWO paths: (1) a self-service unsubscribe link/landing page in every bulk email footer (public, no-auth route that sets `opted_out = true` via a signed/tokenized contact reference), and (2) a staff-manual toggle in the CRM contact detail page (`03-05`'s `crm-detail.tsx`) for phone-requested or SMS-reply opt-outs. *Recommended because: this is the STATE.md-flagged legal/provider-risk item (PH Data Privacy Act + email provider suspension risk for bulk sends with no unsubscribe mechanism) — self-service link is close to a hard requirement for bulk email deliverability, not just a nice-to-have, and is a well-established, low-effort pattern (one API route + one DB column). SMS opt-out via inbound reply-keyword parsing (e.g. "STOP") is explicitly Claude's Discretion / may be deferred if the SMS provider's webhook support adds real complexity — the staff-manual toggle is the guaranteed-available fallback.*
- **D-03 [auto-selected]:** Bulk send UI (email and SMS) always filters out `opted_out = true` contacts before sending — enforced server-side in the bulk-send Server Action, not just hidden in the selection UI, so a stale client-side contact list can never bypass it.

### SMS Provider (MSG-02, MSG-04)
- **D-04 [auto-selected]:** Semaphore is the SMS provider (not PhilSMS). *Recommended because: CLAUDE.md explicitly marks Semaphore "(recommended)" — PH-focused coverage (Globe/Smart/Sun/Dito), single REST call handles up to 1,000 recipients (covers this project's <500-contact bulk sends in one call), free signup credits to test, and no viable free-tier alternative exists for either provider so cost isn't a differentiator at this project's scale. PhilSMS remains the documented backup if Semaphore reliability/pricing underperforms in practice — not re-litigated here.*
- **D-05 [auto-selected]:** A thin internal `sendSingleSms()` / `sendBulkSms()` wrapper (per CLAUDE.md's own stack guidance) sits between application code and Semaphore's REST API — no official Node SDK exists, and the wrapper keeps a provider swap (e.g. to PhilSMS) from touching calling code later.

### Bulk Segmentation (MSG-03, MSG-04)
- **D-06 [auto-selected]:** "Selected/segmented set of contacts" means ad-hoc multi-select from the existing CRM contact list (`03-04`'s `crm-table.tsx`, which already has search/filter by name/status/tag) — checkboxes on the table plus a "Message Selected" bulk action. No new saved-segment/criteria-builder feature (e.g. "all New leads tagged VIP, auto-updating"). *Recommended because: 03-04 already built exactly the search/filter/select surface a segment needs; a saved-segment concept is a new abstraction PROJECT.md's Requirements never asked for, and this project's Out of Scope section already sets the tone ("Granular per-permission configurability beyond the fixed set... fixed set is enough for v1") — the same "reuse what exists, don't add new configurability concepts" bias applies here.*

### Bulk Email Volume Strategy (MSG-03)
- **D-07 [auto-selected]:** Stay on Resend only (no second email provider added this phase). Bulk email sends are server-side throttled/queued to respect Resend's 100/day free-tier cap — if a bulk send would exceed the remaining daily quota, the Server Action rejects it up front with a clear "N of M would exceed today's email quota" message rather than partially sending and silently dropping the rest. *Recommended because: CLAUDE.md's own Alternatives Considered table says adding Brevo for bulk email is "worth reconsidering only if Resend's 100/day cap proves too restrictive for bulk sends in practice" — i.e., don't add a second provider preemptively. This also avoids a second account/API-key/domain-verification setup step before real send volume is known.*

### Claude's Discretion
- Exact `messages` table schema (parallel to Phase 3's `inquiries` — one row per sent message: channel, recipient, subject/body or SMS text, status (sent/failed), provider message id, sent_by, sent_at, individual-vs-bulk flag or a `batch_id` grouping bulk sends together).
- Message composition UI: plain-text compose box vs. minimal template/merge-tag support (e.g. `{{name}}`) for bulk sends — lean toward simple plain-text with `{{name}}` substitution only, no rich-text editor or saved-template library, matching Phase 3's plain email templates.
- SMS inbound reply-keyword ("STOP") handling — implement via Semaphore webhook if straightforward, otherwise defer entirely to the staff-manual opt-out toggle (D-02) as v1's only SMS opt-out path.
- Exact API route / Server Action structure for individual vs. bulk send, and where "Message" entry points live in the CRM detail (`03-05`) and list (`03-04`) pages.
- Whether SMS character-count/segment-cost feedback is shown to staff before sending (nice-to-have, not a stated requirement).
- `messages` RLS policy shape — mirror Phase 3's `can_edit_crm`-gated write / universal-authenticated-read pattern unless a reason emerges to diverge (sending a message is arguably closer to "edit CRM" than a passive read, so gate the *send* action on `can_message_customers` specifically, per MSG-01 through MSG-04's exact wording — not `can_edit_crm`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & requirements
- `.planning/PROJECT.md` — Core value, business context, constraints (SMS is the one accepted pay-as-you-go exception to the free-tier budget preference), Key Decisions table
- `.planning/REQUIREMENTS.md` §Messaging (MSG-01–06) — full requirement list this phase must satisfy
- `.planning/ROADMAP.md` §Phase 4 — goal, success criteria, dependencies (depends on Phase 3)
- `.claude/CLAUDE.md` §Free Email Sending: Comparison — Resend 100/day cap (D-07), Brevo as the documented (not selected) bulk-email fallback
- `.claude/CLAUDE.md` §PH-Friendly SMS Provider Comparison — Semaphore (selected, D-04) vs PhilSMS (documented backup) pricing/API shape
- `.claude/CLAUDE.md` §Stack Patterns by Variant — the `sendSingleSms()`/`sendBulkSms()` thin-wrapper guidance (D-05)

### Prior phase (code/schema this phase extends)
- `supabase/migrations/20260720121436_create_crm_schema.sql` + `supabase/migrations/20260720130816_fix_crm_schema_review_findings.sql` — current live `contacts`/`inquiries` schema this phase adds `opted_out` (D-01) and a new `messages` table to
- `lib/resend.ts`, `components/email/*.tsx` — existing Resend client + React Email templates (auto-reply, internal notification) from Phase 3; individual/bulk customer email reuses this same client, new templates
- `lib/crm/notify-staff.ts` — Phase 3's bcc-fan-out pattern; NOT reused directly for customer-facing sends (those are `to:` the actual customer, not bcc), but the try/catch/log-on-failure discipline should carry over
- `actions/crm.ts` — `requirePermission()`-gated Server Action pattern (03-05) this phase's send actions should mirror, gating on `can_message_customers` per D-Claude's-Discretion note above
- `components/admin/crm-table.tsx`, `components/admin/crm-detail.tsx` — existing CRM list/detail UI (03-04/03-05) this phase adds bulk-select and individual-send entry points to, per D-06
- `.planning/phases/03-lead-capture-crm-automation/03-SECURITY.md` — Phase 3's threat register/mitigations (SECURITY DEFINER RPC pattern, bcc-only fan-out, server-only secret handling) — Phase 4's new send paths should follow the same conventions (e.g. RESEND_API_KEY/Semaphore API key handling mirrors T-03-10's server-only discipline)
- `.planning/phases/03-lead-capture-crm-automation/03-REVIEW.md` — WR-01 (Server Actions need server-side re-validation, not just client zod) applies equally to this phase's new send actions; WR-03 (unverified client-supplied text reaching outbound messages) is directly relevant to message-compose input handling

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/resend.ts` — `resend` client singleton + `FROM_EMAIL` constant, directly reusable for individual/bulk customer email (new templates needed, not new client setup)
- `lib/action-result.ts` — `ActionResult` type (`{ok:true} | {ok:false, error:string}`) already the established Server Action return shape across `actions/crm.ts`, `actions/users.ts`, `actions/packages.ts` — new send actions should return this same shape
- `lib/crm/status.ts` — established "shared constants/labels module" pattern (`03-04`) to mirror for a new `lib/crm/messages.ts` or similar if message channel/status enums need shared display logic
- `components/admin/crm-table.tsx` — TanStack Table already has search/filter by name/status/tag; adding row-selection (checkbox column) for bulk-send targeting is an incremental addition, not a rebuild

### Established Patterns
- Every Server Action in `actions/*.ts` starts with a `requirePermission()`/`requireAdmin()` call before any Supabase call (Phase 2/3 convention) — new send actions follow this exactly, gated on `can_message_customers`
- Outbound send side-effects (Phase 3's auto-reply/internal-notification emails) are try/catch-wrapped and log-only on failure, never blocking the caller's response — likely applies to individual sends too, though a user-initiated "Send Email" action arguably SHOULD surface send failure to the clicking staff member (unlike Phase 3's fire-and-forget `after()` pattern) — flagged as a real difference worth the planner/researcher's attention, not resolved here
- No `messages`/`sms_log`/similar table exists yet — greenfield schema addition, same "SECURITY DEFINER RPC as sole write path" precedent (03-01) may or may not apply depending on whether sends originate only from authenticated Server Actions (likely yes, since — unlike Phase 3's public inquiry form — nothing in Phase 4 is anon-writable)

### Integration Points
- New send actions sit between the CRM list (`03-04`, bulk entry point) / detail (`03-05`, individual entry point) pages and both Resend (email) and the new Semaphore wrapper (SMS)
- New `messages` table needs an RLS write policy scoped to `can_message_customers` (not `can_edit_crm` — different permission per MSG-01 through MSG-04's exact wording) and likely the same universal-authenticated-read pattern as `contacts`/`inquiries` (CRM-03 precedent) so any Staff can see message history even if they can't send
- Public, no-auth unsubscribe route (D-02) is the project's second unauthenticated write surface after Phase 3's `/api/inquiries` — needs the same tokenized/signed-reference discipline (not a raw guessable contact id) to avoid letting anyone unsubscribe an arbitrary contact

</code_context>

<specifics>
## Specific Ideas

No specific ideas were captured interactively — this context was generated in `--auto` mode. Every decision above was auto-selected from the recommended option per its stated rationale; there is no user-provided "I want it like X" reference beyond what CLAUDE.md and prior-phase precedent already establish.

</specifics>

<deferred>
## Deferred Ideas

- **Drip/multi-step automated follow-up sequences (AUTOv2-01)** — already deferred to v2 at project init (PROJECT.md Deferred Items); not re-raised here, stays out of Phase 4's scope (individual/bulk send only, no scheduling/sequencing).
- **SMS inbound reply-keyword ("STOP") auto-opt-out** — noted as Claude's Discretion above, not a hard requirement; may land in this phase if straightforward via Semaphore's webhook support, otherwise explicitly deferred to a fast-follow with the staff-manual toggle (D-02) as the v1 fallback.
- **Saved/dynamic segment criteria for bulk sends** (e.g. "all contacts tagged VIP, auto-updating") — considered and explicitly not selected (D-06 picked ad-hoc multi-select instead); worth reconsidering only if manual multi-select proves painful at real contact-list scale.
- **Per-channel opt-out granularity** (opt out of email but not SMS, or vice versa) — considered and explicitly not selected (D-01 picked a single combined flag); revisit only if a real business need for channel-specific consent emerges.

</deferred>

---

*Phase: 4-Customer Messaging (Email & SMS)*
*Context gathered: 2026-07-24*
