# Feature Research

**Domain:** Travel agency marketing site (no checkout, inquiry-driven) + lightweight admin/CRM/messaging panel
**Researched:** 2026-07-18
**Confidence:** MEDIUM (cross-checked web sources; no single authoritative spec for this exact domain combination — see Sources)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

**Public site**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Package list/browse page | Baseline expectation for any tour site — "what do you offer" | LOW | Already in scope. Grid/list with filters (destination, duration, price range) is common but filters can be deferred if catalog is small. |
| Package detail page: day-by-day itinerary | Travelers won't inquire without knowing what a day looks like | LOW–MED | Already in scope. Progressive disclosure (tabs/accordion) beats a wall of text — see ARCHITECTURE-adjacent UX note below. |
| Price & inclusions/exclusions listed explicitly | Hidden pricing or vague "what's included" is the #1 trust-killer in tour sales; ambiguity = lost leads or angry follow-ups | LOW | Already in scope. Line-item inclusions/exclusions (not paragraph prose) is the pattern that reduces "is this included?" back-and-forth. |
| Photo gallery per package | Travel is a visual-trust purchase; no photos = looks like a scam page | LOW | Already in scope. Real trip photos outperform generic stock. |
| Multiple low-friction contact channels (WhatsApp deep link, Facebook, inquiry form) | PH travel buyers expect to reach a human via chat, not just a form | LOW | Already in scope — WhatsApp click-to-chat (`wa.me/<number>?text=...`) + FB page link + Formspree form is exactly the pattern seen across PH travel agency sites researched. |
| Mobile-responsive design | Majority of PH travel inquiry traffic is mobile (FB/WhatsApp referral) | LOW–MED | Not explicitly listed in PROJECT.md scope but implicit — flag as a requirement, not a nice-to-have. |
| Basic trust signals: business name, logo, contact info, "about us" | Signals operational legitimacy before someone hands over contact info | LOW | Business already has brand assets; just needs to surface them (address/phone/socials in footer). |
| Visible "starting from" pricing on package cards, not just detail page | Hidden pricing causes bounce before a single click; showing "from ₱X" on the list view is standard | LOW | Not explicitly in scope — flag as likely-expected addition to the package list page. |
| FAQ or trip facts section (best time to go, what to bring, group size) | Reduces pre-inquiry friction and repetitive DMs to staff | LOW–MED | Nice-to-have that borders on table stakes for tour-heavy sites; can be deferred to v1.x if time-constrained. |

**Admin / CRM / messaging**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Authenticated admin login (Admin/Staff roles) | Baseline security for any internal tool touching customer data | LOW–MED | Already in scope. |
| Package CRUD | Business needs to update tours without a developer | MED | Already in scope. |
| Central contact/lead record with inquiry history | The whole point of a CRM — one place per person, not scattered inboxes/DMs | MED | Already in scope. Table stakes detail: every contact needs a visible timeline of past inquiries/messages, not just a snapshot. |
| Lead status field (New / Contacted / Qualified / Won / Lost, or similar) | Without status, staff can't tell which leads are stale vs handled — leads get lost, which directly threatens the project's core value metric | LOW–MED | **Not explicitly listed in PROJECT.md Active requirements** — flagged below as a likely gap. |
| Individual + bulk email/SMS messaging | Already in scope | MED | — |
| Instant auto-reply on inquiry | Already in scope | LOW–MED | Keep under ~100 words, acknowledge receipt, set expectation ("we'll reply within X hours"), personalize with the lead's name from the Formspree payload. |
| Internal new-inquiry notification | Already in scope | LOW | Should go to staff who have "message customers" permission, not literally everyone, to avoid notification fatigue. |
| Search/filter contacts (by name, status, tag) | Even a small CRM with 100+ contacts is unusable without search | LOW–MED | Not explicitly listed — implicit table stakes once CRM has meaningful volume; cheap to add alongside CRUD. |
| Unsubscribe/opt-out handling for bulk email and SMS | Legal + deliverability requirement (CAN-SPAM-style for email, TCPA-style consent/STOP for SMS); ESPs/SMS providers often enforce this at the platform level regardless | LOW–MED | **Gap flag** — see below. Not listed in PROJECT.md scope; needs to be added or explicitly deferred with eyes open. |
| Audit trail / "who did what" on CRM edits | Multi-staff tool — without this, disputes over who changed a lead's status are unresolvable | LOW | Not in scope; low cost to add (created_by/updated_by + timestamp columns), can piggyback on existing DB writes. Recommend as v1.x if not v1. |

### Differentiators (Competitive Advantage)

