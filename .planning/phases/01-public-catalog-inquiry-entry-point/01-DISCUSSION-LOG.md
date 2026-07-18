# Phase 1: Public Catalog & Inquiry Entry Point - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 1-Public Catalog & Inquiry Entry Point
**Areas discussed:** Package data for launch, WhatsApp/Facebook contact details, Inquiry form integration, FAQ/trip-facts structure

---

## Package Data for Launch

| Option | Description | Selected |
|--------|-------------|----------|
| Manual seed via SQL/dashboard | Insert real rows directly through Supabase SQL editor/table view | |
| Seed script (repo-committed) | Committed `seed.sql`/`seed.ts`, re-runnable, disposable once Phase 2 admin CRUD exists | ✓ |
| Hardcoded in code (no DB yet) | TypeScript array/JSON in repo, migrate to Supabase in Phase 2 | |

**User's choice:** Seed script (repo-committed)

| Option | Description | Selected |
|--------|-------------|----------|
| A few (2-4), content ready | Small real set, business supplies content now | |
| Full catalog, content ready | All current packages, content ready to hand over | |
| Use placeholder content for now | Real content not ready — build with dummy packages, swap in before launch | ✓ |

**User's choice:** Use placeholder content for now
**Notes:** No further questions — moved to next area.

---

## WhatsApp / Facebook Contact Details

| Option | Description | Selected |
|--------|-------------|----------|
| I'll provide them now | User types the real number/URL | ✓ |
| Use placeholders for now | Not ready — use obvious placeholder values | |

**User's choice:** I'll provide them now
**Notes:** WhatsApp: +639205351673. Facebook: https://web.facebook.com/profile.php?id=61567102791951

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — mention package name | Pre-fill "Hi! I'm interested in [Package Name]" per package | ✓ |
| Yes — generic greeting | Pre-fill a generic greeting regardless of package | |
| No pre-filled message | Blank WhatsApp chat | |

**User's choice:** Yes — mention package name

---

## Inquiry Form Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Rebuild UI, same Formspree endpoint | Native React form (react-hook-form + zod) styled to site, posts to existing Formspree endpoint | ✓ |
| Embed current Formspree form as-is | Keep hosted form unchanged (iframe/redirect) | |

**User's choice:** Rebuild UI, same Formspree endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| Per-package + general contact page | Form on each package detail page (tagged to that package) plus a general Contact Us page | ✓ |
| Single general contact form only | One shared /contact form for all packages | |

**User's choice:** Per-package + general contact page

| Option | Description | Selected |
|--------|-------------|----------|
| I'll provide the endpoint now | User shares the real Formspree form ID/endpoint | ✓ |
| Create a new Formspree form | Set up a fresh Formspree form during implementation | |

**User's choice:** I'll provide the endpoint now
**Notes:** Formspree endpoint: https://formspree.io/f/xojpkjbr

---

## FAQ / Trip-Facts Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed structured fields | Best time to go, what to bring, group size as dedicated typed fields on every package | ✓ |
| Freeform FAQ list per package | Arbitrary Q&A list per package | |
| Hybrid: fixed trip-facts + optional freeform FAQ | Fixed fields plus an optional freeform FAQ list | |

**User's choice:** Fixed structured fields

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, shared list component | One reusable checklist component for inclusions, exclusions, and what-to-bring | ✓ |
| You decide | Leave to planner/researcher | |

**User's choice:** Yes, shared list component

---

## Claude's Discretion

- Package detail routing/URL structure (e.g. slug-based `/packages/[slug]`)
- Placeholder photo hosting for Phase 1 (Supabase Storage vs static bundled assets)
- Formspree form field validation rules and success/error UI states

## Deferred Ideas

- Visual/brand fidelity (logo, colors, exact look) — not deferred as new scope, just correctly routed to the future UI phase (`/gsd-ui-phase`) per PROJECT.md, which already notes brand assets are gathered there.
