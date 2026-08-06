# Phase 6: Public Site Content Sections & Hero Carousel - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The public homepage (`/`) gains a hero carousel and a set of new, fully admin-editable content sections: value props ("why choose us"), a featured packages grid, customer testimonials, an embedded general inquiry form, and two conditional logo sections (Brand Partners, Corporate Clients) that only render when the admin has added at least one entry. All new content lives on the homepage only — package list/detail/contact pages are untouched. Everything stays within the existing locked brand system (#021F4A navy / #F49314 marigold / #FAF7F2 sand, Inter + Plus Jakarta Sans).

**Scoping note:** ROADMAP.md's Phase 6 entry was created as a placeholder (`Goal: [To be planned]`, `Requirements: TBD`) with no prior scoping. This discussion defined the phase goal and requirements (HOME-01 through HOME-07, added to REQUIREMENTS.md) interactively with the user before any implementation gray areas were discussed — this is genuinely new scope, not a HOW-to-implement clarification of already-scoped work.

</domain>

<decisions>
## Implementation Decisions

### Hero Carousel (HOME-01)
- **D-01:** Carousel content is a MIX of rotating featured packages (photo, name, CTA into that package — reuses the existing `is_featured` flag from Phase 2's `featurePackage()`) and general brand/promotional imagery (not tied to a specific package). Admin controls which slides exist and their mix.
- **D-02:** Fully admin-editable: add/edit/delete/reorder slides via the admin panel — matches this project's established "admin-managed, no code deploy needed" pattern (packages, CRM, users).

### Content Sections (HOME-02 through HOME-07)
- **D-03:** In scope beyond the hero carousel: "why choose us" / value props, featured packages grid, customer testimonials, an embedded general inquiry form, Brand Partners (conditional), Corporate Clients (conditional). All homepage-only — no other public pages get new sections, no sitewide footer placement.
- **D-04:** Featured packages grid (HOME-03) reuses the EXISTING `is_featured` flag/toggle from Phase 2 (`actions/packages.ts` `featurePackage()`) — no new curation mechanism, no separate "homepage-featured" flag distinct from the packages-list "featured" badge.
- **D-05:** The homepage inquiry form (HOME-07) is the SAME component/pipeline as `/contact` and per-package inquiries — `components/inquiry/inquiry-form.tsx`, Formspree + CRM-backed (Phase 1/3), general inquiry with no `package_id`. Not a new form or a new pipeline.
- **D-06:** Testimonials (HOME-04) each have: quote text, customer name, customer photo/avatar, and a star rating. No "which package" reference field (user selected the first three, not the package-link option). Admin-entered (no review-collection system exists) — add/edit/delete via admin panel.
- **D-07:** Brand Partners (HOME-05) and Corporate Clients (HOME-06) are each: a logo image + an optional click-through link. No name/description fields beyond what's visible in the logo itself. Both sections render ONLY when at least one entry exists for that specific section — fully hidden (not an empty state) otherwise.

### Claude's Discretion
- **Section order on the page** — recommended default: Hero Carousel → Why Choose Us → Featured Packages Grid → Testimonials → Contact Form → Brand Partners / Corporate Clients (near the bottom, closer to a trust-signal footer position). Not discussed with the user; planner may adjust if a more natural flow emerges during UI design.
- **Data model for Partners vs. Clients** — likely a single `partners` table with a `type` enum (`brand_partner` | `corporate_client`) rather than two separate tables/actions, since both have identical fields (logo + optional link) per D-07. Not a hard requirement — planner/researcher should confirm this is the cleanest shape.
- **Carousel autoplay behavior** — shadcn's `components/ui/carousel.tsx` (already installed, Embla-based, already used in `package-gallery.tsx`'s lightbox) does NOT include autoplay out of the box; an `embla-carousel-autoplay` plugin would be a new dependency if autoplay-with-manual-override is wanted for the hero. Flagged for research — not decided with the user.
- **New admin nav / permission gating** — recommended: reuse the existing `can_manage_packages` permission toggle for gating this new content-management surface (hero slides, sections, testimonials, partners/clients), consistent with this project's explicit "fixed 3-toggle, no new configurability" bias (PROJECT.md Key Decisions). A new admin nav section (e.g. "Content" or "Homepage") under the same pattern as Packages/CRM/Users. Not discussed with the user — flagged as the most consistent choice with existing project conventions, not a locked decision.
- **Image storage** — reuse the same Supabase Storage bucket/upload pattern as package photos (`actions/package-photos.ts`) for hero slide images, testimonial photos, and partner/client logos, rather than inventing a new storage convention.
- **Exact DB schema** (table names, column shapes, RLS policy scoping) — left to planner/researcher, following the established `can_manage_packages`-gated write / universal-authenticated-read pattern already used for `packages`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & requirements
- `.planning/PROJECT.md` — Core value, business context, constraints, Key Decisions table (fixed 3-toggle permission model, no new configurability concepts — informs the admin-gating discretion item above)
- `.planning/REQUIREMENTS.md` §Homepage Content (HOME-01–07) — full requirement list this phase must satisfy, added 2026-07-27 during this discussion
- `.planning/ROADMAP.md` §Phase 6 — goal and success criteria, written during this discussion (was a TBD placeholder before)