Features that set the product apart from a generic Wix/Wordpress travel template or from doing this via spreadsheets + Facebook DMs. Should align with Core Value: "inquiry reliably lands in CRM, no lead lost."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Formspree → CRM webhook automation | Turns a static form into a lead-capture system; most small PH travel agencies just read a Formspree/email inbox manually and leads get lost in the shuffle — this is the actual differentiator of the whole project | MED | Already in scope; this is the single highest-value feature relative to "what a typical small travel agency has today." |
| Per-staff permission toggles (message/manage packages/edit CRM) | Lets the owner delegate work (e.g., a junior staffer can view CRM but not send bulk SMS) without a full RBAC system | MED | Already in scope. Standard pattern for small-team SaaS is exactly this: binary role + a few scoped capability flags, not a full permission matrix — validates the "3 toggles" decision as right-sized, not under-built. |
| Bulk segmented messaging (email + SMS) tied to CRM tags/status | Lets staff run a "still interested?" campaign to stale leads or a seasonal promo to past customers — most competitors' sites have no re-engagement mechanism at all | MED–HIGH | Already in scope. This is a genuine differentiator vs. both (a) template travel sites with no CRM and (b) generic CRMs with no travel-specific package linkage. |
| Inquiry → package linkage (which package the lead asked about) | Staff following up know context instantly instead of re-reading the original message | LOW–MED | Not explicitly stated but implied by "inquiry history" — worth confirming Formspree payload captures which package page the inquiry came from. |
| WhatsApp-first CTA design (not buried under a generic "Contact Us") | PH market strongly prefers WhatsApp/FB over email; making it the primary CTA (vs. treating the form as primary) matches actual buyer behavior | LOW | Already effectively in scope via CTA decision; worth calling out as a genuine (if small) differentiator vs. sites that default to a form-first flow. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create disproportionate cost/risk for this scope. These validate the user's existing Out-of-Scope list and flag a couple of additional ones.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Online checkout/payment | "Competitors let people book online" | Bookings close via conversation in this market; adds PCI/refund/cancellation-policy complexity for a business that doesn't need it | Already correctly out of scope — WhatsApp/FB CTA is the right fit |
| Customer accounts/login | "Customers should see their booking history" | No self-serve flow exists to populate it (no checkout); adds auth surface area and a second user type for zero payoff at v1 | Already correctly out of scope |
| Full granular permission system (per-resource, per-action ACLs) | "What if we need more roles later" | Massive complexity increase for a 2–5 person staff team; premature generalization | Already correctly out of scope — 3-toggle model matches industry pattern for small-team tools |
| Drip/multi-step automation sequences | "Nurture leads automatically over weeks" | Requires sequence builder UI, scheduling infra, and message-state tracking — disproportionate to a business that follows up via WhatsApp conversation anyway | Already correctly out of scope; instant auto-reply + internal alert covers the "don't lose a lead" risk |
| Real-time chat widget / live chat on-site | "Feels modern, reduces friction" | Requires staffing a live queue; if unstaffed it looks broken (unanswered chat = worse than no chat) | WhatsApp deep link already gives near-real-time feel without requiring an always-staffed widget |
| Booking calendar / availability management | "Show which dates are available" | No online booking exists, so availability display without a booking mechanism just creates support questions ("is this actually available?") without resolving them | Handle availability in the WhatsApp/FB conversation, as today |
| SMS/email marketing without opt-out mechanism | "Just send it, we're a small business, no one will complain" | SMS providers (Semaphore, Twilio) and email providers commonly suspend accounts for spam complaints; even without strict PH enforcement, providers self-police at the platform level, risking account loss | Build a minimal opt-out (reply STOP / unsubscribe link) even at v1 — cheap now, expensive to retrofit after a provider ban |
| Multi-currency / multi-language site | "International customers might visit" | PROJECT.md context confirms PHP-only, Philippines market; multi-currency adds real complexity with no validated demand | Single currency (PHP), single language (English, possibly Filipino copy) is correct for v1 |

## Feature Dependencies

```
Formspree inquiry form
    └──requires──> Webhook receiver endpoint
                       └──requires──> CRM contact/lead data model (must exist first)
                                          └──enables──> Instant auto-reply email
                                          └──enables──> Internal new-inquiry notification
                                          └──enables──> Lead status field / pipeline

Admin authentication (Admin/Staff roles)
    └──requires──> User accounts table
                       └──requires──> Per-staff permission toggles (message/manage packages/edit CRM)
                                          └──gates──> Package CRUD (requires "manage packages")
                                          └──gates──> Bulk/individual messaging (requires "message customers")
                                          └──gates──> CRM edit vs. read-only (requires "edit CRM")

CRM contact/lead data model
    └──enables──> Bulk email/SMS messaging (needs a contact list to select/segment)
    └──enables──> Individual messaging (needs a contact record to message from)
    └──enables──> Lead status/tagging (enhances segmentation for bulk send)

Bulk email/SMS messaging
    └──requires──> Opt-out/unsubscribe handling (flagged gap — should land in same phase, not after)

Package CRUD
    └──enables──> Public package list/detail pages (site reads from same package data)
    └──enables──> Inquiry → package linkage (lead capture references package ID)
```

