---
phase: 05-mobile-responsive-visual-polish
plan: 05
subsystem: ui
tags: [tailwind, shadcn, sidebar, card, admin-panel, touch-targets, elevation]

# Dependency graph
requires:
  - phase: 05-mobile-responsive-visual-polish
    provides: "05-01 through 05-04's card-mode/mobile-responsive admin table work, plus 05-RESEARCH.md's ring-vs-shadow convention audit (Pitfall 4)"
provides:
  - "44px SidebarTrigger and 48px SidebarMenuButton touch targets on the admin dashboard shell"
  - "Header shadow separation on scroll (shadow-sm bg-background)"
  - "Consistent shadow-sm elevation cue on the shared Card primitive, distinct from floating-surface shadow-md/shadow-lg"
  - "Documented confirmation that sidebar chrome and remaining desktop TableRow usages already carry full hover/focus-visible/active-state coverage via existing shadcn defaults (D-07)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Call-site-only className overrides (size-11, size=\"lg\") on shadcn primitives instead of editing the primitive component file itself"
    - "Shared Card primitive elevation (shadow-sm) kept one step below floating-surface elevation (shadow-md/shadow-lg) to preserve an intentional in-flow vs floating visual hierarchy"

key-files:
  created: []
  modified:
    - "app/admin/(dashboard)/layout.tsx"
    - "components/ui/card.tsx"

key-decisions:
  - "SidebarTrigger overridden via className=\"size-11\" and SidebarMenuButton via size=\"lg\" from the call site only -- zero edits to components/ui/sidebar.tsx, matching the plan's D-05 call-site-only constraint"
  - "Card's shadow-sm appended alongside the existing ring-1 ring-foreground/10 (not replacing it) to preserve the ring/shadow distinction RESEARCH.md's Pitfall 4 flagged as intentional"
  - "Task 3 required no code changes -- hover/focus/active-state coverage for SidebarTrigger/SidebarMenuButton (via buttonVariants/sidebarMenuButtonVariants base classes) and TableRow (hover:bg-muted/50) was confirmed already complete via existing shadcn defaults, documented below rather than silently assumed"

patterns-established:
  - "Touch-target polish for shadcn primitives: override size via className/size prop from the call site, never edit the primitive file, to keep shared component logic untouched and diffable"

requirements-completed: []

coverage:
  - id: D1
    description: "SidebarTrigger renders at a 44px touch target (size-11) and all 3 nav SidebarMenuButtons render at the existing 48px \"lg\" size, with zero changes to components/ui/sidebar.tsx"
    verification:
      - kind: other
        ref: "grep -c 'size-11' \"app/admin/(dashboard)/layout.tsx\" == 1; grep -c 'size=\"lg\"' \"app/admin/(dashboard)/layout.tsx\" == 3; git diff --quiet components/ui/sidebar.tsx == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admin header gains shadow-sm bg-background for visual separation from scrolled content"
    verification:
      - kind: other
        ref: "grep -c 'shadow-sm' \"app/admin/(dashboard)/layout.tsx\" == 1"
        status: pass
    human_judgment: true
    rationale: "Visual shadow appearance and readability against the existing brand background is a subjective polish judgment best confirmed by a human viewing the rendered admin shell, not just a grep count."
  - id: D3
    description: "Every Card consumer across the admin panel and public site gains a subtle shadow-sm elevation cue while the existing ring-1 ring-foreground/10 is preserved, distinct from dialog/dropdown/select's shadow-md/shadow-lg"
    verification:
      - kind: other
        ref: "grep -c 'shadow-sm' components/ui/card.tsx == 1; grep -c 'ring-1 ring-foreground/10' components/ui/card.tsx == 1; grep -c 'shadow-xl' components/ui/card.tsx == 0"
        status: pass
    human_judgment: true
    rationale: "Whether the new shadow-sm reads as visually 'subtle and distinct' from shadow-md/shadow-lg floating surfaces is a design judgment best confirmed visually, not just by class-name presence."
  - id: D4
    description: "SidebarTrigger/SidebarMenuButton and all remaining desktop TableRow usages already carry complete hover/focus-visible/active-state styling via existing shadcn defaults (D-07), documented in this SUMMARY, with zero changes to components/ui/sidebar.tsx or components/ui/table.tsx"
    verification:
      - kind: other
        ref: "grep -c 'hover:bg-sidebar-accent' components/ui/sidebar.tsx >= 1; grep -c 'focus-visible:ring-2' components/ui/sidebar.tsx >= 1; grep -c 'hover:bg-muted/50' components/ui/table.tsx >= 1; git diff --quiet components/ui/sidebar.tsx components/ui/table.tsx == 0"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-07-24
status: complete
---

# Phase 05 Plan 05: Admin Sidebar Touch Targets & Card Elevation Polish Summary

