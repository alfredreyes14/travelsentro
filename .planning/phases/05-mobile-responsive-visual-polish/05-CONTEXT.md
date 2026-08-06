# Phase 5: Mobile Responsive & Visual Polish - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Retrofit the already-built admin CRM (Phases 2–4) and public site (Phase 1) so both work correctly on mobile/narrow viewports and under browser zoom, and elevate visual polish within the existing locked brand system. No new capabilities, no palette/typography changes — this phase is about correctness and polish of what already exists.

</domain>

<decisions>
## Implementation Decisions

### Public Site Responsiveness
- **D-01:** Primary driver is a concrete, reported bug: the public site layout does not reflow correctly when the browser's zoom level is changed (distinct from device-width media queries, which is what PUBL-09 already validated in Phase 1). Treat this as a site-wide audit across all public pages (package list, package detail, inquiry/Contact Us form) — not a single-page fix.
- **D-02:** Acceptance bar for the zoom fix: no horizontal overflow and no overlapping elements up to 200% browser zoom (WCAG reflow-style bar), verified across all public pages.

### Admin Data Tables
- **D-03:** `crm-table.tsx`, the packages table, and the users table switch to a stacked-card layout below the mobile breakpoint — not horizontal-scroll-only, not progressive column-hiding.
- **D-04:** Bulk row-selection (checkboxes) for messaging (MSG-03/MSG-04's bulk email/SMS) must be preserved in the mobile card layout — same multi-select-then-bulk-send flow as desktop, not a desktop-only feature.

### Admin Sidebar Navigation
- **D-05:** Keep the existing shadcn `SidebarProvider` slide-out drawer pattern for mobile (already functional via built-in `useIsMobile()`) — no bottom tab bar. Scope is polish only: trigger placement, tap targets, open/close feel.

### Styling Scope
- **D-06:** "Enhanced styling" means deeper polish within the existing locked brand system — `#021F4A` navy / `#F49314` marigold / `#FAF7F2` sand, Inter + Plus Jakarta Sans, weights 400/600 only. No palette or typography changes.
- **D-07:** Priority polish targets (all in scope): empty & loading states (tables/lists currently show bare states while loading or when empty), spacing & visual rhythm, hover/focus/active interactive states, and shadows/depth for cards/dialogs/dropdowns.

### Claude's Discretion
- Exact mobile breakpoint values (e.g., Tailwind's default `sm`/`md`) for switching table↔card layout and for sidebar drawer collapse — use standard Tailwind breakpoints unless research surfaces a reason to diverge.
- Specific shadow/elevation scale, skeleton-loading component choice, and hover/focus token values — implement using the Tailwind/shadcn conventions already established across Phases 1–4.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brand System
- `app/globals.css` — Locked color tokens (`--primary` #F49314 = Accent 10%, `--secondary` #021F4A = Dominant-surface 30%, `--background` #FAF7F2 = Dominant 60%), sidebar token mapping, radius scale
- `.planning/phases/01-public-catalog-inquiry-entry-point/01-UI-SPEC.md` — Original 60/30/10 color role table + typography scale (public site)
- `.planning/phases/02-admin-access-package-management/02-UI-SPEC.md` — Admin-specific color role table + sidebar token mapping + typography scale

### Prior Phase Decisions
- `.planning/phases/01-public-catalog-inquiry-entry-point/01-CONTEXT.md` — PUBL-09 baseline responsiveness scope (device-width only, not zoom)
- `.planning/phases/02-admin-access-package-management/02-CONTEXT.md` — D-16, confirms shadcn components already installed (`switch`, `carousel`, `sheet`, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/sidebar.tsx` — shadcn `SidebarProvider`/`Sidebar`/`SidebarTrigger`, already has built-in `useIsMobile()` detection and auto-drawer-collapse below the mobile breakpoint — reuse as-is, style/polish only
- `components/ui/card.tsx`, `table.tsx`, `skeleton.tsx` — already-installed shadcn primitives to build the stacked-card mobile layout and loading skeletons
- `components/admin/crm-table.tsx` — existing `@tanstack/react-table` wiring including `enableRowSelection` — extend this same selection state into the card-mode view rather than rebuilding it

### Established Patterns
- Tailwind v4 CSS-first tokens in `app/globals.css` — all styling changes must go through these tokens, never hardcoded hex (there was a past hardcoded-hex drift incident, already fixed in `02-13-PLAN.md`)
- 60/30/10 color-role convention (Dominant/Secondary/Accent) established in `01-UI-SPEC.md`/`02-UI-SPEC.md` — document any new UI additions against the same role table if colors are used in new ways

### Integration Points
- `app/admin/(dashboard)/layout.tsx` — `SidebarProvider` wraps all admin pages; drawer/trigger polish happens here
- `components/admin/crm-table.tsx`, packages table, and users table components — each needs its own card-layout breakpoint variant

</code_context>

<specifics>
## Specific Ideas

- User's own words on the public-site issue: "The layout does not adjust when browser zoom level is adjusted" — a literal, reproducible bug report, not a vague preference. Audit scope is "everywhere / not sure" per D-01.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

**Aside (not phase scope, flagged for cleanup):** `.planning/debug/admin-brand-color-hierarchy-inverted.md` is a stale, uncommitted debug artifact describing a brand-color hierarchy bug that was already fixed in commits `f923f06`/`29c819e` (per git log on `app/globals.css` and `02-UI-SPEC.md`). Safe to delete; not an open issue for this phase.

</deferred>

---

*Phase: 05-mobile-responsive-visual-polish*
*Context gathered: 2026-07-24*
