---
status: diagnosed
phase: 04-customer-messaging-email-sms
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md]
started: 2026-07-24T11:26:51Z
updated: 2026-07-24T11:32:00Z
---

## Current Test

[testing paused — user-flow step 3 (individual SMS) failed; MVP-mode halt rule stops the walkthrough here. Tests 4-14 (remaining flow steps, technical checks, coverage acknowledgments) not yet run. Resume with /gsd-verify-work 04 after the SMS-send failure is fixed.]

## Tests

<!-- Section 1: User-Flow Walkthrough (mandatory, ordered) -->
<!-- Story: As a TravelSentro Admin or Staff member, I want to proactively reach out to customers
     individually or in bulk via email and SMS, with opt-outs respected and every message logged
     to CRM history, so that the business can follow up on leads without risking spam complaints,
     provider suspension, or losing a record of what was said. -->

### 1. Open a contact's detail page
expected: Navigate to /admin/crm and open any contact's detail page. A "Message" button is visible next to the contact's status control.
result: pass

### 2. Send an individual email
expected: Click "Message". A compose dialog opens with Email/SMS tabs. Fill in a subject/body on the Email tab and send. A success toast appears and the dialog closes.
result: pass
note: "Email delivered successfully (toast + dialog close both worked), but landed in Gmail's Promotions tab rather than Primary/Inbox. Not a code defect this phase can fix directly — likely a sender-domain reputation/authentication (SPF/DKIM/DMARC) signal worth tracking separately, since it affects the 'without risking spam complaints' outcome."

### 3. Send an individual SMS
expected: Open the compose dialog again, switch to the SMS tab, fill in a body, and send. A success toast appears and the dialog closes.
result: issue
reported: "Failed, saw an error toast and no SMS message was sent"
severity: blocker

### 4. Bulk-select contacts including one opted-out
expected: Go to /admin/crm. Select 2+ contacts via row checkboxes, including one contact whose "Opted out" badge is showing. That opted-out row's checkbox is disabled and shows a tooltip explaining why.
result: [pending]

### 5. Send a bulk email or SMS
expected: With non-opted-out contacts selected, click "Message Selected". A confirmation dialog appears before sending. Confirm and send. A success (or partial-failure) toast appears.
result: [pending]

### 6. Opted-out contact excluded from the bulk send
expected: The opted-out contact from Test 4 does NOT receive the bulk email/SMS sent in Test 5, even though it may have been part of an earlier client-side selection.
result: [pending]

### 7. Real unsubscribe link click-through
expected: Open the unsubscribe link from an email actually sent in Test 2 (or any real customer-facing email with the unsubscribe footer). Clicking it flips the contact to opted-out and shows a confirmation page. The contact's CRM detail page now shows the "Opted out" badge/toggle in the opted-out state.
result: [pending]

### 8. Activity timeline shows accurate history
expected: On each contact messaged above, the "Activity" section shows the sent messages merged with inquiries, newest-first, each with a "Sent by {name}" attribution and (for any failed sends) a visible "Failed to send" badge.
result: [pending]

<!-- Section 2: Technical checks (deferred — only run after Section 1 passes) -->

### 9. Semaphore production configuration
expected: SEMAPHORE_API_KEY and SEMAPHORE_SENDER_NAME are set in the production/Vercel environment (not just local), and the Semaphore account has an approved/registered sender name — a real SMS send returns "Queued"/"Sent", not a sender-name or auth error.
result: [pending]

### 10. Unsubscribe secret production configuration (urgent)
expected: UNSUBSCRIBE_TOKEN_SECRET is actually set (to a real, non-default value) in the production/Vercel environment right now. If unset, real unsubscribe links are currently being signed/verified with the hardcoded fallback string visible in source — an active, exploitable gap.
result: [pending]

### 11. Tampered unsubscribe link is rejected
expected: Take a real unsubscribe link and modify one character of its `sig` query parameter. Visiting the tampered URL shows an "invalid link" message and does NOT flip the contact's opted-out status.
result: [pending]

### 12. Bulk email per-recipient status accuracy
expected: Send a bulk email to a batch that includes at least one address Resend would reject or bounce (e.g. a malformed/suppressed test address alongside valid ones). The Activity/messages log marks that specific recipient's message as "Failed to send" rather than blanket-marking the whole batch "Sent".
result: [pending]

