<!-- GSD:project-start source:PROJECT.md -->

## Project

**TravelSentro**

TravelSentro is a public-facing website where customers browse tour packages and reach out via WhatsApp or Facebook (no on-site checkout), paired with an internal admin panel for managing tour packages, a lightweight CRM of customer/lead data, and email/SMS messaging (individual, bulk, and automated follow-ups). TravelSentro is an existing Philippines-based travel business with an existing brand (logo, colors, FB page) that is getting a new website and admin tooling.

**Core Value:** A prospective customer can browse tour packages and reach out to inquire (via WhatsApp, Facebook, or the inquiry form) in under a minute, and that inquiry reliably lands in the business's CRM so no lead is lost.

### Constraints

- **Budget**: Prioritize free-tier services wherever possible (hosting, database, email) — SMS is the one exception where pay-as-you-go is accepted since no viable free SMS tier exists. Stay on free hosting/DB tiers (Vercel Hobby, Supabase free) as long as possible even given their ToS/reliability caveats (Vercel Hobby is non-commercial-licensed, Supabase free projects auto-pause after 7 days idle); revisit only if it becomes a real problem.
- **Database**: Supabase — explicit user choice
- **Tech stack**: Otherwise open — chosen for best free-tier fit (e.g. Next.js on Vercel)

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.x (App Router, Turbopack default) | Full-stack framework — public marketing pages + admin panel + API/webhook routes in one codebase | One deploy target on Vercel, file-based routing separates `(public)` and `(admin)` route groups cleanly, Route Handlers give you the webhook receiver for free without a separate backend service. App Router has been stable since v13.4 and is the default for every new project as of 2026 — Pages Router is in maintenance mode, do not start new work there. |
| React | 19.2.x | UI library (ships with Next.js) | Required peer of Next.js 16; Server Components let the admin panel fetch Supabase data server-side without shipping a client-side data-fetching library. |
| TypeScript | 5.x | Type safety across public site, admin panel, and Supabase-generated DB types | Supabase CLI generates typed DB schemas (`supabase gen types typescript`) — pairs naturally with a typed Next.js codebase and catches CRM field/permission mistakes at compile time. |
| Supabase (Postgres + Auth + Storage) | supabase-js 2.110.x, @supabase/ssr 0.12.x | Database, authentication, row-level authorization, package-photo storage | Explicit user decision (do not second-guess). Supabase's Postgres + Auth + Storage combo covers CRM data, admin/staff auth, and package photo galleries in one free-tier service — no separate auth provider or file storage needed. |
| Vercel | — (Hobby or Pro plan) | Hosting for Next.js app, serverless functions, cron | Built by the Next.js team; zero-config deploys, automatic preview environments per PR, integrated cron for the auto-reply/notification automation. **Important:** the Hobby (free) plan's fair-use policy restricts it to "non-commercial, personal use only" — TravelSentro is a commercial business, so plan to run on **Vercel Pro ($20/month per seat)** once live, or accept the ToS risk on Hobby during development/staging only. This is the one place "free tier" isn't realistically compliant for this project — flag for roadmap budget discussion. |
| Tailwind CSS | v4.x | Styling for both public site and admin panel | Current default pairing with shadcn/ui; v4's CSS-first config (no `tailwind.config.js` needed) is simpler to match against the existing brand colors/logo. |
| shadcn/ui | latest (CLI-installed, not an npm dependency) | Admin panel UI components (tables, forms, dialogs, sidebar nav) | Components are copied into your repo (built on Radix UI primitives), so there's zero vendor lock-in and you can freely restyle to match TravelSentro's existing brand. This is the de-facto standard for Next.js admin dashboards in 2025/2026 — avoids pulling in a heavier component library (MUI, Ant Design) that fights Tailwind. Public marketing pages can use a handful of the same primitives (button, card) but should stay mostly hand-built/bespoke to match existing brand look. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `resend` (npm) | 6.x | Transactional email sending (auto-reply to customer, internal new-inquiry alert, individual/bulk admin emails) | Primary email provider — see Email Provider Comparison below. Use the official `resend` SDK from Route Handlers/Server Actions. |
| `react-email` + `@react-email/components` | 6.x / 5.x-6.x | Email templates as React components | Write the auto-reply and bulk-email templates as JSX instead of raw HTML strings; Resend's co-founder built React Email, so integration is first-class (`resend.emails.send({ react: <Template/> })`). |
| `zod` | 4.x | Validation for admin forms, webhook payloads, package CRUD | Validate the Formspree webhook body before writing to Supabase (never trust incoming webhook JSON shape); pairs with `react-hook-form` for admin forms. |
| `react-hook-form` | 7.x | Admin panel forms (package CRUD, user management, staff permission toggles, CRM record edits) | Standard pairing with `zod` via `@hookform/resolvers`; avoids re-render overhead of large admin forms. |
| `@tanstack/react-table` | 8.x | CRM contact/lead list table, admin package list, user management table | Headless table logic (sorting, filtering, pagination) that composes with shadcn/ui's `<Table>` primitives — needed as soon as the CRM list grows past a trivial `.map()`. |
| Semaphore SMS PHP/Node client or plain `fetch` to Semaphore's HTTP API | — | SMS sending (individual + bulk, up to 1000 recipients per request) | See SMS Provider Comparison below. Semaphore has no official first-party Node SDK — a thin `fetch`-based wrapper around their REST API is standard practice and keeps the dependency surface minimal. |
| `@supabase/ssr` | 0.12.x | Supabase client creation for Server Components, Server Actions, Route Handlers, and browser client | Replaces the deprecated `@supabase/auth-helpers-nextjs` package — do not install the old auth-helpers package, it's no longer maintained. |
| `date-fns` | latest | Formatting inquiry dates, "days since last contact" in CRM, follow-up scheduling | Lighter than `moment`/`dayjs` chains for the handful of date-formatting needs in a CRM list. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase CLI | Local Postgres dev, migrations, typed schema generation | Run `supabase gen types typescript --project-id <id> > types/database.ts` after every schema change so admin panel + CRM code stays type-safe against RLS-protected tables. |
| ESLint + `eslint-config-next` | Linting | Ships with `create-next-app`; keep default Next.js rules, add `eslint-plugin-tailwindcss` if class-order consistency matters for a small team. |
| Vercel CLI | Env var management, preview deploys from terminal | Use `vercel env add` for secrets (Supabase service role key, Resend API key, Semaphore API key, Formspree webhook shared secret) — never commit these to `vercel.json` or `.env` files in git. |

