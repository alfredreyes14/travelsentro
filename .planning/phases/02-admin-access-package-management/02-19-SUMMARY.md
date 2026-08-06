---
phase: 02-admin-access-package-management
plan: 19
subsystem: ui
tags: [css-custom-properties, design-tokens, tailwind-v4, shadcn-ui, color-system]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "02-13-PLAN.md's prior --primary/--secondary hex-value fix (which this plan's role-swap builds on top of)"
provides:
  - "Corrected Secondary(30%)/Accent(10%) color-role assignment: navy #021F4A now governs large persistent surfaces (site header/footer, admin sidebar background), marigold #F49314 now confined to small elements (buttons, badges, active-nav indicator, switch-on state)"
  - "01-UI-SPEC.md and 02-UI-SPEC.md updated to document the corrected role assignment as the source of truth"
affects: [ui-review, 02-UAT.md Test 44 retest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Color-role swaps in this codebase are values-only edits to app/globals.css's :root block -- component code references tokens by role name (bg-secondary/bg-primary/text-secondary), never hardcoded hex, so role reassignment never touches component files"

key-files:
  created: []
  modified:
    - .planning/phases/01-public-catalog-inquiry-entry-point/01-UI-SPEC.md
    - .planning/phases/02-admin-access-package-management/02-UI-SPEC.md
    - app/globals.css

key-decisions:
  - "Swapped which UI-SPEC role (Secondary vs Accent) each hex fills, rather than repeating 02-13's approach of swapping which hex sits in which CSS variable name -- 02-13 already tried the variable-name swap and it didn't fix the dominance problem because the 30%-large-surface role stayed marigold regardless of variable naming"
  - "No component file touched -- confirmed via grep that all consumers (header/footer, button/badge/switch variants, checklist.tsx) already reference tokens by role name"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "01-UI-SPEC.md and 02-UI-SPEC.md color-role tables, 'reserved for' headings, and 02-UI-SPEC.md's sidebar token mapping bullets swapped so Secondary(30%)=navy #021F4A, Accent(10%)=marigold #F49314"
    verification:
      - kind: other
        ref: "grep -oi '#021f4a'/'#f49314' occurrence counts against plan's acceptance criteria (01: 1x navy/2x marigold; 02: 4x navy/3x marigold)"
        status: pass
    human_judgment: false
  - id: D2
    description: "app/globals.css's --primary/--secondary and the 4 derived --sidebar-* tokens recalculated off the swapped values; stale 'Secondary teal' comment corrected; npm run build passes"
    verification:
      - kind: other
        ref: "grep assertions for exact token line values + zero 'teal' occurrences (all passed); npm run build (Compiled successfully, TypeScript passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Visual retest of 02-UAT.md Test 44: admin sidebar background and public site header/footer read as navy, marigold confined to small elements"
    verification: []
    human_judgment: true
    rationale: "Deferred per this project's human_verify_mode: end-of-phase -- requires visual inspection of the running app across both public site and admin panel, not determinable from static code/grep checks"

duration: 8min
completed: 2026-07-20
status: complete
---

# Phase 02 Plan 19: Admin Brand Color Hierarchy Swap Summary

**Swapped Secondary/Accent color-role assignment in both UI-SPEC docs and app/globals.css so navy #021F4A governs large surfaces (30% role) and marigold #F49314 is confined to small elements (10% role), reversing the marigold-dominant hierarchy reported in 02-UAT.md Test 44 -- no component code changed.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-20T09:xx:xxZ
- **Completed:** 2026-07-20T09:xx:xxZ
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 01-UI-SPEC.md and 02-UI-SPEC.md color-role tables now assign Secondary (30%, large-surface) to navy `#021F4A` and Accent (10%, small-element) to marigold `#F49314` -- the reverse of the previously-documented assignment
- app/globals.css's `--primary`/`--secondary` and all 4 derived `--sidebar-*` tokens recalculated off the swapped values, so the admin sidebar background and public site header/footer render navy while marigold is confined to primary buttons, badges, switch-on states, and the active sidebar-nav indicator
- Stale "Secondary teal" comment (a leftover from before 02-13's marigold fix) corrected to hue-neutral "Secondary color"
- `npm run build` compiles cleanly with zero component file changes -- confirms the token-name-based consumption pattern from Phase 1/2 propagates role reassignment automatically

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap Secondary/Accent role assignment in both UI-SPEC.md color tables** - `29c819e` (docs)
2. **Task 2: Swap --secondary/--primary and the 4 derived --sidebar-* tokens in app/globals.css** - `f923f06` (fix)

**Plan metadata:** (this commit, see below)

## Files Created/Modified
- `.planning/phases/01-public-catalog-inquiry-entry-point/01-UI-SPEC.md` - Secondary/Accent value cells and "reserved for" heading swapped
- `.planning/phases/02-admin-access-package-management/02-UI-SPEC.md` - Same swap plus sidebar token mapping bullets updated
- `app/globals.css` - `--primary`, `--secondary`, and 4 derived `--sidebar-*` tokens swapped; stale "teal" comment corrected

## Decisions Made
- Swapped which UI-SPEC *role* each hex fills (this plan) rather than repeating 02-13's approach of swapping which hex sits in which CSS *variable name* (that plan) -- confirmed via root-cause diagnosis in `.planning/debug/admin-brand-color-hierarchy-inverted.md` that the 30%-large-surface role staying marigold was the actual cause of visual dominance, independent of variable naming
- No component file touched -- verified via grep that every consumer (header/footer, button/badge/switch variants, `components/packages/checklist.tsx`) already references tokens by role name (`bg-secondary`/`bg-primary`/`text-secondary`), so the swap propagates automatically on rebuild

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria (grep occurrence counts, exact token line values, zero "teal" occurrences, `npm run build` success) passed on first attempt with no fixes needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Color-role swap is code-complete and build-verified; the remaining item is a visual retest of 02-UAT.md Test 44 across both the admin panel and the Phase 1 public site, deferred to end-of-phase human verification per `human_verify_mode: end-of-phase` (tracked as coverage item D3 above)
- No blockers introduced by this plan

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: .planning/phases/02-admin-access-package-management/02-19-SUMMARY.md
- FOUND: .planning/phases/01-public-catalog-inquiry-entry-point/01-UI-SPEC.md
- FOUND: .planning/phases/02-admin-access-package-management/02-UI-SPEC.md
- FOUND: app/globals.css
- FOUND commit: 29c819e
- FOUND commit: f923f06
