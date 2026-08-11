# Facebook Messenger Auto-Greeting Bot — Design Spec

**Date:** 2026-08-11
**Status:** Approved by user, pending implementation plan.

## Summary

`FacebookCta` (`components/packages/facebook-cta.tsx`) currently links to the Page's profile URL (D-04, "outbound-only"), so a visitor has to find and click "Message" themselves once on the Page. This adds a Messenger deep link (`m.me/<page>`) with a package reference, plus a webhook-driven bot that sends one auto-reply naming the package the visitor clicked from — working around Messenger having no `wa.me`-style `?text=` prefill. The bot sends exactly one message per click and never responds to anything the customer types afterward; staff take the conversation from there manually in Messenger, same as today.

## Feasibility Notes (from investigation)

- Meta's Messenger Platform docs show `m.me/PAGE-NAME` (vanity username) as the documented link format; numeric-ID links aren't officially confirmed. The business's Page will need a vanity username configured (checked separately from this build).
- No `?text=` prefill parameter exists for Messenger. The only mechanism available is `ref`, which arrives at a webhook as a `messaging_referrals` event — it does not fill the compose box, it triggers a bot-side reaction.
- Sending a reply to a user-initiated click (a "standard" message within the 24-hour window) is free on Meta's platform. Costs only apply to business-initiated promotional messages outside that window, which this bot never does.
- During development (before App Review approves `pages_messaging` for public use), the bot already works for anyone with an Admin/Developer/Tester role on the app — sufficient for full end-to-end testing before requesting public review.

## Scope Decisions

- **Greeting only, no CRM capture.** The bot sends one message and stops. It does not create a CRM contact/lead, notify staff, or relay anything further — matches the existing "outbound-only" nature of the Facebook/WhatsApp CTAs. A Messenger conversation is tracked in Meta's own inbox, same as it is today.
- **Package-aware and generic variants.** `FacebookCta` is used both with a package (package detail page, its sticky mobile bar) and without (homepage, contact page). Both get a greeting — package clicks get the named message, generic clicks get a plain fallback. Neither case is left silent.
- **Never replies after the first message.** Only the initial `messaging_referrals` event triggers a send. Anything the customer types afterward goes to staff untouched by the bot.
- **The link carries the package code, not the name.** `packages.slug` (unique, not null) is the identifier appended to the link (`?ref=<slug>`) purely as an internal lookup key — it is never shown to the customer. The webhook looks the record up by slug and puts `packages.name` (the real display name) into the message text. This was clarified explicitly with the user: using the code in the link doesn't change what the customer sees, since the message always resolves to the package's name via a database lookup.

## Architecture

Three options considered:

- **A. Thin `fetch` wrapper, no new dependency (chosen).** Mirrors `lib/sms/semaphore.ts`'s existing pattern exactly — Meta has no official Node SDK worth adding for "send one text message," so a small hand-written wrapper matches how this codebase already handles Semaphore.
- B. Install an npm package (e.g. `messaging-api-messenger`) — more surface area than needed, inconsistent with the project's established preference for thin wrappers over unofficial SDKs.
- C. Inline the Graph API call directly in the route handler, no separate `lib/` file — works but harder to test and reuse.

## Components

- **`lib/messenger/send.ts`** (new, server-only) — `sendMessengerText(recipientId, text)`: thin `fetch` wrapper around Graph API's `POST /me/messages`, authenticated with `MESSENGER_PAGE_ACCESS_TOKEN`. Mirrors `lib/sms/semaphore.ts`'s shape (module-level constant endpoint, typed response, throw on failure — never swallow).

