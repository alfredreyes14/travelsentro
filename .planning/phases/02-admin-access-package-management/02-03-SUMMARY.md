---
phase: 02-admin-access-package-management
plan: 03
subsystem: auth
tags: [nextjs, supabase-auth, rls, dal, react-hook-form, zod, shadcn, service-role]

# Dependency graph
requires:
  - phase: 02-admin-access-package-management (plan 02)
    provides: "lib/auth/dal.ts (requireAdmin), lib/action-result.ts (ActionResult), admin dashboard shell with permission-aware nav, shadcn switch/table/select/alert-dialog/dropdown-menu components installed"
provides:
  - "actions/users.ts — createAccount()/updateAccount()/deactivateAccount() Server Actions, each gated by requireAdmin()"
  - "components/admin/account-form-schema.ts — createAccountSchema/editAccountSchema (zod)"
  - "components/admin/account-form.tsx — create/edit account form (name/email/password/role/3 permission switches)"
  - "components/admin/users-table.tsx — interactive client table (Add Staff Account dialog, per-row Edit/Deactivate)"
  - "app/admin/(dashboard)/users/page.tsx — Users list Server Component, requireAdmin()-gated"
affects: [02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-role Supabase client (auth.admin.createUser) constructed inline, only inside the server-only createAccount action, never exported or imported into a \"use client\" module — same safeguard as scripts/seed-admin.ts, including the Node 20 WebSocket polyfill for @supabase/supabase-js's RealtimeClient construction"
    - "Server Component page (page.tsx, calls requireAdmin() + the Supabase query) delegates all dialog/table interactivity to a co-located \"use client\" component (users-table.tsx) — mirrors the existing login page.tsx/login-form.tsx split"
    - "Two independent useForm() instances (CreateAccountForm/EditAccountForm), one per schema variant, rather than one component conditionally shaping a single form-values type — keeps each hook's generic type stable and avoids conditional-hook risk"

key-files:
  created:
    - actions/users.ts
    - components/admin/account-form-schema.ts
    - components/admin/account-form.tsx
    - components/admin/users-table.tsx
    - "app/admin/(dashboard)/users/page.tsx"
  modified: []

key-decisions:
  - "Split the interactive table/dialogs into components/admin/users-table.tsx (a \"use client\" file) rather than inlining them in page.tsx, since Dialog/AlertDialog open-state + post-mutation refresh require client-side hooks that a Server Component page.tsx cannot hold directly — same pattern already established by login page.tsx + login-form.tsx in 02-02"
  - "Submit button reads \"Add Staff Account\" in create mode and \"Save Changes\" in edit mode, per this plan's own Task 1 action text (UI-SPEC's Copywriting Contract table groups both under one \"User form (create/edit)\" row as \"Save Changes\", but the plan's explicit instruction calling for a distinct create-mode label is the more specific authority followed here)"

requirements-completed: [AUTH-02, AUTH-03, AUTH-04, AUTH-05]

coverage:
  - id: D1
    description: "createAccount()/updateAccount()/deactivateAccount() Server Actions exist in actions/users.ts, each calling requireAdmin() before any Supabase write"
    requirement: "AUTH-05"
    verification:
      - kind: other
        ref: "grep -c requireAdmin() actions/users.ts (4 matches: 3 calls + 1 code comment); npm run build succeeds with no type errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live round-trip against the Supabase project: createAccount's exact sequence (auth.admin.createUser via service-role client, then Admin-RLS-scoped profile update) creates a Staff account that immediately logs in with exactly its granted permission (can_manage_packages=true, the other two false), a Staff session cannot read other profiles or escalate its own role (RLS), and deactivateAccount's is_active=false flip is visible to the still-authenticated Staff session on its very next read (D-05)"
    requirement: "AUTH-02"
    verification:
      - kind: other
        ref: "throwaway node --env-file=.env.local script exercising the live Supabase project end-to-end (auth.admin.createUser -> Admin-scoped profile update -> Staff sign-in+self-read -> Staff cross-row read attempt -> Staff self-escalation attempt -> Admin deactivate -> Staff post-deactivate self-read), test user deleted via auth.admin.deleteUser at the end; script never committed"
        status: pass
    human_judgment: true
    rationale: "This confirms the underlying Supabase calls and RLS policies behave correctly, but the actual UI click-through (Admin creating an account via the dialog form, a Staff browser session confirming the sidebar hides Users, deactivation kicking an active Staff browser session) needs a human in two real logged-in browser sessions — deferred to end-of-phase per config.json's human_verify_mode: end-of-phase (same deferral pattern as 02-02's D2/D3)"
  - id: D3
    description: "Users list page renders create/edit/deactivate UI: an \"Add Staff Account\" dialog, per-row Edit dialog (AccountForm in edit mode), and a Deactivate alert-dialog with the exact UI-SPEC copy (\"Deactivate this account?\" / \"...will be signed out immediately and won't be able to log in until reactivated.\" / \"Deactivate\", destructive-styled)"
    requirement: "AUTH-03"
    verification:
      - kind: other
        ref: "grep -c \"Deactivate this account?\" components/admin/users-table.tsx returns 1; npm run build succeeds"
        status: pass
    human_judgment: true
    rationale: "Visual/interaction confirmation of the dialogs (form field layout, switch styling, destructive button color) needs a human eyeball pass — deferred to end-of-phase per config.json's human_verify_mode"

# Metrics
duration: 25min
completed: 2026-07-18
status: complete
---

# Phase 2 Plan 03: Users Section — Account Create/Edit/Deactivate Summary

**Admin-only Users section (`actions/users.ts` + `account-form.tsx` + `users-table.tsx` + `app/admin/(dashboard)/users/page.tsx`) where an Admin creates a Staff account with a specific permission subset via a service-role-backed `createAccount` action, and that account was verified live against the Supabase project to log in with exactly those permissions and be locked out immediately on deactivation.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-18T15:34:14Z
- **Completed:** 2026-07-18T15:45:25Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 5 (5 created, 0 modified)

## Accomplishments
- `actions/users.ts`: `createAccount()`, `updateAccount()`, `deactivateAccount()` Server Actions, each calling `requireAdmin()` first (AUTH-05). `createAccount` constructs a service-role Supabase client inline (never exported, never imported into a `"use client"` module — T-02-13) to call `auth.admin.createUser()`, then updates the trigger-created `profiles` row via the calling Admin's own RLS-scoped session.
- `components/admin/account-form-schema.ts`: `createAccountSchema` (name/email/password/role/3 permission booleans) and `editAccountSchema` (same minus email/password) as two distinct zod schemas.
- `components/admin/account-form.tsx`: create/edit account form following `inquiry-form.tsx`'s `useForm`+`zodResolver`+`Form`/`FormField` composition — name input, email input (create-mode only, editable; edit-mode shows a plain disabled/read-only display, deliberately outside the `FormField`/`FormControl` context since it isn't an RHF-managed field), password input (create-mode only), a `select` for role (Admin/Staff), and 3 `switch` rows labeled exactly "Manage Packages" / "Message Customers" / "Edit CRM Data" per the UI-SPEC Copywriting Contract.
- `components/admin/users-table.tsx`: interactive client table — "Add Staff Account" button opening a create dialog, per-row dropdown menu (Edit -> edit dialog pre-filled via `AccountForm`; Deactivate -> alert-dialog with the exact UI-SPEC copy), permission/role/status badges per row.
- `app/admin/(dashboard)/users/page.tsx`: Server Component calling `requireAdmin()` before querying `profiles` (AUTH-05 — rejects a Staff session even via a bookmarked/guessed URL, independent of D-13's nav hiding), rendering `UsersTable`.
- Verified the entire `createAccount`/`updateAccount`/`deactivateAccount` sequence live against the Supabase project via a throwaway, never-committed script: created a Staff auth user, updated its profile with a specific permission subset via the Admin's RLS-scoped session, signed in as that Staff account and confirmed it reads exactly its granted permissions, confirmed RLS blocks it from reading other profiles or escalating its own role, deactivated it as Admin, and confirmed the Staff session's very next self-read shows `is_active: false` (D-05) — then deleted the test user.

## Task Commits

1. **Task 1: Account form + Server Actions** - `2b334e5` (feat)
2. **Task 2: Users list page — create/edit/deactivate wiring** - `0aa1c40` (feat)

**Plan metadata:** committed in this same SUMMARY.md commit

## Files Created/Modified
- `actions/users.ts` — `createAccount()`, `updateAccount()`, `deactivateAccount()`
- `components/admin/account-form-schema.ts` — `createAccountSchema`, `editAccountSchema`
- `components/admin/account-form.tsx` — `AccountForm` (branches internally to `CreateAccountForm`/`EditAccountForm`)
- `components/admin/users-table.tsx` — `UsersTable` (create dialog, per-row edit dialog, deactivate alert-dialog)
- `app/admin/(dashboard)/users/page.tsx` — Users list Server Component

## Decisions Made
- Split the interactive table/dialogs into a separate `"use client"` component (`users-table.tsx`) rather than inlining them in `page.tsx`, since dialog open/close state and post-mutation `router.refresh()` require client-side hooks a Server Component can't hold — the same split already established by `login page.tsx` + `login-form.tsx` in 02-02.
- Used two independent `useForm()` instances (`CreateAccountForm`/`EditAccountForm`) rather than one component conditionally reshaping a single form-values type, keeping each hook's generic type stable.
- Followed this plan's own Task 1 instruction for submit-button copy ("Add Staff Account" in create mode, "Save Changes" in edit mode) even though the UI-SPEC's Copywriting Contract table groups create/edit under a single "Save Changes" row — the plan's specific instruction is the more precise authority for this file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `FormLabel`/`FormControl` from the edit-mode email display field**
- **Found during:** Task 1, self-review before running `npm run build`
- **Issue:** The edit-mode email field was initially wrapped in `<FormItem>`/`<FormLabel>`/`<FormControl>` even though it isn't an RHF-managed field (no `<FormField>` ancestor). `useFormField()` (in `components/ui/form.tsx`) calls `getFieldState(fieldContext.name, formState)` with `fieldContext.name` undefined in that case — a latent runtime crash risk when the edit dialog renders, since the `if (!fieldContext)` guard in that hand-authored hook never trips (the default context value is a truthy empty object).
- **Fix:** Replaced with a plain `<Label>`/`<Input disabled readOnly>` pair (no `FormField` involvement), consistent with this field being read-only/not part of the submitted values.
- **Files modified:** `components/admin/account-form.tsx`
- **Verification:** `npm run build` and `npm run lint` both pass; per Task 1's `read_first`, `components/ui/form.tsx`'s `useFormField()` contract requires a `<FormField>` ancestor, which this field intentionally has none of.
- **Committed in:** `2b334e5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug fix)
**Impact on plan:** Caught before the task commit — no functional or scope change to the plan, purely a latent-crash fix in an edit path not exercised by the plan's own grep/build verify commands.

## Issues Encountered

**Verify-command mismatch (documented, not a functional issue):** Task 2's `<verify><automated>` block runs `grep -c "Deactivate this account?" "app/admin/(dashboard)/users/page.tsx"`, which returns `0` — the literal copy lives in `components/admin/users-table.tsx` instead, per the Server Component / Client Component split described above (page.tsx has no hooks and can't own the alert-dialog's open state itself). `grep -c "Deactivate this account?" components/admin/users-table.tsx` returns `1`, confirming the copy is present and correct in the codebase; the plan's own verify script simply assumed a single-file implementation. Functionally unaffected — `npm run build` passes and the string is intact.

## User Setup Required

None - no external service configuration required. `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SUPABASE_SERVICE_ROLE_KEY` (all already in `.env.local` since 02-01/02-02) are all `createAccount` needs.

## Next Phase Readiness

**Ready.** `actions/users.ts`'s `createAccount`/`updateAccount`/`deactivateAccount` and the service-role client construction pattern are proven live against the Supabase project. 02-04 (Packages CRUD) can follow the identical `requireAdmin()`/`requirePermission()`-gated Server Action + RLS-scoped `createClient()` pattern without needing a service-role client (no `auth.admin.*` calls are needed there).

What's confirmed ready for 02-04/02-05/02-06:
- The Server Component page + co-located `"use client"` interactive-table split (`page.tsx` + `*-table.tsx`) is now an established pattern for any future admin list page (e.g., the Packages list in 02-04).
- `AccountForm`'s two-independent-`useForm()`-instances pattern (rather than one conditionally-reshaped hook) is a reusable approach for any other future create/edit form pair with genuinely different field sets.
- Full browser click-through (Admin creates a Staff account via the UI, that Staff account logs in and sees the permission-gated sidebar, Admin deactivates it and the Staff session is rejected on its next click) remains deferred to end-of-phase human verification per `config.json`'s `human_verify_mode: end-of-phase` — the underlying Supabase/RLS behavior for all of this is already confirmed live (see Coverage D2).

---
*Phase: 02-admin-access-package-management*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: actions/users.ts
- FOUND: components/admin/account-form-schema.ts
- FOUND: components/admin/account-form.tsx
- FOUND: components/admin/users-table.tsx
- FOUND: app/admin/(dashboard)/users/page.tsx
- FOUND commit: 2b334e5 (Task 1)
- FOUND commit: 0aa1c40 (Task 2)
