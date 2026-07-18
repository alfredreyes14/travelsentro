# Requirements: TravelSentro

**Defined:** 2026-07-18
**Core Value:** A prospective customer can browse tour packages and reach out to inquire (via WhatsApp, Facebook, or the inquiry form) in under a minute, and that inquiry reliably lands in the business's CRM so no lead is lost.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Public Site

- [ ] **PUBL-01**: User can browse a list of tour packages, each showing photo, name, and starting "from ₱X" price
- [ ] **PUBL-02**: User can view a package detail page with a day-by-day itinerary and duration
- [ ] **PUBL-03**: User can view price and inclusions/exclusions listed explicitly (line-item, not paragraph prose) on the package detail page
- [ ] **PUBL-04**: User can view a photo gallery on each package detail page
- [ ] **PUBL-05**: User can contact the business via a WhatsApp deep-link CTA on each package
- [ ] **PUBL-06**: User can contact the business via a Facebook page link CTA on each package
- [ ] **PUBL-07**: User can submit an inquiry via the existing Formspree form
- [ ] **PUBL-08**: User can view an FAQ / trip-facts section per package (best time to go, what to bring, group size)
- [ ] **PUBL-09**: Site is mobile-responsive across package list, detail, and inquiry flows

### Package Management

- [ ] **PKG-01**: Admin/Staff with "manage packages" permission can create a new tour package (itinerary, price, inclusions/exclusions, photos)
- [ ] **PKG-02**: Admin/Staff with "manage packages" permission can edit an existing tour package
- [ ] **PKG-03**: Admin/Staff with "manage packages" permission can delete a tour package
- [ ] **PKG-04**: Admin/Staff with "manage packages" permission can publish/unpublish a package (hide from public site without deleting)
- [ ] **PKG-05**: Admin/Staff with "manage packages" permission can mark a package as featured/highlighted
- [ ] **PKG-06**: Admin/Staff with "manage packages" permission can set the manual display order of packages on the public list

### Admin Auth & Users

- [ ] **AUTH-01**: Admin/Staff can log in to the admin panel with email/password
- [ ] **AUTH-02**: Admin can create new Admin or Staff accounts
- [ ] **AUTH-03**: Admin can edit or deactivate existing Admin/Staff accounts
- [ ] **AUTH-04**: Admin can toggle per-staff permissions individually: can message customers, can manage packages, can edit CRM data
- [ ] **AUTH-05**: A Staff member without a given permission is blocked from that action both in the UI and at the API/data layer (server-side enforcement, not UI-only)

### CRM

- [ ] **CRM-01**: New Formspree inquiry submissions automatically create a lead/contact record in the CRM (via webhook)
- [ ] **CRM-02**: Admin/Staff can view a contact's inquiry/message history as a timeline
- [ ] **CRM-03**: Admin/Staff with "edit CRM" permission can edit a contact's information; Staff without it get read-only access
- [ ] **CRM-04**: Admin/Staff can set/update a lead's status (New / Contacted / Qualified / Won / Lost)
- [ ] **CRM-05**: Admin/Staff can search/filter contacts by name, status, or tag
- [ ] **CRM-06**: Admin/Staff can see which package a lead inquired about, linked directly in the CRM record
- [ ] **CRM-07**: CRM records track who created/last edited them and when (audit trail)

### Messaging

- [ ] **MSG-01**: Admin/Staff with "message customers" permission can send an individual email to a contact
- [ ] **MSG-02**: Admin/Staff with "message customers" permission can send an individual SMS to a contact
- [ ] **MSG-03**: Admin/Staff with "message customers" permission can send a bulk email to a selected set of contacts
- [ ] **MSG-04**: Admin/Staff with "message customers" permission can send a bulk SMS to a selected set of contacts
- [ ] **MSG-05**: Contacts can opt out of bulk email/SMS, and opted-out contacts are excluded from future bulk sends
- [ ] **MSG-06**: Sent messages (individual and bulk) are logged and visible in the contact's history

### Automation

- [ ] **AUTO-01**: Customer receives an instant auto-reply email when their inquiry is received
- [ ] **AUTO-02**: Admin/Staff with "message customers" permission receive an internal notification when a new inquiry arrives
- [ ] **AUTO-03**: Duplicate webhook deliveries for the same inquiry do not create duplicate leads or duplicate auto-reply/notification sends (idempotency)

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
| PUBL-01 through PUBL-09 | TBD | Pending |
| PKG-01 through PKG-06 | TBD | Pending |
| AUTH-01 through AUTH-05 | TBD | Pending |
| CRM-01 through CRM-07 | TBD | Pending |
| MSG-01 through MSG-06 | TBD | Pending |
| AUTO-01 through AUTO-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 36 ⚠️ (expected — roadmap not yet created)

---
*Requirements defined: 2026-07-18*
*Last updated: 2026-07-18 after initial definition*
