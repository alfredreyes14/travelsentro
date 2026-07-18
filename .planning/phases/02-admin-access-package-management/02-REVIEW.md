---
phase: 02-admin-access-package-management
reviewed: 2026-07-19T00:00:00Z
depth: standard
files_reviewed: 54
files_reviewed_list:
  - actions/auth.ts
  - actions/package-photos.ts
  - actions/packages.ts
  - actions/users.ts
  - app/admin/(dashboard)/error.tsx
  - app/admin/(dashboard)/forbidden/page.tsx
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
  - package.json
  - proxy.ts
  - scripts/seed-admin.ts
  - scripts/verify-permission-denial.ts
  - supabase/config.toml
  - supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql
  - supabase/migrations/20260718171228_atomic_package_children_write.sql
  - types/database.ts
findings:
  critical: 1
  warning: 12
  info: 3
  total: 16
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 54
**Status:** issues_found

## Summary

This review supersedes the prior `02-REVIEW.md` round and was run after the AUTH-05 gap-closure work (three prior closure attempts, most recently plan 02-09, which replaced the throw-based `error.tsx` mechanism with redirect-based `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` guards for Server Component page renders, while leaving throw-based `requirePermission()`/`requireAdmin()` in place for Server Actions).

**The dual-mechanism split in `lib/auth/dal.ts` itself is implemented correctly.** All four gated pages (`packages/page.tsx`, `packages/new/page.tsx`, `packages/[id]/page.tsx`, `users/page.tsx`) call the appropriate `*OrRedirect` variant as their first statement, `requirePermissionOrRedirect`/`requireAdminOrRedirect` correctly call `redirect()` as a bare statement (never inside try/catch, so `NEXT_REDIRECT` is never swallowed), and the throw-based variants remain untouched for the Server Action call sites in `actions/{packages,users,package-photos}.ts`, which still correctly rely on a catchable rejection.

**However, the password-reset flow this phase has repeatedly tried to fix is still broken end-to-end — for a new reason.** The previous review's CR-01 (missing `/admin/auth/confirm` entry in `supabase/config.toml`'s `additional_redirect_urls`) is now genuinely fixed (confirmed present at `supabase/config.toml:158`). But a *different*, newly-discovered gate — `lib/supabase/proxy.ts`'s `UNGATED_ADMIN_PATHS` allow-list — still does not include `/admin/auth/confirm`, so an unauthenticated visitor clicking the emailed reset link is redirected to `/admin/login` by the proxy before the code-exchange Route Handler ever runs. See CR-01 below.

Also re-verified: several warnings/info items from the prior review round were not touched by the gap-closure plans and remain present exactly as before (re-confirmed by direct inspection of current file contents, not carried forward blindly) — these are numbered WR-01 through WR-07 and WR-12, and IN-01/IN-02 below. New issues found in this pass are WR-08 through WR-11, and IN-03 has been updated to reflect the throw→redirect migration.

## Critical Issues

### CR-01: `/admin/auth/confirm` is not allow-listed in the proxy — the password-reset flow is still non-functional end-to-end (new regression, distinct from the now-fixed `config.toml` gap)

**File:** `lib/supabase/proxy.ts:4-8`
**Issue:** `UNGATED_ADMIN_PATHS` only contains `/admin/login`, `/admin/forgot-password`, and `/admin/reset-password`:
```ts
const UNGATED_ADMIN_PATHS = [
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
];
```
The PKCE code-exchange Route Handler at `app/admin/auth/confirm/route.ts` lives at `/admin/auth/confirm`, which is **not** in this list.

A user who clicks the emailed password-reset link has no session cookie yet, so `updateSession()`'s `supabase.auth.getUser()` returns `user: null`. The guard clause then evaluates:
```ts
if (
  !user &&                                            // true — no session yet
  request.nextUrl.pathname.startsWith("/admin") &&     // true — "/admin/auth/confirm"
  !isUngatedAdminPath                                  // true — not in the allow-list
) {
  return NextResponse.redirect(new URL("/admin/login", request.url));
}
```
The proxy redirects to `/admin/login` before the request ever reaches the Route Handler, so `exchangeCodeForSession(code)` never runs. The reset link silently dead-ends at the login page with no session established and no error surfaced.

