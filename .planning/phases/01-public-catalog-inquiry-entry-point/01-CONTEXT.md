# Phase 1: Public Catalog & Inquiry Entry Point - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A prospective customer can browse tour packages (list + detail) and reach out to inquire — via WhatsApp deep link, Facebook page link, or the Formspree-backed inquiry form — on any device. No auth, no CRM, no admin panel yet: this phase stands up the public site only. Package management (Phase 2) and CRM/automation (Phase 3) are explicitly out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Package Data for Launch
- **D-01:** Packages are populated via a repo-committed seed script (`seed.sql` or `seed.ts`), not manual Supabase dashboard entry and not hardcoded in-app data. Re-runnable during Phase 1 dev; disposable once Phase 2 admin CRUD exists.
- **D-02:** Real package content is not ready yet — use placeholder/dummy packages (itinerary, prices, inclusions, photos) for Phase 1. Real content gets swapped in later (business will supply it, likely around Phase 2 admin or pre-launch).

### WhatsApp / Facebook Contact Details
- **D-03:** WhatsApp CTA number: **+639205351673**
- **D-04:** Facebook page URL: **https://web.facebook.com/profile.php?id=61567102791951**
- **D-05:** WhatsApp deep link pre-fills a message mentioning the specific package name (e.g. "Hi! I'm interested in [Package Name]"). Requires building the `wa.me` link per-package, not a single static link.

### Inquiry Form Integration
- **D-06:** Rebuild the inquiry form UI natively in React (react-hook-form + zod), styled to match the new site, POSTing to the existing Formspree endpoint: **https://formspree.io/f/xojpkjbr**. Do not iframe/embed the old hosted form.
- **D-07:** Two form contexts: a per-package inquiry form on each package detail page (tagged/pre-filled with that package so the submission carries package context — feeds CRM-06 in Phase 3), plus one general "Contact Us" page/form for non-package questions.

### FAQ / Trip-Facts Structure
- **D-08:** Best-time-to-go, what-to-bring, and group-size are fixed structured fields on every package (not freeform FAQ). Consistent display now, and maps cleanly to Phase 2's admin package-edit form later.
- **D-09:** Inclusions, exclusions, and what-to-bring all use the same shared list-item component/data structure (icon + text per line) across the site — one reusable checklist pattern instead of three bespoke ones.

### Claude's Discretion
- Package detail routing/URL structure (e.g. slug-based `/packages/[slug]`).
- Where placeholder photos are hosted for Phase 1 (Supabase Storage vs static bundled assets) — pick whichever sets Phase 2's photo-management work up more cleanly.
- Formspree form field validation rules and success/error UI states.
- Visual/brand fidelity (logo, colors, exact look) — explicitly deferred; per PROJECT.md, brand assets are gathered during the UI phase (`/gsd-ui-phase`), not this discussion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & requirements
- `.planning/PROJECT.md` — Core value, business context, constraints (Supabase, free-tier hosting, PHP currency), Key Decisions table
- `.planning/REQUIREMENTS.md` §Public Site (PUBL-01 through PUBL-09) — full requirement list this phase must satisfy
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria, dependencies

No additional external specs/ADRs — requirements fully captured in decisions above plus the docs listed.

</canonical_refs>

<code_context>
## Existing Code Insights

Greenfield project — no code exists yet (no `package.json`, no `app/` directory). This is the first phase; there are no reusable assets, established patterns, or integration points to inherit. The stack is pre-decided in `.claude/CLAUDE.md` (Next.js 16 App Router, Supabase, Tailwind v4, shadcn/ui) — researcher/planner should treat that document as authoritative for tech choices, not re-litigate them.

</code_context>

<specifics>
## Specific Ideas

- WhatsApp deep link must be dynamic per package (carries package name in the pre-filled message), not a single static link shared across all CTAs.
- The inquiry form is deliberately rebuilt (not embedded) so it can visually match the new site and so Phase 3's Formspree dual-submit webhook workaround (noted in PROJECT.md) has a controllable submit handler to extend later.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Visual/brand fidelity was raised but is already correctly scoped to the future UI phase per PROJECT.md, not deferred as new scope.)

</deferred>

---

*Phase: 1-Public Catalog & Inquiry Entry Point*
*Context gathered: 2026-07-18*
