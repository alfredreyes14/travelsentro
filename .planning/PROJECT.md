# TravelSentro

## What This Is

TravelSentro is a public-facing website where customers browse tour packages and reach out via WhatsApp or Facebook (no on-site checkout), paired with an internal admin panel for managing tour packages, a lightweight CRM of customer/lead data, and email/SMS messaging (individual, bulk, and automated follow-ups). TravelSentro is an existing Philippines-based travel business with an existing brand (logo, colors, FB page) that is getting a new website and admin tooling.

## Core Value

A prospective customer can browse tour packages and reach out to inquire (via WhatsApp, Facebook, or the inquiry form) in under a minute, and that inquiry reliably lands in the business's CRM so no lead is lost.

## Business Context

- **Customer**: Travelers in the Philippines browsing tour packages; internal users are the business's admin/staff
- **Revenue model**: Tour package bookings closed off-platform via WhatsApp/Facebook conversation (no online payment/checkout)
- **Success metric**: Inquiries captured and responded to (no leads lost between website and staff follow-up)
- **Strategy notes**: —

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Public site: browse tour packages (list + detail pages)
- [ ] Package detail: itinerary/duration, price & inclusions/exclusions, photo gallery
- [ ] Package CTA: "Contact us" via WhatsApp deep link and Facebook page link (no checkout)
- [ ] Inquiry capture: keep existing Formspree form, webhook Formspree submissions into the CRM as new leads
- [ ] Admin panel: authentication with Admin and Staff roles
- [ ] Admin: user management — Admin creates/edits/deactivates Admin and Staff accounts
- [ ] Admin: per-staff permission toggles — can message customers, can manage packages, can edit CRM data (staff default: read-only CRM)
- [ ] Admin: package management (CRUD) for tour packages, respecting the "can manage packages" permission
- [ ] Admin: CRM — view/manage customer & lead records (contact info, inquiry history, status)
- [ ] Admin: messaging — send email to customers individually or in bulk (segment/select contacts)
- [ ] Admin: messaging — send SMS to customers individually or in bulk (pay-as-you-go provider)
- [ ] Automation: instant auto-reply email to customer when a new inquiry is received
- [ ] Automation: internal notification to admin/staff when a new inquiry arrives

### Out of Scope

- Online checkout / payment processing — bookings close via WhatsApp/Facebook conversation, not needed for v1
- Customer-facing accounts/login — customers don't need to sign in, only browse and inquire
- Granular per-permission configurability beyond the fixed set (message customers / manage packages / edit CRM) — fixed set is enough for v1
- Drip/multi-step automated sequences beyond instant auto-reply + internal alert — deferred until instant auto-reply + alert are proven out

## Context

- Existing business: TravelSentro already operates (has an FB page, WhatsApp contact channel, and an existing lead-capture form on Formspree). This is a rebuild/upgrade of the website plus new admin tooling, not a brand-new venture.
- Existing brand assets (logo, colors, current site look) exist and should be matched — specific assets/links to be gathered during UI phase.
- Market: Philippines — currency displayed as PHP, SMS provider should be PH-friendly (e.g. Semaphore) or Twilio, pay-as-you-go is acceptable (no true SMS free tier exists).
- Formspree stays as the inquiry form handler; new backend receives submissions via webhook and creates CRM leads — avoids migrating the form itself.
- Formspree's native webhook plugin requires a paid plan (~$10+/mo). Try a free client-side dual-submit workaround first (submit to Formspree AND our endpoint, if the existing form submits via JS/fetch); fall back to a paid Formspree plan only if that's not viable.
- Staying on free tiers as long as possible for hosting/DB (Vercel Hobby, Supabase free) even though Vercel Hobby is licensed non-commercial and Supabase free projects auto-pause after 7 days idle — accepted risk, revisit budget only if it becomes a real problem.

## Constraints

- **Budget**: Prioritize free-tier services wherever possible (hosting, database, email) — SMS is the one exception where pay-as-you-go is accepted since no viable free SMS tier exists. Stay on free hosting/DB tiers (Vercel Hobby, Supabase free) as long as possible even given their ToS/reliability caveats (Vercel Hobby is non-commercial-licensed, Supabase free projects auto-pause after 7 days idle); revisit only if it becomes a real problem.
- **Database**: Supabase — explicit user choice
- **Tech stack**: Otherwise open — chosen for best free-tier fit (e.g. Next.js on Vercel)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No checkout, WhatsApp/Facebook CTA only | Bookings are closed via conversation, not self-serve online | — Pending |
| Keep Formspree, webhook into CRM | Avoids migrating/rebuilding the existing inquiry form | — Pending |
| Fixed 3-toggle staff permissions (message/manage packages/edit CRM) | Enough granularity for v1 without building a full permission system | — Pending |
| SMS included in v1 despite no free tier | Business wants SMS now; pay-as-you-go accepted | — Pending |
| Supabase for database | Explicit user choice, has a usable free tier | — Pending |
| Instant auto-reply + internal alert only (no drip automation yet) | Simplest automation that still prevents lost leads; drip sequences deferred | — Pending |
| Try free Formspree dual-submit workaround before paying for webhooks | Research found Formspree's webhook plugin requires a paid plan; workaround keeps free-tier goal if current form supports JS submission | — Pending |
| Stay on free hosting tiers as long as possible (Vercel Hobby, Supabase free) | User prioritizes free tier over strict ToS/reliability guarantees; will revisit if it becomes a real problem | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-18 after initialization*
