---
phase: 04-customer-messaging-email-sms
reviewed: 2026-07-24T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - actions/auth.ts
  - actions/messages.ts
  - app/admin/(dashboard)/crm/[id]/page.tsx
  - app/admin/(dashboard)/crm/page.tsx
  - app/unsubscribe/page.tsx
  - components/admin/crm-detail.tsx
  - components/admin/crm-table.tsx
  - components/admin/message-compose-dialog.tsx
  - components/email/customer-message-email.tsx
  - components/ui/checkbox.tsx
  - lib/crm/message-schema.ts
  - lib/crm/messages.ts
  - lib/resend.ts
  - lib/sms/semaphore.ts
  - lib/unsubscribe-token.ts
  - supabase/migrations/20260724100635_add_messaging_schema.sql
  - types/database.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-07-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Reviewed the customer messaging (email/SMS) feature: Server Actions for individual/bulk send, the unsubscribe token/route, the Resend and Semaphore provider wrappers, the messaging DB migration, and the CRM UI that drives all of it. The permission-gating, opt-out filtering, server-side re-validation of client-submitted recipient IDs, and HMAC-based unsubscribe design are all sound in principle. However, two correctness/security defects undercut those good intentions in practice: the unsubscribe HMAC secret has an insecure fallback that is reachable in production if the env var is never set (contradicting the code's own "fails safely" claim), and bulk email delivery status is recorded as blanket "sent" for the whole batch regardless of per-recipient failures, silently corrupting the messages log that the rest of the CRM (Activity timeline, "Failed to send" badge) depends on for accuracy. Several further robustness/UX gaps are listed below as warnings and info.

## Critical Issues

### CR-01: Unsubscribe HMAC secret has an insecure fallback that defeats the "fails safely" design intent

**File:** `lib/unsubscribe-token.ts:14`
**Issue:** `SECRET` falls back to the hardcoded string `"unconfigured-placeholder-secret"` when `UNSUBSCRIBE_TOKEN_SECRET` is unset. The doc comment claims this "degrades to a safely-failing verification at request time, never a next build crash" — but that's not what actually happens. Because the *same* fallback constant is used for both `signContactId()` (used when building outbound unsubscribe links) and `verifyContactId()` (used to gate the `set_contact_opted_out` RPC in `app/unsubscribe/page.tsx`), an unset secret does not fail closed — it silently and consistently succeeds using a secret value that is checked into the public source tree. Any external party who reads this file (open source repo, or anyone who has ever seen this codebase) can compute `HMAC-SHA256("unconfigured-placeholder-secret", <any-uuid>)` and hit `/unsubscribe?cid=<uuid>&sig=<forged>` for arbitrary contact IDs, mass-opting-out real customers with zero authentication. This is an authorization bypass, not a "safe failure."
**Fix:** Fail loudly instead of silently succeeding with a known secret. At minimum, throw/log a hard error at first use if the env var is unset in a non-dev environment, e.g.:
```ts
const SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET;
if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("UNSUBSCRIBE_TOKEN_SECRET must be set in production");
}
const EFFECTIVE_SECRET = SECRET || "unconfigured-placeholder-secret-DEV-ONLY";
```
Or better: verify the env var is present at deploy time (Vercel env check) and remove the fallback for this specific secret — unlike `RESEND_API_KEY`'s placeholder (which only breaks email sending if unset), this placeholder actively grants an auth bypass.

### CR-02: Bulk email send marks the entire batch "sent" even when individual recipients fail

**File:** `actions/messages.ts:241-260`, `lib/resend.ts:57-72`
**Issue:** `sendBulkEmail` does:
```ts
let markAllStatus: "sent" | "failed";
try {
  await sendBatchEmails(items);
  markAllStatus = "sent";
} catch {
  markAllStatus = "failed";
}
```
The return value of `sendBatchEmails` (the raw per-chunk Resend batch responses) is discarded entirely. `lib/resend.ts`'s own doc comment states: "the per-item error field is undocumented... this deliberately does not invent a normalized success/failure shape; the caller (actions/messages.ts) interprets the raw response itself" — but the caller does not interpret it at all. Resend's batch endpoint can return HTTP 200 with some items failed to queue (e.g. suppressed/invalid recipient) without throwing. Every contact in the batch is then written to `messages` with `status: "sent"` regardless, so the Activity timeline's "Failed to send" badge (`components/admin/crm-detail.tsx:349-353`) will never fire for a real per-recipient failure inside a successful batch call, and staff have no way to know a customer never actually received the message.
**Fix:** Capture and inspect the actual per-item results from `sendBatchEmails`, and only mark rows "sent" that Resend actually confirmed queued, e.g.:
```ts
const results = await sendBatchEmails(items); // don't discard
const rows = contacts.map((contact, i) => {
  const itemResult = results.flat()[i]; // shape depends on chunking; align indices per chunk
  return {
    contact_id: contact.id,
    channel: "email",
    subject: parsedValues.data.subject,
    body: parsedValues.data.body,
    status: itemResult?.error ? "failed" : "sent",
    provider_message_id: itemResult?.data?.id ?? null,
    batch_id: batchId,
    sent_by: profile.id,
    sent_by_name: profile.name,
  };
});
```
(Adjust to Resend's actual batch response shape — verify during the phase's human-check step referenced in the code comments.)

## Warnings

### WR-01: Compose dialog submit handlers have no `catch`, so thrown Server Action errors fail silently

**File:** `components/admin/message-compose-dialog.tsx:110-189`
**Issue:** `handleIndividualSubmit`, `handleBulkSubmitAttempt`, and `handleBulkConfirm` each wrap their Server Action call in `try { ... } finally { setIsSubmitting(false); }` with no `catch`. Every Server Action they call goes through `requirePermission()` (`lib/auth/dal.ts:54-64`), which does `throw new Error("Forbidden")` — a plain throw, not an `ActionResult`. If a staff member's permission is revoked mid-session, or their session expires, or `resend.emails.send()`/Supabase throws unexpectedly, the resulting rejected promise is unhandled inside these handlers. Unlike `components/admin/crm-detail.tsx:114-126,131-143`, which explicitly wrap the exact same class of call in `try/catch` specifically to convert a thrown error into a toast, these handlers give the user no feedback at all — the dialog just sits there with `isSubmitting` reset to `false` and no indication anything went wrong.
**Fix:** Add a `catch` clause mirroring `crm-detail.tsx`'s pattern:
```ts
async function handleIndividualSubmit() {
  setIsSubmitting(true);
  try {
    const result = await sendIndividualEmail(...);
    ...
  } catch {
    toast.error(SEND_ERROR_MESSAGE);
  } finally {
    setIsSubmitting(false);
  }
}
```

### WR-02: `/unsubscribe` mutates on a bare GET, vulnerable to email-scanner prefetch

**File:** `app/unsubscribe/page.tsx:29-32`
**Issue:** The page unconditionally calls `supabase.rpc("set_contact_opted_out", ...)` as soon as the signature verifies, during server render of a GET request. Many corporate email gateways (Microsoft Defender for Office 365 Safe Links, Proofpoint, Mimecast, etc.) automatically pre-fetch/"click" every link in an inbound email to scan for malware before the recipient ever opens it. Any bulk email sent through this system to a corporate recipient risks being silently and permanently opted-out by the recipient's mail security software before the human ever sees the message.
**Fix:** Require an explicit user action (a button/form POST, or at minimum a client-side confirm step) before invoking the RPC, rather than mutating during the initial page render.

### WR-03: Bulk SMS status attribution assumes exact string equality between stored and provider-returned phone numbers

**File:** `actions/messages.ts:306-324`, `lib/sms/semaphore.ts:11-54`
**Issue:** `statusByPhone` is keyed by `result.recipient` from Semaphore's response and looked up via `contact.phone!`. If Semaphore normalizes/reformats phone numbers in its response (a common behavior for SMS gateways — e.g. stripping a leading `0`, adding a country code, or reformatting `+63` vs `63`), the map lookup silently misses and `statusByPhone.get(contact.phone!) ?? "failed"` marks an actually-sent message as `"failed"` in the CRM log. The code comments already flag the Semaphore endpoint/response shape as "LOW-confidence... verify against a real account," so this mismatch risk is unverified.
**Fix:** Normalize both sides (e.g., strip non-digits) before comparing, or match by array index/order instead of by recipient string, once Semaphore's actual response ordering guarantees are confirmed during human verification.

### WR-04: Individual SMS never applies `{{name}}` templating, but the UI only warns about this for bulk SMS

**File:** `actions/messages.ts:102-162`, `components/admin/message-compose-dialog.tsx:283-288`
**Issue:** `applyNameTemplate()` is called for individual email (`actions/messages.ts:71`) and would need to be applied for individual SMS to be consistent, but `sendIndividualSms` sends `parsed.data.body` verbatim. The compose dialog's hint text "`{{name}}` isn't supported for text messages" is only rendered `{mode === "bulk" ? ... : null}` (line 283), so a staff member composing an **individual** text with `{{name}}` gets no warning at all and the literal string `{{name}}` is sent to the customer.
**Fix:** Either apply `applyNameTemplate(parsed.data.body, contact.name)` in `sendIndividualSms` for consistency with individual email, or show the "not supported" hint regardless of mode for the SMS tab.

### WR-05: Bulk email/SMS sends never persist `provider_message_id` per recipient

**File:** `actions/messages.ts:249-260, 326-337`
**Issue:** Individual sends capture `result.data?.id` / `result.message_id` into `provider_message_id` (useful for support/debugging), but both bulk paths omit this field entirely on the inserted rows, even though the underlying provider responses (`sendBatchEmails`'s per-item results, `sendBulkSmsProvider`'s per-recipient `message_id`) contain it. This is exactly the data needed to investigate delivery problems for the bulk sends that are statistically most likely to have partial failures (see CR-02).
**Fix:** Thread the per-recipient provider ID through into each inserted row for both bulk email and bulk SMS.

## Info

### IN-01: `sendBatchEmails`'s try/catch is a no-op that only rethrows

**File:** `lib/resend.ts:60-71`
**Issue:** The `try { ... } catch (err) { throw err; }` around the batch-send loop adds no behavior — it catches and immediately rethrows the exact same error. This is dead code from a review standpoint.
**Fix:** Remove the try/catch (the natural exception propagation already achieves the same effect), or add real handling (e.g., partial-success aggregation per CR-02) if this block is meant to eventually do more.

### IN-02: Inconsistent optional-chaining on `primaryContact` in the compose dialog

**File:** `components/admin/message-compose-dialog.tsx:84-119`
**Issue:** `primaryContact` (`contacts[0]`) is accessed with `?.` in `title` and `smsDisabled`, implying the author is aware it can be `undefined`, but `handleIndividualSubmit` calls `primaryContact.id` / `primaryContact.name` without the same guard. It's not currently reachable at runtime (individual mode always passes exactly one contact) but the inconsistency is a latent trap if that invariant ever changes.
**Fix:** Either assert non-null once at the top of the component for individual mode, or use consistent optional chaining with an early return/guard.

### IN-03: Schema-validation failures collapse into one generic error, with no matching client-side length guard

**File:** `lib/crm/message-schema.ts`, `components/admin/message-compose-dialog.tsx:274-279`
**Issue:** Every `safeParse` failure in `actions/messages.ts` (subject/body too long, empty body, etc.) returns the same generic `SEND_ERROR_MESSAGE`, so a user who exceeds the SMS body's 918-char server cap gets no specific feedback about why the send failed. The SMS `Textarea` also has no `maxLength` matching that cap, so the segment counter ("N/160 characters · M segment(s)") can keep counting well past the point the server will actually reject the message.
**Fix:** Either add `maxLength={918}` to the SMS textarea (and a corresponding `maxLength={5000}`/`maxLength={200}` for email body/subject) to prevent the mismatch client-side, and/or surface the specific zod issue message instead of the blanket `SEND_ERROR_MESSAGE`.

### IN-04: `SEMAPHORE_API_KEY` has no fallback/guard, unlike its sibling secrets

**File:** `lib/sms/semaphore.ts:28`
**Issue:** `process.env.SEMAPHORE_API_KEY!` uses a non-null assertion with no runtime fallback or explicit check, unlike `RESEND_API_KEY` (`lib/resend.ts:25`) and `UNSUBSCRIBE_TOKEN_SECRET` (`lib/unsubscribe-token.ts:14`), which both have a documented placeholder-fallback pattern. If unset, `URLSearchParams` will silently serialize the literal string `"undefined"` as the `apikey` param instead of surfacing a clear "missing configuration" error, making the resulting Semaphore 401/403 harder to diagnose.
**Fix:** Add an explicit check (throw a clear configuration error) at the top of `callSemaphore` if `SEMAPHORE_API_KEY` is falsy, for consistency with the pattern used elsewhere in this phase and clearer failure diagnostics.

---

_Reviewed: 2026-07-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