This is the same class of "looks fixed but isn't" gap `02-VERIFICATION.md` explicitly warned about for this exact flow (a clean build and a source-grep for denial copy both passed on a still-broken implementation) — it would only be caught by an actual live click-through of the reset-password email link. `supabase/config.toml`'s `additional_redirect_urls` was correctly updated to allow-list this path (commit `a7c84a6`), but this separate, local proxy-side gate was never updated to match, so the net user-facing result — "a real password-reset link doesn't work" — is unchanged from the original finding, just relocated to a different file.
**Fix:**
```ts
const UNGATED_ADMIN_PATHS = [
  "/admin/login",
  "/admin/forgot-password",
  "/admin/reset-password",
  "/admin/auth/confirm",
];
```
Then verify with a real end-to-end round trip (Inbucket locally, or a live email in staging): request reset → click link → land authenticated on `/admin/reset-password` → set new password → land on `/admin/login` able to sign in with it. `scripts/verify-permission-denial.ts` does not cover this route, so this must be checked manually or via a new script — a clean build alone will not catch it.

## Warnings

### WR-01: `updateAccount`/`deactivateAccount` don't verify a row was actually matched

**File:** `actions/users.ts:98-125` (`updateAccount`), `actions/users.ts:127-145` (`deactivateAccount`)
**Issue:** Both actions run `.update({...}).eq("id", id)` and only check `error`, never checking whether any row actually matched. PostgREST does not error when an `UPDATE ... WHERE id = $1` matches zero rows — it just returns success. If `id` is stale (e.g. the profile was deleted, or the dialog was opened with cached data), both actions return `{ ok: true }`, the UI shows a success toast, and nothing changed. This is inconsistent with `actions/packages.ts`, which correctly guards every mutation with `.select("slug").single()` + `if (error || !data)`.
**Fix:**
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
**Issue:** The next package's `sort_order` is computed from `count` of non-deleted packages, not `max(sort_order) + 1`. Soft-deleting a package never renumbers the remaining rows' `sort_order`, so `count` and `max` diverge over time. Example: 5 packages with `sort_order` 0..4; soft-delete the one with `sort_order = 2`; 4 remain with `{0,1,3,4}`; `count` is now 4, so the next created package gets `sort_order = 4` — colliding with the existing package that already has `4`. Ties produce unstable/non-deterministic ordering in the admin list and on the public site.
**Fix:** Compute the next `sort_order` from the current maximum instead of a count: `select("sort_order").order("sort_order", { ascending: false }).limit(1)`, then `(max ?? -1) + 1`.

### WR-03: `reorderPhotos` doesn't scope photo updates to the given `packageId`

