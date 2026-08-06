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

- [x] Public site: browse tour packages (list + detail pages) — Validated in Phase 01: public-catalog-inquiry-entry-point
- [x] Package detail: itinerary/duration, price & inclusions/exclusions, photo gallery — Validated in Phase 01: public-catalog-inquiry-entry-point
- [x] Package CTA: "Contact us" via WhatsApp deep link and Facebook page link (no checkout) — Validated in Phase 01: public-catalog-inquiry-entry-point
- [x] Inquiry capture: Formspree form submissions reliably become CRM leads, no duplicates on redelivery — Validated in Phase 03: lead-capture-crm-automation. Architecture pivoted from a literal Formspree webhook to routing inquiries through our own `/api/inquiries` endpoint first (synchronous `record_inquiry()` write), with Formspree kept only as a best-effort backup forward — a stronger guarantee than the original "via webhook" wording, since CRM data no longer depends on Formspree's uptime at all.
- [x] Admin: CRM — view/manage customer & lead records (contact info, inquiry history, status, search/filter, audit trail) — Validated in Phase 03: lead-capture-crm-automation
- [x] Automation: instant auto-reply email to customer when a new inquiry is received — Validated in Phase 03: lead-capture-crm-automation
- [x] Automation: internal notification to admin/staff when a new inquiry arrives — Validated in Phase 03: lead-capture-crm-automation
- [x] Admin panel: authentication with Admin and Staff roles — Validated in Phase 02: admin-access-package-management
- [x] Admin: user management — Admin creates/edits/deactivates Admin and Staff accounts — Validated in Phase 02: admin-access-package-management
- [x] Admin: per-staff permission toggles — can message customers, can manage packages, can edit CRM data (staff default: read-only CRM) — Validated in Phase 02: admin-access-package-management
- [x] Admin: package management (CRUD) for tour packages, respecting the "can manage packages" permission — Validated in Phase 02: admin-access-package-management
- [x] Admin: messaging — send email to customers individually or in bulk (segment/select contacts) — Validated in Phase 04: customer-messaging-email-sms
- [x] Homepage: hero carousel (rotating featured packages + brand imagery), admin-editable — Validated in Phase 06: public-site-content-sections-hero-carousel
- [x] Homepage: value props, featured packages grid, testimonials, embedded inquiry form, Brand Partners/Corporate Clients sections — Validated in Phase 06: public-site-content-sections-hero-carousel

### Active

- [ ] Admin: messaging — send SMS to customers individually or in bulk (pay-as-you-go provider) — Semaphore account approval pending; Task 1 (response-validation hardening) shipped and committed, Task 2 blocked on external SMS provider approval (see Blockers)

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
| No checkout, WhatsApp/Facebook CTA only | Bookings are closed via conversation, not self-serve online | Confirmed in Phase 01 — WhatsApp/Facebook CTAs shipped on list and detail pages, no checkout anywhere |
| Keep Formspree, webhook into CRM | Avoids migrating/rebuilding the existing inquiry form | Formspree-backed inquiry form shipped natively in Phase 01 (shared component, per-package + Contact Us). Phase 03 shipped a stronger version: inquiries route through our own `/api/inquiries` endpoint first (synchronous CRM write via `record_inquiry()`), with Formspree kept only as a best-effort backup forward — CRM data no longer depends on Formspree's uptime |
| Fixed 3-toggle staff permissions (message/manage packages/edit CRM) | Enough granularity for v1 without building a full permission system | — Pending |
| SMS included in v1 despite no free tier | Business wants SMS now; pay-as-you-go accepted | — Pending |
| Supabase for database | Explicit user choice, has a usable free tier | Confirmed in Phase 03 — CRM schema (contacts/inquiries), RLS, and SECURITY DEFINER RPCs live on the linked Supabase project |
| Instant auto-reply + internal alert only (no drip automation yet) | Simplest automation that still prevents lost leads; drip sequences deferred | Shipped in Phase 03 — both sends gated on the same idempotent `is_new` flag as the CRM write, so no duplicate sends on redelivery |
| Try free Formspree dual-submit workaround before paying for webhooks | Research found Formspree's webhook plugin requires a paid plan; workaround keeps free-tier goal if current form supports JS submission | — Pending |
| Stay on free hosting tiers as long as possible (Vercel Hobby, Supabase free) | User prioritizes free tier over strict ToS/reliability guarantees; will revisit if it becomes a real problem | — Pending |
| Mobile-responsive stacked-card retrofit + shadow/elevation polish (05-CONTEXT.md D-01–D-07), no REQUIREMENTS.md items — retrofit/polish phase | Admin CRM/packages/users tables were desktop-only pre-Phase-05; public site had a WCAG 1.4.10 zoom-reflow gap; shadow/elevation hierarchy was inconsistent across Card/Dialog/dropdowns | Shipped in Phase 05 — CRM/packages/users tables render as touch-friendly stacked cards below 768px with bulk actions and the opted-out consent guard preserved; public site reflows cleanly at 200%/400% zoom; skeleton loading states replace blank flashes; consistent shadow/elevation hierarchy (Card shadow-sm < Dialog/AlertDialog/DropdownMenu/Select shadow-md/shadow-lg) — all within the existing locked brand system. 6/6 UAT tests passed live; threats_open: 0 (05-SECURITY.md) |
| Homepage hero carousel + admin-editable content sections (HOME-01–07): value props, featured packages grid, testimonials, embedded inquiry form, conditional Brand Partners/Corporate Clients | Homepage was static; business wanted rotating promotional content and social-proof sections manageable without a code deploy | Shipped in Phase 06 — 4 new tables (hero_slides/value_props/testimonials/partners) + site-content Storage bucket, full admin CRUD (drag-reorder, image upload), embla-carousel-autoplay hero with reduced-motion support, orphan-skip filter for package-referencing slides. 4/4 UAT tests passed live; threats_open: 0 across 22 threats (06-SECURITY.md), 3 non-blocking follow-ups flagged (SVG upload MIME validation, folder-param validation, javascript: URL scheme validation on partner/hero link fields) |

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
*Last updated: 2026-08-06 after Phase 06 (public-site-content-sections-hero-carousel) completion*
