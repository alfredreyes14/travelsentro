---
phase: 01-public-catalog-inquiry-entry-point
plan: 03
subsystem: database
tags: [supabase, seed-script, storage, tsx, placeholder-data]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Live Supabase schema (packages, package_photos, itinerary_days, package_inclusions, faq_facts) and public package-photos Storage bucket, with generated types/database.ts"
provides:
  - "3 fully-populated placeholder PH tour packages live in Supabase (Palawan Island Hopping, Siargao Surf & Island, Banaue Rice Terraces)"
  - "Idempotent, repo-committed seed script (npm run seed) that any future dev/CI run can re-execute safely"
  - "Real Storage-hosted placeholder photos exercising the same upload path Phase 2's admin photo-upload feature will use"
affects: [01-05, 01-06, 01-07, 02-package-admin]

# Tech tracking
tech-stack:
  added: []
  patterns: ["upsert-on-slug + delete/reinsert-children idempotent seed pattern", "Node WebSocket polyfill via undici for Supabase realtime client compat on Node 20"]

key-files:
  created: [scripts/seed.ts, "supabase/seed-assets/palawan-1.jpg", "supabase/seed-assets/palawan-2.jpg", "supabase/seed-assets/siargao-1.jpg", "supabase/seed-assets/siargao-2.jpg", "supabase/seed-assets/banaue-1.jpg", "supabase/seed-assets/banaue-2.jpg"]
  modified: [package.json]

key-decisions:
  - "Sourced 6 royalty-free placeholder JPGs (Lorem Picsum, seeded URLs for reproducibility) into supabase/seed-assets/ rather than hotlinking external URLs, so the seed script exercises the real Storage upload path"
  - "Seed script falls back to NEXT_PUBLIC_SUPABASE_URL when server-only SUPABASE_URL is unset, since both point at the same project and .env.local in this environment only defines the NEXT_PUBLIC_ variant"
  - "Polyfilled globalThis.WebSocket from the already-present undici transitive dependency instead of adding a new package, to work around @supabase/supabase-js unconditionally constructing a RealtimeClient (which requires a native WebSocket, absent in Node 20)"

patterns-established:
  - "scripts/*.ts dev-tooling pattern: service-role key read only from process.env, never imported from app/ or components/, run via tsx --env-file"

requirements-completed: [PUBL-01, PUBL-02, PUBL-03, PUBL-04, PUBL-08]

coverage:
  - id: D1
    description: "3 placeholder PH tour packages live in Supabase with complete itinerary/inclusions/faq/photo data"
    requirement: "PUBL-01"
    verification:
      - kind: other
        ref: "PostgREST count query via curl (Content-Range header): packages=3, package_photos=6, itinerary_days=10, package_inclusions=27, faq_facts=3"
        status: pass
    human_judgment: false
  - id: D2
    description: "Seed script is safely re-runnable with no row duplication (upsert-on-slug + delete/reinsert children)"
    requirement: "PUBL-01"
    verification:
      - kind: other
        ref: "npm run seed executed twice consecutively; package_id values identical across both runs, packages table count stayed at 3"
        status: pass
    human_judgment: false
  - id: D3
    description: "No service-role key leakage into app-bundled code"
    requirement: "PUBL-01"
    verification:
      - kind: other
        ref: "grep -rl SUPABASE_SERVICE_ROLE_KEY app/ components/ (no matches)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Placeholder photos are real Storage-hosted objects, publicly fetchable"
    requirement: "PUBL-02"
    verification:
      - kind: other
        ref: "Storage object list API confirms 6 objects (image/jpeg); direct curl of one public URL returns HTTP 200 with content-type image/jpeg"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-18
status: complete
---

# Phase 01 Plan 03: Package Seed Data Summary

**Idempotent `npm run seed` script populates 3 placeholder PH tour packages (Palawan, Siargao, Banaue) into the live Supabase project, including real Storage-hosted photos, itinerary days, inclusions/exclusions/bring items, and FAQ facts.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-18T12:31:00Z
- **Completed:** 2026-07-18T12:36:47Z
- **Tasks:** 2
- **Files modified:** 8 (scripts/seed.ts, package.json, 6 seed-asset JPGs)

