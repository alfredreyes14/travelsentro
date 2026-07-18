# Architecture Research

**Domain:** Public marketing/catalog site + internal admin panel/CRM + messaging automation (small business, low-volume, free-tier hosted)
**Researched:** 2026-07-18
**Confidence:** HIGH

## Standard Architecture

For this class of product (public catalog + gated internal tool + lead capture + notifications), the dominant, well-trodden pattern in the Next.js/Vercel/Supabase ecosystem — confirmed across Supabase's own docs, Vercel templates, and multiple production starter kits (Makerkit, Supabase+Next.js quickstarts) — is a **single Next.js application with route groups**, not two separate apps. One deployable unit, one Supabase project, gated sections enforced by session middleware + database-level Row Level Security (RLS). This is the free-tier-friendliest shape: one Vercel project (one build, one domain, one set of env vars) and one Supabase project (one Postgres instance, one Auth namespace).

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Vercel (Next.js App Router)                    │
├─────────────────────────────┬────────────────────────────────────────┤
│      (public) route group    │        (admin) route group             │
│  Marketing site + catalog    │   Auth-gated admin panel                │
│  - Home, About                │  - Dashboard                           │
│  - Package list / detail      │  - Package CRUD                        │
│  - WhatsApp / FB CTA links    │  - CRM (leads/customers)                │
│  - Formspree-hosted form      │  - Messaging (email/SMS)                │
│                               │  - User management (Admin/Staff)        │
├───────────────────────────────┴────────────────────────────────────────┤
│                     proxy.ts / middleware.ts                            │
│   Refreshes Supabase session on every request; redirects unauth'd       │
│   users away from (admin); does NOT enforce fine-grained permissions    │
│   (that's RLS + server-side checks — see Anti-Patterns)                 │
├──────────────────────────────────────────────────────────────────────┤
│                    app/api/*  (Route Handlers)                          │
│  ┌────────────────────┐ ┌───────────────────┐ ┌──────────────────┐    │
│  │ webhooks/formspree  │ │ messaging/email    │ │ messaging/sms    │    │
│  │ (lead ingestion)    │ │ (Resend, single+   │ │ (Semaphore/      │    │
│  │                     │ │  batch)            │ │  Twilio)         │    │
│  └──────────┬──────────┘ └─────────┬──────────┘ └────────┬─────────┘    │
└─────────────┼──────────────────────┼─────────────────────┼─────────────┘
              ▼                      ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              Supabase                                  │
│  ┌───────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────────────┐ │
│  │   Auth     │ │ Postgres │ │  Storage  │ │  RLS policies per role │ │
│  │(Admin/Staff│ │ packages,│ │ (package  │ │  (admin / staff, and   │ │
│  │  accounts  │ │ leads,   │ │  photos)  │ │  per-staff permission  │ │
│  │  only)     │ │ profiles,│ │           │ │  toggles)               │ │
│  │            │ │ messages │ │           │ │                         │ │
│  └───────────┘ └──────────┘ └───────────┘ └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
              ▲
              │ webhook (JSON POST + shared secret)
┌─────────────┴───────────────────┐        ┌─────────────────────────┐
│           Formspree              │        │   External providers    │
│  Hosts the existing inquiry form │        │  Resend (email)          │
│  Public site embeds/links to it  │        │  Semaphore/Twilio (SMS)  │
│  Fires webhook on new submission │        │  WhatsApp / Facebook     │
└──────────────────────────────────┘        │  (deep links only, no   │
                                             │   API integration)      │
                                             └─────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Public site (`(public)` route group) | Browse packages, present WhatsApp/FB CTAs, host/embed Formspree form | Next.js Server Components, data read from Supabase (packages table) with anon key + public-read RLS |
| Admin panel (`(admin)` route group) | Package CRUD, CRM views, messaging composer, user/role management | Next.js Server Components + Server Actions, Supabase client scoped to logged-in session (RLS enforced) |
| Session/route gate | Refresh Supabase session cookie, redirect unauthenticated users off `/admin/*` | `proxy.ts` (Next.js 16+ naming; `middleware.ts` on older versions) using `@supabase/ssr` |
| Ingestion webhook (`/api/webhooks/formspree`) | Receive Formspree POST, verify shared secret, insert lead row, kick off automation | Next.js Route Handler, service-role Supabase client (server-only) |
| Messaging layer (`/api/messaging/*`) | Send individual/bulk email (Resend) and SMS (Semaphore/Twilio), respect per-staff permission toggle | Route Handlers or Server Actions, provider SDKs, server-only API keys |
| Automation | Instant auto-reply to customer + internal alert to staff on new lead | Triggered synchronously inside the webhook handler (low volume — no queue needed at this scale) |
| Supabase Postgres | System of record: packages, leads/customers, profiles (role + permission flags), message log | Tables + RLS policies; migrations checked into repo |
| Supabase Auth | Admin/Staff login only — no customer accounts | Email/password; accounts created by an Admin via service-role Admin API, not public self-signup |
| Supabase Storage | Package photo galleries | Public bucket for package images, admin-only write policy |

## Recommended Project Structure

```
src/
├── app/
│   ├── (public)/                    # Marketing/catalog — public, no auth
│   │   ├── layout.tsx                # header/footer, brand shell
│   │   ├── page.tsx                  # homepage
│   │   └── packages/
│   │       ├── page.tsx              # catalog list
│   │       └── [slug]/page.tsx       # package detail + WhatsApp/FB CTA
│   ├── (admin)/                     # Internal panel — auth + role gated
│   │   ├── layout.tsx                # loads profile, checks role, nav shell
│   │   ├── dashboard/page.tsx
│   │   ├── packages/                 # package CRUD (gated by can_manage_packages)
│   │   ├── crm/                      # leads/customers list + detail (gated by can_edit_crm for writes)
│   │   ├── messaging/                # compose/send email + SMS (gated by can_message_customers)
│   │   └── users/                    # Admin-only: create/deactivate Admin & Staff accounts
│   ├── api/
│   │   ├── webhooks/formspree/route.ts   # lead ingestion endpoint
│   │   ├── messaging/email/route.ts      # individual + bulk email send
│   │   ├── messaging/sms/route.ts        # individual + bulk SMS send
│   │   └── admin/users/route.ts          # account create/deactivate (service role)
│   └── proxy.ts                     # session refresh + admin route gate (middleware.ts pre-Next.js 16)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # browser client (anon key, RLS-bound)
│   │   ├── server.ts                 # server client (cookie-bound, RLS-bound)
│   │   └── admin.ts                  # service-role client — server-only, never imported client-side
│   ├── email/resend.ts               # Resend wrapper (single + batch send)
│   ├── sms/semaphore.ts              # Semaphore (or Twilio) wrapper
│   └── permissions.ts                # shared can_manage_packages/can_edit_crm/can_message_customers checks
└── supabase/
    └── migrations/                   # schema + RLS policies as versioned SQL
```

### Structure Rationale

- **`(public)` / `(admin)` route groups:** Next.js route groups let both surfaces share one app, one deploy, one domain — while keeping layouts, data-fetching, and auth requirements fully separate. This is the pattern used by production starter kits (Makerkit's `(marketing)`/admin split) and keeps the project on a single free Vercel project.
- **`lib/supabase/admin.ts` isolated from `client.ts`:** The service-role key bypasses RLS entirely — it must only ever be imported in server-only files (Route Handlers, Server Actions), never in a Client Component. Separating the file makes accidental client-side imports easy to catch in review.
- **`supabase/migrations/`:** Schema and RLS policies as code, reviewed and versioned alongside app code — avoids “what does prod actually look like” drift, which matters more here because RLS is the real security boundary (see Anti-Patterns).

## Architectural Patterns

### Pattern 1: Single-app route-group monolith (not separate admin app)

**What:** Public site and admin panel live in one Next.js codebase, one Vercel project, distinguished by route groups and a session/role gate — rather than two separate deployed apps.
**When to use:** Small-to-medium internal tools with one team, low traffic, and a strong preference for free-tier simplicity (this project's stated constraint).
**Trade-offs:** Simpler deploy, shared components/design tokens, one set of env vars, one Supabase project. Downside: admin and public code ship together (slightly larger bundle for public visitors, mitigated by route-level code splitting which Next.js does automatically) and a public-site bug technically shares a deploy with the admin panel (mitigated by preview deployments + admin still being auth/RLS gated regardless of deploy).

### Pattern 2: RLS as the real security boundary, middleware as UX convenience

**What:** `proxy.ts`/`middleware.ts` redirects unauthenticated users and refreshes sessions, but the actual enforcement of "who can read/write what" lives in Postgres Row Level Security policies plus server-side checks in Route Handlers/Server Actions. Client-side and middleware checks are just UX — anyone can call the Supabase REST/JS API directly, bypassing the Next.js layer entirely.
**When to use:** Always, whenever Supabase Auth + RLS is in play — this is Supabase's own documented recommendation, not optional.
**Trade-offs:** More upfront schema/policy work (a `profiles` table with `role` and permission-toggle columns, policies referencing `auth.uid()`), but it's the only boundary that can't be bypassed. Two viable role-lookup strategies: (a) query the `profiles` table inside each policy (simplest, instant permission changes, one extra query per check), or (b) mirror role/permissions into JWT custom claims via an auth hook (faster at high query volume, but requires token refresh to pick up changes). At this project's scale, (a) — profiles table lookup — is simpler and sufficient.

**Example:**
```sql
-- profiles table is the source of truth for role + per-staff toggles
create table profiles (
  id uuid references auth.users primary key,
  role text not null check (role in ('admin','staff')),
  can_message_customers boolean not null default false,
  can_manage_packages boolean not null default false,
  can_edit_crm boolean not null default false
);

-- Example RLS: only admins, or staff with the toggle, can write leads
create policy "staff can edit crm if permitted"
on leads for update
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and (profiles.role = 'admin' or profiles.can_edit_crm)
  )
);
```

### Pattern 3: Webhook-triggers-automation chain, kept synchronous at this scale

**What:** Formspree POSTs a submission to `/api/webhooks/formspree`. That single Route Handler: verifies a shared secret, inserts the lead row, then directly calls the email provider twice (auto-reply to customer, internal alert to staff) in the same request — no queue, no background job.
**When to use:** Low-volume lead capture (a handful to dozens of inquiries per day, as described for this business). Vercel's default function timeout (10s on Hobby, up to 300s on Pro) comfortably covers "insert row + send 2 emails."
**Trade-offs:** Simple, no extra infrastructure (no queue service needed), but doesn't scale to high-volume bulk operations — that's why **bulk** messaging (staff sending to hundreds of contacts) is a *separate* concern (see Anti-Patterns: bulk ≠ automation).

**Example:**
```typescript
// app/api/webhooks/formspree/route.ts
export async function POST(req: Request) {
  const secret = req.headers.get('x-formspree-secret');
  if (secret !== process.env.FORMSPREE_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  const payload = await req.json();
  const supabase = createAdminClient(); // service role, server-only
  const { data: lead } = await supabase.from('leads').insert({
    name: payload.name, email: payload.email, message: payload.message,
    status: 'new', source: 'formspree',
  }).select().single();

  await Promise.all([
    sendAutoReply(lead.email, lead.name),        // Resend
    notifyStaffOfNewLead(lead),                  // Resend, to admin/staff distribution
  ]);

  return new Response('ok', { status: 200 });
}
```

## Data Flow

### Lead Ingestion → CRM → Automation

```
Visitor submits Formspree form (public site)
    ↓
Formspree stores submission, fires Webhook plugin
    ↓  (POST JSON + shared secret header)
/api/webhooks/formspree  (Next.js Route Handler on Vercel)
    ↓  verify secret → reject if invalid
    ↓  insert into Supabase `leads` table (service-role client, bypasses RLS intentionally — this is a trusted server context)
    ↓
    ├──→ Resend: auto-reply email to customer ("We received your inquiry")
    └──→ Resend: internal alert email to Admin/Staff distribution ("New lead: [name]")
              (optionally also insert an in-app `notifications` row for a dashboard badge)
    ↓
Lead now visible in Admin → CRM, status = "new", ready for staff follow-up
```

### Admin/Staff Messaging (Individual or Bulk)

```
Staff selects contact(s) in CRM UI → composes email/SMS in Messaging screen
    ↓
Server Action / Route Handler checks: role === 'admin' OR profile.can_message_customers
    ↓ (rejected server-side even if UI hid the button — defense in depth)
    ↓
Single recipient → one Resend/Semaphore API call, synchronous
Bulk recipients  → chunked calls respecting provider rate limits
                    (Resend: batch endpoint, up to 100/call, ~2 req/sec default limit;
                     Semaphore/Twilio: sequential or small-batch loop)
    ↓
Message + delivery status logged to Supabase `messages` table for CRM history
```

### Key Data Flows

1. **Lead capture:** Formspree (external, unowned) → webhook → Supabase `leads` (owned system of record). Formspree is never queried at read time — once ingested, Supabase is the sole source of truth for CRM data.
2. **Automation:** Triggered inline from the same ingestion request, not via a separate cron/queue — appropriate only because volume is low; documented as an anti-pattern to keep synchronous if volume grows (see Anti-Patterns).
3. **Bulk messaging:** Distinct code path from automation — must chunk/batch against provider rate limits and must not be built to reuse the "insert lead → immediately email" synchronous pattern at scale.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (small PH travel business, tens of leads/week, staff-sized contact lists) | Single Next.js app on Vercel Hobby/Pro, single Supabase free-tier project, synchronous webhook automation, small bulk sends (tens–low hundreds of recipients) done in one chunked request |
| Growth (hundreds of leads/week, contact list in the thousands) | Move bulk email/SMS off the request/response cycle into a `jobs` table processed by Vercel Cron (poll-and-send in batches respecting provider rate limits) instead of one long-lived request; upgrade Vercel plan for longer function timeouts if needed |
| High volume (rare for this business model, but noted) | Introduce a real queue (Upstash/QStash or similar) between "staff clicks send" and "provider API calls" for fan-out and retries; consider Supabase connection pooling settings and read replicas if CRM read volume grows significantly |

### Scaling Priorities

1. **First bottleneck:** Vercel serverless function timeout (10s default) hit during a large bulk send in a single request. Fix: chunk sends client-side or server-side into provider-rate-limit-sized batches (Resend batch API = 100/call) before this becomes a problem — cheap to build correctly from the start rather than retrofit.
2. **Second bottleneck (unlikely at this business's scale, but worth flagging):** Synchronous webhook-triggered automation blocking the Formspree webhook response if email providers are slow/down. Fix: wrap provider calls in try/catch so a provider outage doesn't fail the lead insert; consider a lightweight retry (e.g., a `pending_notifications` table swept by a cron) only if this becomes an observed problem.

## Anti-Patterns

### Anti-Pattern 1: Client-side/middleware-only permission checks

**What people do:** Rely on hiding UI buttons or on a `proxy.ts`/`middleware.ts` redirect as the only gate for "can this staff member edit CRM data / manage packages / send messages."
**Why it's wrong:** Anyone can call the Supabase REST API directly with the anon key and bypass the Next.js layer entirely. Middleware and hidden buttons are UX, not security.
**Do this instead:** Enforce every permission at two layers minimum: (1) RLS policy on the table referencing the `profiles` role/toggle columns, and (2) a server-side check in the Route Handler/Server Action before performing the write. UI hiding is a nice-to-have third layer, not the security boundary.

### Anti-Pattern 2: Exposing the Supabase service-role key to any client-executable code

**What people do:** Import the service-role Supabase client in a Client Component or a shared `lib/supabase.ts` that gets bundled for the browser, "just to make one query easier."
**Why it's wrong:** The service-role key bypasses RLS completely — leaking it grants full read/write to every table, including other staff's accounts and all CRM data.
**Do this instead:** Keep the service-role client in a separate file (`lib/supabase/admin.ts`), only ever import it inside Route Handlers, Server Actions, or other server-only modules. Never pass it through any file also imported by a Client Component.

### Anti-Pattern 3: Building bulk messaging on the same synchronous pattern as instant automation

**What people do:** Reuse the "insert row, then call the email API directly in the same request" pattern from the auto-reply automation for staff-initiated bulk sends to hundreds of contacts.
**Why it's wrong:** Hits the Vercel function timeout and/or the provider's per-second rate limit (Resend defaults to ~2 req/sec outside the batch endpoint), causing partial sends and unclear failure states.
**Do this instead:** Use the provider's batch endpoint (Resend batch API, up to 100 emails/call) and chunk larger lists across multiple batched calls; for very large future lists, move to a polling job (Vercel Cron + a `jobs`/`message_queue` table) rather than one long request.

### Anti-Pattern 4: Trusting the Formspree webhook payload without verification

**What people do:** Accept and insert any JSON POSTed to `/api/webhooks/formspree` as a lead, assuming only Formspree will ever call it.
**Why it's wrong:** The endpoint URL is a public URL; anyone who discovers it can POST fabricated "leads" (spam, CRM pollution, or a vector to trigger the auto-reply/alert automation as a mail-spam relay).
**Do this instead:** Configure a shared secret (custom header or signed payload per Formspree's webhook plugin settings) and reject any request that doesn't match it before inserting or triggering automation.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Formspree | Webhook plugin POSTs JSON to `/api/webhooks/formspree` on each submission | Formspree remains the form host/spam-filter; verify shared secret header; Formspree is not queried after ingestion — Supabase becomes the record of truth |
| Supabase (Postgres + Auth + Storage) | `@supabase/ssr` for session-bound server/browser clients; service-role client only in server-only files | RLS policies are the real authorization boundary; Auth restricted to Admin/Staff accounts created via Admin API, no public signup |
| Resend | HTTP API (not SMTP — Vercel blocks outbound SMTP) from Route Handlers; single-send for automation, batch endpoint (100/call) for bulk | Default rate limit ~2 req/sec outside batch API; requires `RESEND_API_KEY` server-only env var |
| Semaphore (or Twilio) | REST API called from a Route Handler, PH-network coverage (Globe/Smart/Sun/Dito) | Pay-as-you-go, no free tier (accepted per project constraints); wrap in `lib/sms/semaphore.ts` so provider is swappable |
| WhatsApp / Facebook | Deep link only (`wa.me/...`, FB page URL) — no API integration | No webhook, no auth, no data flows back into the system; conversation happens entirely off-platform |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `(public)` ↔ Supabase | Direct read via anon-key client, public-read RLS on `packages`/`package_photos` | No admin data ever exposed through this path — enforce with RLS, not just "the public UI doesn't show it" |
| `(admin)` ↔ Supabase | Session-bound client (RLS enforced) for reads/writes as the logged-in user | Role/permission columns on `profiles` drive both RLS and UI state |
| Route Handlers (`/api/*`) ↔ Supabase | Service-role client for privileged operations (webhook ingestion, account creation) | Every use of the service-role client should be paired with an explicit in-code authorization check, since RLS is bypassed here by design |
| Messaging layer ↔ providers | Server-only SDK/API calls, keys never sent to browser | Log outcomes to a `messages` table for CRM history/audit, independent of provider-side delivery logs |

## Sources

- [Adding pages to the marketing site of your Makerkit Next.js Supabase project](https://makerkit.dev/docs/next-supabase/how-to/site/adding-marketing-pages) — MEDIUM confidence (vendor blog/starter-kit docs, cross-checked against Supabase official docs)
- [Use Supabase with Next.js | Supabase Docs](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs) — HIGH confidence (official docs)
- [Custom Claims & Role-based Access Control (RBAC) | Supabase Docs](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac) — HIGH confidence (official docs)
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — HIGH confidence (official docs)
- [How to Implement RBAC and use with RLS · supabase discussion #13903](https://github.com/orgs/supabase/discussions/13903) — MEDIUM confidence (maintainer/community discussion)
- [Formspree Plugins — Formspree Docs](https://help.formspree.io/articles/plugins/plugins) — HIGH confidence (official vendor docs)
- [Send emails with Vercel Functions - Resend](https://resend.com/docs/send-with-vercel-functions) — HIGH confidence (official vendor docs)
- [Handling proactive events in a serverless architecture with Vercel, Supabase, and PostgreSQL · supabase discussion #13547](https://github.com/orgs/supabase/discussions/13547) — MEDIUM confidence (community discussion)
- [Usage Limits - Resend](https://resend.com/docs/api-reference/rate-limit) — HIGH confidence (official docs)
- [Introducing the Batch Emails API · Resend](https://resend.com/blog/introducing-the-batch-emails-api) — HIGH confidence (official vendor blog)
- [Case Study: Solving Vercel's 10-Second Limit with QStash](https://medium.com/@kolbysisk/case-study-solving-vercels-10-second-limit-with-qstash-2bceeb35d29b) — LOW confidence (individual blog post, used only for framing the timeout constraint, which is independently confirmed by Vercel's own documented limits)
- [SMS Gateway Philippines - SMS API | Semaphore](https://semaphore.co/) — HIGH confidence (official vendor site)
- [Protect Admin Routes with Supabase | RapidDev Tutorial](https://www.rapidevelopers.com/supabase-tutorial/how-to-protect-admin-routes-with-supabase) — MEDIUM confidence (third-party tutorial, consistent with official Supabase RLS guidance)

---
*Architecture research for: Public marketing site + admin/CRM + messaging automation (TravelSentro)*
*Researched: 2026-07-18*
