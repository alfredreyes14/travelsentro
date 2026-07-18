---
phase: 01-public-catalog-inquiry-entry-point
plan: 02
subsystem: database
tags: [supabase, postgres, rls, storage, postgrest, sql]

# Dependency graph
requires:
  - phase: 01-public-catalog-inquiry-entry-point (plan 01)
    provides: Next.js scaffold, lib/supabase/server.ts + client.ts factories, .env.local.example
provides:
  - Live Supabase Postgres schema (5 tables) pushed to the linked remote project
  - RLS enabled on all 5 tables with public-SELECT-only policies (default-deny writes)
  - Public `package-photos` Storage bucket with public-read policy
  - Generated `types/database.ts` for type-safe Supabase queries in later plans
affects: [01-03, 01-04, 01-05, 01-06, 01-07]

# Tech tracking
tech-stack:
  added:
    - Supabase CLI 2.100.1 (local dependency, not an npm package — used for migrations/link/push/gen types)
  patterns:
    - "supabase/migrations/*.sql as the single source of truth for schema — types/database.ts is regenerated, never hand-edited"
    - "RLS default-deny: every table gets exactly one 'public read' SELECT policy and zero write policies, so Phase 2 adds write policies additively without touching this migration"
    - "Storage writes happen only via the service-role key (seed script, next plan), which bypasses RLS — no anon insert/update policy on storage.objects"

key-files:
  created:
    - supabase/config.toml
    - supabase/.gitignore
    - supabase/migrations/20260718114727_create_package_schema.sql
    - types/database.ts

key-decisions:
  - "Ran `supabase init` fresh (no prior supabase/ directory existed from plan 01-01) before scaffolding the migration."
  - "Verified RLS behavior live via direct PostgREST calls (curl with anon key) rather than trusting the migration's static SQL alone: confirmed 200/empty-array SELECT on all 5 tables, 401 on an anon INSERT attempt against `packages`, and 200/empty-array on `storage/v1/object/list/package-photos` (proves both table RLS and the storage public-read policy are live, not just written)."

requirements-completed: [PUBL-01, PUBL-02, PUBL-03, PUBL-04, PUBL-08]

coverage:
  - id: D1
    description: "All 5 package-domain tables (packages, package_photos, itinerary_days, package_inclusions, faq_facts) exist in the live Supabase project with RLS enabled and public-SELECT-only policies"
    requirement: "PUBL-02"
    verification:
      - kind: other
        ref: "supabase migration list (remote matches local 20260718114727); grep counts on migration file (5x create table, 5x enable row level security, 5x for select using (true), 0x for insert/update/delete)"
        status: pass
      - kind: other
        ref: "curl PostgREST anon-key SELECT on all 5 tables -> 200 with empty result set"
        status: pass
      - kind: other
        ref: "curl PostgREST anon-key INSERT on packages -> 401 (rejected by RLS)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Public Storage bucket package-photos exists and serves public read access"
    requirement: "PUBL-03"
    verification:
      - kind: other
        ref: "curl storage/v1/object/list/package-photos with anon key -> 200, []"
        status: pass
    human_judgment: false
  - id: D3
    description: "types/database.ts reflects the pushed schema (generated, not hand-written)"
    requirement: "PUBL-04"
    verification:
      - kind: other
        ref: "supabase gen types typescript --project-id $SUPABASE_PROJECT_REF > types/database.ts; grep confirms packages, package_photos, itinerary_days, package_inclusions, faq_facts all present"
        status: pass
    human_judgment: false
  - id: D4
    description: "package_inclusions.kind column enforces the 3-value check constraint (included/excluded/bring), backing the faq_facts 'what to bring' data shape decision (D-08/D-09)"
    requirement: "PUBL-08"
    verification:
      - kind: other
        ref: "grep \"check (kind in\" on migration file -> 1 match listing 'included','excluded','bring'"
        status: pass
    human_judgment: false

# Metrics
duration: 40min
completed: 2026-07-18
status: complete
---

# Phase 1 Plan 2: Live Supabase Package Schema Summary

