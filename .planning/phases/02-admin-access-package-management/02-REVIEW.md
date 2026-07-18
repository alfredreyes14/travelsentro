---
phase: 02-admin-access-package-management
reviewed: 2026-07-19T00:00:00Z
depth: standard
files_reviewed: 50
files_reviewed_list:
  - actions/auth.ts
  - actions/package-photos.ts
  - actions/packages.ts
  - actions/users.ts
  - app/admin/(dashboard)/error.tsx
  - app/admin/(dashboard)/layout.tsx
  - app/admin/(dashboard)/packages/[id]/page.tsx
  - app/admin/(dashboard)/packages/new/page.tsx
  - app/admin/(dashboard)/packages/page.tsx
  - app/admin/(dashboard)/users/page.tsx
  - app/admin/auth/confirm/route.ts
  - app/admin/forgot-password/page.tsx
  - app/admin/login/page.tsx
  - app/admin/reset-password/page.tsx
  - app/globals.css
  - app/layout.tsx
  - components/admin/account-form-schema.ts
  - components/admin/account-form.tsx
  - components/admin/forgot-password-form.tsx
  - components/admin/forgot-password-schema.ts
  - components/admin/login-form.tsx
  - components/admin/login-schema.ts
  - components/admin/package-form-schema.ts
  - components/admin/package-form.tsx
  - components/admin/package-list-row.tsx
  - components/admin/photo-manager.tsx
  - components/admin/reset-password-form.tsx
  - components/admin/reset-password-schema.ts
  - components/admin/sortable-package-list.tsx
  - components/admin/users-table.tsx
  - components/ui/alert-dialog.tsx
  - components/ui/dropdown-menu.tsx
  - components/ui/select.tsx
  - components/ui/sheet.tsx
  - components/ui/sidebar.tsx
  - components/ui/skeleton.tsx
  - components/ui/switch.tsx
  - components/ui/table.tsx
  - components/ui/tabs.tsx
  - components/ui/tooltip.tsx
  - hooks/use-mobile.ts
  - lib/action-result.ts
  - lib/auth/dal.ts
  - lib/supabase/proxy.ts
  - lib/supabase/server.ts
  - scripts/seed-admin.ts
  - supabase/config.toml
  - supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql
  - supabase/migrations/20260718171228_atomic_package_children_write.sql
  - types/database.ts
findings:
  critical: 1
  warning: 8
  info: 3
  total: 12
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

This is a fresh full review of the admin auth/RBAC and package-management surface, superseding the 2026-07-18 02-REVIEW.md. Since that review, a gap-closure round (plans 02-07/02-08) shipped three fixes, and two of them check out completely under adversarial re-verification:

- **CR-02 (non-atomic package-children write) is correctly and completely fixed.** The new `write_package_children()` RPC (`supabase/migrations/20260718171228_atomic_package_children_write.sql`) wraps the delete+reinsert sequence for `itinerary_days`/`package_inclusions`/`faq_facts` in a single Postgres function call, which Postgres executes as one transaction — a failed insert now rolls back the whole operation instead of leaving the package half-emptied. It is correctly declared `SECURITY INVOKER` (not `DEFINER`), so it stays subject to the existing `can_manage_packages`-scoped RLS policies rather than opening a privilege-escalation path, and all values are passed as bound `jsonb`/`uuid`/`text` RPC parameters (never string-interpolated SQL), so there is no injection surface. `types/database.ts` was correctly regenerated with the new RPC's `Args`/`Returns` shape.
- **The permission-denied-crash verification gap is correctly and completely fixed.** `app/admin/(dashboard)/error.tsx` now catches the `Forbidden` throws from `requirePermission()`/`requireAdmin()` and renders fixed denial copy without leaking why access was denied. `package-list-row.tsx`, `sortable-package-list.tsx`, `photo-manager.tsx`, and `users-table.tsx` all now wrap their Server Action calls in try/catch and revert optimistic UI state on both `!result.ok` and a thrown exception. `login-form.tsx` and `reset-password-form.tsx` were correctly left untouched — both still use a bare try/finally (no catch), which is the intentional pattern so a successful `redirect()` "error" is never swallowed.
- **CR-01 (PKCE code-exchange) is fixed at the application-code level but the fix is incomplete and, as shipped, still non-functional.** `app/admin/auth/confirm/route.ts` correctly implements the code-exchange handshake with no open-redirect surface, and `actions/auth.ts` correctly repoints `redirectTo` at it. However, `supabase/config.toml`'s `additional_redirect_urls` was never updated to allow-list the new `/admin/auth/confirm` path — see CR-01 below. This is the same failure mode the original CR-01 finding described (a real reset attempt silently fails), just moved one layer down the stack.