- **`app/api/messenger/webhook/route.ts`** (new)
  - `GET` — handles Meta's one-time verification handshake: checks `hub.verify_token` against `MESSENGER_VERIFY_TOKEN`, echoes back `hub.challenge` on match, 403 otherwise.
  - `POST` — receives webhook events:
    1. Validates the `X-Hub-Signature-256` header against `MESSENGER_APP_SECRET` (HMAC-SHA256 over the raw body) — reject with 403 if it doesn't match.
    2. Parses the event for a `messaging_referrals` entry, extracting the sender's Messenger ID (PSID) and the `ref` value (package slug, or absent).
    3. If `ref` present: looks up `packages.name` by `slug` (excluding `deleted_at`). Found → package-named greeting. Not found (stale/bad link) → generic greeting.
    4. If `ref` absent: generic greeting.
    5. Calls `sendMessengerText()`, wrapped in `after()` so the webhook ACKs Meta within its 5-second requirement regardless of how long the Send API call takes — same non-blocking-side-effect discipline as `app/api/inquiries/route.ts` (D-02).
    6. Always returns 200 once signature validation passes — a downstream lookup/send failure is logged, never surfaced back to Meta as an error (retrying wouldn't fix a config/auth problem, it would just duplicate the greeting).

- **`components/packages/facebook-cta.tsx`** — new optional `packageSlug?: string` prop, alongside the existing `packageName?: string` (display-only, unchanged). When present, the link becomes `m.me/<page-username>?ref=<packageSlug>` instead of the current `FACEBOOK_URL` (Page profile link).

- **Call sites updated** to pass `packageSlug` alongside the existing `packageName`:
  - `app/(public)/packages/[slug]/page.tsx` → `packageSlug={pkg.slug}`
  - `components/packages/sticky-cta-bar.tsx` → new `packageSlug` prop threaded through from its caller (same page, `pkg.slug`)
  - Homepage and contact page usages (`variant="icon-label"`, no package context) pass no slug — generic greeting path.

- **`FACEBOOK_URL`** (`lib/constants.ts`) stays as-is for the other two existing call sites that are genuinely page-level, not conversational (`app/unsubscribe/page.tsx`, `components/email/auto-reply-email.tsx`) — those aren't in scope for a Messenger deep link.

## Data Flow

1. Visitor clicks the Facebook button → `m.me/<page>?ref=<slug>` (or no `ref` for the generic buttons).
2. Meta opens Messenger and sends our webhook a `messaging_referrals` event carrying the visitor's Messenger ID and the `ref`.
3. Route handler validates the signature, looks up the package by slug if `ref` is present.
4. Builds the greeting: named ("Hi! Thanks for your interest in the {package} package. One of our team members will get back to you shortly 😊") or generic ("Hi! Thanks for reaching out, we'll get back to you shortly 😊").
5. Sends it via `sendMessengerText()`, then never speaks again in that conversation.

## Error Handling

- Bad/missing webhook signature → 403, no processing.
- Package lookup fails or slug doesn't resolve → falls back to the generic greeting rather than erroring; a stale/bad link should never break the experience.
- Send API failure (bad token, Meta outage, etc.) → logged via `console.error`, not retried, webhook still ACKs 200 — matches the existing "log and move on" discipline used for the inquiry form's email/SMS side effects.
- **Accepted rough edge, by design:** no dedup/state tracking. Clicking the same package link twice sends two greetings. Kept stateless deliberately per scope decision; revisit only if it proves annoying in practice.

## Testing

- Unit tests for the pure logic that doesn't require Meta's live API: signature verification, and "which message do we send given this event" (package found / not found / no ref).
- No automated test against the real Send API. End-to-end verification is manual: the user (already an Admin on the Meta app) clicks the real link and confirms the reply arrives — works pre-App-Review since the account already has a role on the app.

## Environment Variables

All added to Vercel, never committed:

- `MESSENGER_PAGE_ACCESS_TOKEN` — already obtained.
- `MESSENGER_VERIFY_TOKEN` — a string the user makes up; entered into both Meta's dashboard "Verify token" field and here.
- `MESSENGER_APP_SECRET` — from App Dashboard → App settings → Basic → "App Secret." Not yet obtained; needed before the webhook can be configured/verified in Meta's dashboard.

## Explicit Non-Goals

- No CRM contact/lead creation from Messenger clicks.
- No staff notification (email/SMS) triggered by this bot.
- No handling of any message beyond the first `messaging_referrals` event — no ongoing bot conversation, no human-handover logic beyond "the bot just stops talking."
- No App Review submission as part of this build — the bot is built and fully testable in development mode first; requesting public (`pages_messaging`) approval is a separate, later step once the bot is confirmed working.
- No change to the two page-level (non-conversational) `FACEBOOK_URL` usages (`unsubscribe`, auto-reply email).
