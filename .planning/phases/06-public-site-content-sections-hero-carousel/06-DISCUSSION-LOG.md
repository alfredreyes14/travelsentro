# Phase 6: Public Site Content Sections & Hero Carousel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-27
**Phase:** 06-public-site-content-sections-hero-carousel
**Areas discussed:** Phase scoping (goal was undefined), Hero carousel content, Content sections, Content source, Contact form reuse, Testimonials data, Partners/clients data, Page scope

---

## Phase scoping

ROADMAP.md's Phase 6 entry existed only as a placeholder (`Goal: [To be planned]`, `Requirements: TBD`), unlike phases 1–5 which all had a concrete goal before discussion started. Rather than let `--auto` mode invent scope by picking "recommended" defaults for an undefined phase, the orchestrator stopped and asked the user how to proceed.

| Option | Description | Selected |
|--------|-------------|----------|
| Define the goal now | Capture the user's vision for "Content Sections & Hero Carousel" before any further discussion or planning | ✓ |
| Stop the auto-chain here | Leave phase 6 as a placeholder for later | |
| Use an existing PRD/spec | Point to an existing doc via `/gsd-plan-phase --prd` | |

**User's choice:** Define the goal now.

---

## Hero Carousel

| Option | Description | Selected |
|--------|-------------|----------|
| Rotating featured packages | Cycles through featured packages (photo, name, CTA) | |
| Rotating brand/destination photography | General scenic/brand imagery, not package-specific | |
| Mix of both | Some slides are featured packages, others general brand/promo imagery | ✓ |

**User's choice:** Mix of both.
**Notes:** Reuses the existing `is_featured` package flag from Phase 2 for the package slides.

---

## Content Sections

| Option | Description | Selected |
|--------|-------------|----------|
| Why choose us / value props | Icon+text trust-building blocks | ✓ |
| Testimonials / reviews | Customer quotes/reviews | ✓ |
| About / company story | Short business background section | |
| Featured packages grid | Curated grid separate from full /packages list | ✓ |

**User's choice:** Why choose us, Testimonials, Featured packages grid — plus three sections the user added beyond the offered options: **Contact Form**, **Brand Partners**, **Corporate Clients**.
**Notes:** User specified Brand Partners and Corporate Clients each only appear when there's data for them, and both are controlled in the admin area.

---

## Content Source

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-editable | Staff update content from the admin panel, no code deploy | ✓ |
| Hardcoded for now | Content written directly in code for v1 | |

**User's choice:** Admin-editable.

---

## Contact Form Reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse the existing inquiry form | Same component/pipeline as /contact and package pages (Formspree + CRM) | ✓ |
| Something different | A different form than the existing pipeline | |

**User's choice:** Reuse the existing inquiry form.

---

## Testimonials Data

| Option | Description | Selected |
|--------|-------------|----------|
| Quote text + customer name | Minimum viable fields | ✓ |
| Customer photo/avatar | Small headshot per testimonial | ✓ |
| Star rating | e.g. 5-star rating alongside quote | ✓ |
| Which package they took | Link/reference to a specific tour package | |

**User's choice:** Quote text + customer name, Customer photo/avatar, Star rating.

---

## Partners/Clients Data

| Option | Description | Selected |
|--------|-------------|----------|
| Logo image + optional link | Mirrors existing package-photo upload pattern | ✓ |
| Logo + name + description | More detail per entry | |

**User's choice:** Logo image + optional link.

---

## Page Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Homepage only | All new sections live on `/` only | ✓ |
| Homepage + partners/clients in footer sitewide | Partners/clients logos also appear in the global footer | |

**User's choice:** Homepage only.

---

## Claude's Discretion

- Exact section order on the page (recommended: Hero → Why Choose Us → Featured Packages Grid → Testimonials → Contact Form → Brand Partners/Corporate Clients)
- Data model shape for Partners vs. Clients (recommended: single `partners` table with a `type` enum, since both have identical fields)
- Carousel autoplay behavior — shadcn's Embla-based carousel has no built-in autoplay; an `embla-carousel-autoplay` plugin would be a new dependency if autoplay is wanted (flagged for research, not decided)
- New admin nav/permission gating — recommended reuse of `can_manage_packages` for this new content-management surface, consistent with the project's fixed 3-toggle permission model (not discussed directly with the user)
- Image storage — recommended reuse of the existing package-photos Storage upload pattern
- Exact DB schema (table names, column shapes, RLS policy scoping)

## Deferred Ideas

None — discussion stayed within the scope defined during this session.
