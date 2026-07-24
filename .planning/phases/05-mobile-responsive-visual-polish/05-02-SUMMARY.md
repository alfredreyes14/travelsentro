---
phase: 05-mobile-responsive-visual-polish
plan: 02
subsystem: ui
tags: [react, nextjs, tailwind, tanstack-table, admin-panel, responsive]

# Dependency graph
requires:
  - phase: 04-messaging-crm-automation
    provides: crm-table.tsx's TanStack Table wiring, enableRowSelection gated on !opted_out, MessageComposeDialog bulk-send entry point
provides:
  - Mobile (<768px) card-mode rendering for /admin/crm's contact table, with bulk selection and opt-out guard fully preserved
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS-only twin-markup table/card breakpoint switch (hidden md:block / md:hidden), first applied in this plan for admin tables"

key-files:
  created: []
  modified:
    - components/admin/crm-table.tsx

key-decisions:
  - "Card-mode select cell reuses the existing 'select' column's columnDef.cell via flexRender (row.getVisibleCells().find + flexRender) instead of re-authoring the opted_out/Tooltip/Checkbox JSX a second time — single implementation of the consent guard, closing the STRIDE tampering risk (T-05-02) flagged in the plan's threat model"
  - "hidden md:block class order reordered to keep 'hidden' and 'md:block' adjacent tokens (vs. interleaved with other utility classes) purely to satisfy the plan's literal grep acceptance gate — no visual/behavioral difference"

patterns-established:
  - "Twin-markup responsive table/card breakpoint: wrap the desktop <Table> in hidden md:block, add a sibling md:hidden card-stack mapping over the same table.getRowModel().rows — no useIsMobile() hook, zero SSR/hydration flash"

requirements-completed: []

coverage:
  - id: D1
    description: "Below 768px, /admin/crm renders contacts as stacked Cards instead of the desktop Table (D-03)"
    verification:
      - kind: unit
        ref: "grep -c 'md:hidden' components/admin/crm-table.tsx >= 1; grep -c 'hidden md:block' components/admin/crm-table.tsx >= 1"
        status: pass
      - kind: automated_ui
        ref: "manual DevTools resize to <768px on /admin/crm — deferred to end-of-phase UAT per workflow.human_verify_mode=end-of-phase"
        status: unknown
    human_judgment: true
    rationale: "Visual/interactive confirmation of actual card rendering, tap-to-navigate, and hover/active feedback requires a live browser check; deferred to end-of-phase UAT consolidation per project config (human_verify_mode=end-of-phase)."
  - id: D2
    description: "Bulk row-selection and 'Message Selected' bulk-send flow work identically in card mode, including the opted-out disabled-checkbox guard (D-04, MSG-03/MSG-04)"
    verification:
      - kind: unit
        ref: "grep confirms card branch calls flexRender on the 'select' column's own columnDef.cell (no second Checkbox/opted_out conditional authored)"
        status: pass
      - kind: automated_ui
        ref: "manual bulk-select + Message Selected + opted-out tooltip check on /admin/crm at <768px — deferred to end-of-phase UAT"
        status: unknown
    human_judgment: true
    rationale: "Confirming the opt-out guard and bulk compose dialog behave correctly in the browser requires live interaction; deferred to end-of-phase UAT per human_verify_mode=end-of-phase."
  - id: D3
    description: "Card-mode rows show the same hover/active visual feedback as desktop table rows, and the nested checkbox keeps its focus-visible ring (D-07)"
    verification:
      - kind: unit
        ref: "grep -c 'hover:bg-muted/50' components/admin/crm-table.tsx >= 2"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-24
status: complete
---

# Phase 05 Plan 02: Mobile card-mode retrofit for CRM contact table Summary

**CSS-only twin-markup table/card breakpoint added to `components/admin/crm-table.tsx`, reusing the existing TanStack Table selection state and opt-out-guarded select-column cell renderer via `flexRender` so mobile card mode carries zero duplicated consent-guard logic.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-24T15:22:00Z
- **Completed:** 2026-07-24T15:34:00Z
- **Tasks:** 2 (1 code task + 1 verification task)
- **Files modified:** 1

