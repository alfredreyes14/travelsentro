# Phase 5: Mobile Responsive & Visual Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 05-mobile-responsive-visual-polish
**Areas discussed:** Public site current state, Admin table mobile pattern, Admin sidebar nav on mobile, Styling scope

---

## Public Site Current State

| Option | Description | Selected |
|--------|-------------|----------|
| Specific broken spots | You've noticed particular pages/components that don't work well on phones | |
| General polish pass | Baseline responsiveness technically works, but could feel more refined | |
| Both | Fix known trouble spots AND do a general polish pass | |
| Other (free text) | — | ✓ |

**User's choice:** "The layout does not adjust when browser zoom level is adjusted" (free-text, not one of the presented options)
**Notes:** Reframed from a generic satisfaction question into a concrete reported bug — the site doesn't reflow correctly on browser zoom, not just at different device widths.

| Option | Description | Selected |
|--------|-------------|----------|
| Package list page | The homepage/catalog grid | |
| Package detail page | Itinerary, gallery, price/inclusions, FAQ | |
| Inquiry / contact form | The Formspree-backed inquiry form | |
| Everywhere / not sure — audit all public pages | Site-wide layout robustness issue | ✓ |

**User's choice:** Everywhere / not sure — audit all public pages

| Option | Description | Selected |
|--------|-------------|----------|
| No overflow/overlap up to 200% zoom (Recommended) | WCAG reflow-style bar | ✓ |
| Just fix what looks obviously broken | No formal target, spot-check a couple zoom levels | |
| You decide | Implementation sets a reasonable bar | |

**User's choice:** No overflow/overlap up to 200% zoom (Recommended)

---

## Admin Table Mobile Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked cards on phone (Recommended) | Each row becomes a card below a breakpoint | ✓ |
| Keep horizontal scroll | Simpler, keep existing <Table> everywhere | |
| Hybrid: fewer columns + scroll | Hide less-critical columns, keep scroll | |

**User's choice:** Stacked cards on phone (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, keep it (Recommended) | Cards get selectable state too, bulk messaging still works from phone | ✓ |
| No, desktop-only for bulk actions | Mobile card view read-only/individual actions only | |

**User's choice:** Yes, keep it (Recommended)
**Notes:** Preserves MSG-03/MSG-04 (bulk email/SMS) on mobile — flagged since Phase 4's crm-table.tsx row-selection depends on it.

---

## Admin Sidebar Nav on Mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Keep drawer, just polish it (Recommended) | The slide-out drawer mechanism already works | ✓ |
| Bottom tab bar instead | Replace/supplement with a fixed bottom nav bar | |
| You decide | Implementation picks whichever fits best | |

**User's choice:** Keep drawer, just polish it (Recommended)

---

## Styling Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Polish within current system (Recommended) | Keep locked palette/type, elevate shadows/spacing/states | ✓ |
| Broader visual refresh | Open to revisiting palette/type itself | |

**User's choice:** Polish within current system (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Empty & loading states | Skeletons and empty-state messaging | ✓ |
| Spacing & visual rhythm | Consistent padding/margins/alignment | ✓ |
| Hover/focus/active states | Deliberate interactive states | ✓ |
| Shadows & depth | Elevation for cards/dialogs/dropdowns | ✓ |

**User's choice:** All four selected (multiSelect)

---

## Claude's Discretion

- Exact mobile breakpoint values (Tailwind `sm`/`md`) for table↔card switch and sidebar drawer collapse
- Specific shadow/elevation scale, skeleton-loading component choice, hover/focus token values

## Deferred Ideas

None — discussion stayed within phase scope.

Aside (not phase scope): `.planning/debug/admin-brand-color-hierarchy-inverted.md` is a stale, uncommitted debug artifact for an issue already fixed in commits `f923f06`/`29c819e`. Flagged for cleanup, not carried into this phase.
