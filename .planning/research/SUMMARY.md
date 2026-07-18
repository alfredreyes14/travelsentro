# Project Research Summary

**Project:** TravelSentro
**Domain:** Travel-agency marketing/catalog site (inquiry-driven, no checkout) + internal admin/CRM panel with email/SMS messaging automation
**Researched:** 2026-07-18
**Confidence:** MEDIUM-HIGH

## Executive Summary

TravelSentro is a small-business product: a public tour-package catalog site paired with an internal admin/CRM panel, built to close the biggest gap in the PH travel-agency market — leads currently live only in Facebook/WhatsApp chat history and get lost. The expert-standard way to build this class of product in 2026 is a single Next.js App Router application on Vercel with a single Supabase project, using route groups (public/admin) rather than separate apps, with Supabase Row Level Security as the real authorization boundary (not middleware, not UI hiding). This is the dominant, well-documented pattern across Supabase's own docs and production Next.js/Supabase starter kits, and it is the free-tier-friendliest shape available.

The recommended approach: Next.js 16 + React 19 + TypeScript, Supabase (Postgres/Auth/Storage) for data and a lightweight profiles-table + RLS permission model (role + 3 toggles, no custom RBAC engine), shadcn/ui + Tailwind v4 for the admin panel, Resend for email, Semaphore for PH SMS, and a synchronous webhook-triggered automation chain (Formspree → Route Handler → Supabase insert → auto-reply + internal alert) that is appropriate at this business's low volume but must not be reused for bulk sends. Two things researched here are genuinely new features on top of the user's existing scope: a lead status field (without it, the core "no lead lost" value prop can't actually be verified) and opt-out/consent handling on bulk messaging (without it, the business risks provider account suspension and PH Data Privacy Act exposure).

The dominant risk cluster is "free tier assumptions that don't survive contact with a live commercial business": Formspree's webhook/plugin feature requires a paid plan (not free, as commonly assumed), Vercel's Hobby plan is licensed for non-commercial use only, and Supabase free projects auto-pause after 7 days of inactivity. All three should be resolved as explicit budget/architecture decisions early rather than discovered mid-build. A second risk cluster is security/compliance: the Supabase service_role key must never reach client code, permission checks must be centralized and enforced at the RLS/API layer (not just UI), and bulk messaging needs consent/opt-out modeling from day one, not retrofitted later.

## Key Findings

### Recommended Stack

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript form the full-stack core, with Supabase (already decided) providing Postgres, Auth, and Storage in one free-tier service. Tailwind v4 + shadcn/ui is the standard, low-lock-in choice for the admin panel; the public site should stay mostly hand-built to match existing brand. Supporting libraries: resend + react-email (email), zod + react-hook-form (forms/validation), @tanstack/react-table (CRM lists), @supabase/ssr (not the deprecated auth-helpers-nextjs), and a thin fetch-based wrapper around Semaphore's REST API for PH SMS (no official SDK exists).

**Core technologies:**
- Next.js 16 App Router — one deploy target for public site + admin + webhook API routes, Pages Router is legacy
- Supabase (Postgres + Auth + Storage) — user-mandated; also the natural home for RLS-enforced admin/CRM access control
- shadcn/ui + Tailwind v4 — Tailwind-native, copy-in admin components, no vendor lock-in, avoids MUI/Ant-style bundle weight

**Notable cost findings:** Resend's free tier caps at 100 emails/day (not just 3,000/month) — bulk sends to a large lead list will hit this; Semaphore (~₱0.50-0.56/SMS) is the right PH-market SMS choice over Twilio (~20x more expensive); Vercel Pro ($20/mo) and possibly Formspree's paid tier (~$10/mo) should be budgeted as necessary exceptions to "free tier wherever possible."

### Expected Features

TravelSentro's public-site scope (package browse/detail, WhatsApp/FB CTA, Formspree inquiry) matches table stakes for PH travel-agency sites. The admin/CRM scope (auth, package CRUD, CRM with inquiry history, individual/bulk messaging, auto-reply, internal alerts) is already the differentiator versus typical competitors, who track leads ad hoc in FB Messenger/spreadsheets with no CRM at all.

**Must have (table stakes) — beyond what's already scoped:**
- Lead status field (New/Contacted/Qualified/Won/Lost) — without it, "no lead lost" is unverifiable
- Minimal opt-out/unsubscribe handling on bulk messaging — protects provider accounts from suspension
- "Starting from ₱X" pricing visible on package list cards, not just detail pages

**Should have (competitive):**
- Formspree → CRM webhook automation (the core differentiator vs. typical PH agency sites)
- Per-staff permission toggles (message/manage packages/edit CRM) — right-sized vs. full RBAC
- Bulk segmented messaging tied to CRM status/tags — re-engagement mechanism competitors lack

**Defer (v2+):**
- CRM tags/segments beyond basic status, search/filter, audit trail — add when triggered by real usage friction
- Drip/multi-step automation, granular per-resource permissions, booking/availability calendar, multi-language — explicitly out of scope, validated as correctly deferred

### Architecture Approach

Single Next.js codebase with public/admin route groups, one Vercel project, one Supabase project. Session middleware (proxy.ts) handles redirect/UX only; the real authorization boundary is Postgres RLS policies referencing a profiles table (role + 3 boolean permission columns), enforced identically whether the caller goes through the Next.js app or hits the Supabase API directly. The Formspree webhook lands in a Route Handler using a service-role client (server-only), synchronously triggers auto-reply + internal alert email — appropriate at low volume but explicitly a different, must-be-batched code path from bulk messaging.

**Major components:**
1. Public route group — package browse/detail, CTAs, reads packages via anon-key client with public-read RLS
2. Admin route group — package CRUD, CRM, messaging composer, user management, gated by session + RLS
3. /api/webhooks/formspree — lead ingestion, service-role client, shared-secret verification, triggers automation
4. /api/messaging/* — individual/bulk email (Resend) and SMS (Semaphore) send, permission-checked server-side
5. Supabase Postgres/Auth/Storage — system of record, RLS policies as the security boundary, migrations as code

### Critical Pitfalls

1. **Formspree webhooks require a paid plan** — not free like the form itself; resolve in Phase 1 before building ingestion architecture around it (workaround: self-hosted form endpoint, or dual-submit from client).
2. **Supabase free-tier project auto-pauses after 7 days idle** — add a Vercel Cron keep-alive or budget Supabase Pro before go-live; directly threatens "no lead lost."
3. **Vercel Hobby is licensed non-commercial only** — plan the Pro ($20/mo) upgrade at/before public launch, not as an afterthought.
4. **Webhook automation needs idempotency** — at-least-once delivery causes duplicate auto-replies/alerts without a dedup key + "mark processed before side effects" pattern; test by resending the same payload twice.
5. **Permission toggles must be centralized, not inlined** — one hasPermission() helper + RLS policies, never scattered role checks; enforce server-side, never rely on UI hiding alone.
6. **Bulk messaging without consent/opt-out risks PH Data Privacy Act exposure and provider suspension** — model consent in the CRM schema from the start; start SMS Sender ID registration early (2-4 week NTC approval lead time).

## Implications for Roadmap

### Phase 1: Foundation & Public Catalog
**Rationale:** Public package browsing has no dependencies on auth/CRM and delivers visible value immediately; also where the Formspree paid-plan decision and Vercel/Supabase free-tier budget decisions must be resolved before later phases build on top of them.
**Delivers:** Next.js app scaffolded with public/admin route groups, Supabase project + packages/photos schema, public package list + detail pages (itinerary, pricing/inclusions, gallery), WhatsApp/FB CTAs.
**Addresses:** Package list/detail, WhatsApp/FB CTA, mobile-responsive design, trust signals
**Avoids:** Pitfall 1 (Formspree plan), Pitfall 3 (Vercel Hobby ToS)

### Phase 2: Admin Auth & Permission Model
**Rationale:** Every subsequent admin feature depends on the role/permission model existing first — retrofitting is more error-prone than building in from the start.
**Delivers:** Supabase Auth (Admin/Staff), profiles table with role + 3 permission booleans, centralized hasPermission() helper, RLS policies, admin route gating via proxy.ts.
**Uses:** @supabase/ssr, shadcn/ui admin shell
**Implements:** RLS as real security boundary
**Avoids:** Pitfall 5 (permission sprawl), Pitfall 8 (service-role key exposure)

### Phase 3: CRM Data Model & Package CRUD
**Rationale:** CRM contact/lead schema must exist before the webhook has anything to write into; package CRUD is gated by the same permission model from Phase 2.
**Delivers:** Leads/contacts table with status field and consent/opt-out fields (built in now, not retrofitted), package CRUD admin screens, CRM contact list with inquiry-history view.
**Addresses:** Lead status field, package CRUD, CRM contact record
**Avoids:** Pitfall 6 (retrofit cost of adding consent fields late)

### Phase 4: Inquiry Ingestion & Automation
**Rationale:** Depends on CRM data model (Phase 3) and resolved Formspree decision (Phase 1); auto-reply and internal alert can be built in parallel once the webhook lands.
**Delivers:** /api/webhooks/formspree Route Handler with shared-secret verification and idempotency key, instant auto-reply email, internal new-inquiry notification.
**Uses:** Resend, react-email, service-role Supabase client
**Avoids:** Pitfall 4 (duplicate sends), Pitfall 7 (email deliverability)

### Phase 5: Messaging (Individual & Bulk Email/SMS)
**Rationale:** Depends on CRM (contact list to select/segment) and permission model; bulk messaging is architecturally distinct from Phase 4's automation and must not reuse its synchronous per-request pattern.
**Delivers:** Individual + bulk email/SMS composer, provider-rate-limit-aware batching (Resend batch API, chunked Semaphore calls), opt-out/unsubscribe enforcement, message log for CRM history.
**Uses:** Resend batch API, Semaphore wrapper
**Avoids:** Pitfall 6 (consent/compliance), bulk-as-synchronous anti-pattern

### Phase Ordering Rationale

- Public catalog first — zero auth/CRM dependencies, validates stack/deploy pipeline early
- Auth/permissions before any admin feature — cheaper to build in from start than retrofit
- CRM data model before webhook ingestion — webhook has nothing to write into otherwise; consent/status fields expensive to add later
- Bulk messaging as its own phase, after automation — architecturally distinct (batching, compliance)

### Research Flags

Needs deeper research: Phase 1 (Formspree pricing re-verification), Phase 5 (PH Data Privacy Act / NTC Sender ID specifics)
Standard patterns (skip research-phase): Phase 2 (Supabase Auth+RLS, HIGH confidence official docs), Phase 3 (standard CRUD), Phase 4 (standard webhook pattern)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm/official docs; pricing MEDIUM |
| Features | MEDIUM | Cross-checked web sources; no single authoritative spec |
| Architecture | HIGH | Confirmed across official Supabase/Vercel/Resend docs + starter kits |
| Pitfalls | MEDIUM | Web-sourced; PH regulatory specifics not legal-reviewed |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address
- Formspree webhook pricing: re-verify directly at formspree.io/pricing before Phase 1
- PH Data Privacy Act / NTC Sender ID specifics: not legal-reviewed, validate before Phase 5
- Supabase free-tier limits: consistent across aggregators but not first-party fetched, spot-check before budget finalization
- Resend vs. Brevo bulk-send tradeoff: deferred until real send volume known (Phase 5 decision point)

## Sources
Primary (HIGH): npm registry, vercel.com/docs, supabase.com/docs (Next.js quickstart, RBAC, RLS, project pausing), resend.com/docs, help.formspree.io
Secondary (MEDIUM): Resend/Semaphore/PhilSMS/Twilio pricing aggregators, Makerkit/RapidDev pattern docs, PH travel-agency site review
Tertiary (LOW): PhilSMS single-source pricing, PH DPA/NTC regulatory specifics

---
*Research completed: 2026-07-18*
*Ready for roadmap: yes*