## Accomplishments
- `/admin/crm` now renders a stacked `Card`-per-row layout below the 768px `md` breakpoint, with the existing desktop `<Table>` wrapped in `hidden md:block` and a new sibling `md:hidden` card-stack branch
- Card-mode selection, the opted-out disabled-checkbox + tooltip guard, and the "Message Selected" bulk-send trigger all reuse the exact same `rowSelection` state and the select column's own `columnDef.cell` via `flexRender` — no second implementation of the consent guard exists in the file
- Card rows carry `hover:bg-muted/50 active:bg-muted` to match the desktop `TableRow`'s existing hover/tap feedback (D-07), and tap-to-navigate (`router.push`) mirrors the desktop row's `onClick`

## Task Commits

1. **Task 1: Add CSS-only card-mode branch to crm-table.tsx** - `30ed26d` (feat)

**Plan metadata:** committed with STATE/ROADMAP/REQUIREMENTS updates (see below)

_Note: Task 2 is a verification-only task (no code changes) — see "Issues Encountered" for how its human-check portion was handled._

## Files Created/Modified
- `components/admin/crm-table.tsx` - Added `Card` import, wrapped desktop Table render in `hidden md:block`, added new `md:hidden` Card-per-row branch that reuses the select column's cell via `flexRender`, renders name/email/status badge/tags/opted-out badge, and mirrors desktop's hover/active/tap-to-navigate behavior

## Decisions Made
- Reused the existing "select" column's `columnDef.cell` via `flexRender(selectCell.column.columnDef.cell, selectCell.getContext())` rather than re-authoring the opted_out/Tooltip/Checkbox JSX a second time, per the plan's explicit instruction and threat model (T-05-02) — this is the single point of truth for the consent guard in both render modes
- Reordered the desktop wrapper's Tailwind classes so `hidden` and `md:block` sit adjacent (`"hidden md:block overflow-hidden rounded-xl border border-border"`) instead of interleaved with the border/rounding utilities — purely to satisfy the plan's literal `grep -c 'hidden md:block'` acceptance gate; no visual or behavioral change

## Deviations from Plan

None — plan executed exactly as written. Task 1's grep acceptance criteria required the literal substring `hidden md:block`, which is a minor class-ordering detail not explicitly spelled out in the plan's action text; this was resolved inline while writing the code (not a deviation from intended behavior, just literal string matching for the automated gate).

## Issues Encountered

Task 2 ("Live verification of CRM card-mode selection, bulk send, and empty state") specifies a `<human-check>` verification block requiring interactive browser confirmation at `<768px` viewport. Per `.planning/config.json`'s `workflow.human_verify_mode: "end-of-phase"` (project-wide default, not specific to this plan), this human-check is deferred to the phase's end-of-phase UAT consolidation rather than performed mid-plan — consistent with `references/checkpoints.md`'s documented behavior for this config setting. The task's automated portion (`npm run lint`) was run now and passed with 0 errors (1 pre-existing, unrelated warning on the `useReactTable()` call that predates this plan's changes). The 5 numbered live-verification points from Task 2's action are captured in this SUMMARY's `coverage` block (D1/D2) as `human_judgment: true` deliverables for the verifier to route into `05-UAT.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `crm-table.tsx`'s twin-markup pattern (`hidden md:block` / `md:hidden`) is now the established precedent for `05-03` (users-table.tsx) and `05-04`/`sortable-package-list.tsx`, per 05-PATTERNS.md's shared-pattern section
- Live browser verification of card-mode selection/bulk-send/opt-out/navigation/empty-state (Task 2's 5 confirmations) remains open and carried forward to end-of-phase UAT (`05-UAT.md`)

---
*Phase: 05-mobile-responsive-visual-polish*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: components/admin/crm-table.tsx
- FOUND: .planning/phases/05-mobile-responsive-visual-polish/05-02-SUMMARY.md
- FOUND: 30ed26d (git log)
