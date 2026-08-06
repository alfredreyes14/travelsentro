# Requirements: TravelSentro

**Defined:** 2026-07-18
**Core Value:** A prospective customer can browse tour packages and reach out to inquire (via WhatsApp, Facebook, or the inquiry form) in under a minute, and that inquiry reliably lands in the business's CRM so no lead is lost.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Public Site

- [x] **PUBL-01**: User can browse a list of tour packages, each showing photo, name, and starting "from ₱X" price
- [x] **PUBL-02**: User can view a package detail page with a day-by-day itinerary and duration
- [x] **PUBL-03**: User can view price and inclusions/exclusions listed explicitly (line-item, not paragraph prose) on the package detail page
- [x] **PUBL-04**: User can view a photo gallery on each package detail page
- [x] **PUBL-05**: User can contact the business via a WhatsApp deep-link CTA on each package
- [x] **PUBL-06**: User can contact the business via a Facebook page link CTA on each package
- [x] **PUBL-07**: User can submit an inquiry via the existing Formspree form
- [x] **PUBL-08**: User can view an FAQ / trip-facts section per package (best time to go, what to bring, group size)
- [x] **PUBL-09**: Site is mobile-responsive across package list, detail, and inquiry flows

### Package Management

- [x] **PKG-01**: Admin/Staff with "manage packages" permission can create a new tour package (itinerary, price, inclusions/exclusions, photos)
- [x] **PKG-02**: Admin/Staff with "manage packages" permission can edit an existing tour package
- [x] **PKG-03**: Admin/Staff with "manage packages" permission can delete a tour package
- [x] **PKG-04**: Admin/Staff with "manage packages" permission can publish/unpublish a package (hide from public site without deleting)
- [x] **PKG-05**: Admin/Staff with "manage packages" permission can mark a package as featured/highlighted
- [x] **PKG-06**: Admin/Staff with "manage packages" permission can set the manual display order of packages on the public list

### Admin Auth & Users

- [x] **AUTH-01**: Admin/Staff can log in to the admin panel with email/password
- [x] **AUTH-02**: Admin can create new Admin or Staff accounts
- [x] **AUTH-03**: Admin can edit or deactivate existing Admin/Staff accounts
- [x] **AUTH-04**: Admin can toggle per-staff permissions individually: can message customers, can manage packages, can edit CRM data
- [x] **AUTH-05**: A Staff member without a given permission is blocked from that action both in the UI and at the API/data layer (server-side enforcement, not UI-only)

### CRM

- [x] **CRM-01**: New Formspree inquiry submissions automatically create a lead/contact record in the CRM (via webhook)
- [x] **CRM-02**: Admin/Staff can view a contact's inquiry/message history as a timeline
- [x] **CRM-03**: Admin/Staff with "edit CRM" permission can edit a contact's information; Staff without it get read-only access
- [x] **CRM-04**: Admin/Staff can set/update a lead's status (New / Contacted / Qualified / Won / Lost)
- [x] **CRM-05**: Admin/Staff can search/filter contacts by name, status, or tag
- [x] **CRM-06**: Admin/Staff can see which package a lead inquired about, linked directly in the CRM record
- [x] **CRM-07**: CRM records track who created/last edited them and when (audit trail)

### Messaging

- [x] **MSG-01**: Admin/Staff with "message customers" permission can send an individual email to a contact
- [x] **MSG-02**: Admin/Staff with "message customers" permission can send an individual SMS to a contact
- [x] **MSG-03**: Admin/Staff with "message customers" permission can send a bulk email to a selected set of contacts
- [x] **MSG-04**: Admin/Staff with "message customers" permission can send a bulk SMS to a selected set of contacts
- [x] **MSG-05**: Contacts can opt out of bulk email/SMS, and opted-out contacts are excluded from future bulk sends
- [x] **MSG-06**: Sent messages (individual and bulk) are logged and visible in the contact's history

### Automation

- [x] **AUTO-01**: Customer receives an instant auto-reply email when their inquiry is received
- [x] **AUTO-02**: Admin/Staff with "message customers" permission receive an internal notification when a new inquiry arrives
- [x] **AUTO-03**: Duplicate webhook deliveries for the same inquiry do not create duplicate leads or duplicate auto-reply/notification sends (idempotency)

### Homepage Content

Added 2026-07-27 — defined during Phase 6 discuss-phase (ROADMAP.md Phase 6 was created as a placeholder with no requirements; scoped interactively with the user before planning).

- [x] **HOME-01**: Homepage displays a hero carousel mixing rotating featured packages and general brand/promotional imagery, admin-editable (add/edit/delete/reorder slides) via the admin panel
- [x] **HOME-02**: Homepage displays a "why choose us" / value props section, admin-editable
- [x] **HOME-03**: Homepage displays a featured packages grid, reusing the existing "featured" package flag (Phase 2 PKG-05) rather than a separate curation mechanism
- [x] **HOME-04**: Homepage displays customer testimonials (photo, customer name, quote text, star rating), admin-editable (add/edit/delete)
- [x] **HOME-05**: Homepage displays a Brand Partners section (logo + optional link), admin-editable, and renders only when at least one partner entry exists
- [x] **HOME-06**: Homepage displays a Corporate Clients section (logo + optional link), admin-editable, and renders only when at least one client entry exists
- [x] **HOME-07**: Homepage includes an embedded general inquiry form section, reusing the existing inquiry pipeline (PUBL-07/CRM-01, Formspree + CRM-backed) rather than a new form/pipeline

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Automation

- **AUTOv2-01**: Drip/multi-step automated follow-up sequences beyond the instant auto-reply + internal alert

### Admin

- **ADMv2-01**: Granular per-resource/per-action permission system beyond the fixed 3-toggle model

### Public Site

- **PUBLv2-01**: Booking/availability calendar (would require revisiting the no-checkout decision)
- **PUBLv2-02**: Multi-language site (English/Filipino beyond default copy)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Online checkout / payment processing | Bookings close via WhatsApp/Facebook conversation in this market; adds PCI/refund/cancellation complexity with no validated need |
| Customer accounts/login | No self-serve flow exists to populate a customer dashboard (no checkout); adds auth surface area for zero v1 payoff |
| Real-time chat widget on-site | Unstaffed live chat looks broken; WhatsApp deep link already gives a near-real-time feel without requiring an always-staffed queue |
| Full granular permission system (per-resource ACLs) | Massive complexity increase for a small staff team; the 3-toggle model matches the standard small-team SaaS pattern |
| Drip/multi-step automation sequences | Requires sequence builder UI, scheduling infra, and message-state tracking; instant auto-reply + internal alert already covers the "don't lose a lead" risk |
| Booking/availability calendar | No online booking mechanism exists; availability without a booking flow just creates unresolved support questions |
| Multi-currency / multi-language site | PHP-only, Philippines market confirmed; no validated demand for other markets |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PUBL-01 through PUBL-09 | Phase 1 | Complete |
| AUTH-01 through AUTH-05 | Phase 2 | Complete |
| PKG-01 through PKG-06 | Phase 2 | Complete |
| CRM-01 through CRM-07 | Phase 3 | Complete |
| AUTO-01 through AUTO-03 | Phase 3 | Complete |
| MSG-01 through MSG-06 | Phase 4 | Complete |
| HOME-01 through HOME-07 | Phase 6 | Complete |

**Coverage:**

- v1 requirements: 43 total
- Mapped to phases: 43/43 ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-18*
*Last updated: 2026-08-06 after Phase 6 (public-site-content-sections-hero-carousel) completion — HOME-01–07 complete*
