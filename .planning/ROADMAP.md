# Roadmap: TravelSentro

## Overview

TravelSentro ships as four vertical slices, each delivering a complete, independently-verifiable capability. Phase 1 stands up the public catalog so prospective customers can browse packages and reach out immediately (WhatsApp, Facebook, or the existing Formspree form) — no auth/CRM dependency, so it validates the stack and deploy pipeline early. Phase 2 adds admin login, role/permission model, and package CRUD so the business can manage its own catalog. Phase 3 is the core value proposition made real: every inquiry automatically becomes a tracked CRM lead with an instant auto-reply and internal alert, closing the "no lead lost" promise. Phase 4 layers proactive outreach on top — individual and bulk email/SMS messaging with opt-out enforcement. Each phase depends only on what precedes it, and by the end of Phase 3 the core value is already fully deliverable; Phase 4 is additive.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Public Catalog & Inquiry Entry Point** - Customers browse tour packages and reach out via WhatsApp, Facebook, or the inquiry form (completed 2026-07-18)
- [x] **Phase 2: Admin Access & Package Management** - Admin/Staff log in and manage the package catalog under a role/permission model (gaps found 2026-07-18 — see 02-VERIFICATION.md) (completed 2026-07-18)
- [x] **Phase 3: Lead Capture, CRM & Automation** - Every inquiry becomes a tracked CRM lead with auto-reply and internal alert (completed 2026-07-20)
- [ ] **Phase 4: Customer Messaging (Email & SMS)** - Admin/Staff message customers individually or in bulk, with opt-out enforcement (gaps found 2026-07-24 — see 04-VERIFICATION.md, 04-UAT.md)

## Phase Details

### Phase 1: Public Catalog & Inquiry Entry Point

**Goal**: A prospective customer can browse tour packages and reach out to inquire via WhatsApp, Facebook, or the inquiry form, on any device.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PUBL-01, PUBL-02, PUBL-03, PUBL-04, PUBL-05, PUBL-06, PUBL-07, PUBL-08, PUBL-09
**Success Criteria** (what must be TRUE):

  1. User can browse a list of tour packages, each showing photo, name, and starting "from ₱X" price
  2. User can view a package detail page with day-by-day itinerary/duration, line-item price and inclusions/exclusions, a photo gallery, and an FAQ/trip-facts section
  3. User can contact the business directly from any package via a WhatsApp deep link or Facebook page link, with no checkout step
  4. User can submit an inquiry via the existing Formspree form
  5. The package list, detail pages, and inquiry flow are usable on mobile

**Plans**: 7/7 plans complete
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Project scaffold, Supabase clients, public site shell

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Database schema, Storage bucket, [BLOCKING] push to Supabase
- [x] 01-04-PLAN.md — Inquiry form components + Contact Us page (Formspree)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Seed script: 3 placeholder packages with photos/itinerary/inclusions/faq

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Package list page, WhatsApp/Facebook CTAs, Walking Skeleton verification

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-06-PLAN.md — Package detail page: itinerary, inclusions, gallery, trip facts, inquiry wiring

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-07-PLAN.md — Mobile-responsive polish + full Phase 1 acceptance verification

**UI hint**: yes

### Phase 2: Admin Access & Package Management

**Goal**: As a TravelSentro Admin or Staff member, I want to securely log into an admin panel and manage the tour package catalog according to my individually-assigned permissions, so that the business can keep its live package catalog accurate and control exactly who can change it, without needing a developer for every update.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, PKG-01, PKG-02, PKG-03, PKG-04, PKG-05, PKG-06
**Success Criteria** (what must be TRUE):

  1. Admin/Staff can log in to the admin panel with email/password
  2. Admin can create, edit, and deactivate Admin/Staff accounts, and toggle each staff member's permissions (message customers, manage packages, edit CRM data)
  3. A Staff member without a given permission is blocked from that action both in the UI and at the API/data layer
  4. Admin/Staff with "manage packages" permission can create, edit, delete, publish/unpublish, feature, and reorder tour packages, and those changes are reflected on the public site from Phase 1

**Plans**: 20/20 plans complete

Plans:

- [x] 02-20-PLAN.md

- [x] 02-14-PLAN.md
- [x] 02-15-PLAN.md

**Wave 1**

- [x] 02-01-PLAN.md — Schema migration (profiles, RLS, has_permission helper), [BLOCKING] push, admin bootstrap seed

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Session-refresh proxy, DAL, login, admin dashboard shell, forgot/reset password

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Staff account management (create/edit/deactivate, permission toggles)
- [x] 02-04-PLAN.md — Package list: publish/unpublish, feature, drag-reorder, soft-delete

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05-PLAN.md — Package create/edit form (Details/Itinerary/Inclusions & FAQ)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-06-PLAN.md — Package photo manager (upload/reorder/delete)