**File:** `actions/package-photos.ts:175-208`
**Issue:** `reorderPhotos(packageId, order)` verifies `packageId` exists, then updates `package_photos.display_order` for every `item.id` in `order` with no `.eq("package_id", packageId)` filter. Since `order` is fully client-supplied ("untrusted input from the browser" per the function's own doc comment), any `can_manage_packages`-permitted caller can pass photo IDs belonging to a *different* package, silently reassigning their `display_order` and corrupting that other package's photo ordering — and `revalidatePath` only refreshes the intended package's slug, so the corruption elsewhere isn't even visible until later.
**Fix:**
```ts
supabase
  .from("package_photos")
  .update({ display_order: item.displayOrder })
  .eq("id", item.id)
  .eq("package_id", packageId)
```

### WR-04: Server Actions never re-validate input with their Zod schemas server-side

**File:** `actions/auth.ts` (`login`, `requestPasswordReset`, `updatePassword`), `actions/packages.ts` (`createPackage`, `updatePackage`), `actions/users.ts` (`createAccount`, `updateAccount`)
**Issue:** Every Server Action here accepts a plain, untyped-at-runtime object and passes it straight to Supabase without re-parsing it against the corresponding Zod schema (`packageFormSchema`, `createAccountSchema`, `loginSchema`, etc.) that only the *client* form applies via `zodResolver`. Server Actions are directly callable (via the Next.js action-id POST endpoint), bypassing the React form entirely, so constraints like "price must be positive," "slug must be lowercase-hyphenated," or "password must be 8+ characters" are enforced only in the browser.
**Fix:** Re-parse with the shared schema at the top of each action:
```ts
const parsed = packageFormSchema.safeParse(values);
if (!parsed.success) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```
and use `parsed.data` for the rest of the function.

### WR-05: Local Supabase auth config allows public self-signup, contradicting the "no admin sign-up route" design

**File:** `supabase/config.toml:171, 216`, `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql:96-111`
**Issue:** `[auth] enable_signup = true` and `[auth.email] enable_signup = true` leave Supabase's own `/auth/v1/signup` endpoint reachable by anyone holding the public anon key (exposed client-side by design via `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Combined with the `on_auth_user_created` trigger, which unconditionally inserts a `profiles` row (`role='staff', is_active=true`, all permissions false) for *any* new `auth.users` row, an anonymous internet visitor can self-register and authenticate into `/admin` (the DAL's `getProfile()` only checks `is_active`, not any permission, before the dashboard shell renders — they'd just see an empty sidebar). This directly contradicts `scripts/seed-admin.ts`'s documented invariant: "There is no sign-up route for the admin panel (Phase 2, D-01)."
**Fix:** Set `enable_signup = false` in both `[auth]` and `[auth.email]`, and confirm the same setting on the hosted Supabase project's Auth settings (this file only guarantees local-dev parity).

### WR-06: `createAccount` has no rollback if the profile-permission update fails after auth-user creation

**File:** `actions/users.ts:37-96`
**Issue:** `createAccount` creates the Supabase Auth user via the service-role client (with `email_confirm: true`, so it can log in immediately), then separately updates the auto-created `profiles` row with the admin-chosen name/role/permissions using the calling admin's own session. If that second `update` fails (transient network/DB error), the function returns `{ ok: false }` — but the auth user, with working login credentials, and its default `profiles` row (`role='staff'`, all permissions false, `is_active=true`) both persist. The admin sees a generic failure toast with no indication a live, if low-privileged, login now exists for that email, and can't retry with the same address (already registered).
**Fix:** On `updateError`, best-effort delete the just-created auth user before returning the failure:
```ts
if (updateError) {
  await serviceRoleClient.auth.admin.deleteUser(created.user.id).catch(() => {});
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-07: No "last admin" / self-lockout guard on demotion or deactivation

**File:** `actions/users.ts:98-125` (`updateAccount`), `actions/users.ts:127-145` (`deactivateAccount`)
**Issue:** Neither action checks whether the target is the caller themselves or the last remaining `role='admin'` account before demoting to `staff` or deactivating. Since `getProfile()` re-checks `is_active` on *every* request (`lib/auth/dal.ts:45-49`), an Admin who deactivates their own account (accidentally, or another Admin deactivating the only other Admin) is signed out on their very next request. Because account creation/promotion/deactivation are themselves admin-only actions, this can permanently remove the only account capable of undoing it — the sole recovery path is re-running `scripts/seed-admin.ts` with direct database/CLI access, not anything self-serve from the UI.
**Fix:** Before applying a demotion or deactivation, reject if the target is the caller's own account, and/or reject if the target is the last active admin:
```ts
const caller = await requireAdmin();
if (caller.id === id) {
  return { ok: false, error: "You can't deactivate your own account." };
}
```

### WR-08: `uploadPhotos` discards already-successful uploads on a mid-loop failure

**File:** `actions/package-photos.ts:76-114`
**Issue:** Files are uploaded and inserted one at a time in a `for...of` loop. If file 2 of 3 fails its Storage upload or its `package_photos` insert, the function immediately `return`s `{ ok: false }` — but file 1's Storage object and DB row were already committed. The client (`components/admin/photo-manager.tsx:185-193`) only merges `result.photos` into visible state when `result.ok` is true, so on this path the caller sees an error toast and file 1 never appears in the UI even though it genuinely exists — until a full page reload. Additionally, if the DB insert (not the Storage upload) fails, that file's just-uploaded Storage object is never cleaned up, leaving an orphaned object.
**Fix:** Either wrap the batch in a single-transaction RPC (mirroring `write_package_children`, the fix for the phase's own prior CR-02), or at minimum return the partial `photos` array alongside `ok: false` so the client can reconcile visible state, and clean up the Storage object when its paired insert fails:
```ts
if (insertError || !photoRow) {
  await supabase.storage.from("package-photos").remove([storagePath]);
  return { ok: false, error: GENERIC_ERROR_MESSAGE, photos: uploaded };
}
```

### WR-09: `reorderPackages`/`reorderPhotos` are not atomic — partial failure leaves the DB and the reverted optimistic UI out of sync

**File:** `actions/packages.ts:247-271`, `actions/package-photos.ts:175-208`
**Issue:** Both functions fire one independent `.update()` per row via `Promise.all`. If any one of N concurrent updates fails, the function returns `{ ok: false }` and the client (`sortable-package-list.tsx:74-81`, `photo-manager.tsx:230-239`) reverts its optimistic UI back to the pre-drag order — but updates that succeeded alongside the failing one are not rolled back. The DB is left holding a mixed old/new sort order that the reverted UI no longer reflects, until the next full page load re-fetches from the DB. This is a distinct issue from WR-03 (missing tenant-scoping filter) — this one is about atomicity even for a single, correctly-scoped package's own rows.
**Fix:** Wrap each batch in a single-transaction RPC (same pattern as `write_package_children`) so the whole reorder either fully applies or fully rolls back.

### WR-10: `uploadPhotos` performs no server-side file-type or size validation

**File:** `actions/package-photos.ts:38-118`
**Issue:** The client restricts the file picker with `accept="image/*"` (`photo-manager.tsx:255`), but that's a client-side hint only. The Server Action accepts `UploadPhotoInput.type` as an arbitrary caller-supplied string with no `zod` validation or allow-list, and `extensionFromMimeType` derives the Storage object's file extension directly from that untrusted value. A `can_manage_packages`-permissioned caller (not a fully untrusted actor, but also not one who should be able to plant arbitrary content) can upload a file with any `type`/extension — e.g. `image/svg+xml`, which can embed `<script>` — into the public `package-photos` bucket, and there is no size cap before `Buffer.from(file.base64, "base64")` allocates the decoded payload in memory.
**Fix:** Validate `file.type` against an explicit allow-list with `zod` before upload, and enforce a max decoded size:
```ts
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
if (!ALLOWED_TYPES.has(file.type)) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-11: Password-reset email link can fall back to an attacker-influenceable `Host` header

**File:** `actions/auth.ts:14-31`
**Issue:** `getSiteOrigin()` prefers `NEXT_PUBLIC_SITE_URL`, but if that env var is unset it falls back to building the origin from the incoming request's `host`/`x-forwarded-proto` headers. Those headers are attacker-influenceable unless the deployment platform strictly normalizes them — a known vector for password-reset-link poisoning (the generated `redirectTo` URL is emailed to the real user, but could point at a domain the requester controls). Blast radius here is currently limited by Supabase Auth independently validating `redirectTo` against `additional_redirect_urls` server-side (`supabase/config.toml:158`), so a spoofed Host header alone likely can't produce a working malicious link today — but that protection depends entirely on the production project's allow-list staying exactly in sync, with no local guardrail if it drifts.
**Fix:** Require `NEXT_PUBLIC_SITE_URL` in production and fail loudly rather than silently trusting request headers outside local dev:
```ts
if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
if (process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_SITE_URL must be set in production.");
}
// ...existing header-based dev fallback...
```

### WR-12: `package_photos.alt_text` is fully unused — a genuine accessibility gap, not just dead code

**File:** `actions/package-photos.ts:99` (always inserts `alt_text: null`), `components/admin/photo-manager.tsx:90` (`alt={photo.altText ?? ""}`)
**Issue:** The `alt_text` column and its plumbing exist end-to-end (DB column, types, `PhotoManagerPhoto.altText`), but there is no UI to ever set it — every uploaded photo permanently has `alt_text: null`, so package photos always render with an empty `alt=""`. This is an accessibility defect on the public site (screen readers get no description of tour-package photos), not merely unused code.
**Fix:** Either add an alt-text input to the photo manager UI, or remove the plumbing until it's implemented.

## Info

### IN-01: Duplicated `GENERIC_ERROR_MESSAGE` constant across modules

**File:** `actions/packages.ts:10-11`, `actions/package-photos.ts:9-10`, `actions/users.ts:11-12`, `components/admin/package-form.tsx:33-34`, `components/admin/forgot-password-form.tsx:24-25`, `components/admin/account-form.tsx:36-37`, `components/admin/package-list-row.tsx:42-43`, `components/admin/photo-manager.tsx:33-34`, `components/admin/sortable-package-list.tsx:33-34`, `components/admin/users-table.tsx:45-46`
**Issue:** The identical string `"Something went wrong saving your changes. Please try again."` is redeclared as a local constant in at least ten files.
**Fix:** Hoist to a single shared module (e.g. `lib/action-result.ts` or a new `lib/messages.ts`) and import everywhere.

### IN-02: Stale comment in `lib/supabase/server.ts` no longer matches the codebase

**File:** `lib/supabase/server.ts:29-32`
**Issue:** The comment justifying the silent `catch` around `cookieStore.set(...)` says "safe to ignore since Phase 1 has no middleware refreshing sessions yet" — but this is Phase 2, and `lib/supabase/proxy.ts`'s `updateSession()` *does* refresh sessions on every `/admin/*` request. The catch is still correct (Server Components genuinely can't set cookies), but the stated rationale is outdated and could mislead a future maintainer debugging session-refresh issues.
**Fix:** Update the comment to reference `proxy.ts`'s `updateSession()` as the actual session-refresh mechanism, instead of the now-inapplicable "Phase 1" note.

