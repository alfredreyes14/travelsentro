---
phase: 02-admin-access-package-management
reviewed: 2026-07-18T16:20:14Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - actions/auth.ts
  - actions/package-photos.ts
  - actions/packages.ts
  - actions/users.ts
  - app/admin/(dashboard)/layout.tsx
  - app/admin/(dashboard)/packages/[id]/page.tsx
  - app/admin/(dashboard)/packages/new/page.tsx
  - app/admin/(dashboard)/packages/page.tsx
  - app/admin/(dashboard)/users/page.tsx
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
  - types/database.ts
findings:
  critical: 2
  warning: 8
  info: 3
  total: 13
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-18T16:20:14Z
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

Reviewed the admin auth/RBAC and package-management surface (Server Actions, DAL, RLS migration, forms, and drag/reorder UI). The RBAC design itself is sound (dual-layer enforcement — `requirePermission`/`requireAdmin` in the DAL plus RLS policies keyed off a `SECURITY DEFINER` `has_permission()` — and the soft-delete/no-DELETE-policy invariant on `packages` is correctly enforced at the database layer). However, two data-integrity/availability defects were found that should block ship: the password-reset flow appears to be non-functional end-to-end (no PKCE `code` exchange anywhere in the codebase), and package edits use a non-atomic delete-then-reinsert for itinerary/inclusions/FAQ rows with no rollback, so a single failed insert during an edit silently wipes existing content. A further set of warnings covers missing row-existence checks in `actions/users.ts`, a `sort_order` collision bug after soft-deletes, unscoped photo-reorder writes, missing server-side re-validation of Zod schemas in Server Actions, and a public-signup configuration gap that conflicts with the documented "no admin sign-up route" design decision.

## Critical Issues

### CR-01: Password reset flow has no PKCE code-exchange step — likely completely broken

