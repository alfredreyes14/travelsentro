---
phase: 02-admin-access-package-management
plan: 01
subsystem: database
tags: [supabase, postgres, rls, auth, migrations]

# Dependency graph
requires:
  - phase: 01-public-catalog-inquiry-entry-point
    provides: packages/package_photos/itinerary_days/package_inclusions/faq_facts schema + public-read RLS policies
provides:
  - "profiles/RLS/soft-delete migration file authored and committed (not yet pushed to the live Supabase project)"
affects: [02-02, 02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER plpgsql has_permission(uid, perm) helper to avoid RLS self-recursion on profiles' own policies"
    - "Split SELECT/UPDATE-admin-only RLS policies on profiles (never one combined FOR ALL policy) to close a self-privilege-escalation hole"

key-files:
  created:
    - supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql
  modified: []

key-decisions:
  - "Migration file fully authored and verified via static grep against all 8 acceptance-criteria counts (exact match); NOT yet pushed to the live Supabase project — blocked by an authentication gate in this isolated worktree (see Issues Encountered)"

patterns-established:
  - "has_permission(uid uuid, perm text) SECURITY DEFINER plpgsql function — MUST stay plpgsql (never sql) to avoid planner inlining reintroducing RLS recursion"

requirements-completed: []

coverage:
  - id: D1
    description: "profiles table + has_permission() helper + split SELECT/UPDATE RLS policies + auto-create trigger + soft-delete column + updated public-read policies + write RLS on all 5 package tables + storage.objects write RLS, authored in a single migration file"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "static grep verification against migration file: create table profiles (1), security definer (2), language plpgsql (2), add column deleted_at (1), can read all (5), can insert (5), can update (6), can delete (5), can delete packages (0) — all match plan's exact acceptance criteria"
        status: pass
    human_judgment: true
    rationale: "Migration SQL has not been pushed to or executed against the live Supabase project (Task 2 blocked — see below). Static grep confirms the file's text matches every acceptance-criteria count, but this does not prove the SQL is free of runtime errors (e.g. Postgres syntax errors, policy-name collisions, or RLS behavior bugs) until it actually runs against Postgres. A human/operator must run `supabase db push` from an environment with valid TravelSentro Supabase credentials and confirm success before this deliverable can be considered proven."

# Metrics
duration: 25min
completed: 2026-07-18
status: blocked
---

# Phase 2 Plan 01: Admin RBAC + Package Write Policies Migration Summary

**Authored (but not yet pushed) the `profiles`/RLS/soft-delete migration: a SECURITY DEFINER `has_permission()` helper, split admin-only profiles UPDATE policy, auto-create trigger, `packages.deleted_at` soft-delete column, and manage_packages-scoped write RLS across all 5 package tables + storage.objects.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-18T15:05:00Z
- **Completed:** 2026-07-18T15:30:00Z
- **Tasks:** 1 of 3 completed (Task 1 done; Tasks 2 and 3 blocked)
- **Files modified:** 1

## Accomplishments
- Authored `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql` covering all 8 required pieces: `profiles` table, `has_permission()` SECURITY DEFINER plpgsql helper, split SELECT/UPDATE-admin-only profiles policies (no self-escalation path), `handle_new_user()` trigger, `packages.deleted_at` column, soft-delete-aware public-read policy fixes on all 5 tables, manage_packages-scoped read/insert/update[/delete] RLS on all 5 package tables, and storage.objects write RLS for the `package-photos` bucket.
- Verified the migration file's text matches every one of the plan's 8 acceptance-criteria grep counts exactly (see Task Commits below).
- Discovered and documented a genuine authentication gate blocking Task 2 (push to live Supabase project) — see Issues Encountered.

## Task Commits

1. **Task 1: Author profiles/RLS/soft-delete migration** - `b145ae6` (feat)
2. Task 2: [BLOCKING] Push migration, regenerate types — **NOT STARTED** (blocked, see below)
3. Task 3: Admin bootstrap seed script (D-01, D-03, D-04) — **NOT STARTED** (depends on Task 2)

**Plan metadata:** committed in this same SUMMARY.md commit (worktree mode — STATE.md/ROADMAP.md updates deferred to the orchestrator)

## Files Created/Modified
- `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql` - profiles table, has_permission() SECURITY DEFINER helper, handle_new_user() trigger, packages.deleted_at column, updated public-read policies (soft-delete aware), manage_packages write RLS on all 5 package tables, storage.objects write RLS for package-photos

## Decisions Made
- Followed the plan exactly for the migration's structure and policy naming (no deviations in Task 1's SQL content).
- Did not attempt to author `scripts/seed-admin.ts` (Task 3) ahead of Task 2 completing, since Task 3's logic assumes the `profiles` table and `on_auth_user_created` trigger already exist live — writing untestable code against a schema that isn't deployed yet would be pure guesswork with no way to verify correctness in this session.

