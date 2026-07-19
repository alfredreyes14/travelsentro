---
status: testing
phase: 02-admin-access-package-management
source: [02-VERIFICATION.md]
started: 2026-07-19T03:28:49Z
updated: 2026-07-19T03:28:49Z
---

## Current Test

number: 1
name: Full browser login click-through
expected: |
  Login succeeds, session persists across a page refresh, sidebar renders per D-13/D-14.
awaiting: user response

## Tests

### 1. Full browser login click-through
expected: Visit /admin/login, log in with ADMIN_EMAIL/ADMIN_PASSWORD, confirm landing on /admin/packages with a visible sidebar (Packages + Users for Admin). Login succeeds, session persists across a page refresh, sidebar renders per D-13/D-14.
result: [pending]

### 2. Real password-reset email round-trip
expected: Request a reset for a real mailbox, click the actual emailed link, set a new password, log in with it. Reset email arrives with a working link; the code-exchange lands the user authenticated on /admin/reset-password (not /admin/login); the new password logs in successfully. Newly unblocked this round — the proxy-level defect (CR-01) that made this unreachable is now independently confirmed closed; this is the single highest-priority item remaining.
result: [pending]

### 3. Add-Staff-Account dialog
expected: Admin creates a new Staff account, sets name/role/permission toggles, confirms the new account can log in and sees only the nav items its permissions allow. Account created, permission toggles persist, new account's sidebar matches D-13/D-14 exactly.
result: [pending]

### 4. Drag-reorder package list + publish/feature switch interactions
expected: Drag-reorder persists new sort_order; switches optimistically update and persist; a simulated failure reverts the switch and shows a toast.
result: [pending]

### 5. Multi-tab package create/edit form
expected: Itinerary days, inclusions, FAQ facts, price/photos across the full package-form UI. All fields save correctly; package appears/updates on the Phase 1 public site after publish.
result: [pending]

### 6. Photo upload/reorder/delete flow
expected: Photos upload, drag-reorder persists display_order, delete removes the Storage object and DB row. Known edge-case gaps flagged in 02-REVIEW.md (commit cfbe794) WR-08/WR-09/WR-10 worth exercising manually.
result: [pending]

### 7. Full visual/styling pass
expected: Admin panel matches TravelSentro brand tokens (teal/orange sidebar, Prata/Inter typography) consistently across all screens, including the /admin/forbidden page's visual parity with error.tsx.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
