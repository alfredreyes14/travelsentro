---
phase: 02-admin-access-package-management
plan: 20
subsystem: auth
tags: [supabase, postgres, rls, trigger, server-actions, rbac]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "02-17's deactivateAccount() self-/last-admin guard pattern; 02-01's profiles table, has_permission(), and admin-only UPDATE RLS policy"
provides:
  - "updateAccount() rejects self-demotion and last-remaining-admin demotion at the application layer, mirroring deactivateAccount()'s 02-17 guards"
  - "public.prevent_self_last_admin_lockout() BEFORE UPDATE trigger on profiles as an independent database-level backstop"
affects: [admin-access, users-crud, security-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defense-in-depth pair: application-layer guard (Server Action, before any write) + database-layer BEFORE UPDATE trigger (independent of caller), both enforcing the same self-/last-admin invariant"

key-files:
  created:
    - supabase/migrations/20260720102022_prevent_self_last_admin_lockout.sql
  modified:
    - actions/users.ts

key-decisions:
  - "updateAccount()'s two new guards only apply when values.role !== \"admin\" (a role-removal edit) -- editing name/permissions with role unchanged, or promoting Staff to Admin, is completely unaffected"
  - "Last-admin count query mirrors deactivateAccount()'s exact shape (role='admin', is_active=true, id != target) rather than special-casing the target's current role"
  - "Trigger function's guard condition (OLD.role='admin' and OLD.is_active=true and (NEW.role distinct from 'admin' or NEW.is_active=false)) only matches an active admin's admin-role/active-status being removed -- returns NEW immediately for every other case, so Staff rows, already-inactive rows, promotions, and non-role edits on active admins are structurally unaffected"
  - "Trigger is security definer (matching has_permission()'s existing convention) but only ever fires for UPDATEs that already passed the admin-only 'admin can update profiles' RLS policy -- it is a second independent layer, not a replacement for RLS or the application guard"

requirements-completed: [AUTH-03]

coverage:
  - id: D1
    description: "updateAccount() rejects an Admin removing their own admin role via Edit Account, before any database write"
    requirement: "AUTH-03"
    verification:
      - kind: unit
        ref: "grep-verified acceptance criteria (exact occurrence counts) in actions/users.ts; npm run lint && npm run build pass"
        status: pass
    human_judgment: true
    rationale: "Automated checks confirm the guard code exists and compiles/lints cleanly, but exercising the actual reject-before-write behavior end-to-end (submit the Edit Account form as the signed-in admin editing their own row) requires a live browser session against the real admin panel and Supabase project -- queued as end-of-phase human verification item 4 per this project's human_verify_mode: end-of-phase convention."
  - id: D2
    description: "updateAccount() rejects removing the last remaining active admin's admin role via Edit Account, before any database write"
    requirement: "AUTH-03"
    verification:
      - kind: unit
        ref: "grep-verified acceptance criteria (exact occurrence counts) in actions/users.ts; npm run lint && npm run build pass"
        status: pass
    human_judgment: true
    rationale: "Same as D1 -- requires a live scenario with exactly one other admin account to exercise the last-admin branch; queued as end-of-phase human verification item 4."
  - id: D3
    description: "A profiles BEFORE UPDATE trigger independently rejects the same self-/last-admin admin-role-removal at the database layer, live on the linked Supabase project"
    requirement: "AUTH-03"
    verification:
      - kind: other
        ref: "supabase migration list confirms 20260720102022_prevent_self_last_admin_lockout applied remotely; grep-verified acceptance criteria (exact occurrence counts) in the migration file"
        status: pass
    human_judgment: true
    rationale: "Migration authorship and remote application are confirmed automatically, but exercising the trigger's actual reject-on-UPDATE behavior (e.g. via a raw SQL UPDATE bypassing the application layer) was not performed in this session and is not one of the four queued end-of-phase checklist items either -- the trigger's correctness rests on static review of its guard condition rather than a live-fired test. Flagging for reviewer awareness."
  - id: D4
    description: "Non-role-affecting edits (name, permissions) and Staff-to-Admin promotions continue to work exactly as before, unaffected by the new guards"
    requirement: "AUTH-03"
    verification:
      - kind: other
        ref: "static code review: both guards are gated behind `if (values.role !== \"admin\")`; trigger guard is gated behind OLD.role='admin' and OLD.is_active=true and the update removing that"
        status: pass
    human_judgment: true
    rationale: "Structural code review confirms the guard conditions cannot fire for these cases, but a live regression pass (edit a name/permission field, promote a Staff account) was not executed in this session -- queued implicitly within end-of-phase human verification item 4's \"then edit any account's name or permissions only\" step."
  - id: D5
    description: "Three carried-forward items (last-admin deactivation of a different account, seed-admin.ts break-glass recovery, 02-19 color-role visual retest) remain code-correct, confirmed via fresh regression assertions, not re-implemented"
    verification:
      - kind: unit
        ref: "grep-verified: deactivateAccount()'s 02-17 guard messages (actions/users.ts), seed-admin.ts's is_active filter, app/globals.css's #021f4a (x4) / #f49314 (x2) counts -- all unchanged"
        status: pass
    human_judgment: true
    rationale: "Regression assertions confirm the underlying code is unchanged, but the actual behaviors (deactivation flow, break-glass script run, visual color retest) require live human verification and were already deferred by 02-VERIFICATION.md round 8 -- carried forward as end-of-phase human verification items 1-3, not re-run in this session."

# Metrics
duration: 12min
completed: 2026-07-20
status: complete
---

# Phase 02 Plan 20: Self-/last-admin lockout guards for updateAccount() Summary

**Mirrored deactivateAccount()'s self-/last-admin demotion guards into updateAccount(), plus an independent `profiles` BEFORE UPDATE Postgres trigger backstop, closing AUTH-03's round-8 verification gap.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-20T10:09:00Z
- **Completed:** 2026-07-20T10:21:12Z
- **Tasks:** 3
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `updateAccount(id, values)` now rejects self-demotion ("You can't remove your own admin role.") and last-remaining-admin demotion ("Can't remove the last remaining admin's admin role.") before any database write, exactly mirroring `deactivateAccount()`'s existing 02-17 guard shape
- New `supabase/migrations/20260720102022_prevent_self_last_admin_lockout.sql` adds `public.prevent_self_last_admin_lockout()`, a `BEFORE UPDATE` trigger on `profiles` that independently rejects the same class of write at the database layer (closes 02-REVIEW.md WR-06's defense-in-depth gap, T-02-45) -- pushed and confirmed applied on the linked remote Supabase project (`staging`, ref `wisesrmizzgfbwlktoxh`)
- Confirmed via fresh regression assertions that the three round-8 carried-forward items (`deactivateAccount()`'s 02-17 guards, `seed-admin.ts`'s `is_active` filter, 02-19's color-role swap) are unchanged by this plan's edits
- All 4 end-of-phase human-verification items enumerated below, per this project's `human_verify_mode: end-of-phase` convention

## Task Commits

Each task was committed atomically:

1. **Task 1: Mirror deactivateAccount()'s self-/last-admin guards inside updateAccount()** - `8d44fd9` (fix)
2. **Task 2: [BLOCKING] Author and push a profiles BEFORE UPDATE trigger backstop** - `ffbd186` (feat)
3. **Task 3: Regression-confirm carried-forward guards and queue end-of-phase human verification** - no commit (verification-only task; no files modified, all acceptance-criteria greps passed against already-committed code)

**Plan metadata:** (this commit)

## Files Created/Modified
- `actions/users.ts` - `updateAccount()` now captures `caller` from `requireAdmin()` and adds two early-return guards (self-demotion, last-remaining-admin demotion) before its existing `profiles` UPDATE call
- `supabase/migrations/20260720102022_prevent_self_last_admin_lockout.sql` - new migration: `public.prevent_self_last_admin_lockout()` trigger function + `BEFORE UPDATE` trigger on `profiles`

## Decisions Made
- Both new `updateAccount()` guards are scoped to `values.role !== "admin"` so non-role edits and Staff-to-Admin promotions reach the existing UPDATE call completely unaffected, matching the plan's exact instruction
- The trigger function's guard condition only matches an active admin's `role`/`is_active` being removed (`OLD.role = 'admin' and OLD.is_active = true and (NEW.role is distinct from 'admin' or NEW.is_active = false)`), returning `NEW` immediately for every other case -- Staff rows, already-inactive rows, promotions, and non-role edits on active admins are structurally untouched by the trigger
- `security definer set search_path = public` used on the trigger function, matching `has_permission()`'s existing 02-01 convention; the trigger still only ever fires for UPDATEs that already passed the admin-only RLS policy, so this is an additive backstop, not a privilege escalation
- No `types/database.ts` regeneration performed -- per the plan, Supabase's type generator excludes `trigger`-returning functions from the typed RPC surface, and this function is never called directly from application code

## Deviations from Plan

None - plan executed exactly as written. Task 3 authored no code and modified no files, per its own explicit instruction ("This task authors no new production code and modifies no files").

## Issues Encountered
None.

## User Setup Required
None - no new external service configuration required. The migration was pushed directly to the already-linked Supabase project during this session.

## End-of-Phase Human Verification Queue

Per this project's `workflow.human_verify_mode: end-of-phase` config setting, the following 4 items are queued (not performed in this session):

1. **Last-remaining-admin deactivation (a DIFFERENT account, not self):** with exactly one other active admin remaining, attempt to deactivate that other admin via `/admin/users`. Confirm a toast shows "Can't deactivate the last remaining admin." and no write occurs. *(Carried forward from 02-VERIFICATION.md round 8.)*
2. **`scripts/seed-admin.ts` break-glass recovery:** manually set a `role='admin'` profile's `is_active` to `false` in Supabase, then run `npm run seed:admin`. Confirm it finds/recreates the `ADMIN_EMAIL` auth user and promotes it (`is_active: true`) to a working login instead of silently no-op'ing. *(Carried forward from 02-VERIFICATION.md round 8.)*
3. **Live visual retest of 02-19's color-role swap:** visit the admin panel (sidebar, login page, buttons, switches, badges) and the public site (header, footer, badges, active nav underline). Confirm navy `#021f4a` is now the dominant large-surface color and marigold `#f49314` is confined to small elements. *(Carried forward from 02-VERIFICATION.md round 8.)*
4. **Fix-and-retest of this plan's own new guards:** as the current Admin, attempt to edit your OWN account's role to "Staff" via Edit Account -- confirm it's rejected with "You can't remove your own admin role." and no write occurs. With exactly one other admin, attempt to edit THAT admin's role to "Staff" -- confirm it's rejected with "Can't remove the last remaining admin's admin role." Then edit any account's name or permissions only (role unchanged) -- confirm it still saves normally. *(New, this plan.)*

## Next Phase Readiness
- AUTH-03's round-8 FAILED gap is closed at both the application and database layers
- The new database trigger's live reject-on-UPDATE behavior has not been directly exercised (see coverage D3) -- worth a spot-check alongside human verification item 4 if a reviewer wants belt-and-suspenders confidence
- All outstanding Phase 2 human-verification items (4 total, listed above) remain queued for the end-of-phase verification pass

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-20*