All 10 warnings/info items from the previous review that were explicitly deferred (not touched by the gap-closure round) were re-verified in this pass and remain present exactly as before: WR-01 through WR-08 and IN-01 through IN-03 (renumbered below to close the gap left by the two resolved criticals). No new regressions were found in the newly-changed files beyond the CR-01 config gap, and no new issues were found across the rest of the file set.

## Critical Issues

### CR-01: Password-reset redirect target is not allow-listed — the PKCE fix is still non-functional end-to-end

**File:** `supabase/config.toml:158`, `actions/auth.ts:69-71`, `app/admin/auth/confirm/route.ts`
**Issue:** The gap-closure fix for the original CR-01 finding correctly added `app/admin/auth/confirm/route.ts` (a PKCE code-exchange handler) and repointed `requestPasswordReset()`'s `redirectTo` at it:
```ts
await supabase.auth.resetPasswordForEmail(values.email, {
  redirectTo: `${origin}/admin/auth/confirm`,
});
```
But Supabase Auth (GoTrue) validates `redirectTo` against `site_url` plus the exact entries in `additional_redirect_urls` before it will accept it — this exact requirement is documented in this project's own `02-RESEARCH.md` (assumption A1: "the redirect URL must be allow-listed in Auth URL Configuration... If the allow-list step is missed, the forgot-password flow (D-06) silently fails with a redirect rejection"), and the team followed this correctly the first time: `02-02-PLAN.md`/`02-02-SUMMARY.md` document adding `http://localhost:3000/admin/reset-password` to `additional_redirect_urls` and pushing it live via `supabase config push --yes` when that was the redirect target.

`supabase/config.toml`'s `additional_redirect_urls` still only contains the old target:
```toml
additional_redirect_urls = ["https://127.0.0.1:3000", "http://localhost:3000/admin/reset-password"]
```
There is no entry for `/admin/auth/confirm` (or any wildcard that would cover it), and neither `02-07-PLAN.md`/`02-07-SUMMARY.md` (which shipped the route handler) nor `02-08-PLAN.md`/`02-08-SUMMARY.md` (which pushed the atomic-write migration) touched `config.toml` or ran `supabase config push`. `02-07-SUMMARY.md`'s own "External Setup Needed" section even flags this as still-open: *"The Supabase Auth email template/redirect URL allowlist for `/admin/auth/confirm` should be confirmed in the Supabase dashboard's Auth → URL Configuration before relying on a real email round-trip in production, but no code-level setup is needed"* — but that confirmation never happened, and the repo-tracked config (the source of truth `supabase config push` would sync to any linked project) was never updated either.

Net effect: a real password-reset email link still results in Supabase Auth rejecting the redirect target, so the user either lands on an error page or falls back to `site_url` (`/`) with the `code` param, never reaching `/admin/auth/confirm`. The code-exchange handler that was built specifically to fix CR-01 is currently unreachable via the real email flow — the underlying "admins/staff have no working way to reset a forgotten password" defect from the original review is still present, just relocated.
**Fix:** Add `/admin/auth/confirm` to `additional_redirect_urls` in `supabase/config.toml` (keeping the existing `/admin/reset-password` entry is harmless but no longer strictly needed since the flow no longer redirects there directly from the email):
```toml
additional_redirect_urls = [
  "https://127.0.0.1:3000",
  "http://localhost:3000/admin/reset-password",
  "http://localhost:3000/admin/auth/confirm",
]
```
Then push it to the linked remote project non-interactively, the same way 02-02 did: `supabase config push --yes`. Also confirm (not just note as a TODO) the equivalent entry in the hosted Supabase project's Auth → URL Configuration dashboard. Verify with a real end-to-end round trip through Inbucket (or a live email) before considering CR-01 closed: request reset → click link → land authenticated on `/admin/reset-password` → set new password → land on `/admin/login` able to sign in with it.

## Warnings

### WR-01: `actions/users.ts` update/deactivate calls don't verify a row was actually matched