**Gap Closure — Wave 1** *(parallel; addresses 02-VERIFICATION.md's gap plus 02-REVIEW.md's CR-01/CR-02/WR-06)*

- [x] 02-07-PLAN.md — Graceful permission-denied UX (error boundary + optimistic-UI catch) + password-reset PKCE code exchange fix
- [x] 02-08-PLAN.md — Atomic package-children write (migration + RPC), [BLOCKING] push

**Gap Closure — Wave 2** *(third attempt at 02-VERIFICATION.md's AUTH-05 gap — 02-07's error.tsx approach was proven not to render live; this plan switches to a redirect()-based permission gate)*

- [x] 02-09-PLAN.md — Redirect-based permission gate (dal.ts + 4 gated pages) + /admin/forbidden page + live-HTTP verification script (dev + production build)

**Gap Closure — Wave 3** *(closes 02-VERIFICATION.md round-3's last remaining gap / 02-REVIEW.md CR-01 — a newly-discovered proxy allow-list gap in the same D-06 password-reset flow, distinct from AUTH-05 and the earlier config.toml fix)*

- [x] 02-10-PLAN.md — Add /admin/auth/confirm to proxy.ts's UNGATED_ADMIN_PATHS + method-based live-HTTP reachability script (dev + production build)

**Gap Closure — Wave 4** *(closes 02-UAT.md's 3 diagnosed gaps: Test 5 create-package silent validation failure, Test 2 upstream Supabase redirect_to defect, Test 7 brand color update)*

- [x] 02-11-PLAN.md — Fix create-package button silent validation failure (onInvalid + auto-tab-switch + keepMounted)
- [x] 02-12-PLAN.md — Automated Supabase Management API re-save attempt + human-action fallback for the upstream password-reset redirect_to defect
- [x] 02-13-PLAN.md — Update brand color tokens (--primary #021F4A, --secondary #F49314) across globals.css, checklist.tsx, and both UI-SPEC docs

**Gap Closure — Wave 5** *(closes 02-VERIFICATION.md round 6's gaps: 02-REVIEW.md CR-01 photo-upload body-size limit, CR-02 self-/last-admin deactivation lockout; 02-18 is a hypothesis-testing diagnostic only for the still-unresolved password-reset second-link bounce, not a confirmed fix)*

- [x] 02-16-PLAN.md — Raise Server Action body size limit (next.config.ts) + chunk photo uploads to one Server Action call per file
- [x] 02-17-PLAN.md — Reject self-/last-admin deactivation in deactivateAccount() + harden seed-admin.ts's break-glass recovery check
- [x] 02-18-PLAN.md — Add User-Agent diagnostic logging to the password-reset confirm route (hypothesis test only, not a fix)

**Gap Closure — Wave 6** *(closes 02-UAT.md Test 44 / 02-VERIFICATION.md round 7's "brand color hierarchy inverted" gap, diagnosed in .planning/debug/admin-brand-color-hierarchy-inverted.md — the Secondary/Accent role assignment, not the hex-to-token mapping fixed by 02-13, was inverted)*

- [x] 02-19-PLAN.md — Swap Secondary/Accent color-role assignment (navy #021F4A → 30% large-surface Secondary; marigold #F49314 → 10% small-element Accent) across both UI-SPEC docs and app/globals.css

**UI hint**: yes

### Phase 3: Lead Capture, CRM & Automation

**Goal**: Every inquiry reliably becomes a tracked lead in the CRM, the customer is automatically acknowledged, and the business is automatically notified — no lead is lost.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04, CRM-05, CRM-06, CRM-07, AUTO-01, AUTO-02, AUTO-03
**Success Criteria** (what must be TRUE):

  1. A new Formspree inquiry submission automatically creates a lead/contact record in the CRM via webhook, and redelivering the same submission does not create a duplicate lead
  2. The customer receives an instant auto-reply email, and Admin/Staff with "message customers" permission receive an internal notification, when a new inquiry arrives (also without duplication on redelivery)
  3. Admin/Staff can view a contact's inquiry/message history as a timeline, see which package the lead inquired about, and search/filter contacts by name, status, or tag
  4. Admin/Staff can set/update a lead's status (New/Contacted/Qualified/Won/Lost); Staff without "edit CRM" permission get read-only access; every record tracks who created/last edited it and when

**Plans**: 5/5 plans complete

Plans:

**Wave 1**

- [x] 03-01-PLAN.md — CRM schema (contacts/inquiries), record_inquiry() + get_notification_recipients() RPCs, RLS, [BLOCKING] push

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Inquiry-ingestion Route Handler + inquiry form wiring + live verification script
- [x] 03-04-PLAN.md — CRM contact list (search/filter) + unconditional Contacts nav item

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — Auto-reply + internal notification emails (Resend + React Email)
- [x] 03-05-PLAN.md — CRM contact detail (timeline, status editor, contact edit dialog)

**UI hint**: yes

### Phase 4: Customer Messaging (Email & SMS)

**Goal**: As a TravelSentro Admin or Staff member, I want to proactively reach out to customers individually or in bulk via email and SMS, with opt-outs respected and every message logged to CRM history, so that the business can follow up on leads without risking spam complaints, provider suspension, or losing a record of what was said.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06
**Success Criteria** (what must be TRUE):

  1. Admin/Staff with "message customers" permission can send an individual email or SMS to a contact
  2. Admin/Staff with "message customers" permission can send a bulk email or SMS to a selected/segmented set of contacts
  3. A contact who has opted out is excluded from all future bulk email/SMS sends
  4. Every sent message (individual and bulk) is logged and visible in the contact's history

**Plans**: 5/6 plans executed

Plans:

**Wave 1**

- [x] 04-01-PLAN.md — Schema: contacts.opted_out, messages table, set_contact_opted_out() RPC, RLS, [BLOCKING] push
- [x] 04-02-PLAN.md — Service layer: Semaphore SMS wrapper, HMAC unsubscribe token, Resend batch-email helper, shared message constants, customer email template

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-03-PLAN.md — Compose & Send: individual/bulk email+SMS actions (D-03 filter, D-07 quota gate), compose dialog, crm-table/crm-detail entry points

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-04-PLAN.md — Opt-out & Activity: manual opt-out toggle, public unsubscribe page, merged Activity timeline

**Gap Closure — Wave 4** *(closes 04-UAT.md Test 3's blocker — individual SMS send failure root-caused in .planning/debug/sms-send-fails.md to unset Semaphore credentials plus an incidental/fragile error-detection path in lib/sms/semaphore.ts)*

- [ ] 04-05-PLAN.md — Harden Semaphore response-shape validation + diagnostic logging + provision real SMS credentials

**Gap Closure — Wave 5** *(closes 04-VERIFICATION.md's two remaining gaps / 04-REVIEW.md CR-01 (forgeable unsubscribe HMAC secret) and CR-02 (bulk email blanket-marks every recipient "sent" regardless of per-recipient result); depends on 04-05 for actions/messages.ts file-overlap sequencing only, not functionally related to the Semaphore SMS gap)*

- [x] 04-06-PLAN.md — Fail-loud unsubscribe HMAC secret + accurate per-recipient bulk email status

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Public Catalog & Inquiry Entry Point | 7/7 | Complete    | 2026-07-18 |
| 2. Admin Access & Package Management | 20/20 | Complete   | 2026-07-19 |
| 3. Lead Capture, CRM & Automation | 5/5 | Complete    | 2026-07-20 |
| 4. Customer Messaging (Email & SMS) | 5/6 | In Progress|  |

### Phase 5: Mobile Responsive & Visual Polish

**Goal:** The admin CRM/packages/users tables work as touch-friendly stacked cards on mobile with bulk actions preserved, the public site reflows correctly at any browser zoom level up to 200%, and visual polish (empty/loading states, spacing, hover/focus/shadows) is applied throughout — all within the existing locked brand system, with no new capabilities added.
**Requirements**: None (retrofit/polish phase — governed by 05-CONTEXT.md decisions D-01 through D-07, not REQUIREMENTS.md)
**Depends on**: Phase 4
**Success Criteria** (what must be TRUE):

  1. All public pages (package list, package detail, inquiry/Contact Us form) reflow with no horizontal overflow and no overlapping elements up to 200% browser zoom
  2. `crm-table.tsx`, the packages table, and the users table render as stacked cards (not horizontal-scroll-only or column-hiding) below the mobile breakpoint
  3. Bulk row-selection and "Message Selected" (MSG-03/MSG-04) work identically in the CRM's mobile card layout, including the opted-out disabled-checkbox guard
  4. The admin sidebar drawer opens/closes on mobile with adequately sized tap targets, using the existing shadcn Sidebar/Sheet pattern
  5. Admin packages/users pages show skeleton loading states instead of a blank flash; cards/dialogs/dropdowns show a consistent shadow/elevation hierarchy, all within the locked #021F4A/#F49314/#FAF7F2 + Inter/Plus Jakarta Sans brand system

**Plans:** 2/5 plans executed

Plans:

**Wave 1**

- [x] 05-01-PLAN.md — Public site zoom-reflow fix (gallery lightbox) + live 200%/400% audit across 5 routes
- [x] 05-02-PLAN.md — CRM table → mobile card retrofit, bulk-select/opt-out guard preserved
- [ ] 05-03-PLAN.md — Packages list → mobile card retrofit (dnd-kit) + packages/loading.tsx
- [ ] 05-04-PLAN.md — Users table → mobile card retrofit + users/loading.tsx
- [ ] 05-05-PLAN.md — Dashboard chrome polish: sidebar tap targets + Card elevation

**UI hint**: yes

### Phase 6: Public Site Content Sections & Hero Carousel

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 6 to break down)
