# Phase 3: Lead Capture, CRM & Automation - Research

**Researched:** 2026-07-20
**Domain:** Next.js Route Handlers, Supabase (Postgres upsert/RLS/audit trail), Resend + React Email, @tanstack/react-table
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Inquiry Ingestion Architecture**
- **D-01:** The inquiry form (`components/inquiry/inquiry-form.tsx`) changes from submitting directly to Formspree client-side to submitting to a new internal API route. That route writes the lead to the CRM first, then forwards the same payload to Formspree server-side. This supersedes PROJECT.md's original "dual-submit from the client" plan — routing through our own endpoint gives a single write path and the CRM write no longer depends on the client's tab staying open for two sequential fetches.
- **D-02:** Formspree becomes a backup/dashboard copy, not the primary path. If the CRM lead write succeeds but the server-side forward to Formspree fails, log the failure and do NOT block or retry-loop the customer's success response — the CRM write is what "no lead lost" actually depends on. No retry queue/cron for the Formspree forward.
- **D-03 (AUTO-03 dedup key):** The inquiry form generates a client-side UUID (request ID) included in the submission payload; the API route upserts the lead on that ID. This also protects against accidental double-clicks on the Send button, not just literal webhook redelivery. (Formspree submission IDs are not usable for dedup here since Formspree is no longer the first receiver of the payload — see D-01.)

**Contact / Duplicate Identity**
- **D-04:** Email address is the stable identity key for a contact. A second (or later) inquiry from the same email attaches to the EXISTING contact as a new entry in their inquiry-history timeline (CRM-02) rather than creating a second contact record — matches how a real sales team tracks a lead across multiple questions/packages.
- **D-05:** If a later inquiry from the same email includes a different phone number, update the contact's phone field in place (email wins as the identity key; phone is just contact info). No manual-review/reconciliation flag — keep this simple.

