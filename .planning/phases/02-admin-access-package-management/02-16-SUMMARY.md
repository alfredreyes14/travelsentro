---
phase: 02-admin-access-package-management
plan: 16
subsystem: admin
tags: [nextjs, server-actions, supabase-storage, file-upload]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management
    provides: "02-06's package_photos Server Actions (actions/package-photos.ts) and photo-manager.tsx UI, whose real-world photo-size behavior this plan fixes"
provides:
  - "next.config.ts experimental.serverActions.bodySizeLimit raised to 10mb"
  - "photo-manager.tsx sends one uploadPhotos() Server Action call per selected file (sequential, not batched)"
affects: [package-photo-upload, admin-package-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Actions carrying file uploads must chunk one-file-per-call when the underlying insert computes an ordering value (display_order) from a fresh query at call time -- concurrent calls would race; sequential for-of awaiting avoids this without needing a DB-side lock"

key-files:
  created: []
  modified:
    - next.config.ts
    - components/admin/photo-manager.tsx

key-decisions:
  - "Raised experimental.serverActions.bodySizeLimit to a bounded '10mb' (not unlimited) per 02-REVIEW.md CR-01's own suggested value, combined with per-file chunking rather than relying on either fix alone"
  - "Per-file uploads awaited sequentially via for-of (never Promise.all) because uploadPhotos() computes each file's display_order from the current max queried fresh at call start -- concurrent calls would collide on the same value"

patterns-established: []

requirements-completed: [PKG-01, PKG-02]

coverage:
  - id: D1
    description: "next.config.ts raises the Server Action body size limit to 10mb via the config key confirmed correct for this project's installed Next.js 16.2.10 (bundled docs + config-schema.js source)"
    requirement: "PKG-01"
    verification:
      - kind: other
        ref: "grep -c 'bodySizeLimit' next.config.ts -eq 1; grep -c '10mb' next.config.ts -eq 1; npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "photo-manager.tsx sends one uploadPhotos() call per selected file, awaited sequentially, instead of one batched call for the whole selection"
    requirement: "PKG-02"
    verification:
      - kind: other
        ref: "grep checks in 02-16-PLAN.md Task 2 verify block; npm run lint; npm run build"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failure on one file in a multi-file selection no longer discards already-uploaded files from local state; live confirmation with a realistic phone/DSLR-sized photo is a human-verification item"
    verification: []
    human_judgment: true
    rationale: "Code-level fix (per-file setPhotos inside the loop) is verified by inspection and the automated build/lint gates, but actually exercising a real oversized-photo upload against the live Supabase Storage bucket requires human/browser verification, already tracked in 02-VERIFICATION.md's human_verification array under human_verify_mode: end-of-phase -- not re-run here."

# Metrics
duration: 12min
completed: 2026-07-19
status: complete
---

# Phase 02 Plan 16: Photo Upload Body-Size and Batching Fix Summary

**Raised Next.js Server Action body size limit to 10mb and switched photo-manager.tsx from one oversized batched upload call to sequential per-file Server Action calls, closing 02-REVIEW.md CR-01**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-19T15:07:00Z
- **Completed:** 2026-07-19T15:09:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `next.config.ts` now sets `experimental.serverActions.bodySizeLimit` to `"10mb"`, verified against the installed Next.js 16.2.10's bundled docs (`node_modules/next/dist/docs/.../serverActions.md`) and its own config schema (`config-schema.js`) rather than assumed from training data
- `components/admin/photo-manager.tsx`'s `handleFilesSelected` now calls `uploadPhotos(packageId, [file])` once per selected file inside a sequential `for...of` loop (never `Promise.all`, since `uploadPhotos` computes each file's `display_order` from a freshly-queried max at call time)
- Partial-success handling: each successful per-file upload appends to local `photos` state immediately inside the loop, so a failure on a later file no longer discards already-uploaded files from view; separate success/failure toasts summarize counts

## Task Commits

Each task was committed atomically:

1. **Task 1: Raise the Server Action body size limit in next.config.ts** - `81f16bb` (fix)
2. **Task 2: Stop batching every selected photo into one oversized Server Action call** - `98fc333` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified
- `next.config.ts` - Added `experimental.serverActions.bodySizeLimit: "10mb"` alongside the existing `images.remotePatterns` block (unchanged)
- `components/admin/photo-manager.tsx` - `handleFilesSelected` now loops per file with sequential `uploadPhotos(packageId, [file])` calls instead of one batched `uploadPhotos(packageId, files)` call; partial-success state and split success/failure toasts added

## Decisions Made
- Raised the body size limit to a bounded `"10mb"` (not unlimited) matching 02-REVIEW.md CR-01's own suggested value, applied together with per-file chunking rather than relying on either fix alone (limit-only still caps out on large multi-file batches; chunking-only still fails on a single realistically-large photo)
- Per-file `uploadPhotos()` calls awaited sequentially via `for...of`, never `Promise.all`, because `uploadPhotos()` queries the current max `display_order` fresh at the start of each call -- concurrent calls would race and collide on the same value

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed literal "10mb" from an explanatory code comment to satisfy the plan's exact-occurrence acceptance check**
- **Found during:** Task 1 (next.config.ts edit)
- **Issue:** My first draft of the added comment explaining the rationale for the change also said "10mb", which pushed the file's total `10mb` string-match count to 2, failing the plan's stated acceptance criterion of "exactly 1 occurrence of 10mb"
- **Fix:** Reworded the comment to describe the change without repeating the literal string "10mb" (kept the actual `bodySizeLimit: "10mb"` config value)
- **Files modified:** next.config.ts
- **Verification:** `grep -c '10mb' next.config.ts` returns 1
- **Committed in:** 81f16bb (Task 1 commit)

### Pre-existing Verification Script Discrepancy (documented, not auto-fixed)

Task 1's literal `<verify>` command includes `test "$(grep -c 'package-photos' next.config.ts)" -eq 1`. This fails against both the pre-edit and post-edit file: the pre-existing `images.remotePatterns` block already contains 2 occurrences of the string `"package-photos"` (one in an explanatory comment on line 10, one in the `pathname` value on line 14) -- a condition that predates this plan and was not introduced by this plan's edit. The acceptance criterion's actual intent -- "the existing images.remotePatterns block referencing package-photos is unchanged" -- is satisfied (that block was not touched); this is a pre-existing miscount in the plan's own verify script, not a defect in the delivered code. Not auto-fixed because the plan file itself is out of scope for a code-fix task; documented here per the deviation-tracking requirement instead.

---

**Total deviations:** 1 auto-fixed (Rule 1, comment wording), 1 documented pre-existing plan-script discrepancy (no code change)
**Impact on plan:** No scope creep. Both `next.config.ts` and `photo-manager.tsx` changes match the plan's intent exactly; `npm run lint` and `npm run build` both pass with no new errors.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CR-01 (photo upload failure for realistic file sizes) is closed at the code level; `npm run lint` and `npm run build` both pass
- Live confirmation that a realistic phone/DSLR-sized photo upload now succeeds against the real Supabase Storage bucket remains a human-verification item, already tracked in 02-VERIFICATION.md's `human_verification` array (`human_verify_mode: end-of-phase`) -- not a new blocker introduced by this plan
- Plans 02-17 (CR-02 admin lockout) and 02-18 (AUTH-01 diagnostic hypothesis) remain outstanding gap-closure plans for this phase

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-19*