**File:** `actions/auth.ts:60-74`, `app/admin/reset-password/page.tsx:1-24`, `components/admin/reset-password-form.tsx:24-45`
**Issue:** `requestPasswordReset()` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: "${origin}/admin/reset-password" })` using a server-side `@supabase/ssr` client (`createServerClient`), whose default `flowType` is `pkce`. With PKCE, the emailed recovery link redirects the browser to `/admin/reset-password?code=...`, and the app must exchange that code for a session via `supabase.auth.exchangeCodeForSession(code)` *before* any authenticated call (like `updateUser()`) can succeed. There is no route/handler anywhere in the codebase that does this exchange — `app/admin/reset-password/page.tsx` never reads `searchParams`, and a repo-wide search confirms `exchangeCodeForSession` is not called anywhere:
```
grep -rn "exchangeCodeForSession" . # no matches outside node_modules
```
As a result, when a user clicks the reset link, they land on `/admin/reset-password` with no session established. `ResetPasswordForm` then calls `updatePassword()` (`actions/auth.ts:76-94`), which calls `supabase.auth.updateUser({ password })` against a client with no active session — this will fail with an auth error every time, surfacing only the generic "Something went wrong" toast. Admins/staff who forget their password have no working way to reset it.
**Fix:** Add a route handler (e.g. `app/admin/auth/confirm/route.ts`) that reads the `code` (or `token_hash`/`type` for OTP-style links) query param, calls `supabase.auth.exchangeCodeForSession(code)` server-side (writing the session cookie), and then redirects to `/admin/reset-password`. Point `resetPasswordForEmail`'s `redirectTo` at that confirm route instead of directly at `/admin/reset-password`:
```ts
// app/admin/auth/confirm/route.ts
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();
  if (code) await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/admin/reset-password", request.url));
}
```
Verify manually against a real (or Inbucket-captured local) reset email before considering this flow done.

### CR-02: Non-atomic delete-then-reinsert of package children risks data loss on partial failure

**File:** `actions/packages.ts:22-93` (`writePackageChildren`), used by `updatePackage` (`actions/packages.ts:156-190`)
**Issue:** `writePackageChildren` unconditionally deletes all of a package's `itinerary_days`, `package_inclusions`, and `faq_facts` rows *first* (lines 27-35), then reinserts them one table at a time, returning early on the first insert error. None of this runs inside a database transaction/RPC — each `supabase.from(...).insert(...)` is an independent network call. If the itinerary insert succeeds but the inclusions insert fails (e.g. a transient network blip, a payload-size limit, or a future NOT NULL/check-constraint addition), `updatePackage` returns `{ ok: false }` — but the package's pre-existing inclusions/exclusions/bring-items and FAQ facts have already been deleted and are now permanently gone, even though the calling admin only intended to edit (not clear) the package. The admin sees a generic error toast with no indication that content was lost, and the next time they open the edit page they'll find empty tabs.
**Fix:** Wrap the delete+reinserts in a single Postgres transaction, e.g. via a `supabase.rpc()` call to a `plpgsql` function that performs all deletes/inserts atomically, or use the Postgres `BEGIN`/`COMMIT` semantics available through a direct connection. At minimum, reorder to "insert new rows first (with a temporary marker), delete old rows only after all inserts succeed" so a failed insert never leaves the package in a state worse than before the edit.

## Warnings

### WR-01: `actions/users.ts` update/deactivate calls don't verify a row was actually matched

**File:** `actions/users.ts:98-125` (`updateAccount`), `actions/users.ts:127-145` (`deactivateAccount`)
**Issue:** Both actions run `.update({...}).eq("id", id)` and only check `error`, never checking whether any row actually matched. Supabase/PostgREST does not error when an `UPDATE ... WHERE id = $1` matches zero rows — it just returns success. If `id` is stale (e.g. the profile was already deleted, or the dialog was opened with cached data), both actions return `{ ok: true }`, the UI shows "Account updated." / "Account deactivated.", and nothing changed. This is inconsistent with `actions/packages.ts`, which correctly guards every mutation with `.select("slug").single()` + `if (error || !data)` (see `updatePackage`, `softDeletePackage`, `publishPackage`, `featurePackage`).
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

**File:** `actions/packages.ts:110-127`
**Issue:** The next package's `sort_order` is computed as `count` of non-deleted packages (`select("id", { count: "exact", head: true }).is("deleted_at", null)`), not `max(sort_order) + 1`. Soft-deleting a package (`softDeletePackage`) never renumbers the remaining rows' `sort_order`, so counts and max values diverge over time. Example: 5 packages with `sort_order` 0..4; soft-delete the one with `sort_order = 2`; 4 packages remain with `sort_order` values `{0,1,3,4}`; `count` is now 4, so the next created package is inserted with `sort_order = 4` — colliding with the existing package that already has `sort_order = 4`. Ties in `sort_order` produce unstable/non-deterministic ordering in the admin list (`order("sort_order", { ascending: true })` in `app/admin/(dashboard)/packages/page.tsx:44`) and on the public site.
**Fix:** Compute the next `sort_order` from the current maximum instead of a count, e.g. `select("sort_order").order("sort_order", { ascending: false }).limit(1)` and use `(max ?? -1) + 1`.

### WR-03: `reorderPhotos` doesn't scope photo updates to the given `packageId`

**File:** `actions/package-photos.ts:175-208`
**Issue:** `reorderPhotos(packageId, order)` verifies `packageId` exists, then updates `package_photos.display_order` for every `item.id` in `order` with no `.eq("package_id", packageId)` filter (`actions/package-photos.ts:193-200`). Since `order` is fully client-supplied (the function's own doc comment acknowledges it is "untrusted input from the browser"), any manage_packages-permitted caller can pass photo IDs that belong to a *different* package, silently reassigning their `display_order` and corrupting that other package's photo ordering — while `revalidatePath` only refreshes the page for the intended package's slug, so the corruption on the other package won't even be visible until it's later loaded elsewhere.
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
**Issue:** Every Server Action here accepts a plain, untyped-at-runtime object and passes it straight to Supabase without re-parsing it against the corresponding Zod schema (`packageFormSchema`, `createAccountSchema`, `loginSchema`, etc.) that only the *client* form applies via `zodResolver`. Server Actions are callable directly (e.g. via the Next.js action-id POST endpoint) bypassing the React form entirely, so constraints like "price must be positive," "slug must be lowercase-hyphenated," or "password must be 8+ characters" are enforced only in the browser. This is the same class of risk CLAUDE.md explicitly calls out for the Formspree webhook ("never trust incoming webhook JSON shape") — the same principle applies to Server Action payloads.
**Fix:** At the top of each action, re-parse with the shared schema, e.g.:
```ts
const parsed = packageFormSchema.safeParse(values);
if (!parsed.success) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```
and use `parsed.data` for the rest of the function.

### WR-05: Local Supabase auth config allows public self-signup, contradicting the "no admin sign-up route" design

**File:** `supabase/config.toml:170-171, 216`, `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql:96-111`
**Issue:** `[auth] enable_signup = true` and `[auth.email] enable_signup = true` leave Supabase's own `/auth/v1/signup` endpoint reachable by anyone holding the public anon key (which is, by design, exposed client-side via `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Combined with the `on_auth_user_created` trigger, which unconditionally inserts a `profiles` row (`role='staff', is_active=true`, all permissions false) for *any* new `auth.users` row, an anonymous internet visitor can self-register an account and successfully authenticate into `/admin` (the DAL only checks `is_active`, not any permission, before rendering the dashboard shell). This directly contradicts `scripts/seed-admin.ts`'s documented invariant: "There is no sign-up route for the admin panel (Phase 2, D-01)." While a self-signed-up account has zero permissions today, this is a foot-gun: it silently grants unauthenticated internet users a foothold into the authenticated admin session surface, and any future bug that grants a default permission (or fails to check one) would immediately become exploitable by any signed-up stranger.
**Fix:** Set `enable_signup = false` in both `[auth]` and `[auth.email]` (and confirm the same setting on the hosted Supabase project's Auth settings, since this file only guarantees local-dev parity), so the only way to create an account is `createAccount()`'s service-role path or `seed-admin.ts`.

### WR-06: Optimistic UI mutations have no error handling around thrown Server Action exceptions

**File:** `components/admin/package-list-row.tsx:69-106` (`handlePublishChange`, `handleFeatureChange`, `handleDelete`), `components/admin/sortable-package-list.tsx:56-75` (`handleDragEnd`), `components/admin/photo-manager.tsx:217-236` (`handleDragEnd`), `components/admin/users-table.tsx:59-73` (`handleDeactivate`)
**Issue:** `requirePermission()`/`requireAdmin()` (`lib/auth/dal.ts:54-74`) `throw new Error("Forbidden")` rather than returning an `ActionResult`. None of the call sites above wrap their `await <action>(...)` in try/catch — they only branch on `result.ok`. If the action throws (e.g. a Staff member's permissions are revoked mid-session, or the action is invoked directly with insufficient permission), the promise rejects instead of resolving to `{ ok: false }`. The revert logic that lives in the `else`/`if (!result.ok)` branch never runs, so the optimistically-flipped UI state (e.g. a `Switch` toggled to "Published") is left showing the wrong state indefinitely, with no toast telling the user anything went wrong, and an unhandled promise rejection logged to the console.
**Fix:** Wrap each of these in try/catch (mirroring `components/admin/account-form.tsx`'s pattern) and revert optimistic state / show a generic error toast in the catch block. (Note: this fix does *not* apply to `login-form.tsx`/`reset-password-form.tsx`, which intentionally omit a catch so a successful `redirect()` "error" is never swallowed — don't add a catch there.)

### WR-07: `createAccount` has no rollback if the profile-permission update fails after auth-user creation

**File:** `actions/users.ts:37-96`
**Issue:** `createAccount` creates the Supabase Auth user via the service-role client (line 62-67) and then updates the auto-created `profiles` row with the admin-chosen name/role/permissions using the calling admin's own session (line 78-88). If that second `update` fails (`updateError`, line 90), the function returns `{ ok: false }`, but the auth user (with working login credentials the admin just set) and its default `profiles` row (`role='staff'`, all permissions false, `is_active=true`) both persist. The admin sees a failure toast and, absent checking the Users table, has no way to know an active, working login now exists for that email with unintended default permissions.
**Fix:** On `updateError`, best-effort delete the just-created auth user via `serviceRoleClient.auth.admin.deleteUser(created.user.id)` before returning the failure, so a failed create is fully rolled back rather than partially applied.

### WR-08: No "last admin" guard on demotion/deactivation

**File:** `actions/users.ts:98-125` (`updateAccount`), `actions/users.ts:127-145` (`deactivateAccount`)
**Issue:** Neither action checks whether the target is the last remaining `role='admin'` account before demoting it to `staff` or deactivating it. Since account creation/promotion (`createAccount`/`updateAccount`) and deactivation are themselves admin-only actions, demoting or deactivating the sole admin removes the only account capable of performing those actions going forward — the only recovery path left is re-running `scripts/seed-admin.ts` (which requires server/CLI access, not something an admin can self-serve from the UI).
**Fix:** Before applying a demotion (`role !== "admin"`) or deactivation, query for other active admins and reject with a clear error if the target is the last one.

## Info

### IN-01: Duplicated `GENERIC_ERROR_MESSAGE` constant across modules

**File:** `actions/packages.ts:9-10`, `actions/package-photos.ts:9-10`, `actions/users.ts:11-12`, `components/admin/package-form.tsx:33-34`, `components/admin/forgot-password-form.tsx:24-25`, `components/admin/account-form.tsx:36-37`
**Issue:** The identical string `"Something went wrong saving your changes. Please try again."` is redeclared as a local constant in at least six files instead of being exported once.
**Fix:** Hoist to a single shared module (e.g. `lib/action-result.ts` or a new `lib/messages.ts`) and import everywhere.

### IN-02: `photo_photos.alt_text` is fully unused dead functionality

**File:** `actions/package-photos.ts:99` (always inserts `alt_text: null`), `components/admin/photo-manager.tsx:90` (`alt={photo.altText ?? ""}`)
**Issue:** The `alt_text` column and its plumbing exist end-to-end (DB column, types, `PhotoManagerPhoto.altText`), but there is no UI to ever set it — every uploaded photo permanently has `alt_text: null`, so uploaded package photos always render with an empty `alt=""`. This is a minor accessibility gap in addition to being an unused code path.
**Fix:** Either add an alt-text input to the photo manager UI, or remove the plumbing until it's needed, to avoid the false impression that alt text is supported.

### IN-03: Stale comment in `lib/supabase/server.ts` no longer matches the codebase

**File:** `lib/supabase/server.ts:29-32`
**Issue:** The comment justifying the silent `catch` around `cookieStore.set(...)` says "safe to ignore since Phase 1 has no middleware refreshing sessions yet" — but this is Phase 2, and `lib/supabase/proxy.ts`'s `updateSession()` *does* refresh sessions on every `/admin/*` request via `proxy.ts`. The catch is still needed (Server Components genuinely can't set cookies), but the stated rationale is outdated and could mislead a future maintainer investigating session-refresh bugs.
**Fix:** Update the comment to reference `proxy.ts`'s `updateSession()` as the actual session-refresh mechanism, rather than the now-inapplicable "Phase 1" note.

---

_Reviewed: 2026-07-18T16:20:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