**Internal Notification (AUTO-02)**
- **D-06:** Every Admin/Staff account with the "message customers" permission receives the internal notification email on a new inquiry (matches AUTO-02's wording exactly) — not Admins-only.
- **D-07:** One email per inquiry, sent immediately — no digest/batching. "Instant" is the point; a digest would delay response to a fresh lead, and per-inquiry volume is expected to comfortably fit Resend's 100/day free-tier cap at this business's scale.

**Package Linkage (CRM-06)**
- **D-08:** The per-package inquiry form is changed to send the package's real `package_id` (not just the display name it sends today) alongside `package` (name, kept for the auto-reply/notification email copy). The lead record stores `package_id` as a proper foreign key, giving a real, clickable link into the package record from the CRM — survives package renames, unlike name-string matching.
- **D-09:** The general "Contact Us" form has no package context, so `package_id` is nullable on the lead record. CRM-06 only applies when a package context exists; a general inquiry's CRM record shows as a general inquiry with no package link. The Contact Us form is NOT changed to force a package selection.

### Claude's Discretion
- Exact CRM table schema (contacts/leads table shape, `leads`/`contacts`/`inquiries` naming, status enum implementation, tags implementation — freeform text array vs. a separate tags table).
- Exact API route path/structure for the new inquiry-ingestion endpoint and its request/response contract.
- Auto-reply and internal-notification email template content/copy and React Email component structure (Resend + React Email per CLAUDE.md's stack decision — not re-litigated here).
- CRM list/detail page layout, search/filter UI, and where CRM nav items land in the existing admin sidebar (Packages/Users nav already exists per Phase 2 D-14 — this phase adds CRM).
- Whether `status` and `tags` get their own admin nav entry point or live only within the CRM list/detail views.
- Exact validation/error-handling for the new inquiry API route (rate limiting, payload validation via zod).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (A real admin dashboard summarizing lead/message activity was already deferred to "Phase 3 or 4" during Phase 2's discussion per `02-CONTEXT.md`; not re-raised here since it's not required by any of this phase's CRM-0X/AUTO-0X requirements — worth considering once this phase's data actually exists, but not part of this phase's scope.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|--------------|--------------------|
| CRM-01 | New Formspree inquiry submissions automatically create a lead/contact record in the CRM (via webhook) | Architecture Patterns Pattern 1 (`record_inquiry()` RPC) + System Architecture Diagram — note D-01/D-02 supersede the literal "via webhook" framing with a direct-write-first architecture; Formspree becomes the secondary copy |
| CRM-02 | Admin/Staff can view a contact's inquiry/message history as a timeline | Recommended Project Structure (`app/admin/(dashboard)/crm/[id]/page.tsx`), Open Question 1 (`inquiries` table naming rationale, extensible to Phase 4 messages) |
| CRM-03 | Admin/Staff with "edit CRM" permission can edit a contact's information; Staff without it get read-only access | RLS example (Code Examples), Security Domain V4 Access Control row, `has_permission()` reuse pattern |
| CRM-04 | Admin/Staff can set/update a lead's status (New/Contacted/Qualified/Won/Lost) | Recommended Project Structure (`actions/crm.ts` `updateStatus()`), Don't Hand-Roll audit trail row (status changes flow through the same audited write path) |
| CRM-05 | Admin/Staff can search/filter contacts by name, status, or tag | `@tanstack/react-table` Standard Stack entry + Code Examples (client-side global filter + column filter pattern), Open Question 1 (tags as `text[]`) |
| CRM-06 | Admin/Staff can see which package a lead inquired about, linked directly in the CRM record | D-08/D-09 (verbatim in User Constraints), Pattern 1's `p_package_id` RPC parameter, Pitfall 6 (stale/tampered package_id handling) |
| CRM-07 | CRM records track who created/last edited them and when (audit trail) | Don't Hand-Roll audit trail row, Code Examples "Audit trail trigger" (`created_by`/`updated_by`/`updated_at` + `BEFORE UPDATE` trigger) |
| AUTO-01 | Customer receives an instant auto-reply email when their inquiry is received | Pattern 2 (`after()` fire-and-forget), Standard Stack (`resend` + `react-email`), Package Legitimacy Audit (`@react-email/components` deprecation correction) |
| AUTO-02 | Admin/Staff with "message customers" permission receive an internal notification when a new inquiry arrives | Pattern 3 (fan-out query), D-06/D-07 (verbatim in User Constraints), Pitfall 5 (RLS-blocks-anon-query gotcha) |
| AUTO-03 | Duplicate webhook deliveries for the same inquiry do not create duplicate leads or duplicate auto-reply/notification sends (idempotency) | Pattern 1 (`ON CONFLICT (request_id) DO NOTHING RETURNING`, `is_new` flag), Pitfall 3 (gating `after()` calls on `is_new`), D-03 (verbatim in User Constraints) |
</phase_requirements>

## Summary

This phase's core engineering challenge is reliability, not novelty: a new Next.js 16 Route Handler (the project's first) must accept the public inquiry form's POST, write the lead to Supabase durably, then fire a best-effort forward to Formspree and two best-effort emails (auto-reply + internal notification) — all without blocking the customer's response or losing the lead if any downstream step fails. Every piece needed (Route Handlers, `after()`, Supabase upsert-based idempotency, Resend + React Email, RLS scoped to the existing `has_permission()` helper, `@tanstack/react-table`) is already either installed or a one-line install away, and Phase 2 already established every pattern this phase needs to extend (Server Actions with `require*()` guards, `has_permission()`-scoped RLS, `ActionResult`/ `FormspreeResult`-shaped return types).

The single most important technical finding is that **Next.js 16.2's stable `after()` API (from `next/server`) is the correct mechanism for D-02's "forward to Formspree, fire-and-forget on failure"** — a bare unawaited `fetch()` call in a Route Handler is not guaranteed to complete on Vercel's serverless runtime, because the function's execution context can be frozen/terminated once the `Response` is returned. `after()` (stable since Next.js 15.1, confirmed present and unchanged in this project's installed 16.2.10 docs) explicitly schedules a callback to run after the response is sent, and Vercel supports it out of the box via `waitUntil`. This must be used for both the Formspree forward and the two Resend email sends — none of these should block the customer's response, and all three are best-effort side effects that must not affect whether the "lead saved" response is returned.

The second key finding: **Resend's official React Email component package (`@react-email/components`) is deprecated in React Email v6** (the currently-installed-compatible major version). All components and the `render()` utility have been unified into the single `react-email` package — `import { Button, Html, Head } from "react-email"` replaces `import { ... } from "@react-email/components"`. This directly contradicts the version guidance in `.claude/CLAUDE.md`'s Supporting Libraries table (which lists `@react-email/components` 5.x-6.x) — that guidance is now stale and should not be followed literally; use `react-email` as the single import source instead.

**Primary recommendation:** Build the ingestion endpoint as `app/api/inquiries/route.ts`, write to Supabase first via a single atomic Postgres RPC function (find-or-create contact by email + idempotent insert of an inquiry/timeline row keyed on the client-generated `request_id`, mirroring Phase 2's `write_package_children()` RPC precedent), then use `after()` to fire the Formspree forward and the two Resend sends outside the response path. Gate all CRM reads/writes with a new `can_edit_crm`-scoped RLS extension of the existing `has_permission()` function, and build the contact list with `@tanstack/react-table`'s client-side filtering (`getFilteredRowModel` + a custom multi-field global filter), matching the scale of a small travel business's lead volume.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inquiry ingestion (receive + validate payload) | API / Backend (Route Handler) | Browser (client form, zod pre-validation) | New `app/api/inquiries` Route Handler is the single write path per D-01; client-side zod validation is UX only, never trusted |
| Idempotent lead/contact persistence | Database / Storage (Postgres RPC) | API / Backend | Dedup-on-conflict logic belongs in a single atomic DB function, not split across two round-trip client calls (race-condition risk) |
| Formspree backup forward | API / Backend (Route Handler, `after()`) | — | Fire-and-forget side effect, must not block or fail the primary response |
| Auto-reply + internal notification email | API / Backend (Route Handler, `after()`) | — | Resend SDK is server-only (API key must never reach the browser) |
| CRM read/write authorization | Database / Storage (RLS) | API / Backend (Server Action `require*()` guards) | Defense in depth — matches Phase 2's established double-gate pattern (AUTH-05) |
| CRM contact list search/filter/timeline UI | Browser / Client | Frontend Server (SSR initial fetch) | Server Component fetches full contact list once; `@tanstack/react-table` filters client-side, matching `sortable-package-list.tsx` precedent |
| Audit trail (created_by/updated_by) | Database / Storage (trigger) | API / Backend | Trigger-based `auth.uid()` capture is authoritative regardless of which Server Action path performs the write |

## Package Legitimacy Audit

| Package | Registry | Age (latest version) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------------------|-----------|--------------|---------|-------------|
| `resend` | npm | Latest 6.17.2 published 2026-07-08 | 8.26M/wk | github.com/resend/resend-node | SUS (`too-new`) | Approved — high download count + official Resend org repo; "too-new" reflects an active-maintenance release cadence, not a slopsquat signal. Already the project's locked provider (CLAUDE.md). |
| `react-email` | npm | Latest 6.9.0 published 2026-07-15 | 3.02M/wk | github.com/resend/react-email | SUS (`too-new`) | Approved — same rationale as `resend`; official Resend org repo, very high downloads. |
| `@react-email/components` | npm | Latest 1.0.12, published 2026-04-09 | 4.39M/wk | github.com/resend/react-email | SUS (`deprecated`) | **REMOVED from recommendation** — npm reports "Package no longer supported." React Email v6 unified all components into the `react-email` package itself. Do not install this package; import from `react-email` instead. |
| `@tanstack/react-table` | npm | 8.21.3 | 16.6M/wk | github.com/TanStack/table | OK | Approved — already the project's locked stack choice (CLAUDE.md), no change. |
| `date-fns` | npm | 4.4.0 | 93.2M/wk | github.com/date-fns/date-fns | OK | Approved — already the project's locked stack choice (CLAUDE.md), needed for timeline/"days since" formatting (CRM-02). |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `resend`, `react-email` — both are high-confidence false positives (the "too-new" heuristic just means their latest patch release is recent; both are Resend's own first-party packages with tens of millions of weekly downloads). No `checkpoint:human-verify` needed given the corroborating download/repo evidence, but the planner should still pin exact versions at install time rather than blindly trusting `latest`.
**Deprecated package caught by the gate:** `@react-email/components` — confirmed deprecated directly via `npm view @react-email/components deprecated` (`[VERIFIED: npm registry]`) and cross-referenced against React Email's own v6 changelog/blog post (`[CITED: react.email/docs/changelog, resend.com/blog/react-email-6]`). This is exactly the kind of "training data is stale" pitfall this project's `AGENTS.md` warns about for Next.js APIs — it applies here too, to a supporting library.

## Standard Stack

### Core (already installed — no action needed)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.10 | Route Handler (`app/api/inquiries/route.ts`), `after()` for fire-and-forget side effects | Already the project's framework; `after()` confirmed stable and present in this exact installed version's own docs `[VERIFIED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md]` |
| `zod` | ^4.4.3 | Request body validation in the Route Handler | Already used for `inquirySchema`; extend with `requestId`/`packageId` fields, reuse `z.email()` (zod 4 API, already in use in `inquiry-schema.ts`) |
| `@supabase/ssr` / `@supabase/supabase-js` | ^0.12.3 / ^2.110.7 | DB writes from the Route Handler via `lib/supabase/server.ts`'s existing `createClient()` | Already the project's DB client factory; Route Handlers can call it directly (cookies() works in request context, unlike Server Component renders) |
| `react-hook-form` + `@hookform/resolvers` | ^7.82.0 / ^5.4.0 | Inquiry form field changes (add `requestId`, `packageId`) | Already in use in `inquiry-form.tsx`, no new pattern needed |

### New for this phase
| Library | Verified Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `resend` | 6.17.2 | Send auto-reply + internal notification emails from the Route Handler | Official SDK, already the project's locked email provider (CLAUDE.md) `[VERIFIED: npm registry, 2026-07-20]` |
| `react-email` | 6.9.0 | Author auto-reply + internal-notification templates as React components; import `Html`, `Head`, `Body`, `Container`, `Text`, `Button`, etc. directly from this package (NOT `@react-email/components` — deprecated, see audit above) | `[VERIFIED: npm registry, 2026-07-20]`; `[CITED: react.email/docs/changelog]` for the v6 import-path unification |
| `@tanstack/react-table` | 8.21.3 | CRM contact list table: client-side global filter (name/tag) + column filter (status) | Already the project's locked stack choice (CLAUDE.md), first actual usage this phase `[VERIFIED: npm registry, 2026-07-20]` |
| `date-fns` | 4.4.0 | Timeline date formatting, "last contacted N days ago" | Already the project's locked stack choice (CLAUDE.md) `[VERIFIED: npm registry, 2026-07-20]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `after()` for fire-and-forget forward/email | Bare unawaited `fetch()`/`resend.emails.send()` | Rejected — no guarantee the promise runs to completion once the `Response` is returned on Vercel's serverless runtime; `after()` is the documented, stable mechanism for exactly this use case |
| Postgres RPC for idempotent write | Two sequential `supabase-js` calls (`upsert` contact, then `upsert` inquiry) from the Route Handler | RPC preferred — a single atomic function avoids a race where two near-simultaneous redeliveries could both pass a "does contact exist" check before either write commits; also mirrors this project's own `write_package_children()` precedent from Phase 2 |
| `@tanstack/react-table` client-side filtering | Server-side search via Supabase `ilike`/query params | Client-side preferred at this project's scale (a small PH travel business's lead volume is expected to stay in the hundreds, not the tens of thousands) — matches `sortable-package-list.tsx`'s existing all-client-side precedent and avoids adding a new server-round-trip-per-keystroke pattern to the codebase |

**Installation:**
```bash
npm install resend react-email @tanstack/react-table date-fns
```
Do NOT install `@react-email/components` — deprecated, see Package Legitimacy Audit.

**Version verification:** Verified via `npm view <package> version` and `npm view <package> deprecated` against the live npm registry on 2026-07-20 (see Package Legitimacy Audit table for exact publish dates/download counts).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐
│ Public inquiry form      │  (components/inquiry/inquiry-form.tsx)
│ - client-gen UUID        │
│   (crypto.randomUUID())  │
│ - packageId (if per-pkg) │
└────────────┬─────────────┘
             │ POST JSON
             ▼
┌──────────────────────────────────────────────────────────┐
│ app/api/inquiries/route.ts  (NEW — first Route Handler)   │
│                                                             │
│  1. zod .safeParse(body)  ──fail──▶ 400 response           │
│  2. supabase.rpc('record_inquiry', {...})                  │
│     - find-or-create contact by email (upsert on email)    │
│     - insert inquiry row, ON CONFLICT (request_id)          │
│       DO NOTHING RETURNING id  ──▶ is_new boolean           │
│         │                                                   │
│         ├─ DB write fails ──▶ 500 response (lead NOT lost   │
│         │                     is the failure the customer    │
│         │                     sees — nothing silently drops) │
│         │                                                   │
│         └─ DB write succeeds ──▶ build 200 response NOW      │
│                                                               │
│  3. after(() => { … })  — scheduled, does NOT block response │
│       if (is_new) {                                          │
│         forwardToFormspree(payload)   // log-only on failure │
│         resend.emails.send(autoReply)                        │
│         resend.emails.send(internalNotification, to: fanout) │
│       }                                                       │
│                                                               │
│  4. return Response.json({ ok: true })                       │
└──────────────────────────────┬────────────────────────────┘
                                │ (after response sent)
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
        Formspree (backup)  Resend: customer  Resend: fan-out to every
        server-side forward auto-reply email  profile with
        (D-02, best-effort)                   can_message_customers=true
                                               (D-06, queried via
                                                has_permission-style filter)

┌──────────────────────────────────────────────────────────┐
│ Admin CRM (Server Components + Server Actions)             │
│ /admin/crm  — list (RLS: can_edit_crm read-all, else own)  │
│ /admin/crm/[id] — detail: timeline (inquiries), status,     │
│    package link (CRM-06), audit (created_by/updated_by)     │
│ actions/crm.ts — updateStatus(), updateContact(), addTag()  │
│   each starts with requirePermission("can_edit_crm")        │
│   or read-only render path when permission absent (CRM-03)  │
└──────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/
├── api/
│   └── inquiries/
│       └── route.ts              # NEW — POST handler, D-01/D-02/D-03
├── admin/(dashboard)/
│   └── crm/
│       ├── page.tsx               # contact list (Server Component, requirePermissionOrRedirect not needed — CRM-03 read-all)
│       └── [id]/page.tsx          # contact detail + timeline
actions/
└── crm.ts                         # NEW — updateStatus/updateContact/addTag Server Actions
components/
├── admin/
│   ├── crm-table.tsx               # NEW — "use client", @tanstack/react-table
│   └── crm-detail.tsx              # NEW — timeline + status select
├── email/
│   ├── auto-reply-email.tsx        # NEW — React Email template (customer)
│   └── internal-notification-email.tsx  # NEW — React Email template (staff)
lib/
├── formspree.ts                    # EXISTING — reused for forward-to-Formspree shape
├── resend.ts                       # NEW — `new Resend(process.env.RESEND_API_KEY)` singleton
└── crm/
    └── inquiry-schema.ts           # NEW — zod schema for the Route Handler's request body
supabase/migrations/
└── <timestamp>_create_crm_schema.sql   # NEW — contacts, inquiries tables, record_inquiry() RPC, RLS, audit trigger
```

### Pattern 1: Idempotent write via a single Postgres RPC function
**What:** One `security invoker` plpgsql function, `record_inquiry(p_request_id uuid, p_email text, p_name text, p_phone text, p_message text, p_package_id uuid)`, does: (a) upsert the contact row keyed on `email` (insert or update name/phone), (b) insert the inquiry/timeline row with `ON CONFLICT (request_id) DO NOTHING RETURNING id`, (c) returns `(contact_id uuid, inquiry_id uuid, is_new boolean)`.
**When to use:** Any time a single logical operation spans two related tables and must be atomic + tell the caller whether a NEW row was created (needed to decide whether to fire the auto-reply/notification emails on redelivery — AUTO-03).
**Example:**
```sql
-- Source: pattern derived from this project's own
-- supabase/migrations/20260718171228_atomic_package_children_write.sql
-- (write_package_children() RPC precedent) + standard Postgres
-- "insert ... on conflict do nothing returning" idempotency idiom.
create or replace function public.record_inquiry(
  p_request_id uuid,
  p_email text,
  p_name text,
  p_phone text,
  p_message text,
  p_package_id uuid default null
) returns table (contact_id uuid, inquiry_id uuid, is_new boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_inquiry_id uuid;
begin
  insert into contacts (email, name, phone)
  values (p_email, p_name, p_phone)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone
  returning id into v_contact_id;

  insert into inquiries (contact_id, request_id, message, package_id)
  values (v_contact_id, p_request_id, p_message, p_package_id)
  on conflict (request_id) do nothing
  returning id into v_inquiry_id;

  return query select v_contact_id, v_inquiry_id, (v_inquiry_id is not null);
end;
$$;
```
Call from the Route Handler: `const { data, error } = await supabase.rpc("record_inquiry", { p_request_id, p_email, p_name, p_phone, p_message, p_package_id });` — `data[0].is_new` gates the `after()` side effects.

**Why `security invoker`, not `security definer`:** unlike Phase 2's `has_permission()` (which must bypass RLS to avoid self-referential recursion on the `profiles` table), this function's caller is the anon-key Route Handler client — RLS on `contacts`/`inquiries` must explicitly grant `anon` INSERT (see RLS pattern below); a `security definer` function would silently bypass that policy and hide a misconfiguration. Keep it `security invoker` so RLS is the single source of truth for who can write.

### Pattern 2: `after()` for fire-and-forget side effects
**What:** Schedule the Formspree forward and both Resend sends via `next/server`'s `after()`, called after the DB write succeeds but before `return Response.json(...)`.
**When to use:** Any Route Handler side effect that must not block or fail the primary response (D-02's explicit requirement).
**Example:**
```typescript
// Source: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md
// (this project's installed Next.js 16.2.10 docs — confirms `after` is stable
// and Route-Handler-compatible, per AGENTS.md's stale-training-data warning)
import { after } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = inquiryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_inquiry", { ...toRpcArgs(parsed.data) });

  if (error || !data?.[0]) {
    console.error("record_inquiry failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }

  const { contact_id, is_new } = data[0];

  if (is_new) {
    after(async () => {
      // D-02: log-only on failure, never block/retry
      const result = await submitToFormspree({ ...parsed.data.formspreePayload });
      if (!result.ok) console.error("Formspree forward failed", result.errors);
    });

    after(async () => {
      await sendAutoReplyEmail(parsed.data); // Resend — log/catch internally
    });

    after(async () => {
      await sendInternalNotificationEmails(parsed.data); // fan-out, see Pattern 3
    });
  }

  return Response.json({ ok: true });
}
```

### Pattern 3: Fan-out internal notification query (D-06)
**What:** Query every active profile with `can_message_customers = true` (Admins included per D-06's exact wording — role='admin' rows also count regardless of the boolean), send one email per inquiry.
**When to use:** AUTO-02's internal notification fan-out.
**Example:**
```typescript
// lib/crm/notify-staff.ts
const { data: recipients } = await supabase
  .from("profiles")
  .select("email")
  .eq("is_active", true)
  .or("role.eq.admin,can_message_customers.eq.true");

if (recipients?.length) {
  // Send individually (not one call with `to: [...]`) so staff don't see
  // each other's email addresses in the To: header — Resend's `to` array
  // is visible to every recipient, `bcc` avoids that exposure.
  await resend.emails.send({
    from: "TravelSentro <notifications@travelsentro.example>",
    to: "notifications@travelsentro.example", // required placeholder recipient
    bcc: recipients.map((r) => r.email),
    subject: `New inquiry from ${name}`,
    react: <InternalNotificationEmail {...data} />,
  });
}
```
This mirrors the existing `has_permission()` semantics (`role = 'admin' OR <permission column>`) without needing to call the RLS helper function from application code — Route Handler runs with the anon key, and `profiles` SELECT is restricted to "self or admin" (Phase 2 migration), so this query must run through a `security definer` RPC or the service-role client (`actions/users.ts`'s existing `createServiceRoleClient` + WebSocket-polyfill precedent) rather than the plain anon-key client, since an anonymous request cannot read arbitrary `profiles` rows under Phase 2's existing RLS.

### Anti-Patterns to Avoid
- **Two sequential `supabase-js` calls (upsert contact, then upsert inquiry) instead of one RPC:** creates a TOCTOU race window between concurrent redeliveries; use the single RPC (Pattern 1).
- **Awaiting the Formspree forward or Resend sends before returning the response:** turns a "no lead lost" endpoint into one whose latency (and failure surface) is coupled to a third-party API's uptime — exactly what D-01/D-02 were designed to avoid.
- **Importing from `@react-email/components`:** deprecated; import from `react-email` (Pattern above, Package Legitimacy Audit).
- **A single `to: [...]` array for the staff fan-out email:** leaks every recipient's email address to every other recipient; use `bcc`.
- **Trusting `packageId` from the client without validating it references a real, non-deleted package:** D-08 links a real FK — validate `package_id` exists in `packages` (or leave null) before insert, otherwise a stale/tampered ID either 500s on the FK constraint (acceptable — DB rejects, lead insert fails loudly) or silently orphans (avoid by checking first, or catching the FK violation and retrying with `package_id: null`, logging the mismatch).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Idempotent insert-on-duplicate | Manual "SELECT then INSERT if not found" application-level check | Postgres `ON CONFLICT ... DO NOTHING RETURNING` inside a single RPC | Application-level check-then-insert has a race window; Postgres's native conflict resolution is atomic and race-free by construction |
| Fire-and-forget background work in a serverless Route Handler | Bare unawaited `fetch()`/promise | `after()` from `next/server` | Unawaited promises are not guaranteed to complete once the response is sent on Vercel's serverless runtime; `after()` is the documented mechanism Vercel/Next.js provide specifically for this |
| Email HTML templates | Hand-written HTML strings with inline styles for cross-client compatibility | `react-email`'s component set (`Html`, `Body`, `Container`, `Button`, etc.) | Email HTML rendering across Gmail/Outlook/Apple Mail has notoriously inconsistent CSS support; React Email's components already encode the safe subset |
| Audit trail (who/when) | Manually setting `updated_by`/`updated_at` in every Server Action | A `BEFORE UPDATE` trigger calling `auth.uid()` | Trigger-based capture is authoritative regardless of which code path performs the write (Server Action today, a future admin API tomorrow) — matches CRM-07's requirement that EVERY record tracks this, not just ones edited through one specific code path |
| Contact list search/filter | Hand-rolled `.filter()` + multiple `useState` calls per column | `@tanstack/react-table`'s `getFilteredRowModel` + `globalFilterFn` | Already the project's locked stack choice; handles multi-column filter state, sort, and row model composition correctly out of the box |

**Key insight:** every "don't hand-roll" item above already has a proven precedent inside this exact codebase (RPC pattern from `write_package_children()`, `ActionResult`/`FormspreeResult` result shapes, `has_permission()` RLS helper) — the discipline for this phase is extending those precedents consistently, not introducing new patterns.

## Runtime State Inventory

Not applicable — this is a greenfield feature phase (new tables, new Route Handler, new email templates), not a rename/refactor/migration phase. No existing runtime state references the CRM/inquiry concept being renamed or moved.

## Common Pitfalls

### Pitfall 1: Unawaited promise silently dropped on Vercel
**What goes wrong:** A bare `fetch(FORMSPREE_ENDPOINT, ...)` or `resend.emails.send(...)` call left unawaited inside the Route Handler body (not inside `after()`) appears to work in local `next dev` (long-lived Node process) but silently fails to complete in a subset of production Vercel invocations, because the serverless function's execution context can be frozen the instant the `Response` is returned.
**Why it happens:** Local dev's persistent Node process has no equivalent lifecycle boundary; the bug only manifests under Vercel's actual serverless execution model.
**How to avoid:** Always wrap fire-and-forget work in `after()` (Pattern 2), never a bare unawaited call.
**Warning signs:** Auto-reply emails or Formspree copies missing intermittently in production despite the code "looking" fire-and-forget correct and passing local testing.

### Pitfall 2: Anonymous INSERT policy accidentally too broad
**What goes wrong:** The new `contacts`/`inquiries` tables need an RLS policy allowing the **anon** role to INSERT (the Route Handler runs as an unauthenticated public visitor, no admin session) — but if the policy USING/WITH CHECK clause is missing or too permissive, this becomes a public write surface that could be abused for spam or, worse, accidentally allow anon SELECT/UPDATE/DELETE if a broader policy is copy-pasted from elsewhere.
**Why it happens:** Every other Phase 2 write policy is `to authenticated` — this is the first genuinely public write path in the project, easy to under-scope by reusing a Phase 2 policy template that grants read access too.
**How to avoid:** Grant INSERT-only to `anon` (and `authenticated`, since staff might also submit via the same form while logged in) with a `WITH CHECK` that doesn't reference existing table contents (no cross-row leakage possible via RLS on INSERT); keep SELECT/UPDATE/DELETE `can_edit_crm`-scoped as today. Rely on the Route Handler's zod validation (not RLS) for content shape validation, and the existing honeypot field for basic bot deterrence — RLS cannot rate-limit.
**Warning signs:** A quick anon-key `curl` test that can read back other contacts' data, or an unbounded volume of spam inquiry rows.

### Pitfall 3: `record_inquiry()`'s `is_new` flag not checked before firing emails
**What goes wrong:** If the Route Handler fires the auto-reply/notification `after()` calls unconditionally (not gated on `is_new`), a redelivered webhook or an accidental double-submit (same `requestId`) sends a second auto-reply/notification email — violating AUTO-03's explicit "duplicate webhook deliveries ... do not create duplicate ... auto-reply/notification sends" requirement.
**Why it happens:** Easy to focus dedup effort on the DB row and forget the downstream side effects also need to be gated on the same idempotency signal.
**How to avoid:** Only schedule the three `after()` calls inside `if (is_new) { ... }` (Pattern 2's example already reflects this).
**Warning signs:** A UAT test that double-submits the same `requestId` and receives two auto-reply emails despite only one contact/inquiry row existing.

### Pitfall 4: `@react-email/components` import breaks silently or is deprecated at build time
**What goes wrong:** Following this project's own `.claude/CLAUDE.md` Supporting Libraries table literally (`react-email` + `@react-email/components`) installs a deprecated package.
**Why it happens:** CLAUDE.md's guidance was accurate as of prior research but React Email v6 (published 2026-04+) unified the packages; CLAUDE.md predates or didn't catch this shift.
**How to avoid:** Import all React Email components and `render()` from `react-email` directly (Package Legitimacy Audit + Standard Stack above); do not install `@react-email/components`.
**Warning signs:** `npm install` warning "This package has been deprecated," or `npm view @react-email/components deprecated` returning a message.

### Pitfall 5: `profiles` RLS blocks the anon-key fan-out query
**What goes wrong:** The internal-notification fan-out (Pattern 3) needs to read every profile with `can_message_customers = true`, but Phase 2's `profiles` SELECT RLS policy only allows a row's own owner or an admin caller to read it — an anonymous Route Handler request has no session, so a plain anon-key query returns zero rows, and no staff get notified.
**Why it happens:** The fan-out query's caller identity (anonymous visitor submitting a form) has no relationship to the `profiles` rows being read — this is fundamentally different from every other Phase 2 read, which was always an authenticated staff member reading their own data.
**How to avoid:** Use the service-role client for this one query (mirroring `actions/users.ts`'s existing `createServiceRoleClient` + WebSocket-polyfill pattern) inside the `after()` callback, never expose the service role key to the client. Alternatively, wrap the query in a `security definer` RPC scoped narrowly to returning only `email` for `can_message_customers`/admin rows (least-privilege, no other profile fields exposed) — prefer this RPC approach over the service-role client since it avoids importing service-role credentials into a code path with a much larger blast radius (any Route Handler bug) than the existing admin-only Server Actions.
**Warning signs:** DB write succeeds (contact/inquiry created) but zero internal notification emails ever arrive, with no error surfaced (since notification failure is intentionally silent/best-effort per D-02's spirit extended to D-06/D-07).

### Pitfall 6: Package ID FK violates on stale/deleted package
**What goes wrong:** D-08 sends the real `package_id`; if a customer has an old page open (package later soft-deleted or hard-referenced by an invalid ID), the insert into `inquiries.package_id` (FK to `packages.id`) throws a foreign-key violation, and if not handled, the entire `record_inquiry()` call fails — losing the lead over an ancillary field, contradicting the phase's core "no lead lost" value.
**Why it happens:** Packages Phase 2 supports soft-delete (`deleted_at`), not hard-delete, so a genuinely-deleted package's row still exists and its FK still resolves — but a hand-tampered or genuinely invalid `package_id` from a stale client build would not.
**How to avoid:** Validate `package_id` server-side (exists in `packages`, regardless of `deleted_at`/`is_published` — the FK just needs the row to exist) before calling the RPC; on validation failure, log and proceed with `package_id: null` rather than failing the whole request.
**Warning signs:** 500 errors on `record_inquiry()` specifically correlated with package detail pages that were recently unpublished/deleted.

## Code Examples

### Client-generated idempotency key (D-03)
```typescript
// components/inquiry/inquiry-form.tsx — generated once per form mount/submit attempt
// Source: standard Web Crypto API, available in all evergreen browsers Next.js 16 targets.
const requestId = crypto.randomUUID();
```

### Zod schema for the Route Handler's request body
```typescript
// lib/crm/inquiry-schema.ts
import { z } from "zod";

export const inquiryRequestSchema = z.object({
  requestId: z.uuid(), // zod 4 top-level validator, matches this project's existing z.email() convention
  name: z.string().min(1).max(200),
  email: z.email(),
  phone: z.string().min(7).max(30),
  message: z.string().min(1).max(5000),
  packageId: z.uuid().nullable().optional(),
  packageName: z.string().max(200).optional(), // kept for email copy per D-08
});
```

### RLS for `contacts`/`inquiries` (extends Phase 2's `has_permission()` pattern)
```sql
-- Source: pattern extends this project's own
-- supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql
alter table contacts enable row level security;
alter table inquiries enable row level security;

-- Public write path (D-01) — insert only, no read/update/delete for anon.
create policy "anyone can create a contact via inquiry" on contacts
  for insert to anon, authenticated with check (true);

create policy "anyone can create an inquiry" on inquiries
  for insert to anon, authenticated with check (true);

-- CRM-03: read-all for any authenticated Staff (not permission-gated — read
-- is broader than write per the phase's explicit requirement wording).
create policy "authenticated staff can read all contacts" on contacts
  for select to authenticated using (true);

create policy "authenticated staff can read all inquiries" on inquiries
  for select to authenticated using (true);

-- CRM-03: write gated on can_edit_crm, reusing has_permission() as-is.
create policy "can_edit_crm can update contacts" on contacts
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_edit_crm'))
  with check (public.has_permission(auth.uid(), 'can_edit_crm'));
```

### Audit trail trigger (CRM-07)
```sql
-- Source: standard Postgres/Supabase pattern, cross-referenced against
-- Supabase community docs on auth.uid()-based audit triggers.
alter table contacts add column created_by uuid references profiles(id);
alter table contacts add column updated_by uuid references profiles(id);
alter table contacts add column updated_at timestamptz not null default now();
-- created_by is NULL for system-created contacts (public inquiry route runs
-- unauthenticated, auth.uid() is null in that context) — this null is
-- meaningful: it distinguishes "created by a lead's own inquiry" from
-- "created/edited by staff member X".

create or replace function public.set_updated_by()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger contacts_set_updated_by
  before update on contacts
  for each row execute procedure public.set_updated_by();
```

### `@tanstack/react-table` client-side global filter
```tsx
// Source: TanStack Table v8 official Global Filtering guide
// (tanstack.com/table/latest/docs/guide/global-filtering)
"use client";
import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  type ColumnFiltersState,
} from "@tanstack/react-table";

const [globalFilter, setGlobalFilter] = useState("");
const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

const table = useReactTable({
  data: contacts,
  columns,
  state: { globalFilter, columnFilters },
  onGlobalFilterChange: setGlobalFilter,
  onColumnFiltersChange: setColumnFilters,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  globalFilterFn: (row, _columnId, filterValue) => {
    const q = String(filterValue).toLowerCase();
    return (
      row.original.name.toLowerCase().includes(q) ||
      (row.original.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
    );
  },
});
// Status filter: table.getColumn("status")?.setFilterValue(value)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `@react-email/components` for React Email templates | `react-email` (single unified package) | React Email v6 (2026) | Update all new email template imports; do not follow CLAUDE.md's literal package name for this one library |
| `unstable_after()` for post-response work in Next.js | `after()` (stable) from `next/server` | Next.js 15.1 (this project is on 16.2.10, well past this) | No `unstable_` prefix needed — this project's version has always had the stable API |

**Deprecated/outdated:**
- `@react-email/components`: npm-flagged "Package no longer supported" — replaced by importing directly from `react-email`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Repeat inquiries from the same email should overwrite the contact's `name` field too (not just `phone`, which D-05 explicitly states) — implemented via a plain upsert that updates both columns | Pattern 1, Code Examples | Low — if wrong, a contact's displayed name could flip to whatever the most recent inquiry typed, which may read oddly if a friend/relative submits on someone's behalf; easy to change to "keep original name, only update phone" in the RPC if the planner/user disagrees |
| A2 | The internal notification fan-out should use a narrowly-scoped RPC (or the existing service-role client pattern) rather than loosening `profiles`' SELECT RLS policy, since an anon-key query cannot read other users' profile rows under Phase 2's existing policy | Pattern 3, Pitfall 5 | Medium — if the planner instead chooses to broaden `profiles` SELECT RLS to `anon`, that would leak all staff emails/roles publicly; flagging this explicitly so the plan doesn't accidentally take that shortcut |
| A3 | CRM contact list read access should be "any authenticated Staff, unrestricted" (not further scoped by, e.g., which packages a Staff member manages) — inferred from CRM-03's wording ("Staff without edit CRM permission get read-only access", implying read access itself is universal for any logged-in Staff) | RLS example, Architectural Responsibility Map | Low — matches the requirement text closely; if the user actually wants CRM read also gated behind a permission, that's a scope change beyond this phase's locked decisions and should surface during discuss-phase/plan review, not silently assumed away |
| A4 | `resend.emails.send()` accepts a JSX element directly for the `react` field (e.g., `react: <AutoReplyEmail {...props} />`) rather than requiring the component to be invoked as a plain function call | Pattern 3, Code Examples | Low — both forms are functionally equivalent in React (calling a function component is what JSX compiles to), but Resend's own docs page fetched during this research showed the function-call form (`EmailTemplate({ firstName: 'John' })`) while a follow-up web search confirmed "pass the JSX element, not the function itself" is the idiomatic guidance — worth a quick sanity check against the actual installed `resend` package's TypeScript types during implementation |

## Open Questions

1. **Exact `contacts`/`inquiries` table and column naming**
   - What we know: CONTEXT.md leaves table naming (`leads`/`contacts`/`inquiries`) and tags implementation (array column vs. join table) to Claude's discretion.
   - What's unclear: no existing precedent in this codebase for either naming convention or tags storage.
   - Recommendation: `contacts` (the entity) + `inquiries` (the timeline entries, one per submission) — reads clearly for CRM-02's "inquiry/message history as a timeline" framing (a "message" in Phase 4's MSG-06 sense will also want to live in a timeline-shaped table, so `inquiries` as the first entry naturally extends to a shared "activity" concept later). Tags: a `text[]` column on `contacts` (simplest, matches D-04/D-05's "keep it simple" spirit for this MVP-mode phase) rather than a join table — a join table is more normalized but is unjustified complexity for CRM-05's "search/filter by tag" at this scale.

2. **Formspree forward payload shape after D-01's routing change**
   - What we know: `lib/formspree.ts`'s existing `submitToFormspree()` and `InquiryPayload` type should be reused per the canonical refs, and Formspree becomes a secondary/backup copy (D-02).
   - What's unclear: whether the forwarded payload should include the new `requestId`/`packageId` fields (Formspree's own dashboard doesn't know what to do with a `packageId` field, but including it as inert extra data costs nothing) or stay byte-identical to today's `InquiryPayload` shape.
   - Recommendation: keep the Formspree-bound payload to the original `InquiryPayload` shape (name/email/phone/message/package/`_gotcha`) unchanged — Formspree is a backup viewing surface for a human, not a system integration, so there's no reason to change its contract; only the new internal-only fields (`requestId`) are internal-only and don't need to reach Formspree.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `RESEND_API_KEY` env var | Auto-reply + internal notification emails (AUTO-01, AUTO-02) | Not yet configured (no `.env.local` access from this research session — could not confirm) | — | Planner must add a task to obtain/verify this key exists in `.env.local` and Vercel env vars before wiring `lib/resend.ts`; Resend account itself already exists per `.claude/CLAUDE.md`'s locked provider choice |
| Verified sending domain in Resend | Production email delivery (not `onboarding@resend.dev` test domain) | Unknown — not verifiable from this research session | — | If not yet verified, dev/staging can use Resend's shared test domain (`onboarding@resend.dev`, delivers only to the account owner's verified email) as a fallback during development; flag as a blocker for go-live if the business's own domain isn't verified in Resend by the time this phase ships |
| Supabase CLI / local Postgres | New migration authoring + `supabase gen types typescript` regeneration | Assumed available (used successfully in Phase 1/2 per STATE.md decisions log) | — | — |

**Missing dependencies with no fallback:** none confirmed blocking — both Resend items above have viable dev-time fallbacks; production readiness should be explicitly checked as part of this phase's or a later ship-readiness pass.

## Validation Architecture

Skipped — `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`.

## Security Domain

`security_enforcement` is `true`, `security_asvs_level` is `1`, `security_block_on` is `high` per `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No (new surface is unauthenticated by design — public inquiry endpoint) | N/A for the ingestion endpoint; CRM admin routes already covered by Phase 2's `getUser()`-based session verification |
| V3 Session Management | No (new surface) / Yes (CRM admin UI, already covered by Phase 2's `lib/auth/dal.ts`) | Existing `verifySession()`/`getProfile()` re-validation pattern, unchanged this phase |
| V4 Access Control | Yes | `has_permission(auth.uid(), 'can_edit_crm')` RLS policy (extends Phase 2's helper) + `requirePermission("can_edit_crm")` Server Action guard, matching AUTH-05's server-side-enforcement requirement applied to CRM-03 |
| V5 Input Validation | Yes | `zod` `.safeParse()` on the Route Handler's request body (never trust the client payload shape, matches existing `inquirySchema` precedent) |
| V6 Cryptography | No — no new cryptographic operations this phase (dedup key is a client `crypto.randomUUID()`, not a security token) | N/A |
| V13 API and Web Service | Yes (new: this is the project's first Route Handler / public API surface) | Rate limiting is NOT built this phase (out of CONTEXT.md's locked scope — "Exact validation/error-handling for the new inquiry API route (rate limiting...)" is explicitly left to Claude's discretion, but CONTEXT.md's decisions don't mandate it); recommend the planner at minimum keep the existing honeypot field server-side-enforced (reject silently if `_gotcha` is non-empty) as the cheapest anti-abuse control, and flag full rate limiting as a fast-follow if abuse is observed post-launch |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Public unauthenticated INSERT endpoint used for spam/flooding | Denial of Service | Honeypot field (already present client-side, must also be checked server-side in the Route Handler — client-side-only enforcement is trivially bypassed by a direct POST to the API); zod length caps on `message`/`name`/`phone` fields prevent oversized payload abuse |
| Tampered `package_id` referencing a package that doesn't belong to public catalog intent | Tampering | FK constraint + server-side existence check (Pitfall 6) — reject or null out rather than trusting client-supplied IDs blindly |
| Privilege escalation via CRM write RLS | Elevation of Privilege | Reuse `has_permission()` exactly as Phase 2 defined it (SECURITY DEFINER, plpgsql not sql, to avoid RLS self-recursion) — do not redefine a parallel permission-check function for CRM tables |
| Service-role key exposure in the notification fan-out path | Information Disclosure | Never construct the service-role client in a module reachable from `"use client"` code; keep it inline inside the server-only `after()` callback exactly as `actions/users.ts` already does, or prefer the narrowly-scoped `security definer` RPC alternative (Pitfall 5) to avoid introducing a second service-role call site at all |

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — this project's installed Next.js 16.2.10 Route Handler conventions, read directly per AGENTS.md's explicit instruction
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Route Handler request body/JSON/webhook patterns, this project's installed version
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — `after()` API reference, confirmed stable, this project's installed version
- `npm view resend version` / `npm view react-email version` / `npm view @react-email/components deprecated` / `npm view @tanstack/react-table version` / `npm view date-fns version` — direct registry queries, 2026-07-20
- `gsd-tools query package-legitimacy check` — SLOP/SUS/OK verdicts for all 5 candidate packages, 2026-07-20
- Existing codebase: `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql`, `supabase/migrations/20260718171228_atomic_package_children_write.sql`, `lib/auth/dal.ts`, `actions/users.ts`, `lib/formspree.ts`, `components/inquiry/inquiry-form.tsx`, `lib/action-result.ts`, `app/admin/(dashboard)/layout.tsx`

### Secondary (MEDIUM confidence)
- React Email v6 changelog (react.email/docs/changelog) and resend.com/blog/react-email-6 — `@react-email/components` deprecation and import-path unification, cross-referenced across a WebSearch summary of both official sources
- resend.com/docs/send-with-nextjs, resend.com/docs/api-reference/emails/send-email — Resend SDK send pattern, `to` (max 50) vs `bcc` fan-out behavior
- tanstack.com/table (v8 and latest docs) — `useReactTable`, `getFilteredRowModel`, global filter pattern
- Supabase community sources (jonmeyers.io, GitHub Discussions #9066/#22769) — `auth.uid()`-based audit trigger pattern; official Supabase docs page for `upsert()` did not itself document `ignoreDuplicates` + `.select()` interaction in enough detail, so the RPC-based approach (Pattern 1) is recommended instead of depending on that specific undocumented client behavior

### Tertiary (LOW confidence)
- None — all findings above were corroborated by at least one authoritative source (official docs, registry query, or this project's own existing code).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every new package verified live against npm registry + the legitimacy gate; only genuinely new dependency risk (`@react-email/components` deprecation) was caught and corrected
- Architecture: HIGH — every pattern either directly extends an existing, working precedent in this exact codebase (RPC, RLS, `ActionResult`, Server Action guard pattern) or is drawn from this project's own installed framework docs (`after()`)
- Pitfalls: HIGH for `after()`/idempotency/RLS-scope pitfalls (grounded in this codebase + official docs); MEDIUM for the exact Resend `react:` prop JSX-vs-function-call detail (A4) — low-stakes, easy to verify at implementation time

**Research date:** 2026-07-20
**Valid until:** 30 days (stable stack; re-verify package versions if planning is delayed past mid-August 2026, since `resend`/`react-email` both showed active weekly release cadence)
