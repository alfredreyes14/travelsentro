---
phase: 02-admin-access-package-management
plan: 08
subsystem: database
tags: [supabase, postgres, plpgsql, rpc, transactions, rls]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "actions/packages.ts's writePackageChildren() (createPackage/updatePackage helper), can_manage_packages-scoped RLS policies on itinerary_days/package_inclusions/faq_facts from 02-01"
provides:
  - "public.write_package_children() SECURITY INVOKER Postgres RPC — atomic delete+reinsert of itinerary_days/package_inclusions/faq_facts in one transaction"
  - "actions/packages.ts's writePackageChildren() rewired to call the RPC exclusively, replacing the old 3-independent-call delete-then-insert path"
  - "types/database.ts regenerated with write_package_children in the Functions block"
affects: [package-editing, admin-panel, data-integrity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic multi-table child-row writes via a single SECURITY INVOKER plpgsql RPC (delete+reinsert wrapped in one function call = one transaction), called via supabase.rpc() instead of multiple independent PostgREST calls"

key-files:
  created:
    - supabase/migrations/20260718171228_atomic_package_children_write.sql
  modified:
    - actions/packages.ts
    - types/database.ts

key-decisions:
  - "Fixed via a genuine atomic transaction (new RPC function) rather than reordering to insert-first-then-delete-old, because faq_facts.package_id carries a UNIQUE constraint that a naive insert-before-delete would violate"
  - "Function is SECURITY INVOKER (not SECURITY DEFINER) so it stays subject to the same can_manage_packages-scoped RLS policies the calling Server Action's requirePermission() check already enforces"
  - "EXECUTE granted only to authenticated, never anon"

patterns-established:
  - "For any future multi-table child-row write that needs atomicity, use the write_package_children() migration as the template: SECURITY INVOKER plpgsql function, explicit authenticated-only EXECUTE grant, called via supabase.rpc()"

requirements-completed: [PKG-02]

coverage:
  - id: D1
    description: "public.write_package_children() exists on the live Supabase project as a SECURITY INVOKER plpgsql function with EXECUTE granted only to authenticated"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "supabase migration list (20260718171228 shown applied remotely) + grep counts on migration file (1x function def, 1x security invoker, 1x grant execute, 0x security definer)"
        status: pass
    human_judgment: false
  - id: D2
    description: "actions/packages.ts's writePackageChildren() calls the RPC exclusively — no independent multi-call delete-then-insert path remains"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "grep counts on actions/packages.ts (1x supabase.rpc(\"write_package_children\", 0x .from(\"itinerary_days\").delete())"
        status: pass
    human_judgment: false
  - id: D3
    description: "types/database.ts reflects the new function"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "grep -c write_package_children types/database.ts = 1 (Functions block); npm run build compiles cleanly"
        status: pass
    human_judgment: false
  - id: D4
    description: "A failed insert during a package edit can no longer leave the package's pre-existing itinerary/inclusions/FAQ content partially deleted"
    verification: []
    human_judgment: true
    rationale: "The atomicity guarantee comes from Postgres wrapping the delete+reinsert in one function-call transaction — confirmed by code/migration inspection, but no automated test simulates a mid-sequence insert failure against the live database to observe the rollback in action; recommend a human/UAT pass that deliberately triggers a constraint violation (or reviews the plpgsql logic) to fully confirm the rollback behavior end-to-end."

# Metrics
duration: 10min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 08: Atomic Package-Children Write Summary

**Replaced package editing's 3-independent-network-call delete-then-insert sequence with a single SECURITY INVOKER Postgres RPC (`write_package_children()`) so a partial insert failure can no longer silently destroy a package's existing itinerary/inclusions/FAQ content — pushed live to the linked Supabase project and types regenerated.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-19T01:11:00+08:00 (approx, Task 1 authoring)
- **Completed:** 2026-07-19T01:17:18+08:00
- **Tasks:** 2 completed
- **Files modified:** 3 (1 new migration, 2 modified: actions/packages.ts, types/database.ts)

## Accomplishments

- Authored `public.write_package_children()` — a SECURITY INVOKER plpgsql function that deletes and reinserts `itinerary_days`, `package_inclusions`, and `faq_facts` rows for a package inside a single Postgres transaction, with EXECUTE granted only to `authenticated`
- Rewired `actions/packages.ts`'s `writePackageChildren()` to call this RPC exclusively via `supabase.rpc("write_package_children", ...)`, removing the old 3-independent-call delete-then-insert path that could leave a package partially wiped on a mid-sequence failure
- Pushed the migration to the linked Supabase project (`wisesrmizzgfbwlktoxh`) and confirmed it applied via `supabase migration list`
- Regenerated `types/database.ts` via `supabase gen types typescript`; the `Functions` block now includes `write_package_children`
- Closes 02-REVIEW.md's **CR-02** finding end-to-end — the atomic write path is now live on the remote project, not just code-complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Author atomic write_package_children() migration + rewire actions/packages.ts** - `e3c2ee5` (feat)
2. **Task 2: [BLOCKING] Push migration, regenerate types** - `d6b606a` (feat)

**Plan metadata:** (this commit) `docs(02-08): complete atomic package-children write plan`

## Files Created/Modified

- `supabase/migrations/20260718171228_atomic_package_children_write.sql` - New migration defining `public.write_package_children()` (SECURITY INVOKER, `search_path = public`) and its `grant execute ... to authenticated` statement
- `actions/packages.ts` - `writePackageChildren()` now builds `p_itinerary`/`p_inclusions` payloads and calls the RPC in one round trip instead of 3 independent delete/insert calls
- `types/database.ts` - Regenerated; `Functions` block gained `write_package_children` with its `Args`/`Returns` signature

## Decisions Made

- Chose a genuine atomic-transaction RPC over reordering to insert-first-then-delete-old, because `faq_facts.package_id` carries a UNIQUE constraint that a naive insert-before-delete would violate while the old FAQ row still exists — the transactional RPC is the safer, more general fix and also covers `itinerary_days`/`package_inclusions`, which have no such constraint but benefit from the same atomicity guarantee
- Function is `security invoker` (not `security definer`) so it remains subject to the existing `can_manage_packages`-scoped RLS policies — no privilege escalation introduced
- `EXECUTE` granted only to `authenticated`, never `anon`, matching the RLS boundary the calling Server Action's `requirePermission()` check already enforces

## Deviations from Plan

None — plan executed exactly as written across both tasks.

## Issues Encountered

During Task 2's type regeneration, an initial attempt to redirect both stdout (to `types/database.ts`) and stderr (to a scratch log file) in one shell command failed because the stderr target path was on a read-only filesystem; bash had already truncated `types/database.ts` via the stdout redirect before the stderr redirect failed, leaving the file empty. Resolved by regenerating the types into the session scratchpad directory first (confirmed `write_package_children` present in the Functions block there), then writing that verified content into `types/database.ts` directly. No data was lost — the migration itself pushed successfully on the first attempt and was independently confirmed via `supabase migration list` before this file-handling issue occurred.

## User Setup Required

None - no external service configuration required. The migration was pushed directly by this agent to the already-linked Supabase project; no manual dashboard steps needed.

## Next Phase Readiness

CR-02 (the last of Phase 2's three scoped gap-closure items) is now fully closed — package edits are atomic end-to-end on the live project. This was the final plan (02-08) in Phase 2's gap-closure sequence (following 02-06 photo management and 02-07 permission-denied UX/password-reset). No blockers for closing out Phase 2.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260718171228_atomic_package_children_write.sql
- FOUND: actions/packages.ts
- FOUND: types/database.ts
- FOUND commit: e3c2ee5
- FOUND commit: d6b606a
