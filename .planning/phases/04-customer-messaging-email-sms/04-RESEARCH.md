# Phase 4: Customer Messaging (Email & SMS) - Research

**Researched:** 2026-07-24
**Domain:** Transactional/bulk outbound messaging (email via Resend, SMS via Semaphore PH), consent/opt-out enforcement, unauthenticated write surfaces
**Confidence:** MEDIUM (core send mechanics CITED against official docs; SMS inbound-reply/webhook support and exact Semaphore field-level response shape are LOW confidence — flagged for verification during implementation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Opt-out is a single combined flag per contact (`contacts.opted_out boolean not null default false`), not separate per-channel (email vs SMS) flags.
- **D-02:** Opt-out has TWO paths: (1) a self-service unsubscribe link/landing page in every bulk email footer (public, no-auth route that sets `opted_out = true` via a signed/tokenized contact reference), and (2) a staff-manual toggle in the CRM contact detail page (`crm-detail.tsx`) for phone-requested or SMS-reply opt-outs. SMS opt-out via inbound reply-keyword ("STOP") parsing is Claude's Discretion / may be deferred if the SMS provider's webhook support adds real complexity — staff-manual toggle is the guaranteed-available fallback.
- **D-03:** Bulk send UI (email and SMS) always filters out `opted_out = true` contacts before sending — enforced server-side in the bulk-send Server Action, not just hidden in the selection UI.
- **D-04:** Semaphore is the SMS provider (not PhilSMS).
- **D-05:** A thin internal `sendSingleSms()` / `sendBulkSms()` wrapper sits between application code and Semaphore's REST API — no official Node SDK exists.
- **D-06:** "Selected/segmented set of contacts" means ad-hoc multi-select from the existing CRM contact list (`crm-table.tsx`) — checkboxes on the table plus a "Message Selected" bulk action. No new saved-segment/criteria-builder feature.
- **D-07:** Stay on Resend only (no second email provider added this phase). Bulk email sends are server-side throttled/queued to respect Resend's 100/day free-tier cap — if a bulk send would exceed the remaining daily quota, the Server Action rejects it up front with a clear "N of M would exceed today's email quota" message rather than partially sending and silently dropping the rest.

### Claude's Discretion

- Exact `messages` table schema (parallel to Phase 3's `inquiries` — one row per sent message: channel, recipient, subject/body or SMS text, status (sent/failed), provider message id, sent_by, sent_at, individual-vs-bulk flag or a `batch_id` grouping bulk sends together).
- Message composition UI: plain-text compose box vs. minimal template/merge-tag support (e.g. `{{name}}`) for bulk sends — lean toward simple plain-text with `{{name}}` substitution only, no rich-text editor or saved-template library.
- SMS inbound reply-keyword ("STOP") handling — implement via Semaphore webhook if straightforward, otherwise defer entirely to the staff-manual opt-out toggle (D-02) as v1's only SMS opt-out path.
- Exact API route / Server Action structure for individual vs. bulk send, and where "Message" entry points live in the CRM detail and list pages.
- Whether SMS character-count/segment-cost feedback is shown to staff before sending (nice-to-have, not a stated requirement).
- `messages` RLS policy shape — mirror Phase 3's `can_edit_crm`-gated write / universal-authenticated-read pattern unless a reason emerges to diverge; gate the *send* action on `can_message_customers` specifically (not `can_edit_crm`).

### Deferred Ideas (OUT OF SCOPE)

- Drip/multi-step automated follow-up sequences (AUTOv2-01) — already deferred to v2.
- SMS inbound reply-keyword ("STOP") auto-opt-out — may land this phase if straightforward via Semaphore's webhook support, otherwise deferred to a fast-follow.
- Saved/dynamic segment criteria for bulk sends (e.g. "all contacts tagged VIP, auto-updating") — explicitly not selected (D-06).
- Per-channel opt-out granularity (opt out of email but not SMS) — explicitly not selected (D-01).

</user_constraints>

## Project Constraints (from CLAUDE.md)

- Use `@supabase/ssr`'s `createServerClient` pattern — never `@supabase/auth-helpers-nextjs`.
- Always call `supabase.auth.getUser()` server-side (never `getSession()`) — already enforced by `lib/auth/dal.ts`'s `getProfile()`/`requirePermission()`, which this phase's new send actions must reuse unchanged.
- No custom RBAC/Auth-Hook JWT claims system — permission checks stay on the existing `profiles` table + `has_permission()` SQL function + `requirePermission()` DAL helper.
- Semaphore is the SMS provider (recommended in CLAUDE.md); no official Node SDK — write a thin `fetch`-based wrapper, do not add a third-party unofficial Semaphore npm package as a dependency.
- Resend is the sole email provider this phase (D-07) — do not add Brevo.
- No heavy component library — continue using shadcn/ui primitives already installed (`Table`, `Checkbox`, `Dialog`, `Textarea`, etc.).
- Never commit secrets to `.env`/`vercel.json` — new `SEMAPHORE_API_KEY` and any new signing secret go through `vercel env add` per existing convention (`RESEND_API_KEY` precedent in `lib/resend.ts`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MSG-01 | Admin/Staff with "message customers" permission can send an individual email to a contact | Reuse `lib/resend.ts` singleton + `resend.emails.send()` (already proven in Phase 3); new `sendIndividualEmail()` Server Action gated on `can_message_customers`. See Architecture Patterns, Code Examples. |
| MSG-02 | Admin/Staff with "message customers" permission can send an individual SMS to a contact | New `lib/sms/semaphore.ts` thin wrapper's `sendSingleSms()`, POST to Semaphore `/api/v4/messages` with a single `number`. See Standard Stack, Code Examples. |
| MSG-03 | Admin/Staff with "message customers" permission can send a bulk email to a selected set of contacts | Resend Batch Emails API (`POST /emails/batch`, ≤100 items/call) + server-side daily-quota pre-check against a `messages` table count (D-07). See Common Pitfalls (rolling-24h quota window), Code Examples. |
| MSG-04 | Admin/Staff with "message customers" permission can send a bulk SMS to a selected set of contacts | `sendBulkSms()` — single Semaphore call, comma-separated numbers (≤1,000/call); no per-recipient personalization in one call (flagged Pitfall). No daily cap (pay-as-you-go), but recommend a client-side recipient-count confirmation given real per-SMS cost. |
| MSG-05 | Contacts can opt out of bulk email/SMS, and opted-out contacts are excluded from future bulk sends | `contacts.opted_out` column (D-01) + server-side filter in bulk Server Actions (D-03) + public HMAC-signed unsubscribe Route Handler (D-02) + staff-manual toggle in `crm-detail.tsx`. See Architecture Patterns Pattern 2, Security Domain. |
| MSG-06 | Sent messages (individual and bulk) are logged and visible in the contact's history | New `messages` table, FK to `contacts`, rendered in `crm-detail.tsx` alongside the existing `inquiries` timeline (likely a merged/interleaved timeline sorted by `created_at`). See Architecture Patterns. |

</phase_requirements>

## Summary

This phase adds two new outbound-send capabilities (email, SMS) on top of Phase 3's CRM, plus consent tracking and message history logging. The email side is a straight extension of Phase 3's already-proven Resend integration: reuse `lib/resend.ts`, add Resend's **Batch Emails API** (`POST https://api.resend.com/emails/batch`, up to 100 distinct emails per call, each with its own `to`/subject/html so `{{name}}` personalization works natively) for bulk sends, and add a server-side daily-quota pre-check because Resend's own 100/day free-tier cap only returns a `429 daily_quota_exceeded` *after* an over-quota send is attempted — the project's own `messages` table (count of `channel='email'` rows in the trailing 24 hours, not calendar day — see Pitfall 1) is the source of truth for the pre-send rejection D-07 requires.

The SMS side is new: Semaphore has no official Node SDK, confirming D-05's thin-wrapper decision. Its REST API is simple — `POST https://semaphore.co/api/v4/messages` with `apikey`, `number` (comma-separated, up to 1,000 per call), and `message` — but the **bulk endpoint sends one identical message body to every recipient in the call**; there is no native per-recipient personalization in a single request, unlike Resend's batch API. This is a real asymmetry between the two channels the planner needs to account for (Pitfall 2). Semaphore also requires a pre-registered `sendername` — sending without one throws an API error, so a `checkpoint:human-verify` task (verify the account's registered sender name in the Semaphore dashboard) is needed before implementation, not just an env var.

Consent (MSG-05) is the highest-risk part of this phase because it opens the project's **second unauthenticated write surface** (after Phase 3's `record_inquiry()` RPC). Phase 3's own code review (CR-03) already established the pattern to follow: never grant `anon` a broad RLS `UPDATE` policy on `contacts` — instead route the single permitted write through a narrow `SECURITY DEFINER` RPC. This phase's unsubscribe route should do the same: verify an HMAC-SHA256 signature (computed server-side from the contact id + a server-only secret, using Node's built-in `crypto` module — no new package) before calling a new `set_contact_opted_out(uuid)` RPC that touches nothing but `contacts.opted_out`. This makes the link **unforgeable and unguessable** without ever needing a raw, enumerable contact id in the URL, and needs no database round-trip to validate the request before the write.

**Primary recommendation:** Extend `lib/resend.ts` with a `sendBatchEmails()` helper backed by Resend's Batch API + a `messages`-table-backed rolling-24h quota gate; add `lib/sms/semaphore.ts` as a two-function (`sendSingleSms`/`sendBulkSms`) fetch wrapper with no bulk personalization; add `contacts.opted_out` + a new `messages` table + a `SECURITY DEFINER set_contact_opted_out()` RPC exposed through an HMAC-token-gated public Route Handler; gate every new Server Action on `can_message_customers` via the existing `requirePermission()` DAL helper, mirroring `actions/crm.ts` exactly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Individual/bulk email send | API/Backend (Server Action) | External Service (Resend) | Server Action owns permission check, quota gate, and `messages` row write; Resend is a pure external delivery service. |
| Individual/bulk SMS send | API/Backend (Server Action) | External Service (Semaphore) | Same shape as email; SMS has no local rate constraint besides Semaphore's own 120 calls/min. |
| Opt-out enforcement (bulk filter) | Database/Storage (`contacts.opted_out` + server-side query filter) | API/Backend (Server Action re-filter, D-03) | DB is the single source of truth; Server Action must re-query it at send time, never trust a client-supplied contact list. |
| Public unsubscribe write | API/Backend (Route Handler + `SECURITY DEFINER` RPC) | Database/Storage (narrow RPC touching only `opted_out`) | Mirrors Phase 3's `record_inquiry()` precedent — unauthenticated writes go through a narrow RPC, never a broad anon RLS policy. |
| Bulk contact selection UI | Browser/Client (`crm-table.tsx` row-selection state) | API/Backend (server re-validates selected ids belong to real, non-opted-out contacts) | TanStack Table's built-in row-selection is client state only — the Server Action is the actual authority. |
| Message history / timeline | Database/Storage (`messages` table) | Frontend Server (SSR read in `crm-detail.tsx`) | New append-only log table, read server-side alongside `inquiries` for the merged timeline. |
| Daily email-quota tracking | API/Backend (count query against `messages`) | External Service (Resend's own `x-resend-daily-quota` response header as a cross-check) | App-owned counter is required because Resend has no "check quota before sending" endpoint — only a header returned *after* a send. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `resend` | 6.18.0 (project pinned `^6.17.2`, already installed) [VERIFIED: npm registry] | Individual + bulk (Batch API) email send | Already the project's sole email provider (Phase 3); Batch API is a first-class endpoint of the same SDK, no new dependency. |
| Node.js built-in `crypto` (`createHmac`, `timingSafeEqual`) | Node 20.19.4 (project runtime) [VERIFIED: node --version] | HMAC-signed unsubscribe token generation/verification | Built into the Node runtime already in use (no new package); standard, well-understood primitive for stateless signed links — do not hand-roll a custom signature scheme. |
| `zod` | 4.4.3 (project pinned `^4.4.3`, already installed) [VERIFIED: npm registry] | Validate message-compose form input (subject/body length, recipient set) server-side | Already the project's validation library (`react-hook-form` + `@hookform/resolvers`); Phase 3's WR-01 finding (no server-side re-validation on `actions/crm.ts`) is a documented gap this phase should not repeat — validate server-side too, not client-only. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-table` | 8.21.3 (already installed) [VERIFIED: npm registry] | Row-selection checkboxes on `crm-table.tsx` for bulk-send targeting (D-06) | Built-in `rowSelection` state + `getToggleAllRowsSelectedHandler()`/`row.getIsSelected()` — no new package, incremental addition to the existing table. |
| `react-hook-form` + `@hookform/resolvers` | 7.82.0 / 5.4.0 (already installed) | Compose-message dialog form (individual + bulk) | Matches every other admin form in the codebase (`account-form.tsx`, `contact-edit-form.tsx`). |
| `date-fns` | 4.4.0 (already installed) | Formatting `messages.created_at` in the merged timeline | Already used for `inquiries` timeline formatting in `crm-detail.tsx`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node built-in `crypto` HMAC | `jose` (JWT) for the unsubscribe token | JWT adds a dependency and format overhead (base64 header/payload/signature) for a single-value (contact id) signed link — plain HMAC is simpler and sufficient; only reach for `jose` if the token needs to carry multiple claims or expiry logic beyond what's needed here. |
| Custom `lib/sms/semaphore.ts` fetch wrapper | `node-semaphore-sms` / `semaphore-sms` (unofficial third-party npm packages found during research) | **Do not use** — these are unofficial, low-maintenance community wrappers around a simple REST API; D-05 already calls for a thin first-party wrapper, and pulling in an unverified third-party package for a ~30-line HTTP call adds supply-chain risk with no real benefit (see Package Legitimacy Audit). |
| App-owned quota counter (query `messages` table) | Rely solely on Resend's `429 daily_quota_exceeded` response | Reactive-only approach means a bulk send partially completes before failing mid-batch, directly contradicting D-07's explicit requirement to reject up front, not partially send. |

**Installation:**
```bash
# No new npm packages required this phase — resend, zod, @tanstack/react-table,
# react-hook-form, and date-fns are all already installed from Phases 1-3.
```

**Version verification:** Confirmed live via `npm view resend version` (6.18.0, project pinned `^6.17.2`), `npm view zod version` (4.4.3, matches project's `^4.4.3`), and `node --version` (v20.19.4) on 2026-07-24. No package.json changes needed for this phase.

## Package Legitimacy Audit

No new external npm packages are introduced by this phase's recommended approach — the SMS integration is a hand-written `fetch` wrapper (per D-05, explicitly preferring this over any third-party SDK) and the unsubscribe token uses Node's built-in `crypto` module. All email/table/form libraries are already-installed, already-audited dependencies from Phases 1-3.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `resend` | npm | already installed, in production use since Phase 3 | high (established) | github.com/resend/resend-node | OK | Approved (reused, not new) |
| `node-semaphore-sms` | npm | unofficial community wrapper found during research | not verified this session | github.com/earljon/node-semaphore-sms | Not evaluated | **Excluded** — not recommended, see Alternatives Considered |
| `semaphore-sms` | npm/PyPI (two unrelated packages under similar names found across ecosystems during search) | unofficial community wrappers | not verified this session | multiple unrelated repos | Not evaluated | **Excluded** — do not install; name collision risk alone (multiple different "semaphore-sms" packages across npm/GitHub authors) is itself a signal to avoid guessing at a package name and instead hand-roll the ~30-line wrapper D-05 already calls for |

**Packages removed due to [SLOP] verdict:** none evaluated/installed this phase.
**Packages flagged as suspicious [SUS]:** none — the unofficial Semaphore npm wrappers are excluded by design decision (D-05), not because they failed a legitimacy check; if the planner considers using one instead of the recommended thin wrapper, run `gsd-tools query package-legitimacy check --ecosystem npm <name>` first and treat the result as `[ASSUMED]` until confirmed.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌────────────────────────────┐
                         │   Staff Browser (Admin)     │
                         │  crm-table.tsx (checkboxes) │
                         │  crm-detail.tsx (compose)   │
                         └──────────────┬───────────────┘
                                        │ Server Action call
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │ actions/messages.ts (Server Actions)                       │
        │  1. requirePermission("can_message_customers")             │
        │  2. zod-validate subject/body/recipient set                │
        │  3. re-query contacts server-side, filter opted_out=true   │
        │  4. (email bulk only) quota check: count messages          │
        │     where channel='email' AND created_at > now()-24h       │
        │     reject up front if would exceed 100/24h                │
        │  5. send via lib/resend.ts (email) or                      │
        │     lib/sms/semaphore.ts (SMS)                             │
        │  6. insert one `messages` row per recipient (status,       │
        │     provider_message_id, batch_id for bulk)                │
        └───────────┬───────────────────────────────┬─────────────────┘
                     │                               │
                     ▼                               ▼
        ┌─────────────────────┐         ┌─────────────────────────┐
        │ Resend API           │         │ Semaphore API             │
        │ POST /emails         │         │ POST /api/v4/messages     │
        │ POST /emails/batch   │         │ (comma-separated numbers, │
        │ (≤100/call)          │         │  ≤1000/call, ONE shared   │
        │                       │         │  message body per call)  │
        └─────────────────────┘         └─────────────────────────┘

  ── separate, unauthenticated write path ─────────────────────────────
        ┌────────────────────┐
        │ Bulk email footer   │  Every bulk email footer includes:
        │ link:                │  /unsubscribe?cid=<uuid>&sig=<hmac>
        │  contact clicks      │
        └──────────┬───────────┘
                    ▼
        ┌───────────────────────────────────────────┐
        │ app/api/unsubscribe/route.ts (public, GET) │
        │  1. parse cid + sig                        │
        │  2. recompute HMAC-SHA256(cid, SECRET)      │
        │     compare via crypto.timingSafeEqual      │
        │  3. if valid: call set_contact_opted_out()  │
        │     (SECURITY DEFINER RPC, anon-executable) │
        │  4. render confirmation page (idempotent)   │
        └───────────────────────────────────────────┘

  ── staff-manual fallback (SMS opt-out via phone request) ────────────
        crm-detail.tsx "Opted out" toggle → updateOptOut() Server Action
        (requirePermission("can_edit_crm") — same gate as other contact edits)
```

### Recommended Project Structure
```
lib/
├── sms/
│   └── semaphore.ts        # sendSingleSms(), sendBulkSms() — thin fetch wrapper
├── crm/
│   ├── status.ts           # existing (Phase 3)
│   └── messages.ts         # new: channel/status enums, shared labels, {{name}} template helper
├── resend.ts                # existing — extend with sendBatchEmails() helper
└── unsubscribe-token.ts     # new: sign(contactId) / verify(contactId, sig) HMAC helpers

actions/
├── crm.ts                   # existing (Phase 3)
└── messages.ts               # new: sendIndividualEmail/Sms, sendBulkEmail/Sms, updateOptOut

app/
├── api/
│   └── unsubscribe/
│       └── route.ts          # new: public GET/POST unauthenticated route
└── admin/(dashboard)/crm/
    └── [id]/page.tsx          # existing — extend to fetch + merge `messages` into timeline

components/
├── admin/
│   ├── crm-table.tsx          # existing — add row-selection column + "Message Selected" bar
│   ├── crm-detail.tsx         # existing — add "Send Email"/"Send SMS" buttons + opt-out toggle
│   └── message-compose-dialog.tsx  # new: shared individual/bulk compose form
└── email/
    └── customer-message-email.tsx  # new: react-email template for outbound customer emails

supabase/migrations/
└── <timestamp>_add_messaging_schema.sql  # contacts.opted_out, messages table, RLS, RPC
```

### Pattern 1: Narrow SECURITY DEFINER RPC for the only permitted anonymous write (not a broad RLS policy)
**What:** The public unsubscribe route needs to flip exactly one boolean on exactly one row it did not otherwise have write access to. Phase 3 already tried the "grant anon a scoped RLS policy" approach and had to close it (CR-03: dead/dangerous anon `INSERT` policies were dropped after code review) in favor of the RPC-only pattern.
**When to use:** Any time an unauthenticated (or lightly-authenticated) caller needs to make exactly one narrow, well-defined write.
**Example:**
```sql
-- Source: pattern established in supabase/migrations/20260720121436_create_crm_schema.sql
-- (record_inquiry()) and reinforced by 20260720130816_fix_crm_schema_review_findings.sql (CR-03)
create or replace function public.set_contact_opted_out(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update contacts set opted_out = true where id = p_contact_id;
end;
$$;

grant execute on function public.set_contact_opted_out(uuid) to anon, authenticated;
-- No RLS UPDATE policy for anon is added anywhere — this RPC is the only write path.
```
The Route Handler must verify the HMAC signature **before** calling this RPC — the RPC itself trusts its caller completely (SECURITY DEFINER bypasses RLS), so all the security boundary lives in the application-layer signature check, not in the database.

### Pattern 2: HMAC-signed stateless unsubscribe token
**What:** Sign the contact id with a server-only secret; verify by recomputing, no database lookup or tokens table needed to validate the request (a lookup is still needed to perform the write itself).
**When to use:** Any single-purpose, no-login public link that must not be forgeable or guessable (unsubscribe, one-click confirmations).
**Example:**
```typescript
// lib/unsubscribe-token.ts
// Source: general HMAC-signed-link pattern, cross-referenced against
// Node.js crypto docs (createHmac, timingSafeEqual) — [CITED: nodejs.org/api/crypto.html]
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET!;

export function signContactId(contactId: string): string {
  return createHmac("sha256", SECRET).update(contactId).digest("base64url");
}

export function verifyContactId(contactId: string, sig: string): boolean {
  const expected = signContactId(contactId);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
```
No expiry is applied deliberately — unlike a password-reset link, an unsubscribe link that "goes stale" after N days is a worse UX/compliance outcome (a customer clicking a 3-week-old email's unsubscribe link should still work) than the negligible risk of an indefinitely-valid opt-out link.

### Pattern 3: Resend Batch API for personalized bulk email
**What:** `POST https://api.resend.com/emails/batch` accepts an array of up to 100 distinct email objects, each with its own `to`/`subject`/`react` — this is how `{{name}}` personalization is achieved for bulk email (unlike Semaphore's SMS bulk call, which shares one message body across all recipients).
**When to use:** MSG-03 bulk email sends.
**Example:**
```typescript
// Source: [CITED: resend.com/docs/api-reference/emails/send-batch-emails]
// Note: attachments are NOT supported on the batch endpoint per Resend's docs.
const batch = recipients.map((contact) => ({
  from: FROM_EMAIL,
  to: contact.email,
  subject,
  react: createElement(CustomerMessageEmail, {
    name: contact.name,
    body: body.replaceAll("{{name}}", contact.name),
  }),
}));

// Resend batch max is 100/call -- chunk larger recipient sets.
for (const chunk of chunkArray(batch, 100)) {
  const result = await resend.batch.send(chunk);
  // result.data is an array corresponding 1:1 to chunk's indices;
  // per-item error shape is not documented -- verify empirically in a
  // staging send before relying on partial-failure granularity.
}
```

### Anti-Patterns to Avoid
- **Trusting the client-supplied contact-selection list at send time:** `crm-table.tsx`'s row selection is client state only. The bulk Server Action must re-query `contacts` server-side by id and re-apply the `opted_out = false` filter (D-03) — a stale client list (opted out mid-session in another tab) must never bypass this.
- **Reusing Phase 3's `after()` fire-and-forget pattern for user-initiated sends:** Phase 3's auto-reply/notification emails are background side effects of a *different* action (an inquiry submission) — failure is acceptable to swallow. An individual "Send Email"/"Send SMS" click is the user's primary action; its failure must be awaited and surfaced to the clicking staff member (toast error), not silently logged and ignored, or staff will believe a message sent when it didn't (flagged explicitly in 04-CONTEXT.md's code_context section as "a real difference worth attention").
- **Anon RLS `UPDATE` policy on `contacts` for the unsubscribe write:** Do not repeat the pattern Phase 3 had to remove (CR-03). Use the narrow RPC (Pattern 1) instead.
- **Calendar-day quota reset assumption:** Do not implement the 100/day counter as "reset at midnight UTC/PHT" — see Pitfall 1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signed unsubscribe tokens | A custom XOR/base64 "obfuscation" scheme, or a random-token-stored-in-DB scheme | HMAC-SHA256 via Node's built-in `crypto` module (Pattern 2) | HMAC is a well-understood, unforgeable primitive requiring no extra storage; a stored-random-token approach works too but adds an unnecessary table/lookup for a value that can be verified statelessly. |
| Bulk email personalization/templating | Manual string concatenation per recipient with hand-rolled escaping | React Email components (`@react-email/components`, already installed) passed through Resend's `react` field per batch item | React Email/JSX auto-escapes interpolated values, avoiding an HTML-injection path if a contact's `name` ever contains `<`/`>` characters. |
| SMS provider integration | A full-featured SMS SDK abstraction layer with retries/queuing built from scratch | A ~30-line `fetch` wrapper per D-05, matching CLAUDE.md's own explicit guidance | Semaphore's API is simple enough that a thin wrapper is genuinely sufficient — this is the one case in this phase where NOT reaching for a library is correct, but "no library" still means "small, focused, tested wrapper module," not scattered inline `fetch` calls at each call site. |
| Message/contact deduplication for bulk send | Custom in-memory Set tracking of "already messaged this batch" | Rely on the server-side re-query (Pattern in Anti-Patterns) — `contacts` table is already deduplicated by unique `email` (Phase 3) | The dedup problem is already solved at the schema level; the bulk-send action just needs to select distinct contact ids from client input before its DB query. |

**Key insight:** The two genuinely new "build it yourself" surfaces this phase legitimately requires are the Semaphore fetch wrapper (D-05, no SDK exists) and the HMAC token helper (~10 lines, stdlib only) — everything else (templating, dedup, table/form UI) should reuse Phase 1-3's existing, already-audited building blocks.

## Common Pitfalls

### Pitfall 1: Resend's daily quota resets on a rolling 24-hour window, not a calendar day
**What goes wrong:** If the app's own quota counter queries `messages` for `created_at >= start_of_today_UTC` (or PHT midnight), it can drift out of sync with Resend's actual enforcement — Resend's docs describe the reset as "wait until 24 hours have passed" from the over-quota attempt, which is a rolling window, not a calendar boundary.
**Why it happens:** Calendar-day boundaries are the intuitive first implementation, but they don't match the provider's actual behavior.
**How to avoid:** Query `messages` for `channel = 'email' AND created_at > now() - interval '24 hours'` when computing "remaining quota today," matching Resend's rolling-window semantics. Cross-check against the `x-resend-daily-quota` response header returned on each send as a secondary signal (self-correct if the app's own count and Resend's reported quota diverge).
**Warning signs:** A bulk send is rejected by the app's pre-check as "would exceed quota" while Resend's own dashboard shows quota available (or vice versa) — a sign the two windows are out of sync.

### Pitfall 2: Semaphore's bulk SMS endpoint does not support per-recipient personalization
**What goes wrong:** A `{{name}}` merge-tag feature built generically for "bulk send" (matching the email path) will silently send the literal string `{{name}}` to every SMS recipient, because Semaphore's `/api/v4/messages` call takes one `message` parameter shared across all `number`s in that call.
**Why it happens:** The email batch API and SMS bulk API have fundamentally different personalization models (per-item array vs. single shared payload), easy to assume are symmetric when they aren't.
**How to avoid:** Either (a) do not offer `{{name}}` personalization for bulk SMS in v1 — send identical text to all selected recipients (recommended, matches this project's "simple over configurable" bias), or (b) if personalization is required, send one Semaphore API call per recipient (subject to the 120-calls/minute rate limit and materially higher latency for a 100+ recipient bulk send). Flag this choice explicitly for the planner/user rather than assuming.
**Warning signs:** QA testing a bulk SMS send with 2+ recipients having different names and seeing literal `{{name}}` in the delivered text.

### Pitfall 3: Semaphore requires a pre-registered sender name — sending without one throws an API error
**What goes wrong:** `POST /api/v4/messages` without a registered `sendername` (or an unregistered one supplied explicitly) fails at send time, not at wrapper-build time — this can't be caught by any local validation, only discovered against the live account.
**Why it happens:** Sender name registration is an account-level setting configured in the Semaphore dashboard, invisible to the codebase.
**How to avoid:** Add a `checkpoint:human-verify` task to confirm the TravelSentro Semaphore account has an approved sender name *before* wiring up the send actions, and store it as `SEMAPHORE_SENDER_NAME` env var (or omit the param and rely on the account default, if one exists) rather than hardcoding a guessed string.
**Warning signs:** Every SMS send fails with an API-level error referencing sender name during initial integration testing.

### Pitfall 4: Individual sends must not silently swallow failures the way Phase 3's background auto-reply does
**What goes wrong:** Copy-pasting Phase 3's `try/catch { console.error(...) }`-and-continue pattern from `lib/crm/notify-staff.ts`/the auto-reply block into an individual "Send Email" button means a staff member clicks send, sees a generic success toast, and has no idea the message actually failed (bad API key, invalid recipient, Semaphore account out of credit).
**Why it happens:** The pattern is right there in the codebase and looks reusable, but it exists for a different reason (fire-and-forget background side effects of an unrelated primary action) that doesn't apply to a user-initiated send.
**How to avoid:** `sendIndividualEmail`/`sendIndividualSms`/bulk equivalents must `await` the provider call inline in the Server Action (not schedule it via `after()`) and return `{ ok: false, error }` (the existing `ActionResult` shape) on failure so the UI can `toast.error(...)`, matching `updateStatus()`'s existing error-surfacing pattern in `actions/crm.ts`.
**Warning signs:** UAT testing with a deliberately invalid Semaphore API key still shows a "Message sent" success toast.

### Pitfall 5: An unsubscribe link with a raw, guessable contact id is a documented enumeration/abuse vector
**What goes wrong:** `/unsubscribe?cid=<contact-uuid>` with no signature lets anyone who can guess or scrape a contact's UUID opt that person out (or, if the route is later extended to opt back *in*, opt them back in) without their consent — a low-severity but real Tampering/availability issue (a competitor or prankster silently suppressing a business's ability to reach its own leads).
**Why it happens:** UUIDs feel "unguessable" but are routinely leaked via other channels (URL sharing, browser history, Referer headers) once used in a link at all.
**How to avoid:** Pattern 1 + Pattern 2 (signed token, verified before any write) — this is the explicit reason CONTEXT.md's D-02 calls for "a signed/tokenized contact reference," not a raw id.
**Warning signs:** Any code path that reads `request.nextUrl.searchParams.get("cid")` and passes it directly to a Supabase write without a preceding signature check.

## Code Examples

### Semaphore single/bulk SMS wrapper
```typescript
// lib/sms/semaphore.ts
// Source: [CITED: semaphore.co/docs] (POST /api/v4/messages, curl example
// verified via direct fetch of the docs page 2026-07-24) + cross-checked
// against blog.semaphore.co's overview article — endpoint base URL shown
// in the docs' own curl example is https://semaphore.co/api/v4/messages
// (not the api.semaphore.co subdomain some secondary sources implied) --
// VERIFY against a real account/API key during implementation before
// relying on this exactly, per the LOW-confidence flag on this endpoint.

const SEMAPHORE_ENDPOINT = "https://semaphore.co/api/v4/messages";

type SemaphoreMessage = {
  message_id: string;
  recipient: string;
  message: string;
  sender_name: string;
  network: string;
  status: "Queued" | "Pending" | "Sent" | "Failed" | "Refunded";
  created_at: string;
};

async function callSemaphore(numbers: string[], message: string) {
  const body = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY!,
    number: numbers.join(","),
    message,
    sendername: process.env.SEMAPHORE_SENDER_NAME ?? "",
  });

  const res = await fetch(SEMAPHORE_ENDPOINT, { method: "POST", body });
  if (!res.ok) {
    throw new Error(`Semaphore API error: ${res.status}`);
  }
  return (await res.json()) as SemaphoreMessage[];
}

export async function sendSingleSms(number: string, message: string) {
  const [result] = await callSemaphore([number], message);
  return result;
}

// Semaphore's bulk endpoint sends ONE shared `message` to every number in
// the comma-separated list -- no per-recipient personalization (Pitfall 2).
export async function sendBulkSms(numbers: string[], message: string) {
  // ≤1,000 numbers per call per Semaphore's documented limit.
  return callSemaphore(numbers, message);
}
```

### `messages` table + RLS (parallel to Phase 3's `contacts`/`inquiries`)
```sql
-- Source: pattern mirrors supabase/migrations/20260720121436_create_crm_schema.sql
-- and 20260720130816_fix_crm_schema_review_findings.sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  subject text,              -- email only, null for sms
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider_message_id text,
  batch_id uuid,             -- null for individual sends; shared across one bulk send
  sent_by uuid references profiles(id),
  sent_by_name text,
  created_at timestamptz not null default now()
);

alter table messages enable row level security;
create index messages_contact_id_idx on messages(contact_id);
create index messages_channel_created_at_idx on messages(channel, created_at); -- quota-check query

-- Read: universal-authenticated, matching contacts/inquiries (CRM-03 precedent).
create policy "authenticated staff can read all messages" on messages
  for select to authenticated using (true);

-- Write: gated on can_message_customers specifically (not can_edit_crm) --
-- per MSG-01..MSG-04's exact requirement wording and 04-CONTEXT.md's
-- Claude's-Discretion note. Direct authenticated insert (no RPC needed --
-- unlike the public unsubscribe write, every message send originates from
-- an authenticated Server Action, never an anon caller).
create policy "can_message_customers can insert messages" on messages
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'can_message_customers'));

-- No update/delete policy -- immutable append-only log, same as inquiries.
```

### Contacts opt-out column + narrow RPC
```sql
alter table contacts add column opted_out boolean not null default false;

create or replace function public.set_contact_opted_out(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update contacts set opted_out = true where id = p_contact_id;
end;
$$;

grant execute on function public.set_contact_opted_out(uuid) to anon, authenticated;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual/N-call bulk email (one `resend.emails.send()` per recipient) | Resend Batch Emails API (`/emails/batch`, ≤100/call) | Batch endpoint is a standard part of the current Resend API surface (confirmed live 2026-07-24) | Fewer HTTP round-trips, and the natural place to apply per-recipient `{{name}}` personalization for bulk email. |
| `@supabase/auth-helpers-nextjs` for Supabase session handling | `@supabase/ssr` | Already migrated in this project (Phase 1-2) | Not directly relevant to this phase's new code, but any new Supabase client creation in `actions/messages.ts`/the unsubscribe route must continue using `lib/supabase/server.ts`'s existing `createClient()`, never reintroduce the deprecated package. |

**Deprecated/outdated:**
- Storing a random unsubscribe token in a dedicated `unsubscribe_tokens` table with expiry: superseded for this use case by stateless HMAC verification (Pattern 2) — simpler, no extra table, no cleanup job needed. (Not "deprecated" industry-wide — both patterns are valid — but unnecessary complexity for this project's scale and CLAUDE.md's stated "avoid premature complexity" bias.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Semaphore's base API URL is `https://semaphore.co/api/v4/messages` (not `api.semaphore.co`) | Standard Stack, Code Examples | If wrong, every SMS send fails at integration time — low risk since it's caught immediately in testing, but should be confirmed against the account's actual working example/API key before writing the wrapper, not assumed from search results alone. |
| A2 | Semaphore does not offer a documented inbound-SMS-reply webhook accessible on this account tier | Deferred Ideas, Claude's Discretion (STOP-keyword handling) | If Semaphore does support this and it's straightforward, the planner may choose to implement STOP-keyword auto-opt-out rather than deferring — but this needs direct confirmation with Semaphore support/dashboard, not just public search results, before committing engineering time to it. |
| A3 | Resend's per-item batch-send error reporting shape (`data[i].error` vs. an all-or-nothing response) is not documented in the fetched docs page | Architecture Patterns Pattern 3, Code Examples | If a batch call partially fails, the Server Action's per-recipient `messages` row status ('sent' vs 'failed') logic needs to handle whatever the actual response shape is — recommend a small manual/staging test send with one intentionally-invalid recipient before finalizing the bulk-email Server Action's status-writing logic. |
| A4 | PH Data Privacy Act legal summary (below, informational only) is accurate as researched via web search, not a verified legal opinion | Security Domain / general context | This project is not doing a legal deep-dive per the task's own framing ("informational, flag what's found") — if the business's actual DPA compliance posture matters beyond "have a working unsubscribe mechanism + honor manual opt-out requests," a qualified legal review is recommended before go-live, independent of this phase's engineering work. |

**If this table is empty:** N/A — see rows above.

## Open Questions (RESOLVED)

1. **RESOLVED: Does individual (non-bulk) send to an opted-out contact need to be blocked, or only bulk sends?**
   - What we know: MSG-05's wording is "opt out of bulk email/SMS...excluded from future bulk sends" — the requirement explicitly scopes exclusion to bulk sends.
   - What's unclear: 04-CONTEXT.md doesn't explicitly re-confirm this for individual sends; a staff member might reasonably want to reply individually to an opted-out contact (e.g., answering a direct question), which is standard practice (marketing opt-out ≠ blocking all 1:1 communication) but worth an explicit planner decision, not an implicit one.
   - Recommendation: Individual sends (MSG-01/MSG-02) are NOT blocked by `opted_out = true`; only bulk sends (MSG-03/MSG-04, D-03) are filtered. Surface the contact's opted-out status in the compose UI so staff make an informed choice, but don't hard-block individual sends.
   - Resolution: Adopted as planned in 04-03-PLAN.md — individual sends are never opted-out-blocked; only bulk sends filter server-side.

2. **RESOLVED: What is the exact per-item error/success shape of Resend's Batch Emails API response?**
   - What we know: The endpoint exists, accepts ≤100 items, each corresponding to the same-index entry in the response `data` array on success.
   - What's unclear: Whether a partial failure (one bad recipient among 100) fails the whole batch, returns per-item error objects, or something else — not stated in the fetched documentation.
   - Recommendation: Treat this as a LOW-confidence gap; plan a small staging-environment test send (one valid + one deliberately invalid recipient) as part of the implementation task, before finalizing how `messages.status` gets set per-recipient in a bulk batch.
   - Resolution: 04-03-PLAN.md Task 1 treats the batch as succeed-or-fail-together and verifies actual behavior via a staging test send before finalizing per-recipient status handling.

3. **RESOLVED: Does the TravelSentro Semaphore account already have an approved sender name?**
   - What we know: Semaphore requires one; sending without it throws an API error (Pitfall 3).
   - What's unclear: Whether this is already configured (this is an existing PH travel business, so a sender name may already exist from prior SMS use, or may need first-time registration).
   - Recommendation: `checkpoint:human-verify` task early in the phase's plan, before any SMS send-path code is written against a real key.
   - Resolution: 04-02-PLAN.md Task 2 is `autonomous: false` and defers Semaphore sender-name confirmation to end-of-phase human verification, per this project's `workflow.human_verify_mode=end-of-phase` convention.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `RESEND_API_KEY` | MSG-01, MSG-03 (email send) | Presumed set (used since Phase 3; `.env.local` exists in the repo but its contents are outside this research session's read permissions) | — | None needed — reused from Phase 3, not new to this phase. |
| `SEMAPHORE_API_KEY` | MSG-02, MSG-04 (SMS send) | Not yet configured — new for this phase | — | None — SMS is a hard requirement (MSG-02/MSG-04); must be provisioned via `vercel env add` / `.env.local` before SMS send paths can be tested. |
| `SEMAPHORE_SENDER_NAME` | MSG-02, MSG-04 | Unknown — needs account-level verification (Open Question 3 / Pitfall 3) | — | If the account has a default registered name, the param can be omitted; otherwise required. |
| `UNSUBSCRIBE_TOKEN_SECRET` | MSG-05 (public unsubscribe route) | Not yet configured — new secret for this phase | — | None — generate via `openssl rand -hex 32` and store as a new env var; never reuse `RESEND_API_KEY` or another secret for this purpose. |
| Node.js `crypto` module | MSG-05 (HMAC signing) | ✓ (built-in, Node 20.19.4 confirmed in this environment) | 20.19.4 | — |
| Supabase CLI (schema migration + type regen) | MSG-05/MSG-06 (new `messages` table, `contacts.opted_out`) | ✓ (used successfully in Phases 1-3) | — | — |

**Missing dependencies with no fallback:**
- `SEMAPHORE_API_KEY` and `SEMAPHORE_SENDER_NAME` must be obtained/confirmed before SMS send paths (MSG-02, MSG-04) can be implemented and tested end-to-end — flag as a `user_setup`/`checkpoint:human-verify` task early in the plan, mirroring Phase 3's `RESEND_API_KEY` user_setup precedent.
- `UNSUBSCRIBE_TOKEN_SECRET` must be generated fresh (not reused from another secret) before the unsubscribe route can be implemented.

**Missing dependencies with fallback:**
- None — both new secrets are hard requirements for their respective requirements (MSG-02/04, MSG-05), with no viable fallback path that still satisfies the requirement.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (unchanged) | Existing Supabase Auth (`getUser()` via `lib/auth/dal.ts`), not modified by this phase. |
| V3 Session Management | No (unchanged) | Same as above. |
| V4 Access Control | Yes | `requirePermission("can_message_customers")` on every new send Server Action, mirroring `actions/crm.ts`'s `requirePermission("can_edit_crm")` pattern exactly; double-gated at RLS (`messages` INSERT policy) per Phase 3's T-03-14 precedent. |
| V5 Input Validation | Yes | `zod` schema for compose form (subject max length, body max length matching SMS 160-char-segment awareness, recipient id array validated as real UUIDs) — validated **server-side in the Server Action**, not client-only (do not repeat Phase 3's WR-01 gap). |
| V6 Cryptography | Yes | HMAC-SHA256 via Node's built-in `crypto.createHmac`/`timingSafeEqual` for the unsubscribe token (Pattern 2) — never hand-roll a custom signature/comparison scheme; `timingSafeEqual` specifically avoids a timing side-channel on the signature comparison. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Unauthorized bulk send by an authenticated Staff account lacking `can_message_customers` | Elevation of Privilege | `requirePermission("can_message_customers")` at the top of every new Server Action + RLS `messages` INSERT policy scoped to the same permission (defense in depth, matching T-03-14). |
| Unsubscribe-link enumeration/forgery (arbitrary contact opted out by a guessed/leaked UUID) | Tampering | HMAC-signed token (Pattern 2), verified before any write; narrow `SECURITY DEFINER` RPC (Pattern 1) instead of a broad anon RLS policy. |
| Stale client-side contact-selection bypassing opt-out filter | Tampering | Server-side re-query + re-filter (D-03) inside the bulk Server Action — never trust the client-submitted id list's opted-out status. |
| Silent send failure misreported as success to staff | Repudiation | Await sends inline, return `ActionResult` failure to the UI (Pitfall 4) — do not reuse Phase 3's fire-and-forget `after()` pattern for user-initiated individual sends. |
| Cost-abuse: accidental/malicious large bulk SMS send (real pay-as-you-go cost, no free-tier cap unlike email) | Denial of Service (financial) | Recommend a client-side recipient-count confirmation step before submitting a bulk SMS send (Claude's Discretion note already floats this as a nice-to-have — treat it as a light mitigation for this specific risk, not purely UX polish). |
| XSS via customer `name`/message body reaching outbound emails unescaped | Tampering / Injection | React Email components auto-escape interpolated JSX values (Don't Hand-Roll) — do not build outbound email HTML via raw string concatenation. |

### PH Data Privacy Act — informational context (not a legal review)

Per this phase's explicit framing ("flag what's found, this is not a legal-research deep-dive"), web research surfaced the following **[CITED — general legal/compliance sources, not a verified legal opinion, see Assumption A4]**:

- The Data Privacy Act of 2012 requires informed, voluntary consent before sending commercial/marketing messages, and preserves a data subject's ongoing "right to object" to further processing for marketing purposes even where some other lawful basis exists.
- A working, honored opt-out mechanism (the self-service unsubscribe link + staff-manual toggle this phase builds, D-02) is the standard practical compliance control referenced across multiple sources, alongside honoring explicit opt-out requests made "in writing" (which a staff-manual toggle satisfies for phone/verbal requests logged by staff).
- This research did not find a PH-specific equivalent of the US CAN-SPAM Act's prescriptive technical requirements (e.g., mandatory physical postal address in every email) — the DPA's framing is consent- and rights-based rather than a technical formatting checklist.
- **Recommendation carried into this phase's design (not new):** this phase's D-02 (self-service unsubscribe link) is already aligned with the general "must offer and honor opt-out" principle found in research; no additional DPA-specific technical requirement was identified that isn't already covered by MSG-05's existing scope. Treat this section as directional, not a compliance sign-off — a qualified legal review remains recommended before public launch per this project's own STATE.md blockers list precedent (it already flags the schema-level opt-out gap as a legal/provider-risk item).

## Sources

### Primary (HIGH confidence)
- `npm view resend version`, `npm view zod version`, `node --version` — direct tool verification against the live project environment, 2026-07-24.
- Codebase read: `supabase/migrations/20260720121436_create_crm_schema.sql`, `supabase/migrations/20260720130816_fix_crm_schema_review_findings.sql`, `lib/resend.ts`, `lib/crm/notify-staff.ts`, `actions/crm.ts`, `lib/auth/dal.ts`, `components/admin/crm-table.tsx`, `components/admin/crm-detail.tsx`, `app/api/inquiries/route.ts` — direct inspection of this project's existing patterns.

### Secondary (MEDIUM confidence)
- https://semaphore.co/docs — [CITED] fetched directly 2026-07-24; endpoint paths, curl example, phone number format, response field names, sendername requirement, rate limits.
- https://resend.com/docs/api-reference/emails/send-batch-emails — [CITED] fetched directly 2026-07-24; batch endpoint, 100-item max, no attachments, react-field-in-Node-SDK-only note.
- https://resend.com/docs/api-reference/rate-limit — [CITED] fetched directly 2026-07-24; `daily_quota_exceeded`/`monthly_quota_exceeded` error types, `x-resend-daily-quota` header.
- https://www.respicio.ph/commentaries/data-privacy-rights-and-handling-unsolicited-messages-in-the-philippines and related legal-commentary sources — [CITED, general legal context only, not a verified legal opinion] cross-referenced across 3+ independent sources via WebSearch, 2026-07-24.

### Tertiary (LOW confidence)
- blog.semaphore.co bulk-messaging overview article — WebSearch-summarized, general context only, no technical field-level detail confirmed independently of the semaphore.co/docs fetch.
- HMAC unsubscribe-link pattern (developer-blog-omega.vercel.app and similar) — WebSearch-summarized single-source pattern description; the underlying `crypto.createHmac`/`timingSafeEqual` API usage itself is Node.js stdlib (HIGH confidence), but the specific "sign contact id, no expiry" design choice documented here is this research's own synthesis, not verified against an authoritative source.
- Semaphore inbound-SMS-webhook support — WebSearch found no clear documentation either way (Assumption A2); flagged LOW confidence / open question, not asserted as unsupported.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and version-verified against the live project; no new dependencies introduced.
- Architecture: MEDIUM — new `messages` table/RPC pattern directly mirrors Phase 3's already-reviewed-and-fixed precedent (high confidence in the *pattern*), but exact Resend batch error shape and Semaphore base-URL/webhook support are unverified against a live account (Open Questions 2-3, Assumption A1-A2).
- Pitfalls: MEDIUM-HIGH — Pitfall 1 (rolling quota window) and Pitfall 2 (SMS bulk personalization) are directly sourced from official docs; Pitfall 3 (sender name) is directly quoted from official docs; Pitfall 4-5 are this project's own architectural reasoning applied to documented precedent (Phase 3's code review findings).

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (30 days — Resend/Semaphore API surfaces are stable-but-external; re-verify endpoint/quota details if implementation is delayed past this window)
