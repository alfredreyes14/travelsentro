---
status: diagnosed
trigger: "sms-send-fails — Individual SMS send fails with an error toast, no SMS message was sent"
created: 2026-07-24T11:36:18Z
updated: 2026-07-24T11:36:18Z
---

## Current Focus

hypothesis: CONFIRMED — SEMAPHORE_API_KEY and SEMAPHORE_SENDER_NAME are unset in the local .env.local environment where UAT was run, causing every real Semaphore SMS API call to be rejected with an "invalid apikey" validation error; the resulting response is misshapen relative to what lib/sms/semaphore.ts expects, which throws, which is caught by actions/messages.ts's bare catch and surfaced as a "failed" messages row + generic error toast.
test: Loaded .env.local via dotenv and confirmed SEMAPHORE_API_KEY/SEMAPHORE_SENDER_NAME are both unset (length 0); then reproduced the exact fetch call callSemaphore() makes (same URL, same body shape) directly against the live Semaphore API using the current (unset) env.
expecting: If credentials are the cause, the live call would fail in a way consistent with the catch block producing "failed" status.
next_action: none — root cause confirmed, returning to orchestrator (find_root_cause_only mode, no fix applied)

## Symptoms

expected: Open the compose dialog, switch to the SMS tab, fill in a body, and send. A success toast appears and the dialog closes.
actual: Failed, saw an error toast and no SMS message was sent
errors: Error toast shown (exact error text not captured by user during manual UAT click-through) — traced to actions/messages.ts's SEND_ERROR_MESSAGE ("Couldn't send the message. Please try again.")
reproduction: Test 3 in UAT — .planning/phases/04-customer-messaging-email-sms/04-UAT.md — open any contact's detail page, click Message, switch to SMS tab, fill body, send
started: Discovered during UAT (phase 4 verify-work session), 2026-07-24. 04-VERIFICATION.md (same day) had already flagged Semaphore SMS production configuration (SEMAPHORE_API_KEY, SEMAPHORE_SENDER_NAME, approved sender name) as never live-verified across all 4 of this phase's plans due to lack of .env.local/production credential access during automated sessions.

## Eliminated

(none — first hypothesis, backed directly by this phase's own carried-forward "unverified Semaphore config" flag, was confirmed on first test)

## Evidence

- timestamp: 2026-07-24T11:34:00Z
  checked: lib/sms/semaphore.ts (callSemaphore, sendSingleSms, sendBulkSms)
  found: callSemaphore() POSTs apikey/number/message/sendername to https://semaphore.co/api/v4/messages and only throws if `!res.ok` (non-2xx HTTP status). sendSingleSms() destructures the response as an array: `const [result] = await callSemaphore(...)`.
  implication: If Semaphore's response for a validation error is HTTP 200 with a non-array JSON body, `!res.ok` never fires, but the subsequent array-destructure would throw instead — an indirect, incidental error path, not an explicit one.

- timestamp: 2026-07-24T11:34:30Z
  checked: actions/messages.ts sendIndividualSms (lines 102-162)
  found: sendSingleSms() call is wrapped in try/catch; catch sets status="failed", providerMessageId=null, still inserts a messages row, and the action returns `{ ok: false, error: SEND_ERROR_MESSAGE }` on failed status. The UI (message-compose-dialog.tsx handleIndividualSubmit) shows `toast.error(result.error)` for any `!result.ok`.
  implication: Any thrown error inside sendSingleSms (regardless of exact cause) surfaces to the user as exactly the reported symptom: error toast, no dialog-close, no SMS actually delivered.

- timestamp: 2026-07-24T11:35:00Z
  checked: .env.local (presence/length only, via `node -e` + dotenv — never printed secret values)
  found: "SEMAPHORE_API_KEY set: false" (length 0), "SEMAPHORE_SENDER_NAME set: false" (length 0). Confirmed via `ls -la .env*` that .env.local is the only local env file (no .env, .env.development, etc.) — this is the exact file Next.js `npm run dev` loads, i.e. the real environment the UAT click-through ran against.
  implication: The project's own local dev environment has never had Semaphore credentials configured, exactly matching the gap flagged repeatedly across 04-01/04-02/04-03/04-04-PLAN and independently re-flagged by 04-VERIFICATION.md's human_verification section.

- timestamp: 2026-07-24T11:35:40Z
  checked: Live reproduction — ran the exact POST callSemaphore() constructs (same URL, same URLSearchParams body shape) against https://semaphore.co/api/v4/messages using the current (unset) env
  found: "body being sent: apikey=undefined&number=09171234567&message=test&sendername=" → response: HTTP 200 (res.ok === true), body `{"apikey":["The selected apikey is invalid."]}`
  implication: Semaphore returns HTTP 200 for this class of validation error (not a 4xx/5xx), so `lib/sms/semaphore.ts`'s `if (!res.ok) throw` never triggers for this exact failure mode. The response body is a plain object, not the expected `SemaphoreMessage[]` array, so `const [result] = await callSemaphore(...)` in sendSingleSms throws a TypeError (destructuring a non-iterable). That TypeError is what actions/messages.ts's bare `catch` block in sendIndividualSms actually catches — producing status="failed" and the exact reported error toast, but via an incidental/fragile path rather than semaphore.ts explicitly detecting and reporting the "invalid apikey" condition.

## Resolution

root_cause: |
  SEMAPHORE_API_KEY and SEMAPHORE_SENDER_NAME are unset in the environment the UAT session ran against
  (.env.local — the same file `npm run dev` loads). Every real call to Semaphore's SMS API therefore
  fails with an "invalid apikey" validation error. Semaphore returns this specific error as HTTP 200
  (not a 4xx/5xx), so lib/sms/semaphore.ts's `if (!res.ok) throw` check does not detect it directly;
  instead, the response body (a plain error object, not the expected array of SemaphoreMessage) breaks
  sendSingleSms()'s `const [result] = await callSemaphore(...)` array-destructure, throwing a TypeError
  that is caught by actions/messages.ts's bare `catch` in sendIndividualSms and converted into a
  "failed" messages row + generic error toast — which is exactly the reported symptom.

  This is precisely the human-verification gap every one of this phase's four plans and 04-VERIFICATION.md
  already flagged and deferred ("Semaphore production configuration ... never live-verified"): this UAT
  failure is that exact unverified path being exercised for the first time, and it fails because the
  required credentials were never actually provisioned locally (or in production/Vercel — unconfirmed,
  same gap).

  Secondary, independent code-level finding (not the primary cause, but a real robustness gap uncovered
  by this investigation): lib/sms/semaphore.ts has no explicit check for Semaphore's documented
  validation-error response shape (HTTP 200 + `{ field: [errors] }` body). It currently relies on an
  incidental array-destructure throw to catch this case, which happens to work for "invalid apikey" but
  would not reliably catch every possible malformed-200 response Semaphore could return (e.g., a
  differently-shaped success/error object that IS array-like).

fix: (not applied — find_root_cause_only mode)
verification: (not applicable — find_root_cause_only mode)
files_changed: []