### IN-03: `app/admin/(dashboard)/error.tsx`'s docstring is stale after the throw→redirect migration, and the boundary still mislabels unrelated errors

**File:** `app/admin/(dashboard)/error.tsx:6-14`
**Issue:** Two compounding issues in the same comment. First, it claims every render-time throw currently reachable under this segment (`packages/page.tsx`, `packages/new/page.tsx`, `packages/[id]/page.tsx`, `users/page.tsx`, "all via `lib/auth/dal.ts`'s `requirePermission()`/`requireAdmin()`") is exclusively a permission-gate `Forbidden` throw. Since plan 02-09, all four of those pages call the *redirect*-based `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` instead — they no longer throw for the permission-denial case at all (that's now `app/admin/(dashboard)/forbidden/page.tsx`'s job). The comment was not updated to reflect this and now inaccurately narrows this boundary's actual remaining purpose (general defense-in-depth for unexpected exceptions, not "exclusively a permission-gate Forbidden throw"). Second, and independent of the migration, the component still unconditionally renders "Permission Denied" copy for *any* caught error — including a genuine Supabase network/timeout error or an unrelated bug in a future page added under `(dashboard)/` — which will now be even more frequently wrong given permission denials no longer route through this boundary at all.
**Fix:** Update the comment to match `forbidden/page.tsx`'s accurate framing (defense-in-depth for unexpected render-time exceptions only), and consider branching on `error.message === "Forbidden"` before choosing "Permission Denied" copy, falling back to a generic "Something went wrong" message otherwise.

---

_Reviewed: 2026-07-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