## Accomplishments
- Wrote `scripts/seed.ts`: 3 distinct placeholder packages (Palawan Island Hopping — featured, Siargao Surf & Island, Banaue Rice Terraces), each with 2 Storage-hosted photos, 3-4 itinerary days, 8-9 inclusion/exclusion/bring items, and one faq_facts row
- Sourced and committed 6 placeholder JPGs (53KB-277KB each) into `supabase/seed-assets/`
- Added `npm run seed` (`tsx --env-file=.env.local scripts/seed.ts`) to `package.json`
- Ran the seed script twice against the live Supabase project linked in 01-02 — confirmed idempotency (identical package IDs both runs, `packages` table stayed at exactly 3 rows)
- Verified all 5 tables populated (packages=3, package_photos=6, itinerary_days=10, package_inclusions=27, faq_facts=3) and the `package-photos` Storage bucket holds 6 objects, each publicly fetchable (HTTP 200, `image/jpeg`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write scripts/seed.ts and source placeholder photo assets** - `0025fd4` (feat)
2. **Task 2: Run seed script and verify live data** - `a83dfc2` (fix — includes env-var fallback and WebSocket polyfill discovered while running Task 2)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `scripts/seed.ts` - Idempotent seed script: upserts packages on slug, deletes/reinserts child rows, uploads photos to Storage before inserting `package_photos` rows
- `supabase/seed-assets/palawan-1.jpg`, `palawan-2.jpg` - Palawan package photos
- `supabase/seed-assets/siargao-1.jpg`, `siargao-2.jpg` - Siargao package photos
- `supabase/seed-assets/banaue-1.jpg`, `banaue-2.jpg` - Banaue package photos
- `package.json` - Added `scripts.seed`

## Decisions Made
- Sourced placeholder photos from Lorem Picsum with fixed seed URLs (`picsum.photos/seed/<name>/1024/768.jpg`) for reproducible, royalty-free, appropriately-sized (under ~280KB) JPGs, rather than hotlinking — the seed script downloads once into the repo and re-uploads from disk on every run, exercising the real Storage upload path per D-01/D-02's intent
- `SUPABASE_URL` env var fallback to `NEXT_PUBLIC_SUPABASE_URL` — this project's `.env.local` only defines the `NEXT_PUBLIC_` variant for the URL (the service-role key is separate and server-only), and both point at the same Supabase project
- WebSocket polyfill sourced from the already-installed `undici` package (transitive via Next.js) rather than adding a new dependency, to satisfy `@supabase/supabase-js`'s unconditional `RealtimeClient` construction on Node 20 (which lacks a native global `WebSocket`, added in Node 22)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing SUPABASE_URL fallback**
- **Found during:** Task 2 (running `npm run seed` for the first time)
- **Issue:** Script only read `process.env.SUPABASE_URL`, but this project's `.env.local` only populates `NEXT_PUBLIC_SUPABASE_URL` (no separate server-only `SUPABASE_URL`); script threw "Missing SUPABASE_URL" immediately
- **Fix:** Fall back to `process.env.NEXT_PUBLIC_SUPABASE_URL` when `SUPABASE_URL` is unset
- **Files modified:** `scripts/seed.ts`
- **Verification:** Re-ran `npm run seed`, env validation passed
- **Committed in:** `a83dfc2` (Task 2 commit)

**2. [Rule 3 - Blocking] Polyfilled WebSocket for Node 20 compatibility**
- **Found during:** Task 2 (running `npm run seed` after fixing the env var)
- **Issue:** `@supabase/supabase-js` constructs a `RealtimeClient` inside `createClient()` unconditionally, which throws "Node.js detected but native WebSocket not found" on Node 20.19.4 (native global `WebSocket` was only added in Node 22) — this script never uses realtime, but the constructor still requires it
- **Fix:** Added `ensureWebSocketPolyfill()`, which dynamically imports `WebSocket` from the already-installed `undici` package and assigns it to `globalThis.WebSocket` before `createClient()` runs; restructured client creation to happen inside `seed()` after the polyfill (top-level `await` wasn't usable given the ad-hoc `tsc --noEmit scripts/seed.ts` invocation's module resolution)
- **Files modified:** `scripts/seed.ts`
- **Verification:** `npm run seed` completed successfully twice in a row against the live project; all row-count and Storage verifications passed
- **Committed in:** `a83dfc2` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary for the seed script to run at all in this environment; no scope creep — plan's data model, idempotency design, and acceptance criteria are all satisfied unchanged.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required. The seed script reused the existing `.env.local` credentials already populated by the user before this plan started.

## Next Phase Readiness
- 3 fully-populated placeholder packages are live in Supabase, ready for the package list (01-05/06) and detail page plans to query
- `npm run seed` is safely re-runnable at any point during Phase 1/2 development without creating duplicate rows
- No blockers for subsequent plans in this phase

---
*Phase: 01-public-catalog-inquiry-entry-point*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commit hashes (`0025fd4`, `a83dfc2`) verified present in git log.