<!-- Section 3: Coverage check (goal-backward, narrowed to the user story's outcome clause:
     "follow up on leads without risking spam complaints, provider suspension, or losing a
     record of what was said") -->

### 13. Known gap: bulk email status accuracy (CR-02)
expected: Confirm whether you accept `actions/messages.ts`'s `sendBulkEmail` (lines 241-260) currently blanket-marking a bulk batch "sent" regardless of individual Resend delivery outcome as a known, still-open gap (already documented in 04-REVIEW.md and 04-VERIFICATION.md), or whether it should block phase completion until fixed.
result: [pending]

### 14. Known gap: forgeable unsubscribe signature (CR-01)
expected: Confirm whether you accept `lib/unsubscribe-token.ts`'s hardcoded HMAC secret fallback (used when UNSUBSCRIBE_TOKEN_SECRET is unset) as a known, still-open gap (already documented in 04-REVIEW.md and 04-VERIFICATION.md), or whether it should block phase completion until fixed.
result: [pending]

<!-- Coverage auto-passed entries (#1602) — deterministically covered by passing automated
     verification during plan execution; NOT presented to the user as checkpoints. -->

### 15. contacts.opted_out column live, default false, flippable only via set_contact_opted_out()
expected: contacts.opted_out column live, default false, flippable only via set_contact_opted_out() for anon callers
result: pass
source: automated
coverage_id: 04-01-D1

### 16. types/database.ts regenerated for messaging schema
expected: types/database.ts regenerated and reflects all three new schema elements (messages, contacts.opted_out, set_contact_opted_out)
result: pass
source: automated
coverage_id: 04-01-D3

### 17. lib/crm/messages.ts channel/status constants
expected: lib/crm/messages.ts exports MESSAGE_CHANNELS/MessageChannel, MESSAGE_STATUSES/MessageStatus, CHANNEL_LABELS, applyNameTemplate()
result: pass
source: automated
coverage_id: 04-02-D1

### 18. lib/unsubscribe-token.ts HMAC timing-safe comparison
expected: signContactId/verifyContactId pair uses HMAC-SHA256 with timing-safe comparison, no expiry
result: pass
source: automated
coverage_id: 04-02-D2

### 19. customer-message-email.tsx React Email template
expected: Renders name/body/optional unsubscribeUrl via react-email JSX, never dangerouslySetInnerHTML
result: pass
source: automated
coverage_id: 04-02-D3

### 20. lib/resend.ts sendBatchEmails chunking
expected: Chunks recipients to Resend's 100-item batch limit, re-throws on whole-batch failure
result: pass
source: automated
coverage_id: 04-02-D4

### 21. lib/sms/semaphore.ts wrapper
expected: sendSingleSms/sendBulkSms POST to Semaphore's documented endpoint, throw on non-OK response
result: pass
source: automated
coverage_id: 04-02-D5

### 22. actions/messages.ts permission gating
expected: 5 Server Actions all requirePermission('can_message_customers')-gated, zero after() usage
result: pass
source: automated
coverage_id: 04-03-D1

### 23. Bulk send server-side opt-out re-query
expected: sendBulkEmail/sendBulkSms re-query contacts server-side with .eq('opted_out', false), never trusting client-submitted id list
result: pass
source: automated
coverage_id: 04-03-D2

### 24. Every send inserts a messages row
expected: Every send function (individual email/SMS, bulk email/SMS) inserts one messages row per recipient
result: pass
source: automated
coverage_id: 04-03-D3

### 25. Bulk email quota gate
expected: sendBulkEmail rejects a send exceeding the rolling-24h 100-email quota before the confirmation dialog opens
result: pass
source: automated
coverage_id: 04-03-D4

### 26. Manual opt-out toggle with optimistic update
expected: A can_edit_crm-permissioned Staff/Admin can manually toggle a contact's opted-out status with optimistic-update-with-revert-on-failure
result: pass
source: automated
coverage_id: 04-04-D2

### 27. Activity timeline merges inquiries and messages
expected: The Activity timeline shows both inquiries and sent messages, newest-first, with failed sends visibly marked and sender attributed
result: pass
source: automated
coverage_id: 04-04-D3

### 28. Read-only opt-out badge for non-can_edit_crm sessions
expected: A Staff session without can_edit_crm sees the read-only "Opted out" badge, never the toggle Switch
result: pass
source: automated
coverage_id: 04-04-D4

## Summary

total: 28
passed: 16
issues: 1
pending: 11
skipped: 0
blocked: 0

## Gaps

<!-- YAML format for plan-phase --gaps consumption -->
- truth: "Open the compose dialog, switch to the SMS tab, fill in a body, and send. A success toast appears and the dialog closes."
  status: failed
  reason: "User reported: Failed, saw an error toast and no SMS message was sent"
  severity: blocker
  test: 3
  root_cause: "SEMAPHORE_API_KEY and SEMAPHORE_SENDER_NAME are unset in .env.local (the file npm run dev actually loads). Semaphore returns its 'invalid apikey' validation error as HTTP 200 (not 4xx/5xx), so lib/sms/semaphore.ts's `if (!res.ok) throw` never fires. sendSingleSms() then array-destructures the plain error object as if it were SemaphoreMessage[], throwing a TypeError that actions/messages.ts's bare catch converts into a generic 'failed' status/error toast. This is the exact Semaphore production-config gap this phase's own PLAN/SUMMARY/VERIFICATION artifacts repeatedly deferred to end-of-phase human verification -- now confirmed failing on first real exercise."
  artifacts:
    - path: ".env.local"
      issue: "SEMAPHORE_API_KEY and SEMAPHORE_SENDER_NAME both unset (config gap, not a code file)"
    - path: "lib/sms/semaphore.ts"
      issue: "callSemaphore()'s `if (!res.ok) throw` doesn't explicitly detect Semaphore's HTTP-200-with-validation-error response shape; failure detection is incidental (relies on a destructure throwing on a non-array response)"
    - path: "actions/messages.ts"
      issue: "sendIndividualSms/sendBulkSms bare catch blocks correctly mark status failed, but surface only a generic error message rather than distinguishing 'provider misconfigured' from other failure classes"
  missing:
    - "Provision valid SEMAPHORE_API_KEY and an approved SEMAPHORE_SENDER_NAME in .env.local (local) and the production/Vercel environment"
    - "Harden lib/sms/semaphore.ts's callSemaphore() to explicitly validate the response shape (array of SemaphoreMessage vs. an error object with field-keyed arrays) instead of relying only on res.ok and an incidental destructure throw"
  debug_session: ".planning/debug/sms-send-fails.md"