**44px/48px touch targets on the admin sidebar trigger and nav buttons, a subtle shadow-sm elevation cue added to the shared Card primitive, and documented confirmation that D-07's hover/focus/active-state requirement was already satisfied by existing shadcn defaults for sidebar chrome and table rows.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-24T15:42:40Z
- **Completed:** 2026-07-24T15:44:54Z
- **Tasks:** 3 (2 code tasks + 1 documentation-only verification task)
- **Files modified:** 2

## Accomplishments
- Admin sidebar's `SidebarTrigger` now renders at a 44px touch target (`size-11`), matching the codebase's existing drag-handle convention in `package-list-row.tsx`
- All 3 admin nav `SidebarMenuButton`s (Packages/Contacts/Users) now use the existing 48px `lg` size variant already defined in `sidebarMenuButtonVariants`
- Admin header gains `shadow-sm bg-background` for subtle separation from scrolled content
- Shared `Card` primitive gains `shadow-sm` alongside its existing `ring-1 ring-foreground/10`, giving every Card consumer (mobile card rows from 05-02/05-03/05-04, empty-state cards, the unsubscribe page card) a consistent, brand-scale elevation cue with zero per-consumer changes
- Confirmed and documented (Task 3) that D-07's hover/focus/active-state requirement for sidebar chrome and remaining desktop table rows was already fully satisfied by existing shadcn defaults, requiring no additional styling

## Task Commits

Each task was committed atomically:

1. **Task 1: Sidebar trigger/nav tap-target + header spacing polish** - `46faaee` (feat)
2. **Task 2: Card component shadow/elevation polish** - `b60133c` (feat)
3. **Task 3: Verify and document hover/focus/active-state coverage for sidebar trigger/nav buttons and remaining table rows (D-07)** - no code commit (documentation-only task, recorded below; see "D-07 Determination" section)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/admin/(dashboard)/layout.tsx` - SidebarTrigger overridden to `size-11`; all 3 SidebarMenuButton nav items given `size="lg"`; header wrapper gains `shadow-sm bg-background`
- `components/ui/card.tsx` - Card's base className gains `shadow-sm` alongside the existing `ring-1 ring-foreground/10`

## D-07 Determination (Task 3)

Task 3 added no styling — it exists to make D-07's hover/focus/active-state coverage traceable rather than silently assumed. Two determinations were confirmed by reading the relevant base class strings directly (not by inference):

**(1) Sidebar trigger/nav buttons already fully covered.**
- `SidebarTrigger` (`components/ui/sidebar.tsx`) renders a `variant="ghost"` shadcn `Button`. `buttonVariants`' base string (`components/ui/button.tsx`) already includes `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` and `active:not-aria-[haspopup]:translate-y-px`; the `ghost` variant adds `hover:bg-muted hover:text-foreground` (plus `dark:hover:bg-muted/50`).
- `SidebarMenuButton` (the 3 nav items) is built on `sidebarMenuButtonVariants`, whose base string already includes `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`, `focus-visible:ring-2`, and `active:bg-sidebar-accent active:text-sidebar-accent-foreground`.
- Task 1's `className="size-11"` / `size="lg"` overrides only replace the `size` slot via `cva`'s variant system and merge additional classes via `cn()` — they do not remove or override these hover/focus-visible/active classes from the base string. Both controls keep full interactive-state coverage automatically, with zero additional styling required.

**(2) Remaining desktop table rows already fully covered.**
- `components/ui/table.tsx`'s shared `TableRow` component bakes `hover:bg-muted/50` into its base className (confirmed at line 60: `"border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted"`), applied automatically to every `<TableRow>` usage across `crm-table.tsx`, `users-table.tsx`, and `package-list-row.tsx` without any per-consumer styling. This predates Phase 5 and needed no change.

Both `components/ui/sidebar.tsx` and `components/ui/table.tsx` have zero diff from this plan (verified via `git diff --quiet components/ui/sidebar.tsx components/ui/table.tsx`).

## Decisions Made
- SidebarTrigger/SidebarMenuButton size overrides applied entirely from the call site (`app/admin/(dashboard)/layout.tsx`) — no edits to `components/ui/sidebar.tsx`, per D-05's call-site-only polish scope
- Card's `shadow-sm` appended alongside (not replacing) the existing `ring-1 ring-foreground/10`, preserving the intentional ring-vs-shadow distinction RESEARCH.md's Pitfall 4 flagged between in-flow Cards and floating surfaces
- Task 3 required no code changes — D-07's hover/focus/active-state requirement for sidebar chrome and table rows was confirmed (not assumed) already satisfied by existing shadcn base classes, documented above for traceability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 05 (mobile-responsive-visual-polish) plans 05-01 through 05-05 are all complete
- No outstanding code changes required; remaining Phase 05 work (if any) is end-of-phase human UAT verification per `workflow.human_verify_mode=end-of-phase`
- No blockers introduced by this plan

---
*Phase: 05-mobile-responsive-visual-polish*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: app/admin/(dashboard)/layout.tsx
- FOUND: components/ui/card.tsx
- FOUND: 46faaee (Task 1 commit)
- FOUND: b60133c (Task 2 commit)
