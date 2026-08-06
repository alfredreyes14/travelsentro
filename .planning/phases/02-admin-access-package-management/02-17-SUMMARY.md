---
phase: 02-admin-access-package-management
plan: 17
subsystem: auth
tags: [supabase, server-actions, rbac, availability]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "lib/auth/dal.ts's requireAdmin()/getProfile() (D-05 is_active re-check), actions/users.ts's deactivateAccount() (02-03/02-04), scripts/seed-admin.ts break-glass bootstrap (02-01)"
provides:
  - "deactivateAccount(id) guards rejecting self-deactivation and last-remaining-active-admin deactivation before any database write"
  - "scripts/seed-admin.ts existingAdmin lookup that requires is_active = true, making the break-glass recovery script actually recover from a self-/last-admin lockout"
affects: [admin-access, security-review, availability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action guard-before-write: capture caller profile from requireAdmin(), run explicit application-logic checks, return specific ActionResult errors before touching the database — independent of and in addition to RLS"

key-files:
  created: []
  modified:
    - actions/users.ts
    - scripts/seed-admin.ts

key-decisions:
  - "Guard order: self-deactivation check (unconditional, no DB query) before the last-remaining-admin check (requires a count query) — cheaper check first, and self-deactivation is rejected regardless of admin count"
  - "Last-admin count query counts OTHER active admins (role='admin', is_active=true, id != target) rather than checking the target's own role — works correctly whether the target is an admin or staff account, matching the plan's exact query shape"

requirements-completed: [AUTH-03]

coverage:
  - id: D1
    description: "deactivateAccount(id) rejects self-deactivation (caller.id === id) with a specific error message before any database write"
    requirement: AUTH-03
    verification:
      - kind: other
        ref: "grep -c 'caller.id === id' actions/users.ts == 1; grep -c \"You can't deactivate your own account.\" actions/users.ts == 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "deactivateAccount(id) rejects deactivating the last remaining active admin with a specific error message before any database write"
    requirement: AUTH-03
    verification:
      - kind: other
        ref: "grep -c \"Can't deactivate the last remaining admin.\" actions/users.ts == 1; grep -c 'eq(\"role\", \"admin\")' / 'eq(\"is_active\", true)' / 'neq(\"id\", id)' actions/users.ts == 1 each"
        status: pass
    human_judgment: true
    rationale: "Correct rejection of the last-admin scenario is a runtime state transition (requires an actual DB with exactly one active admin) that static grep/build checks cannot fully exercise; source inspection confirms the guard logic is present and structurally correct, but a live UAT pass against a real Supabase project is the stronger proof this phase's verifier should route to a human."
  - id: D3
    description: "scripts/seed-admin.ts's existingAdmin lookup requires is_active = true, so a deactivated-but-still-role='admin' profile no longer causes the script to silently no-op"
    requirement: AUTH-03
    verification:
      - kind: other
        ref: "grep -c \"eq('is_active', true)\" scripts/seed-admin.ts == 1; npx tsc --noEmit; npm run lint"
        status: pass
    human_judgment: true
    rationale: "The break-glass recovery path (npm run seed:admin against a real deactivated-admin profile) is an operational/runtime scenario best confirmed by a human running the actual recovery script once, not just by static type-check/lint of the added filter clause."

# Metrics
duration: 6min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 17: Self-/Last-Admin Deactivation Lockout Guard Summary

**deactivateAccount() now rejects self-deactivation and last-remaining-admin deactivation with specific error messages before any write, and seed-admin.ts's break-glass recovery check requires is_active = true so it can actually recover from that exact lockout.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-19T23:10:50+08:00
- **Completed:** 2026-07-19T23:12:38+08:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `actions/users.ts`'s `deactivateAccount(id)` captures the caller's own profile from `requireAdmin()` and rejects `caller.id === id` unconditionally, before any database write, with `"You can't deactivate your own account."`
- Before writing, `deactivateAccount(id)` also queries the count of other currently-active admins (`role='admin'`, `is_active=true`, `id != target`) and rejects the deactivation with `"Can't deactivate the last remaining admin."` if that count is zero
- The existing successful-deactivation path (RLS, `is_active` re-check on every request per D-05, `revalidatePath("/admin/users")`) is unchanged for the normal case
- `scripts/seed-admin.ts`'s `existingAdmin` lookup gained a `.eq('is_active', true)` filter, so a deactivated-but-still-`role='admin'` profile no longer causes the break-glass bootstrap script to silently no-op — it now falls through to find/create the `ADMIN_EMAIL` auth user and its existing promote-to-admin update reactivates a working login
- `npm run lint`, `npm run build`, and `npx tsc --noEmit` all pass with no new errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Reject self-deactivation and last-remaining-admin deactivation in deactivateAccount()** - `375594b` (fix)
2. **Task 2: Harden seed-admin.ts's break-glass recovery check to require is_active** - `af9cb16` (fix)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `actions/users.ts` - `deactivateAccount(id)` now captures `caller` from `requireAdmin()`, adds a self-deactivation guard and a last-remaining-active-admin guard, both returning specific `ActionResult` errors before any write
- `scripts/seed-admin.ts` - `existingAdmin` lookup now also filters `.eq('is_active', true)`, closing the recovery-script gap 02-REVIEW.md CR-02 identified

## Decisions Made
- Guard order: self-deactivation check (cheap, unconditional) runs before the last-remaining-admin check (requires a count query) — matches the plan's specified control flow exactly
- The last-admin count query excludes the target `id` from the active-admin count rather than special-casing on the target's own role, so it behaves correctly whether the target being deactivated is an admin or a staff account

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` specifications precisely; all acceptance-criteria grep counts and build/lint/typecheck gates passed on the first attempt with no fix-up needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Closes 02-VERIFICATION.md round 6 gap 3 and 02-REVIEW.md CR-02 (AUTH-03, T-02-40, T-02-41). Both threats are mitigated per this round's `security_block_on: high` gate. The last-remaining-admin and break-glass-recovery guards are structurally verified via source/build/lint checks in this session; a live end-to-end UAT run (attempt self-deactivation as the only admin in a real Supabase project, then run `npm run seed:admin` to confirm recovery) is recommended before closing this gap permanently, per the `human_judgment: true` coverage entries above.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: actions/users.ts
- FOUND: scripts/seed-admin.ts
- FOUND: .planning/phases/02-admin-access-package-management/02-17-SUMMARY.md
- FOUND: 375594b (Task 1 commit)
- FOUND: af9cb16 (Task 2 commit)