### Dependency Notes

- **Formspree webhook requires CRM data model to exist first:** the webhook has nothing to write into until contact/lead tables exist — this is a hard sequencing constraint for roadmap phase ordering (CRM data model must precede or land in the same phase as webhook integration).
- **Auto-reply and internal notification both depend on the webhook, not on each other:** they can be built in parallel once the webhook lands, since both just react to "new lead created."
- **Per-staff permission toggles gate three other features:** package CRUD, messaging, and CRM edit access. Building the toggle mechanism itself should happen before or alongside the first gated feature, not after all three are already using ungated access (retrofitting permission checks onto existing endpoints is more error-prone than building them in from the start).
- **Bulk messaging conflicts with skipping opt-out handling:** shipping bulk SMS/email without any unsubscribe path is the single most likely thing to cause a real-world provider suspension (Semaphore/Twilio/email ESP) — treat opt-out as part of the same feature, not a follow-up.
- **Lead status/tagging enhances but does not block bulk messaging:** bulk send can launch with "select all" / manual multi-select before segmentation-by-tag exists; tagging is an enhancement, not a hard prerequisite.

## MVP Definition

### Launch With (v1)

Minimum viable product — matches the user's already-decided Active requirements, with two additions flagged as likely-necessary based on research (see Gaps below).

- [ ] Public site: package list + detail pages (itinerary, price/inclusions, gallery) — core value proposition, nothing to inquire about without it
- [ ] WhatsApp + Facebook CTA on every package — primary conversion path in this market
- [ ] Formspree form kept + webhooked into CRM as new leads — the actual differentiator (no more lost leads)
- [ ] Admin auth (Admin/Staff roles) + per-staff permission toggles — required before any admin feature can be safely multi-user
- [ ] Package CRUD — business must self-serve content updates
- [ ] CRM contact/lead record with inquiry history — the core "don't lose a lead" mechanism
- [ ] **Lead status field (flagged addition)** — without it, "no lead lost" can't actually be verified/tracked; staff need to see what's still open
- [ ] Individual + bulk email/SMS messaging — already in scope
- [ ] **Minimal opt-out/unsubscribe handling on bulk messaging (flagged addition)** — cheap now, protects the SMS/email provider account from suspension
- [ ] Instant auto-reply email on new inquiry — already in scope
- [ ] Internal new-inquiry notification — already in scope

### Add After Validation (v1.x)

Features to add once the core loop (browse → inquire → CRM → follow-up) is proven.

