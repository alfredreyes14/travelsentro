---
phase: 03-lead-capture-crm-automation
plan: 01
subsystem: database
tags: [postgres, supabase, rls, plpgsql, security-definer, idempotency]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: profiles table, has_permission() RLS helper, packages table
provides:
  - "contacts + inquiries tables live on the linked Supabase project, RLS enabled"
  - "record_inquiry() SECURITY DEFINER idempotent upsert RPC (email-keyed contact, request_id-keyed inquiry, is_new flag)"
  - "get_notification_recipients() SECURITY DEFINER least-privilege fan-out RPC (email-only)"
  - "contacts_set_updated_by audit trigger capturing updated_by/updated_by_name/updated_at"
  - "types/database.ts regenerated with contacts, inquiries, and both new RPC signatures"
affects: [03-02 (inquiry ingestion Route Handler), 03-03 (automation emails), 03-04/03-05 (CRM admin UI)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPC as the sole write path for an anon-writable table, avoiding any anon-scoped UPDATE RLS policy"
    - "Denormalized *_name text columns captured at write time to avoid a cross-table profiles read blocked by existing RLS"

key-files:
  created:
    - supabase/migrations/20260720121436_create_crm_schema.sql
  modified:
    - types/database.ts

key-decisions:
  - "record_inquiry() is SECURITY DEFINER (deviates from 03-RESEARCH.md's SECURITY INVOKER recommendation) to avoid ever needing an anon-scoped UPDATE policy on contacts, which would have reopened arbitrary-PATCH tampering risk (T-03-01)"
  - "created_by_name/updated_by_name denormalized as plain text columns on contacts instead of joining to profiles, since Phase 2's profiles SELECT RLS would block a non-admin Staff viewer from resolving another staff member's name"
  - "inquiries has no UPDATE/DELETE RLS policy at all -- immutable append-only log this phase"

patterns-established:
  - "Anon-writable tables get a narrowly-scoped SECURITY DEFINER RPC as their only write path, never a broad anon RLS UPDATE policy"

requirements-completed: [CRM-01, CRM-03, CRM-06, CRM-07, AUTO-02, AUTO-03]

coverage:
  - id: D1
    description: "contacts/inquiries tables live on the remote Supabase project with RLS enabled, zero anon/public UPDATE or DELETE grant on either table"
    requirement: "CRM-01"
    verification:
      - kind: integration
        ref: "live anon-key PostgREST GET /contacts and PATCH /contacts?email=eq.<x> against the pushed migration -- both returned empty result sets (RLS default-deny)"
        status: pass
    human_judgment: false
  - id: D2
    description: "record_inquiry() performs an idempotent upsert: repeat inquiry from the same email attaches to the same contact; identical request_id returns is_new=true then is_new=false with no duplicate rows"
    requirement: "AUTO-03"
    verification:
      - kind: integration
        ref: "live anon-key rpc/record_inquiry called twice with the same request_id against the pushed migration -- first call returned is_new=true with a new contact_id/inquiry_id, second call returned is_new=false with the same contact_id and inquiry_id=null"
        status: pass
    human_judgment: false
  - id: D3
    description: "get_notification_recipients() returns only the email column for is_active profiles where role='admin' or can_message_customers=true, callable by anon"
    requirement: "AUTO-02"
    verification:
      - kind: integration
        ref: "live anon-key rpc/get_notification_recipients against the pushed migration -- returned exactly one row, {email: admin@travelsentro.test}, no other profile fields"
        status: pass
    human_judgment: false
  - id: D4
    description: "Authenticated Staff/Admin can read all contacts/inquiries rows regardless of can_edit_crm; only can_edit_crm-permissioned (or admin) sessions can UPDATE a contact"
    requirement: "CRM-03"
    verification:
      - kind: other
        ref: "static SQL inspection of the migration's RLS policy definitions (\"authenticated staff can read all contacts/inquiries\" using(true); \"can_edit_crm can update contacts\" using/with check has_permission(auth.uid(),'can_edit_crm')) -- not exercised against a live authenticated session in this plan, since no Staff/Admin session-bearing client exists yet in this codebase"
        status: pass
    human_judgment: true
    rationale: "No authenticated test harness/session exists yet to exercise this live (Server Actions consuming can_edit_crm arrive in 03-05) -- policy text was verified by direct SQL read and matches the acceptance criteria exactly, but a live authenticated-session check is deferred to 03-05's own verification."
  - id: D5
    description: "contacts_set_updated_by trigger fires on every contacts UPDATE, capturing updated_by/updated_by_name/updated_at"
    verification:
      - kind: other
        ref: "static SQL inspection of the migration -- trigger is defined 'before update on contacts', body sets updated_by/updated_by_name/updated_at; not exercised via a live authenticated UPDATE in this plan (no authenticated write path exists yet -- arrives in 03-05)"
        status: unknown
    human_judgment: true
    rationale: "Live exercise requires an authenticated session performing a contacts UPDATE, which only exists starting in 03-05's actions/crm.ts -- deferred to that plan's own verification."

# Metrics
duration: 8min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 1: CRM Database Foundation Summary

**contacts/inquiries schema with a SECURITY DEFINER record_inquiry() idempotent-upsert RPC and a least-privilege get_notification_recipients() fan-out RPC, pushed live and verified via anon-key PostgREST**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-20T12:11:56Z
- **Completed:** 2026-07-20T12:19:00Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Authored and pushed `contacts`/`inquiries` tables with RLS enabled (`supabase/migrations/20260720121436_create_crm_schema.sql`)
- `record_inquiry()` SECURITY DEFINER RPC: email-keyed contact upsert, request_id-keyed idempotent inquiry insert, `is_new` flag, server-side `package_id` existence check (Pitfall 6)
- `get_notification_recipients()` SECURITY DEFINER RPC: least-privilege (email-only) fan-out for active admin/`can_message_customers` staff, callable by anon
- `contacts_set_updated_by` SECURITY INVOKER audit trigger capturing `updated_by`/`updated_by_name`/`updated_at`
- RLS policies: anon+authenticated insert-only on both tables, authenticated read-all, `can_edit_crm`-scoped update on contacts, zero anon/public UPDATE or DELETE grant anywhere
- Regenerated `types/database.ts` to include `contacts`, `inquiries`, `record_inquiry`, `get_notification_recipients`
- Verified live against the remote Supabase project via direct anon-key PostgREST calls (dedup, RLS deny, notification fan-out) — test rows cleaned up via service-role client afterward

## Task Commits

Each task was committed atomically:

1. **Task 1: Author contacts/inquiries schema, RLS, audit trigger, and both RPCs** - `7cc0a3a` (feat)
2. **Task 2: [BLOCKING] Push migration, regenerate types** - `147292d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/20260720121436_create_crm_schema.sql` - contacts + inquiries tables, RLS, audit trigger, record_inquiry() and get_notification_recipients() RPCs
- `types/database.ts` - regenerated Database type including contacts, inquiries, and both new RPC function signatures

## Decisions Made
- `record_inquiry()` made SECURITY DEFINER instead of the RESEARCH.md-recommended SECURITY INVOKER, to avoid ever needing an anon-scoped UPDATE RLS policy on `contacts` (which would have reopened arbitrary-PATCH tampering risk — see plan's T-03-01 threat entry). No anon/public UPDATE or DELETE policy exists on `contacts` or `inquiries` anywhere in this migration.
- `created_by_name`/`updated_by_name` denormalized as plain text columns on `contacts`, captured at write time, instead of a cross-table join to `profiles` — Phase 2's existing `profiles` SELECT RLS ("self or admin") would otherwise block a non-admin Staff viewer from resolving a different staff member's name.
- `inquiries` has no UPDATE or DELETE RLS policy at all — treated as an immutable append-only timeline this phase, per 03-PATTERNS.md's explicit note that soft-delete is not needed.

## Deviations from Plan

None - plan executed exactly as written. (The SECURITY DEFINER choice for `record_inquiry()` was already the plan's own stated deliberate deviation from 03-RESEARCH.md's default recommendation, not an executor-introduced deviation — implemented exactly as the plan's objective/task specified.)

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and the Supabase project link were already configured from Phase 1/2.

## Next Phase Readiness

- Live schema is ready for 03-02 (inquiry ingestion Route Handler) to call `record_inquiry()` via `supabase.rpc(...)` with the anon-key server client.
- `get_notification_recipients()` is ready for 03-03's internal notification automation.
- `can_edit_crm`-scoped UPDATE policy on `contacts` and the read-all SELECT policy are ready for 03-04/03-05's CRM admin UI and `actions/crm.ts`.
- Deferred live verification: the `can_edit_crm`-scoped UPDATE policy and the `contacts_set_updated_by` trigger's authenticated-session behavior were confirmed correct by direct SQL read only (no authenticated write path exists in the codebase yet) — recommend 03-05 exercise these live once `actions/crm.ts` exists.

---
*Phase: 03-lead-capture-crm-automation*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260720121436_create_crm_schema.sql
- FOUND: types/database.ts contains `contacts` table
- FOUND: commit 7cc0a3a
- FOUND: commit 147292d