## Deviations from Plan

None in the authored SQL — Task 1 was executed exactly as specified, matching every acceptance criterion by exact count.

## Issues Encountered

**Task 2 ([BLOCKING] Push migration, regenerate types) could not be completed — genuine authentication gate, not a bug:**

This plan is executing inside an isolated git worktree (`.claude/worktrees/agent-a56099c501cf280bc`) that is missing the infrastructure needed to push to the live Supabase project:

1. **No linked Supabase project state.** `supabase/.temp/linked-project.json` (and sibling `.temp/` files) are gitignored and exist only in the main checkout, not in this worktree. The main checkout has a project linked (project ref `wisesrmizzgfbwlktoxh`).
2. **No `.env.local`.** This worktree has only the committed `.env.local.example` template (all values blank) — no real `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, or `SUPABASE_SERVICE_ROLE_KEY` are available. (The main checkout does have a populated `.env.local`, but it lives outside this worktree.)
3. **No `node_modules`.** `npm run seed:admin` (Task 3) and `supabase gen types typescript` both need the project's dependencies installed; this worktree has never had `npm install` run.
4. **Confirmed CLI auth mismatch.** Running `supabase link --project-ref wisesrmizzgfbwlktoxh` in this worktree returned:
   ```
   Unexpected error retrieving remote project status: {"message":"Your account does not have the necessary
   privileges to access this endpoint. For more details, refer to our documentation
   https://supabase.com/docs/guides/platform/access-control"}
   ```
   The Supabase CLI's currently-logged-in session in this environment (`supabase projects list`) only sees two projects (`staging-tryb`, `Tryb Dashboard`) under org `waznhijocjuyjcfjhmfl` — neither is TravelSentro's project. This is a real account-scoping issue, not something fixable by retrying or by any auto-fix rule (Rules 1-3 don't apply — this isn't a bug in the code, and Rule 3's package-manager-install exclusion analog applies: don't attempt workarounds around a legitimate access-control boundary).

**Per the authentication-gates protocol, this is a gate, not a failure.** Task 1's migration file is fully authored, verified, and committed. Tasks 2 and 3 require an execution environment with:
- A valid, linked Supabase CLI session (or `SUPABASE_ACCESS_TOKEN` env var) scoped to the TravelSentro project (`wisesrmizzgfbwlktoxh`), and
- A populated `.env.local` (or equivalent env vars) with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, and
- `npm install` run so `tsx` and the Supabase JS client are available for `scripts/seed-admin.ts`.

**Recommended resolution:** run Task 2 and Task 3 from the main checkout (which already has the linked project + `.env.local` + `node_modules`), or supply this worktree with equivalent Supabase CLI auth (`SUPABASE_ACCESS_TOKEN` for the correct account) plus a populated `.env.local` and `npm install`, then re-run `supabase db push`, `supabase gen types typescript --project-id wisesrmizzgfbwlktoxh > types/database.ts`, author `scripts/seed-admin.ts`, and provide `ADMIN_EMAIL`/`ADMIN_PASSWORD` (per this plan's `user_setup` block) before running `npm run seed:admin`.

## Known Stubs

None — Task 1's migration is complete SQL, not a stub. Tasks 2/3 are simply not started (blocked), not stubbed.

## User Setup Required

**Not yet reached.** This plan's `user_setup` block (ADMIN_EMAIL / ADMIN_PASSWORD for the bootstrap seed script) applies to Task 3, which could not be started because it depends on Task 2's live schema push. Once Task 2 completes in an environment with proper Supabase access, the operator will need to supply `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.local` before running `npm run seed:admin`.

## Next Phase Readiness

**Not ready.** This plan (02-01) is the required shared foundation for every other Phase 2 plan (all of 02-02 through 02-06 depend on the live `profiles` table, RLS policies, and a working Admin login). Task 1's migration file is committed and ready to push, but:
- The schema is **not yet live** on the Supabase project — `supabase migration list` has not been run/confirmed against the remote.
- `types/database.ts` has **not** been regenerated and still lacks the `profiles` table type.
- No Admin account exists yet — `scripts/seed-admin.ts` was not authored or run.

**Blocker for the orchestrator:** re-run (or resume) Task 2 and Task 3 of this plan from an environment with valid Supabase CLI credentials scoped to the TravelSentro project, a populated `.env.local`, and `npm install` completed, before dispatching any dependent Phase 2 plan.

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-18 (partial — Task 1 of 3)*