## Installation

# Core

# Admin panel UI

# Forms & validation

# CRM data table

# Email

# Dates

# Dev dependencies

## Free Email Sending: Comparison (Resend vs Alternatives)

| Provider | Free Tier | Daily Cap | Notes |
|----------|-----------|-----------|-------|
| **Resend** (recommended) | 3,000 emails/month | **100/day** | Best developer experience, first-class React Email + Next.js integration, 1 verified domain on free tier. The 100/day cap is the binding constraint — fine for auto-reply + internal alert + occasional individual emails, but a "bulk send to 300 leads" admin action would blow the daily cap in one shot and should be throttled/queued (see Pitfalls implication for roadmap). |
| Brevo | 300 emails/**day** forever free (~9,000/mo), no credit card | 300/day | More generous daily cap than Resend and also bundles SMS + a lightweight CRM, but weaker Next.js/React DX (template building is less code-first) than Resend+React Email. Worth reconsidering only if Resend's 100/day cap proves too restrictive for bulk sends in practice. |
| SendGrid | Free tier **discontinued in 2025** — trial only | — | Do not plan around SendGrid's free tier; it no longer exists. |
| MailerSend | 500/month free | ~unspecified low daily cap | Too low a monthly ceiling for a CRM sending bulk campaigns. |
| Mailjet | 6,000/month free | 200/day | Higher monthly ceiling than Resend, weaker template DX. Backup option if Resend's monthly cap (3,000) is exceeded before daily cap is the issue. |

## PH-Friendly SMS Provider Comparison

| Provider | Price per SMS (PH) | Setup Fee | Fit |
|----------|--------------------|-----------| ----|
| **Semaphore** (recommended) | ~₱0.50–0.56/SMS (ex. VAT) | ₱0 | Purpose-built for PH (Globe/Smart/Sun/Dito coverage), simple REST API (POST with up to 1,000 recipients per request — covers this project's <500-contact bulk sends in a single call), dedicated OTP route if needed later, free signup credits to test. No official Node SDK but the API is simple enough for a ~30-line `fetch` wrapper. |
| PhilSMS | From ~₱0.35/SMS | ₱0 | Slightly cheaper per-message than Semaphore, 1-year credit validity, official REST API. Reasonable alternative/backup if Semaphore pricing or reliability becomes an issue — worth a bake-off during the messaging phase rather than committing blind. |
| Twilio | ~$0.17–0.20/SMS (≈₱10–11) | ₱0 | **20x+ more expensive** than local PH providers for PH-only sending. Only justified if the business later needs SMS to non-PH numbers, WhatsApp Business API (Twilio has a WhatsApp integration), or a globally-recognized compliance/reporting stack. Not recommended for this project's PH-only, low-volume use case. |

## Formspree Webhook Integration — Important Cost Finding

## Auth & Roles: Supabase Auth vs Custom

- Use `@supabase/ssr`'s `createServerClient`/`createBrowserClient` pattern for Next.js App Router — this is the current (non-deprecated) integration path; do **not** install `@supabase/auth-helpers-nextjs` (deprecated, superseded by `@supabase/ssr`).
- Always call `supabase.auth.getUser()` server-side in middleware/Server Components (not `getSession()`) — `getUser()` revalidates the token against Supabase Auth servers rather than trusting a potentially-stale local session, which matters for an admin panel gating CRM data.
- **Roles/permissions model:** For this project's simple 2-role (Admin/Staff) + 3 fixed permission toggles (message customers / manage packages / edit CRM) requirement, skip the more complex "Custom Access Token Auth Hook + JWT app_metadata claims" pattern that's recommended for larger multi-tenant SaaS RBAC. That pattern adds real complexity (Auth Hooks, token refresh subscriptions) that isn't justified by 2 roles and 3 booleans.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js App Router (single app, route groups for public/admin) | Separate Next.js apps (monorepo) for public site vs admin panel | If the admin panel grows large enough that build times or bundle isolation become a real problem, or if public site and admin need genuinely different deploy cadences. Not justified at this project's scale — a single app with `(site)` and `(admin)` route groups plus middleware-gated `/admin` paths is simpler to build and host on one free/low-cost Vercel project. |
| Resend for transactional email | Brevo for both transactional and bulk/marketing email | If Resend's 100/day cap is hit regularly by bulk admin sends. Brevo's 300/day free cap and built-in "campaign" concept is arguably a better fit for the CRM's bulk-email use case specifically — worth reconsidering once real send volume is known, rather than guessing upfront. |
| Semaphore for SMS | PhilSMS | If Semaphore's ₱0.50-0.56/SMS rate or delivery reliability underperforms in testing — PhilSMS is a credible, cheaper (~₱0.35/SMS) local alternative worth a side-by-side trial before committing. |
| Supabase Auth + `profiles` table RLS | NextAuth.js / Auth.js with a custom Postgres adapter | Only if the project needed non-Supabase auth (e.g., SSO/enterprise identity providers) — not relevant here since Supabase is already the mandated database and its Auth product is free, integrated, and sufficient for 2 internal roles. |
| Vercel Pro for production hosting | Vercel Hobby for production | Hobby is fine for local/staging/preview work, but its ToS explicitly restricts it to non-commercial personal use — do not run TravelSentro's production traffic on Hobby long-term. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Pages Router (`pages/` directory) | In maintenance mode; App Router has been the stable, recommended default since Next.js 13.4 and all new tooling/docs target it | App Router (`app/` directory) |
| `@supabase/auth-helpers-nextjs` | Deprecated, superseded package; no longer maintained | `@supabase/ssr` |
| SendGrid free tier | No longer exists (discontinued 2025) — any plan built around it will fail | Resend (primary) or Brevo (bulk-cap fallback) |
| Twilio for PH-only SMS | ~20x more expensive per message than local PH providers for a market that is 100% Philippines-based | Semaphore (primary) or PhilSMS (backup) |
| Running production on Vercel Hobby indefinitely | Violates Vercel's fair-use ToS for commercial use ("non-commercial, personal use only") — TravelSentro is an operating business | Vercel Pro ($20/mo/seat) for the production deployment; Hobby is fine for a personal dev/preview account during build-out |
| A general-purpose heavy component library (MUI, Ant Design, Chakra) for the admin panel | Fights against Tailwind, adds bundle weight and a second design-token system, harder to match existing TravelSentro brand styling | shadcn/ui (Tailwind-native, copy-in, fully restylable) |
| Building a custom RBAC/Auth-Hook-based JWT claims system | Over-engineered for 2 roles + 3 fixed permission booleans; adds real operational complexity (token refresh, hook maintenance) with no payoff at this scale | Simple `profiles` table + RLS policies checking role/permission columns |
| Redux / heavy global state libraries | Not needed — Next.js Server Components + Server Actions handle CRM data fetching/mutation server-side; admin panel has no complex cross-page client state to justify it | React Server Components + Server Actions; local `useState`/`useReducer` for isolated client interactivity only |

## Stack Patterns by Variant

- Add Brevo alongside Resend specifically for bulk/marketing sends (higher 300/day free cap), keep Resend for transactional (auto-reply, internal alert).
- Because splitting by use case (transactional vs. bulk) keeps each provider under its respective free-tier cap longer than forcing everything through one provider.
- Trial PhilSMS as a drop-in alternative (~₱0.35/SMS, similar REST API shape) behind a small internal `sendSms()` abstraction so swapping providers doesn't touch calling code.
- Because a thin internal wrapper (2-3 functions: `sendSingleSms`, `sendBulkSms`) costs almost nothing to build up front and avoids a rewrite if the SMS provider needs to change later.
- Add a trivial Vercel Cron job (once-daily, within Hobby's cadence limit) that pings a lightweight Supabase query to keep the project active, OR budget for Supabase Pro ($25/mo) once the admin panel is in daily real-world use (at which point inactivity pausing stops being a risk anyway).
- Because a dormant free Supabase project pausing mid-development is a common, avoidable surprise — cheap to prevent with a keep-alive cron during build-out.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.x` | `react@19.2.x`, `react-dom@19.2.x` | Next.js 16 requires React 19; `create-next-app@latest` wires this up automatically — don't manually pin an older React version. |
| `@supabase/ssr@0.12.x` | `@supabase/supabase-js@2.110.x` | Install both together; `@supabase/ssr` is a thin wrapper providing SSR-safe client creation, not a replacement for `supabase-js`. |
| `tailwindcss@4.x` | `shadcn/ui` (latest CLI) | shadcn's CLI has been updated for Tailwind v4's CSS-first config (no `tailwind.config.js`); use `npx shadcn@latest init` (not an older cached CLI version) to get the v4-compatible setup. |
| `react-email@6.x` | `resend@6.x` | Both maintained by Resend; the `resend.emails.send({ react: <Component /> })` API expects React Email-authored components — mixing with a different email-templating library adds no value here. |
| `zod@4.x` | `react-hook-form@7.x` via `@hookform/resolvers` | Confirm `@hookform/resolvers` version supports Zod 4's schema API at install time (Zod 4 changed some internals from v3) — pin `@hookform/resolvers@latest` alongside. |

## Sources

- npm registry (direct `registry.npmjs.org` queries) — `next`, `react`, `@supabase/supabase-js`, `@supabase/ssr`, `resend`, `tailwindcss`, `zod`, `react-hook-form`, `@tanstack/react-table`, `react-email` current versions — HIGH confidence (authoritative version source, checked 2026-07-18)
- https://vercel.com/docs/plans/hobby — official Vercel docs, confirms Hobby plan's "non-commercial, personal use only" fair-use restriction and resource limits — HIGH confidence (first-party, fetched directly)
- https://vercel.com/docs/cron-jobs/usage-and-pricing — official Vercel docs, confirms Hobby cron jobs limited to once-per-day cadence with per-hour timing precision — HIGH confidence (first-party, fetched directly)
- https://resend.com/pricing, https://resend.com/docs/knowledge-base/account-quotas-and-limits — Resend free tier limits (3,000/mo, 100/day cap) — MEDIUM confidence (official pricing page cross-referenced via web search summary, not directly fetched)
- https://semaphore.co/, https://www.sent.dm/en/resources/sms-pricing/philippines-sms-pricing — Semaphore PH SMS pricing (₱0.50–0.56/SMS) — MEDIUM confidence (cross-checked across 2 independent sources)
- https://www.twilio.com/en-us/sms/pricing/ph — Twilio PH SMS pricing (~$0.17-0.20/SMS) — MEDIUM confidence (web search summary of official Twilio pricing page)
- https://help.formspree.io/hc/en-us/articles/360015234873-Webhooks and pricing aggregator sources — Formspree webhook plugin requires paid plan — MEDIUM confidence (official help doc for mechanism; paid-tier requirement cross-checked via 2 pricing aggregator sources, worth re-verifying directly against formspree.io/pricing before committing to a paid tier)
- https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac, https://supabase.com/docs/guides/database/postgres/row-level-security — official Supabase RBAC/RLS docs — MEDIUM-HIGH confidence (official docs referenced via web search summary)
- https://aiagencyplus.com/supabase-free-tier-limits/, https://uibakery.io/blog/supabase-pricing, and other 2026 aggregators — Supabase free tier limits (500MB DB, 50k MAU, 7-day pause) — MEDIUM confidence (consistent across multiple independent 2026 sources, not directly fetched from supabase.com/pricing — recommend spot-checking supabase.com/pricing directly before roadmap finalization)
- https://philsms.com/ — PhilSMS pricing (~₱0.35/SMS) — LOW-MEDIUM confidence (single source, pricing table gated behind signup — worth confirming directly during SMS provider selection)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