**5-table normalized package catalog schema (packages, package_photos, itinerary_days, package_inclusions, faq_facts) pushed live to Supabase with public-read-only RLS and a public package-photos Storage bucket, plus generated `types/database.ts`.**

## Performance

- **Duration:** ~40 min (includes a human-action checkpoint pause waiting for the user to populate Supabase project credentials in `.env.local`)
- **Tasks:** 2/2 completed
- **Files modified:** 4 created (`supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/20260718114727_create_package_schema.sql`, `types/database.ts`)

## Accomplishments

- Authored the complete Phase 1 database schema: 5 normalized tables (packages, package_photos, itinerary_days, package_inclusions, faq_facts), each with RLS enabled and exactly one public-SELECT-only policy — no write policies anywhere, so Phase 2's authenticated-write policies can be added purely additively.
- Created the public `package-photos` Storage bucket with a public-read `storage.objects` policy; writes are reserved exclusively for the service-role key used by the seed script in the next plan.
- Linked the local project to the live Supabase project non-interactively (`SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`), pushed the migration, and confirmed it applied remotely via `supabase migration list`.
- Generated `types/database.ts` from the live schema via `supabase gen types typescript`, and live-verified RLS/storage policy behavior with direct anon-key PostgREST/Storage API calls (not just static SQL inspection).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author package schema migration (5 tables, RLS, storage bucket)** - `26a76eb` (feat)
2. **Task 2: [BLOCKING] Push schema to Supabase, generate types, verify live** - `fb56382` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `supabase/config.toml` - Supabase CLI local project config (from `supabase init`)
- `supabase/.gitignore` - excludes `.branches`, `.temp`, and local env-key files from git
- `supabase/migrations/20260718114727_create_package_schema.sql` - the 5-table schema, RLS policies, and storage bucket + policy
- `types/database.ts` - generated `Database` type covering all 5 tables, ready for typed Supabase queries in later plans

## Decisions Made

- No `supabase/` directory existed from plan 01-01, so `supabase init` was run fresh at the start of Task 1.
- Verified RLS and storage policies live (not just by reading the SQL) using direct `curl` calls against the PostgREST and Storage HTTP APIs with the anon key: all 5 tables return 200/empty-array on SELECT, `packages` returns 401 on an anon INSERT attempt, and `storage/v1/object/list/package-photos` returns 200/`[]` for the anon key — confirming both RLS default-deny and the storage public-read policy are functioning on the live project, not just present in the migration text.
- `.env.local.example` (already created in plan 01-01) was reviewed and confirmed to already list all 4 required app-runtime vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) with no real values — no changes needed. `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF` were correctly excluded (CLI-operator-only, not app runtime config).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Task 2 initially hit its documented `[BLOCKING]` gate: no Supabase credentials (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and the 4 app env vars) were present in the execution environment. Per the plan's own instruction ("do not proceed with the push until [they] are available"), execution paused and returned a structured checkpoint (human-action) rather than fabricating or guessing credentials. The user subsequently populated `.env.local` with all 6 required values; credentials were sourced inline per-command (`set -a; source .env.local; set +a`) and never printed, echoed, or committed. Execution then resumed and completed Task 2 without further issues.

## User Setup Required

None further - the Supabase project is now live, linked, and populated with the pushed schema. `.env.local` (gitignored, confirmed via `git check-ignore`) holds the working credentials for local development; no `USER-SETUP.md` was generated since this plan's `user_setup` block was fully satisfied during execution.

## Next Phase Readiness

- The live Supabase schema, RLS policies, storage bucket, and generated types are all in place and verified against the running project — plan 01-03 (seed script) can now insert real package data via the service-role key with zero additional schema work.
- `types/database.ts` is ready to import into `lib/supabase/server.ts`/`client.ts` for typed queries in the package list/detail plans.
- No blockers carried forward from this plan.

---
*Phase: 01-public-catalog-inquiry-entry-point*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created files verified present on disk (`supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/20260718114727_create_package_schema.sql`, `types/database.ts`, this SUMMARY.md). Both task commits (`26a76eb`, `fb56382`) verified present in `git log`.