### Brand System
- `app/globals.css` — Locked color tokens (`--primary` #F49314, `--secondary` #021F4A, `--background` #FAF7F2), radius scale — all new section styling must use these tokens
- `.planning/phases/01-public-catalog-inquiry-entry-point/01-UI-SPEC.md` — Original 60/30/10 color role table + typography scale (public site) — this phase's sections must follow the same role table, no new colors/fonts

### Prior phase (code this phase extends)
- `components/ui/carousel.tsx` — shadcn Carousel primitive already installed and used in `components/packages/package-gallery.tsx`'s lightbox — reuse for the hero carousel rather than adding a new carousel library
- `actions/packages.ts` — `featurePackage()` / `is_featured` column (D-04's reuse target for HOME-03)
- `actions/package-photos.ts` — existing Storage upload Server Action pattern this phase's image uploads (hero slides, testimonials, partner/client logos) should mirror
- `components/inquiry/inquiry-form.tsx`, `.planning/phases/03-lead-capture-crm-automation/03-CONTEXT.md` — existing inquiry form component and its CRM/Formspree pipeline (D-05's reuse target for HOME-07); `package_id` is nullable per 03-CONTEXT.md D-09, matching a homepage general inquiry with no package context
- `app/admin/(dashboard)/layout.tsx` — existing admin sidebar nav pattern (Packages/CRM/Users, each permission-gated) — a new Content/Homepage nav entry follows this same structure
- `app/(public)/page.tsx` — the homepage file this phase's new sections are added to

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/carousel.tsx` (shadcn, Embla-based) — directly reusable for the hero carousel; already proven in `package-gallery.tsx`
- `actions/packages.ts`'s `featurePackage()` and `is_featured` column — HOME-03's featured packages grid needs no new curation mechanism, just a homepage query filtering `is_featured = true`
- `actions/package-photos.ts` — Storage upload pattern (bucket structure, signed URL handling) directly transferable to hero slide/testimonial/partner-logo image uploads
- `components/inquiry/inquiry-form.tsx` — existing react-hook-form + zod inquiry form; HOME-07 embeds this as-is (general inquiry, no `package_id`), no new form component

### Established Patterns
- Every Server Action in `actions/*.ts` starts with a `requirePermission()`/`requireAdmin()` call before any Supabase write (Phase 2/3/4/5 convention) — new content-management actions (hero slides, testimonials, partners/clients) should follow this identically
- Admin sidebar nav items are permission-gated inline in `app/admin/(dashboard)/layout.tsx` (e.g. `canManagePackages && (...)`) — a new Content nav entry follows the same conditional-render pattern
- Tailwind v4 CSS-first tokens in `app/globals.css` — all new section styling must go through these tokens, never hardcoded hex (past drift incident already fixed in `02-13-PLAN.md`)

### Integration Points
- `app/(public)/page.tsx` is the sole integration point on the public side — all new sections render here
- New admin CRUD surfaces (hero slides, testimonials, partners/clients) need their own admin routes under `app/admin/(dashboard)/`, following the Packages/Users precedent
- New tables need RLS write policies scoped to `can_manage_packages` (per the Claude's Discretion recommendation above) and public anon-read policies (homepage is unauthenticated), mirroring `packages`' existing `is_published`-style public-read pattern

</code_context>

<specifics>
## Specific Ideas

- User specified Brand Partners and Corporate Clients as two distinct sections (not one generic "partners" section), each independently conditional on having at least one entry — this distinction should be preserved in the UI even if the underlying data model uses a shared `type` field (Claude's Discretion above).
- The homepage inquiry form section must NOT be a new/different form from what already exists — explicit user confirmation that this reuses the Phase 1/3 pipeline exactly.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within the scope defined during this session (the phase itself was newly scoped here, but nothing raised during discussion was pushed to a future phase).

</deferred>

---

*Phase: 06-public-site-content-sections-hero-carousel*
*Context gathered: 2026-07-27*