- [ ] CRM tags/segments beyond a basic status field — trigger: staff start manually tracking segments in spreadsheets alongside the CRM (sign the built-in status isn't enough)
- [ ] Search/filter on contacts and packages — trigger: contact list or package catalog grows past ~50 items and scrolling becomes the bottleneck
- [ ] Audit trail on CRM edits (who changed what) — trigger: a dispute or confusion arises between Admin and Staff over a record change
- [ ] Inquiry → package linkage surfaced in CRM UI — trigger: staff report having to re-ask customers which package they meant
- [ ] FAQ/trip-facts section on package pages — trigger: staff report repetitive pre-inquiry questions via WhatsApp

### Future Consideration (v2+)

Features to defer until product-market fit on the core inquiry-to-CRM loop is established.

- [ ] Drip/multi-step automation — defer until instant auto-reply + internal alert are proven insufficient (per PROJECT.md's own stated rationale)
- [ ] Granular per-resource permissions — defer until a real business need for more than 3 toggles emerges with actual staff roles that don't fit
- [ ] Booking/availability calendar — defer indefinitely unless the business decides to move toward online booking (would also reopen the checkout question)
- [ ] Multi-language site — defer unless demand from non-English/Filipino-speaking customer segment is observed

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Package list/detail pages | HIGH | LOW | P1 |
| WhatsApp/FB CTA | HIGH | LOW | P1 |
| Formspree → CRM webhook | HIGH | MEDIUM | P1 |
| Admin auth + role/permission toggles | HIGH | MEDIUM | P1 |
| Package CRUD | HIGH | MEDIUM | P1 |
| CRM contact/lead record + history | HIGH | MEDIUM | P1 |
| Lead status field | HIGH | LOW | P1 |
| Individual/bulk email+SMS messaging | HIGH | MEDIUM–HIGH | P1 |
| Opt-out/unsubscribe handling | MEDIUM (risk mitigation) | LOW | P1 |
| Instant auto-reply | HIGH | LOW | P1 |
| Internal new-inquiry notification | HIGH | LOW | P1 |
| CRM tags/segments | MEDIUM | LOW–MEDIUM | P2 |
| Contact/package search & filter | MEDIUM | LOW | P2 |
| Audit trail on CRM edits | LOW–MEDIUM | LOW | P2 |
| FAQ/trip-facts on package pages | LOW–MEDIUM | LOW | P2 |
| Drip automation sequences | MEDIUM | HIGH | P3 |
| Granular permissions | LOW | HIGH | P3 |
| Booking/availability calendar | LOW (out of model) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Typical PH travel agency site (e.g. Rakso, MPQ, Tourismo Filipino style) | Generic booking platform (WeTravel/Bókun-style) | Our Approach |
|---------|---------------------------------------------------------------------------|--------------------------------------------------|--------------|
| Inquiry channel | Facebook page + WhatsApp, often no structured form/CRM behind it — leads live in FB Messenger/WhatsApp chat history only | Structured booking flow with payment | Formspree form + WhatsApp/FB CTA, but *with* a CRM behind it — this is the gap TravelSentro closes |
| Lead tracking | None — leads tracked ad hoc in the owner's head or a spreadsheet at best | Built into the booking platform automatically | Dedicated CRM with status + history — genuine step up from the norm in this segment |
| Package presentation | Photo gallery + text itinerary, price sometimes only "contact for pricing" | Structured pricing/inclusions with instant quote/booking | Explicit pricing + inclusions/exclusions shown (higher trust than "contact for pricing," lower complexity than instant booking) |
| Staff messaging | Manual, one-by-one via personal WhatsApp/FB accounts | N/A (platform handles comms) | Individual + bulk email/SMS from a shared admin panel — enables consistent follow-up without relying on one staffer's personal phone |
| Follow-up automation | None (fully manual, prone to dropped leads) | Automated booking confirmations | Instant auto-reply + internal alert — closes the "lead falls through the cracks" gap without full automation complexity |

## Sources

- [10+ Travel Website Features for Agencies and Tour Operators](https://wptravel.io/top-features-for-travel-agency-website/) — itinerary builder, gallery, trip facts pattern (MEDIUM confidence, cross-checked against multiple travel-plugin vendor pages)
- [23 Proven Features for Travel Agency Websites](https://wptravelengine.com/features-for-travel-agency-websites/) — WhatsApp/contact-channel patterns, inquiry form as lead capture
- [How to Create Tour Packages That Sell Themselves - Checkfront](https://www.checkfront.com/blog/how-to-create-tour-packages-that-sell-themselves/) — pricing/inclusions display patterns
- [Crafting irresistible packages: strategic guide for tour operators - TrekkSoft](https://www.trekksoft.com/en/blog/strategic-guide-tour-package-creation) — progressive disclosure, CTA-per-page best practice
- [Less Annoying CRM](https://www.lessannoyingcrm.com/) and [Zapier: 14 best free CRM software](https://zapier.com/blog/best-free-crm/) — lightweight CRM feature baseline (contact record, history, tags, pipeline)
- [Capsule CRM: Best CRM for lead management](https://capsulecrm.com/blog/best-crm-for-lead-management/) — status/pipeline pattern for small teams
- [TextUs: SMS Marketing Platform Breakdown](https://textus.com/blog/sms-marketing-platform) and [Brevo SMS features](https://www.messagedesk.com/blog/crm-text-messaging-crm-sms-integrations) — bulk SMS/email segmentation and compliance features as core, not optional
- [FTC: CAN-SPAM Act Compliance Guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) and [Twilio: Opt-in and opt-out text messages](https://www.twilio.com/en-us/blog/insights/compliance/opt-in-opt-out-text-messages) — consent/opt-out pattern for bulk messaging (US-centric rules; PH Data Privacy Act RA 10173 specifics not independently verified — flagged as a gap)
- [17hats: Lead Capture Auto-Replies](https://help.17hats.com/en/articles/1131025-lead-capture-auto-replies) — auto-reply content/length best practice
- [Trust Signals for Travel: 2026 Social Proof & Conversion Guide](https://atlasperk.com/guides/website-conversion-for-travel/trust-signals/) — reviews/trust-signal placement and conversion impact
- Direct review of PH travel agency sites (Rakso Travel, MPQ Travel and Tours, Tourismo Filipino, Kapwa Travel, Filipino Travel) via search — confirms WhatsApp/Facebook-first contact pattern with no visible CRM/lead-tracking layer, which is the gap this project fills (LOW–MEDIUM confidence, based on site listings only, not internal tooling audits)
- [Enterprise Ready: RBAC Guide](https://www.enterpriseready.io/features/role-based-access-control/) and [Cerbos: 3 Most Common Authorization Designs for SaaS](https://www.cerbos.dev/blog/3-most-common-authorization-designs-for-saas-products) — validates simple role + capability-toggle pattern as right-sized for small-team tools

---
*Feature research for: travel agency marketing site + lightweight admin/CRM/messaging panel*
*Researched: 2026-07-18*
