# Walking Skeleton — TravelSentro

**Phase:** 1
**Generated:** 2026-07-18

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

A visitor loads `/packages` and sees at least one real tour package (photo, name, "From ₱X" price) queried live from Supabase, with a working WhatsApp deep-link CTA pre-filled with that package's name — scaffold, routing, one real Supabase read, the seed write that populates it, and one real UI interaction wired end-to-end. Delivered across `01-01-PLAN.md` (scaffold + shell), `01-02-PLAN.md` (schema + push), `01-03-PLAN.md` (seed data), and `01-05-PLAN.md` (list page + CTA + verification checkpoint).

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 App Router, Turbopack default, React 19, TypeScript pinned to 5.9.3 | Mandated by `.claude/CLAUDE.md`; TS pinned below the 7.0 line since 7.x GA'd only 10 days before RESEARCH.md and ecosystem tooling compatibility (editor Language Service, ESLint) is unverified this soon after a from-scratch compiler rewrite |
| Data layer | Supabase (Postgres + Storage), queried directly from React Server Components via `@supabase/ssr`, anon key + public-read RLS — no `/api/*` Route Handler layer | Explicit user choice (Supabase); no cross-origin caller or elevated-privilege need exists in Phase 1 to justify an API proxy layer; RSC direct-fetch is the documented, supported pattern and keeps this phase's surface area minimal |
| Auth | None in Phase 1 | Public site only — no user accounts, no admin panel until Phase 2. `lib/supabase/server.ts`/`client.ts` are scaffolded now in the exact shape Phase 2's session-aware client will extend, so no rewrite is needed later |
| Deployment target | Local dev (`npm run dev`) verified via human checkpoint; Vercel deploy deferred | Skeleton template accepts "dev environment OR documented local full-stack run command" — a Vercel deploy decision (Hobby's non-commercial ToS restriction vs. Pro's $20/mo) is an explicit open budget question flagged in `STATE.md`, not one this phase forces; local verification proves the full stack works without prematurely committing to a hosting tier |
| Directory layout | `app/(public)/...` route group for all public pages; `lib/` for pure helpers (`supabase/`, `whatsapp.ts`, `formspree.ts`, `constants.ts`); `components/packages/` and `components/inquiry/` feature folders; `components/ui/` for shadcn primitives; `scripts/seed.ts` outside `app/` (dev-tooling, never bundled); `supabase/migrations/` for schema-as-code | Matches RESEARCH.md's Recommended Project Structure exactly; `(public)` group scopes this phase's surface cleanly and leaves room for a sibling `(admin)` group in Phase 2 without restructuring; feature folders (not one flat `components/`) keep package-domain and inquiry-domain components discoverable as the codebase grows |
| Schema shape | 5 normalized tables (`packages`, `package_photos`, `itinerary_days`, `package_inclusions`, `faq_facts`) instead of JSONB blobs | Per RESEARCH.md's Open Question #2 resolution — normalized child tables make Phase 2's admin CRUD (reorder/add/remove individual itinerary days and checklist items) straightforward to target with real rows and `sort_order` columns, vs. JSONB path-query complexity |
| Data seeding | Repo-committed, idempotent `scripts/seed.ts` (Node + `tsx`, service-role key) — never manual Supabase dashboard entry | D-01/D-02: real package content isn't ready; placeholder data must be re-runnable and disposable once Phase 2 admin CRUD exists; Storage photo uploads require the JS/HTTP API (not raw SQL), so a Node script — not `seed.sql` alone — is required |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16, TypeScript 5.9.3, Tailwind v4, shadcn/ui, ESLint) — `01-01-PLAN.md`
- [x] Routing — `(public)` route group: `/`, `/packages`, `/packages/[slug]`, `/contact` — `01-01`, `01-05`, `01-06`, `01-04`
- [x] Database — 5-table schema pushed live (`01-02-PLAN.md`) and seeded with 3 placeholder packages (`01-03-PLAN.md`); real read AND real write both exercised
- [x] UI — package cards with photo/name/price rendered from live data, wired to WhatsApp/Facebook CTA click-through — `01-05-PLAN.md`
- [x] Deployment — `npm run dev` full-stack local run, verified via blocking human checkpoint in `01-05-PLAN.md` (Vercel deploy deferred, see Architectural Decisions)

## Out of Scope (Deferred to Later Slices)

- Package detail page richness (itinerary, gallery, trip facts) — deferred to `01-06-PLAN.md`, the phase's second MVP slice, not part of the skeleton itself
- Native inquiry form and Contact Us page — deferred to `01-04-PLAN.md` (built in parallel with the schema/seed wave, wired into the detail page in `01-06`)
- Mobile-responsive polish audit — deferred to `01-07-PLAN.md` (each plan builds mobile-first from the start; `01-07` is a verification/refinement pass, not the first attempt)
- Any admin authentication, package CRUD UI, or CRM — explicitly out of scope for all of Phase 1 (Phase 2 and Phase 3 respectively)
- Vercel production deployment / Pro plan decision — explicitly deferred; flagged as a pre-launch budget decision in `STATE.md` Blockers/Concerns, not a Phase 1 blocker

## Subsequent Slice Plan

Each later plan in this phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- `01-04-PLAN.md`: Inquiry form components + Contact Us page (parallel wave, independent of DB)
- `01-06-PLAN.md`: Package detail page — itinerary, line-item inclusions/exclusions, gallery, trip facts, full CTAs, per-package inquiry form
- `01-07-PLAN.md`: Mobile-responsive polish + full-phase acceptance verification

Beyond Phase 1:
- Phase 2: Admin login + role/permission model + package CRUD, extending `lib/supabase/server.ts`/`client.ts` with session-aware auth and adding an `(admin)` route group alongside `(public)`
- Phase 3: Formspree webhook → CRM lead creation, auto-reply + internal notification, idempotency
- Phase 4: Individual/bulk email & SMS messaging with opt-out enforcement