**File:** `actions/users.ts:98-125` (`updateAccount`), `actions/users.ts:127-145` (`deactivateAccount`)
**Issue:** Both actions run `.update({...}).eq("id", id)` and only check `error`, never checking whether any row actually matched. PostgREST does not error when an `UPDATE ... WHERE id = $1` matches zero rows — it just returns success. If `id` is stale (e.g. the profile was already deleted, or the dialog was opened with cached data), both actions return `{ ok: true }`, the UI shows "Account updated." / "Account deactivated.", and nothing changed. This is inconsistent with `actions/packages.ts`, which correctly guards every mutation with `.select("slug").single()` + `if (error || !data)`.
**Fix:** Mirror the `packages.ts` pattern:
```ts
const { data, error } = await supabase
  .from("profiles")
  .update({ ... })
  .eq("id", id)
  .select("id")
  .single();

if (error || !data) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-02: `createPackage`'s next `sort_order` uses a row count, which collides after soft-deletes

**File:** `actions/packages.ts:82-97`
**Issue:** The next package's `sort_order` is computed as `count` of non-deleted packages, not `max(sort_order) + 1`. Soft-deleting a package never renumbers the remaining rows' `sort_order`, so counts and max values diverge over time. Example: 5 packages with `sort_order` 0..4; soft-delete the one with `sort_order = 2`; 4 packages remain with `sort_order` values `{0,1,3,4}`; `count` is now 4, so the next created package is inserted with `sort_order = 4` — colliding with the existing package that already has `sort_order = 4`. Ties produce unstable/non-deterministic ordering in the admin list and on the public site.
**Fix:** Compute the next `sort_order` from the current maximum instead of a count, e.g. `select("sort_order").order("sort_order", { ascending: false }).limit(1)` and use `(max ?? -1) + 1`.

### WR-03: `reorderPhotos` doesn't scope photo updates to the given `packageId`

**File:** `actions/package-photos.ts:175-208`
**Issue:** `reorderPhotos(packageId, order)` verifies `packageId` exists, then updates `package_photos.display_order` for every `item.id` in `order` with no `.eq("package_id", packageId)` filter. Since `order` is fully client-supplied ("untrusted input from the browser" per the function's own doc comment), any `can_manage_packages`-permitted caller can pass photo IDs belonging to a *different* package, silently reassigning their `display_order` and corrupting that other package's photo ordering — and `revalidatePath` only refreshes the intended package's slug, so the corruption elsewhere won't be visible until later.
**Fix:** Add `.eq("package_id", packageId)` to the update:
```ts
supabase
  .from("package_photos")
  .update({ display_order: item.displayOrder })
  .eq("id", item.id)
  .eq("package_id", packageId)
