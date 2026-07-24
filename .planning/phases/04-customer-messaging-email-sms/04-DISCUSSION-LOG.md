# Phase 4: Customer Messaging (Email & SMS) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 4-Customer Messaging (Email & SMS)
**Mode:** `--auto` (fully autonomous — no interactive prompts; recommended option auto-selected for every gray area, logged here for audit)
**Areas discussed:** Opt-Out Mechanism, SMS Provider, Bulk Segmentation, Bulk Email Volume Strategy

---

## Opt-Out Mechanism (MSG-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Staff-manual toggle only | CRM contact detail page gets an "opted out" switch; no self-service link | |
| Self-service unsubscribe link only | Footer link in every bulk email/SMS sets opt-out via a public route; no staff override | |
| Both (self-service link + staff toggle) | Public unsubscribe route AND a staff-manual toggle in the CRM UI | ✓ |
| Per-channel opt-out (separate email/SMS flags) | Two independent booleans instead of one combined flag | |

**Selected:** Both self-service unsubscribe link (bulk email footer, public no-auth route) and staff-manual toggle (`03-05`'s contact detail page); single combined `opted_out` flag, not per-channel.
**Notes:** Auto-selected because self-service unsubscribe is close to a hard requirement for bulk email deliverability (provider suspension risk) and directly addresses the STATE.md-flagged PH Data Privacy Act / provider-suspension concern carried forward from Phase 3's transition. The staff-manual toggle covers phone-requested/SMS-reply opt-outs where a self-service link isn't practical. Combined (not per-channel) flag matches MSG-05's wording and this project's consistent low-configurability bias.

---

## SMS Provider (MSG-02, MSG-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Semaphore | PH-focused, ₱0.50–0.56/SMS, 1000-recipient single-call bulk, free test credits | ✓ |
| PhilSMS | ~₱0.35/SMS, 1-year credit validity, official REST API | |
| Twilio | ~$0.17–0.20/SMS (≈₱10–11) — 20x+ more expensive for PH-only sending | |

**Selected:** Semaphore.
**Notes:** CLAUDE.md explicitly marks Semaphore "(recommended)" for this project's PH-only, low-volume use case. PhilSMS remains the documented backup if Semaphore underperforms in practice, per CLAUDE.md's own bake-off recommendation — not a blocking concern for this phase's planning.

---

## Bulk Segmentation (MSG-03, MSG-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Ad-hoc multi-select | Checkboxes on the existing `03-04` CRM table + "Message Selected" action, reusing existing search/filter | ✓ |
| Saved/dynamic segment criteria | New "segment" concept — save filter criteria (e.g. status=New AND tag=VIP) as a reusable, auto-updating group | |
| Both | Multi-select now, saved segments as a stretch addition | |

**Selected:** Ad-hoc multi-select only, reusing `03-04`'s existing search/filter/table UI.
**Notes:** `03-04` already built exactly the search/filter/select surface a segment needs. Saved-segment criteria is a new abstraction not requested by REQUIREMENTS.md/PROJECT.md; matches this project's existing bias toward fixed, simple sets over open-ended configurability (e.g. Phase 2's fixed 3-toggle permissions instead of full RBAC).

---

## Bulk Email Volume Strategy (MSG-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Resend only, server-side throttled | Stay on Resend's 100/day free cap; reject bulk sends that would exceed remaining daily quota | ✓ |
| Add Brevo for bulk email | New provider (300/day free cap) specifically for bulk/marketing sends, per CLAUDE.md's "Stack Patterns by Variant" | |
| Add Brevo, migrate all email to it | Replace Resend entirely | |

**Selected:** Stay on Resend only, with server-side quota-aware throttling/rejection for bulk sends.
**Notes:** CLAUDE.md's own Alternatives Considered table frames adding Brevo as worth reconsidering "only if Resend's 100/day cap proves too restrictive for bulk sends in practice" — i.e., don't add a second provider preemptively before real send volume is known. Avoids a second account/domain-verification setup this phase.

---

## Claude's Discretion

- Exact `messages` table schema (channel, recipient, body, status, provider message id, sent_by, sent_at, batch grouping for bulk sends)
- Message composition UI: plain-text with `{{name}}` merge tag only, no rich-text editor or template library
- SMS inbound "STOP" reply-keyword auto-opt-out — implement if straightforward via Semaphore webhook, otherwise defer to the staff-manual toggle as v1's SMS opt-out path
- Exact API route / Server Action structure for individual vs. bulk send entry points
- Whether SMS character-count/segment-cost feedback is shown before sending
- `messages` RLS policy shape — write gated on `can_message_customers` (not `can_edit_crm`, per MSG-01–04's exact wording), read likely universal-authenticated per the CRM-03 precedent

## Deferred Ideas

- Drip/multi-step automated follow-up sequences (AUTOv2-01) — already deferred to v2 at project init, not re-raised
- SMS inbound reply-keyword auto-opt-out — noted as discretionary, may or may not land this phase
- Saved/dynamic segment criteria for bulk sends — explicitly not selected this phase (ad-hoc multi-select chosen instead); revisit only if manual selection proves painful at scale
- Per-channel opt-out granularity (email vs SMS independently) — explicitly not selected (single combined flag chosen instead); revisit only if a real business need emerges
