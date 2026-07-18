# Roadmap: TravelSentro

## Overview

TravelSentro ships as four vertical slices, each delivering a complete, independently-verifiable capability. Phase 1 stands up the public catalog so prospective customers can browse packages and reach out immediately (WhatsApp, Facebook, or the existing Formspree form) — no auth/CRM dependency, so it validates the stack and deploy pipeline early. Phase 2 adds admin login, role/permission model, and package CRUD so the business can manage its own catalog. Phase 3 is the core value proposition made real: every inquiry automatically becomes a tracked CRM lead with an instant auto-reply and internal alert, closing the "no lead lost" promise. Phase 4 layers proactive outreach on top — individual and bulk email/SMS messaging with opt-out enforcement. Each phase depends only on what precedes it, and by the end of Phase 3 the core value is already fully deliverable; Phase 4 is additive.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Public Catalog & Inquiry Entry Point** - Customers browse tour packages and reach out via WhatsApp, Facebook, or the inquiry form
- [ ] **Phase 2: Admin Access & Package Management** - Admin/Staff log in and manage the package catalog under a role/permission model
- [ ] **Phase 3: Lead Capture, CRM & Automation** - Every inquiry becomes a tracked CRM lead with auto-reply and internal alert
- [ ] **Phase 4: Customer Messaging (Email & SMS)** - Admin/Staff message customers individually or in bulk, with opt-out enforcement

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

**Plans**: 3/7 plans executed
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Project scaffold, Supabase clients, public site shell

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Database schema, Storage bucket, [BLOCKING] push to Supabase
- [x] 01-04-PLAN.md — Inquiry form components + Contact Us page (Formspree)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Seed script: 3 placeholder packages with photos/itinerary/inclusions/faq

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-05-PLAN.md — Package list page, WhatsApp/Facebook CTAs, Walking Skeleton verification

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 01-06-PLAN.md — Package detail page: itinerary, inclusions, gallery, trip facts, inquiry wiring

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 01-07-PLAN.md — Mobile-responsive polish + full Phase 1 acceptance verification

**UI hint**: yes

### Phase 2: Admin Access & Package Management

**Goal**: Admin and Staff can securely log into an admin panel, and manage the tour package catalog according to their individually-assigned permissions.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, PKG-01, PKG-02, PKG-03, PKG-04, PKG-05, PKG-06
**Success Criteria** (what must be TRUE):

  1. Admin/Staff can log in to the admin panel with email/password
  2. Admin can create, edit, and deactivate Admin/Staff accounts, and toggle each staff member's permissions (message customers, manage packages, edit CRM data)
  3. A Staff member without a given permission is blocked from that action both in the UI and at the API/data layer
  4. Admin/Staff with "manage packages" permission can create, edit, delete, publish/unpublish, feature, and reorder tour packages, and those changes are reflected on the public site from Phase 1

**Plans**: TBD
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

**Plans**: TBD
**UI hint**: yes

### Phase 4: Customer Messaging (Email & SMS)

**Goal**: Admin/Staff can proactively reach out to customers individually or in bulk via email and SMS, with opt-outs respected and every message logged to CRM history.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06
**Success Criteria** (what must be TRUE):

  1. Admin/Staff with "message customers" permission can send an individual email or SMS to a contact
  2. Admin/Staff with "message customers" permission can send a bulk email or SMS to a selected/segmented set of contacts
  3. A contact who has opted out is excluded from all future bulk email/SMS sends
  4. Every sent message (individual and bulk) is logged and visible in the contact's history

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Public Catalog & Inquiry Entry Point | 3/7 | In Progress|  |
| 2. Admin Access & Package Management | 0/TBD | Not started | - |
| 3. Lead Capture, CRM & Automation | 0/TBD | Not started | - |
| 4. Customer Messaging (Email & SMS) | 0/TBD | Not started | - |