```

### WR-04: Server Actions never re-validate input with their Zod schemas server-side

**File:** `actions/auth.ts` (`login`, `requestPasswordReset`, `updatePassword`), `actions/packages.ts` (`createPackage`, `updatePackage`), `actions/users.ts` (`createAccount`, `updateAccount`)
**Issue:** Every Server Action here accepts a plain, untyped-at-runtime object and passes it straight to Supabase without re-parsing it against the corresponding Zod schema (`packageFormSchema`, `createAccountSchema`, `loginSchema`, etc.) that only the *client* form applies via `zodResolver`. Server Actions are callable directly (via the Next.js action-id POST endpoint), bypassing the React form entirely, so constraints like "price must be positive," "slug must be lowercase-hyphenated," or "password must be 8+ characters" are enforced only in the browser.
**Fix:** At the top of each action, re-parse with the shared schema, e.g.:
```ts
const parsed = packageFormSchema.safeParse(values);
if (!parsed.success) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```
and use `parsed.data` for the rest of the function.

### WR-05: Local Supabase auth config allows public self-signup, contradicting the "no admin sign-up route" design

**File:** `supabase/config.toml:171, 216`, `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql:96-111`
**Issue:** `[auth] enable_signup = true` and `[auth.email] enable_signup = true` leave Supabase's own `/auth/v1/signup` endpoint reachable by anyone holding the public anon key (exposed client-side via `NEXT_PUBLIC_SUPABASE_ANON_KEY` by design). Combined with the `on_auth_user_created` trigger, which unconditionally inserts a `profiles` row (`role='staff', is_active=true`, all permissions false) for *any* new `auth.users` row, an anonymous internet visitor can self-register and authenticate into `/admin` (the DAL only checks `is_active`, not any permission, before rendering the dashboard shell). This directly contradicts `scripts/seed-admin.ts`'s documented invariant: "There is no sign-up route for the admin panel (Phase 2, D-01)." Still unpatched.
**Fix:** Set `enable_signup = false` in both `[auth]` and `[auth.email]` (and confirm the same setting on the hosted Supabase project's Auth settings, since this file only guarantees local-dev parity).

### WR-06: `createAccount` has no rollback if the profile-permission update fails after auth-user creation

**File:** `actions/users.ts:37-96`
**Issue:** `createAccount` creates the Supabase Auth user via the service-role client and then updates the auto-created `profiles` row with the admin-chosen name/role/permissions using the calling admin's own session. If that second `update` fails, the function returns `{ ok: false }`, but the auth user (with working login credentials) and its default `profiles` row (`role='staff'`, all permissions false, `is_active=true`) both persist. The admin sees a failure toast with no indication an active login now exists for that email.
**Fix:** On `updateError`, best-effort delete the just-created auth user via `serviceRoleClient.auth.admin.deleteUser(created.user.id)` before returning the failure.

### WR-07: No "last admin" guard on demotion/deactivation

**File:** `actions/users.ts:98-125` (`updateAccount`), `actions/users.ts:127-145` (`deactivateAccount`)
**Issue:** Neither action checks whether the target is the last remaining `role='admin'` account before demoting it to `staff` or deactivating it. Since account creation/promotion/deactivation are themselves admin-only actions, demoting or deactivating the sole admin removes the only account capable of performing those actions going forward — the only recovery path left is re-running `scripts/seed-admin.ts` (CLI/server access, not self-serve from the UI).
**Fix:** Before applying a demotion (`role !== "admin"`) or deactivation, query for other active admins and reject with a clear error if the target is the last one.

### WR-08: `package_photos.alt_text` is fully unused dead functionality (genuine accessibility gap)

**File:** `actions/package-photos.ts:99` (always inserts `alt_text: null`), `components/admin/photo-manager.tsx:90` (`alt={photo.altText ?? ""}`)
**Issue:** The `alt_text` column and its plumbing exist end-to-end (DB column, types, `PhotoManagerPhoto.altText`), but there is no UI to ever set it — every uploaded photo permanently has `alt_text: null`, so uploaded package photos always render with an empty `alt=""`. This is an accessibility gap on the public site (photos of tour packages render with no meaningful alt text for screen readers), not just unused code.
**Fix:** Either add an alt-text input to the photo manager UI, or remove the plumbing until it's needed.

## Info

### IN-01: Duplicated `GENERIC_ERROR_MESSAGE` constant across modules

**File:** `actions/packages.ts:9-10`, `actions/package-photos.ts:9-10`, `actions/users.ts:11-12`, `components/admin/package-form.tsx:33-34`, `components/admin/forgot-password-form.tsx:24-25`, `components/admin/account-form.tsx:36-37`, `components/admin/package-list-row.tsx:42-43`, `components/admin/photo-manager.tsx:33-34`, `components/admin/sortable-package-list.tsx:33-34`, `components/admin/users-table.tsx:45-46`
**Issue:** The identical string `"Something went wrong saving your changes. Please try again."` is redeclared as a local constant in at least ten files now (the try/catch additions from the gap-closure round added four more copies of this same constant).
**Fix:** Hoist to a single shared module (e.g. `lib/action-result.ts` or a new `lib/messages.ts`) and import everywhere.

### IN-02: Stale comment in `lib/supabase/server.ts` no longer matches the codebase

**File:** `lib/supabase/server.ts:29-32`
**Issue:** The comment justifying the silent `catch` around `cookieStore.set(...)` says "safe to ignore since Phase 1 has no middleware refreshing sessions yet" — but this is Phase 2, and `lib/supabase/proxy.ts`'s `updateSession()` *does* refresh sessions on every `/admin/*` request. The catch is still needed (Server Components genuinely can't set cookies), but the stated rationale is outdated and could mislead a future maintainer investigating session-refresh bugs. Still unpatched.
**Fix:** Update the comment to reference `proxy.ts`'s `updateSession()` as the actual session-refresh mechanism, rather than the now-inapplicable "Phase 1" note.

### IN-03: `app/admin/(dashboard)/error.tsx`'s scope assumption will silently go stale as the dashboard grows

**File:** `app/admin/(dashboard)/error.tsx:6-14`
**Issue:** The boundary's doc comment asserts every render-time throw currently reachable under this segment is exclusively a permission-gate `Forbidden` throw, and the component unconditionally renders "Permission Denied" copy for *any* error caught here — including, e.g., a genuine Supabase network/timeout error or an unrelated bug thrown from a future page added under `(dashboard)/`. That's a reasonable simplification today (matches the current file set), but nothing enforces the invariant going forward; a future page that throws a non-permission error will silently be mislabeled "Permission Denied" instead of a generic failure message.
**Fix:** Low priority given current scope, but worth a follow-up: check `error.message === "Forbidden"` before choosing the "Permission Denied" copy, falling back to a generic "Something went wrong" message otherwise, so the boundary degrades gracefully instead of mislabeling unrelated failures as permission issues.

---

_Reviewed: 2026-07-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
