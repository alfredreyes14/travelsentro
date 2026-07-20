# Phase 3: Lead Capture, CRM & Automation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 03-lead-capture-crm-automation
**Areas discussed:** Inquiry ingestion reliability, Contact/duplicate identity handling, Internal notification channel & recipients, Package linkage for CRM-06

---

## Inquiry ingestion reliability

| Option | Description | Selected |
|--------|-------------|----------|
| Route through our own endpoint | Client submits only to our new API route; route writes CRM lead first, then forwards to Formspree server-side | ✓ |
| Dual-submit from the client | Client fetches both Formspree and our endpoint (PROJECT.md's original plan) | |
| Pay for Formspree's webhook plugin | Formspree relays server-side after receiving; ~$10+/mo | |

**User's choice:** Route through our own endpoint.
**Notes:** Supersedes PROJECT.md's originally-planned "dual-submit" workaround — the user preferred the more reliable single-write-path architecture over preserving Formspree as primary.

| Option | Description | Selected |
|--------|-------------|----------|
| Log and move on | Formspree forward failure is logged but never blocks/retries the customer's success response | ✓ |
| Retry Formspree forward with backoff | Queue retry attempts before giving up | |

**User's choice:** Log and move on.
**Notes:** Confirms Formspree is treated as a backup copy, not load-bearing for "no lead lost."

| Option | Description | Selected |
|--------|-------------|----------|
| Client-generated request ID | Form generates a UUID, endpoint upserts on it | ✓ |
| Formspree submission ID | Not available at write time in the new architecture | |

**User's choice:** Client-generated request ID.

---

## Contact/duplicate identity handling

| Option | Description | Selected |
|--------|-------------|----------|
| One contact, growing timeline | Match on email; new inquiries attach to existing contact | ✓ |
| Always create a new lead | Every inquiry is a separate record | |

**User's choice:** One contact, growing timeline.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep matching on email, update the phone | Email is the stable identity key; phone just updates | ✓ |
| Flag for manual review instead of auto-updating | Adds a review-queue concept | |

**User's choice:** Keep matching on email, update the phone.

---

## Internal notification channel & recipients

| Option | Description | Selected |
|--------|-------------|----------|
| Every Admin/Staff with "message customers" permission | Matches AUTO-02 wording exactly | ✓ |
| Admins only | Staff would need to check CRM themselves | |

**User's choice:** Every Admin/Staff with "message customers" permission.

| Option | Description | Selected |
|--------|-------------|----------|
| One email per inquiry | Instant, fits Resend's 100/day free cap at this scale | ✓ |
| Digest / batched | Adds a queue/cron, delays response | |

**User's choice:** One email per inquiry.

---

## Package linkage for CRM-06

| Option | Description | Selected |
|--------|-------------|----------|
| Add package_id to the form | Change per-package form to send real package ID, store as FK | ✓ |
| Match by name string only | No form changes, but no real FK/link | |

**User's choice:** Add package_id to the form.

| Option | Description | Selected |
|--------|-------------|----------|
| package_id is nullable | General inquiries have no package link | ✓ |
| Force a package selection anyway | Adds friction to a deliberately package-agnostic form | |

**User's choice:** package_id is nullable.

---

## Claude's Discretion

- Exact CRM table schema (naming, status enum implementation, tags implementation)
- Exact API route path/structure for the new inquiry-ingestion endpoint
- Auto-reply and internal-notification email template content/copy (React Email components)
- CRM list/detail page layout, search/filter UI, admin sidebar nav placement
- Whether status/tags get their own nav entry or live only within CRM views
- Inquiry API route validation/rate-limiting details

## Deferred Ideas

None raised this session (the admin dashboard idea was already deferred during Phase 2's discussion, not re-raised here).
