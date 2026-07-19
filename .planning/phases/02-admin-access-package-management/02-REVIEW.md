---
phase: 02-admin-access-package-management
reviewed: 2026-07-19T13:36:30Z
depth: standard
files_reviewed: 52
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
  - components/packages/checklist.tsx
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
  - scripts/verify-password-reset-redirect.ts
  - scripts/verify-permission-denial.ts
  - supabase/config.toml
  - supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql
  - supabase/migrations/20260718171228_atomic_package_children_write.sql
  - types/database.ts
findings:
  critical: 2
  warning: 9
  info: 5
  total: 16
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-19T13:36:30Z
**Depth:** standard
**Files Reviewed:** 52
**Status:** issues_found

## Summary

Full re-review of the Phase 02 file set (admin auth, RBAC/DAL, package CRUD +
photo management, user management, the two RLS/RPC migrations, and the
dev-only verification scripts) against current source — not assumed from the
prior 02-REVIEW.md pass.

**Prior CR-01 re-checked and confirmed fixed:** the earlier finding
("soft-deleted package stays visible in the admin list after deletion,
because `SortablePackageList`'s local `items` state was seeded from
`initialItems` once and never re-synced") no longer reproduces.
`components/admin/sortable-package-list.tsx`'s `handleDeleted` (lines 89-91)
now filters the deleted item out of local state directly, independent of
`router.refresh()`, and `PackageListRow.handleDelete()` (`package-list-row.tsx:110-125`)
calls `onDeleted(item.id)` instead of relying solely on `onMutated()`.
Confirmed fixed — not re-listed below.

**Prior CR-02 (from an even earlier pass, `write_package_children`
atomicity) also re-confirmed fixed**, unchanged from before: the
`20260718171228_atomic_package_children_write.sql` migration + `actions/
packages.ts`'s `writePackageChildren()` RPC call still wrap the delete+
reinsert sequence in one transaction.

Two **new critical** issues were found in this pass:

1. Photo uploads are very likely to fail for realistic photo sizes because
   Next.js's default 1&nbsp;MB Server Action body limit was never raised.
2. An Admin can deactivate their own account or the last remaining admin
   account with no in-app recovery path, and the documented "break glass"
   recovery script (`seed-admin.ts`) does not actually recover from this
   specific state because its existing-admin check ignores `is_active`.

The permission-gating architecture itself
(`requirePermission`/`requireAdmin`/`*OrRedirect` + independent RLS
policies) remains sound and consistently applied across every mutating
Server Action and every gated page. The warnings below are largely
defense-in-depth and data-integrity gaps in individual actions, not breaks
in that core boundary.

## Critical Issues

### CR-01: Photo upload will fail for realistic image sizes — no Server Action body size limit override

**File:** `next.config.ts` (missing config); consumed by `components/admin/photo-manager.tsx:171-200` and `actions/package-photos.ts:38-118`

**Issue:** `PhotoManager.handleFilesSelected` reads every selected file with
`FileReader.readAsDataURL`, strips the data-URL prefix, and sends the
**entire batch** of raw-base64 payloads to `uploadPhotos()` — a `"use
server"` Server Action — in a single invocation
(`photo-manager.tsx:171-200`, `package-photos.ts:38-118`). Next.js enforces
a default Server Action request body limit of **1&nbsp;MB**
(confirmed in `node_modules/next/dist/build/templates/app-page.js`:
`const defaultActionBodySizeLimit = '1 MB'`), and `next.config.ts` never
sets `experimental.serverActions.bodySizeLimit` to raise it. Base64
encoding adds ~33% overhead on top of the raw file size, so a single
~750&nbsp;KB photo — well below what a phone camera or DSLR typically
produces (multi-MB JPEGs) — already exceeds the limit, and the multi-file
upload path (all files sent in one call) multiplies this by however many
files are selected at once. In practice this breaks the core "upload
package photos" feature (D-11) for the overwhelming majority of real-world
photo uploads, not just an edge case.

**Fix:**
```ts
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: { /* ...unchanged... */ },
};
```
Also consider chunking/streaming large multi-file batches (e.g. one
`uploadPhotos` call per file, or a direct-to-Storage signed-upload flow)
rather than relying solely on a larger body limit, since raising the limit
too far reopens a resource-exhaustion vector on a free-tier Vercel function.

### CR-02: An Admin can deactivate themselves or the last remaining admin, with no working in-app or scripted recovery

**File:** `actions/users.ts:127-145`, `scripts/seed-admin.ts:64-80`

**Issue:** `deactivateAccount(id)` only checks `requireAdmin()` on the
*caller* — it never checks whether `id` is the caller's own account, nor
whether `id` is the last remaining active admin:
```ts
export async function deactivateAccount(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", id);
  ...
}
```
Because `getProfile()` (`lib/auth/dal.ts:35-52`) re-checks `is_active` on
**every** request, an admin who deactivates their own account — or the only
other active admin, leaving none — is signed out of the entire admin panel
on their very next request, with no in-app path back in.

The documented "break glass" recovery, re-running `scripts/seed-admin.ts`,
does **not** help in this exact scenario. Its existing-admin guard is:
```ts
const { data: existingAdmin } = await supabase
  .from('profiles').select('id, email').eq('role', 'admin').limit(1).maybeSingle();
if (existingAdmin) { console.log(...); return; } // no-op
```
This matches on `role` alone and ignores `is_active`. A deactivated-but-
still-`role='admin'` profile satisfies `existingAdmin`, so the script silently
no-ops instead of reactivating anything — leaving direct database/Supabase-
dashboard access as the only recovery path for what should be a routine,
self-inflictable admin-panel mistake (e.g. an admin cleaning up test
accounts and misclicking on their own row).

**Fix:** Reject self-deactivation and last-admin deactivation in the action:
```ts
export async function deactivateAccount(id: string): Promise<ActionResult> {
  const caller = await requireAdmin();
  if (caller.id === id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true)
    .neq("id", id);
  if (!count) {
    return { ok: false, error: "Can't deactivate the last remaining admin." };
  }
  ...
}
```
Separately, harden `seed-admin.ts`'s existing-admin check to also require
`is_active = true` so it can actually recover from this state if it ever
occurs anyway.

## Warnings

### WR-01: `createPackage`'s `sort_order` can collide with an existing package after any soft-delete

**File:** `actions/packages.ts:82-97`

**Issue:**
```ts
const { count } = await supabase
  .from("packages")
  .select("id", { count: "exact", head: true })
  .is("deleted_at", null);
...
sort_order: count ?? 0,
```
`count` is the number of currently-active (non-deleted) packages, not
`MAX(sort_order) + 1`. `softDeletePackage` never renumbers the remaining
rows' `sort_order`, so once any package has been deleted, `count`
under-counts relative to the highest `sort_order` still in use. Example:
packages A(0), B(1), C(2) exist; B is soft-deleted; the active count is now
2; the next `createPackage` assigns `sort_order = 2`, colliding with C's
existing `sort_order = 2`. The admin list's `.order("sort_order", {
ascending: true })` query then has a tie, producing unstable/surprising
ordering until the next manual drag-reorder (which does fully renumber the
active set).

**Fix:** Compute the next `sort_order` from the actual max, not a count:
```ts
const { data: maxRow } = await supabase
  .from("packages")
  .select("sort_order")
  .is("deleted_at", null)
  .order("sort_order", { ascending: false })
  .limit(1)
  .maybeSingle();
const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;
```

### WR-02: `createAccount` leaves an orphaned, fully-functional auth user if the profile update fails

**File:** `actions/users.ts:37-96`

**Issue:** `createAccount()` first creates a real Supabase Auth user via the
service-role client (line 62-67) — which the `on_auth_user_created` trigger
immediately backs with an **active** `profiles` row — and only afterward
applies the admin-chosen name/role/permissions via a second, separate
update (line 79-88). If that update fails, the function returns `{ ok:
false, error: GENERIC_ERROR_MESSAGE }` with no compensating deletion of the
auth user. The admin sees "Something went wrong," but a real, login-capable
account (Staff role, all permissions `false`, `is_active: true`) now exists
with the email/password they just entered. Retrying with the same email
then fails at `createUser` with "already registered," producing a confusing
permanent failure loop until someone manually intervenes via the Supabase
dashboard. `scripts/seed-admin.ts` explicitly guards against this exact
failure class (its "auth user may already exist — locate it instead of
failing" fallback, lines 91-131); that safety net was not carried over to
the interactive `createAccount` action.

**Fix:**
```ts
if (updateError) {
  await serviceRoleClient.auth.admin.deleteUser(created.user.id).catch(() => {});
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-03: `reorderPhotos` updates rows by `id` alone, with no `package_id` scoping — plus non-atomic writes

**File:** `actions/package-photos.ts:175-208`

**Issue:** `packageId` is only used to resolve the package's `slug` for
`revalidatePath`; the actual writes key solely on client-supplied ids:
```ts
const results = await Promise.all(
  order.map((item) =>
    supabase.from("package_photos").update({ display_order: item.displayOrder }).eq("id", item.id)
  )
);
```
There is no `.eq("package_id", packageId)` scoping. Any `package_photos.id`
reachable by a `can_manage_packages` caller (i.e. any photo in the entire
catalog, per the RLS policy in the 02-01 migration) can have its
`display_order` silently rewritten via a stale client array, a copy/paste
bug in a future caller, or a malformed request that references photos from
a *different* package than the one named in `packageId` — corrupting
another package's photo ordering with no error surfaced. Separately, the
`Promise.all` of N independent per-row updates is not transactional: a
partial failure leaves the DB in a mixed old/new order while the calling
component (`photo-manager.tsx:231-234`) rolls the client's optimistic state
all the way back, silently desyncing client and server state.

**Fix:** Scope every update to the intended package, and move the write
into a single transactional RPC (mirroring the `write_package_children`
pattern already established in this phase) so all N updates commit or roll
back together:
```ts
supabase
  .from("package_photos")
  .update({ display_order: item.displayOrder })
  .eq("id", item.id)
  .eq("package_id", packageId)
```

### WR-04: `reorderPackages` persists order via non-atomic per-row writes

**File:** `actions/packages.ts:247-271`

**Issue:** Same `Promise.all(order.map(...))` pattern as WR-03 (without the
missing-scope issue, since packages aren't nested under another entity): N
independent `UPDATE` calls, not one transaction. A partial failure (one
call errors while others already succeeded) returns `{ ok: false }` and the
UI (`sortable-package-list.tsx:74-77`) rolls the client back to the
pre-drag order, but the rows that already committed server-side remain in
their new order — client and database silently desync until the next
successful reorder or a page reload surfaces the server's unexpected order.

**Fix:** As with WR-03, move to a single `reorder_packages(p_order jsonb)`
RPC using `update ... from jsonb_to_recordset(...)` so the whole batch
commits atomically.

### WR-05: `deletePhoto` can leave a `package_photos` row pointing at an already-deleted Storage object

**File:** `actions/package-photos.ts:125-169`

**Issue:** `deletePhoto()` removes the Storage object first (line 150-152),
then deletes the `package_photos` row (line 158-161). If `.remove()`
succeeds but the subsequent DB `.delete()` fails (transient DB error), the
function returns a failure result, but the image is already gone from
Storage while the database row — and the public detail page's
`getPublicUrl()` reference to it — still exists, producing a permanently
broken image on the public package page with no automatic recovery.

**Fix:** Reverse the order (delete the DB row first, then the Storage
object), logging rather than failing on a post-delete Storage cleanup
error:
```ts
const { error: deleteError } = await supabase
  .from("package_photos").delete().eq("id", photoId);
if (deleteError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

const { error: removeError } = await supabase.storage
  .from("package-photos").remove([photo.storage_path]);
if (removeError) {
  console.error("Orphaned storage object after photo delete:", photo.storage_path);
}
return { ok: true };
```

### WR-06: No server-side validation of uploaded photo content-type — client-supplied MIME type trusted end-to-end

**File:** `actions/package-photos.ts:25-28, 76-89`

**Issue:** `uploadPhotos()` derives the stored file extension from
`extensionFromMimeType(file.type)` and passes `file.type` straight through
as the Storage object's `contentType` (line 84) — both sourced entirely
from the client-supplied `UploadPhotoInput.type` string, with no check that
the field is actually an `image/*` type, let alone that the decoded
`buffer` bytes match the declared type. `package-photos` is a **public**
Storage bucket. Any account with `can_manage_packages` (Admin or a
lower-trust Staff account) can upload e.g. `image/svg+xml` content (SVG can
embed `<script>`) and have it served directly to public site visitors from
the bucket's public URL — a stored-XSS vector reachable by a Staff account
scoped only to package management, not just a compromised Admin. The
`<input accept="image/*">` in `photo-manager.tsx:255` is a client-side hint
only, easily bypassed by a direct action call.

**Fix:**
```ts
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
if (!ALLOWED_TYPES.has(file.type)) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```
Also add a byte-size ceiling on `buffer.byteLength` — there is currently no
per-file or per-request size cap at all.

### WR-07: Photo mutations never revalidate the admin package list, so its thumbnail can go stale

**File:** `actions/package-photos.ts:116, 167, 206`

**Issue:** `uploadPhotos`, `deletePhoto`, and `reorderPhotos` all call
`revalidatePath(`/packages/${pkg.slug}`)` (the public detail page) but
never `revalidatePath("/admin/packages")`. `app/admin/(dashboard)/packages/page.tsx`
sources each row's thumbnail from the first photo by `display_order`
(lines 52-60), so uploading a new first photo, deleting the current first
photo, or reordering photos is not reflected in the admin list's thumbnail
until something else revalidates that route (e.g. a publish toggle) or a
full reload.

**Fix:** Add `revalidatePath("/admin/packages")` alongside the existing
calls in all three photo actions, matching the pattern already used in
`actions/packages.ts`'s package-level mutations.

### WR-08: `error.tsx`'s hardcoded "Permission Denied" copy is now shown for any unexpected render exception, not just permission denials

**File:** `app/admin/(dashboard)/error.tsx:6-13`

**Issue:** The comment asserts every render-time throw reachable under this
segment is "exclusively a permission-gate Forbidden throw," justifying the
unconditional "Permission Denied" copy. That's no longer accurate: every
page under this segment (`packages/page.tsx`, `packages/new/page.tsx`,
`packages/[id]/page.tsx`, `users/page.tsx`) now calls the redirect-based
`requirePermissionOrRedirect()`/`requireAdminOrRedirect()`
(`lib/auth/dal.ts:85-110`), which redirects to `/admin/forbidden` instead of
throwing. This boundary is therefore no longer reachable via the intended
permission-gate path at all — it now only fires for genuinely unexpected
exceptions (a Supabase query throwing, a null-dereference bug, etc.) — yet
it still renders "Permission Denied. Contact an Admin if you think this is
a mistake." for those unrelated failures, actively misleading users (and
whoever debugs their report) about the real cause.

**Fix:** Either render a generic "Something went wrong" message here
(reserving "Permission Denied" copy for the dedicated `/admin/forbidden`
page, the sole intended destination now), or confirm this dual-purpose
behavior is intentional and update the stale comment accordingly.

### WR-09: `getSiteOrigin()` falls back to trusting the request's `Host` header for the password-reset redirect URL

**File:** `actions/auth.ts:14-31`

**Issue:** When `NEXT_PUBLIC_SITE_URL` is unset, `getSiteOrigin()` builds the
password-reset `redirectTo` origin from the incoming request's `host` /
`x-forwarded-proto` headers. These headers can be attacker-influenced in
some proxy/hosting configurations (classic Host-header injection →
password-reset-link poisoning). The only real backstop today is Supabase's
own `URI_ALLOW_LIST` (`supabase/config.toml:158`) rejecting any redirect
target it doesn't recognize — a legitimate mitigation, but it means this
fallback path has no defense-in-depth of its own and silently builds a
redirect URL from an untrusted header in any environment where
`NEXT_PUBLIC_SITE_URL` isn't set (e.g. a misconfigured preview/staging
deploy).

**Fix:** Treat `NEXT_PUBLIC_SITE_URL` as required in every deployed
environment (fail loudly if unset outside local dev) rather than silently
falling back to request headers.

## Info

### IN-01: Dead error branch in `ForgotPasswordForm` — `requestPasswordReset` never returns `ok: false`

**File:** `components/admin/forgot-password-form.tsx:42-46`, `actions/auth.ts:60-74`

**Issue:** `onSubmit` handles `result.ok === false` by toasting
`GENERIC_ERROR_MESSAGE`, but `requestPasswordReset()` always returns `{ ok:
true }` unconditionally (by design, to avoid leaking account existence) —
it has no code path returning `{ ok: false }`. The `else` branch is
unreachable dead code.

**Fix:** Remove the dead branch, or add a comment noting it's
defensive-only for a hypothetical future failure path.

### IN-02: `profiles.role` and `package_inclusions.kind` are typed as plain `string`, not literal unions

**File:** `types/database.ts:81, 194, 205, 216`

**Issue:** Both columns are constrained at the DB layer (`role` via a CHECK
constraint to `'admin' | 'staff'`; `kind` implicitly to `'included' |
'excluded' | 'bring'` by application convention), but the generated types
widen them to `string`, losing compile-time protection against typos that a
narrower type or Postgres enum would catch at build time.

**Fix:** Regenerate against a schema that models `role` as a Postgres enum,
or maintain a small manual type override for these two columns.

### IN-03: `GENERIC_ERROR_MESSAGE` string constant duplicated verbatim across 11 files

**File:** `actions/auth.ts`, `actions/packages.ts`, `actions/users.ts`,
`actions/package-photos.ts`, `components/admin/users-table.tsx`,
`components/admin/package-list-row.tsx`,
`components/admin/sortable-package-list.tsx`,
`components/admin/forgot-password-form.tsx`,
`components/admin/account-form.tsx`, `components/admin/photo-manager.tsx`,
`components/admin/package-form.tsx`

**Issue:** The exact string `"Something went wrong saving your changes.
Please try again."` is copy-pasted as a local `GENERIC_ERROR_MESSAGE`
constant in 11 separate files instead of being exported once from a shared
module (e.g. alongside `lib/action-result.ts`'s `ActionResult` type, which
several of these files already import). Any future copy change requires
updating all 11 call sites in lockstep.

**Fix:** Export a single `GENERIC_ERROR_MESSAGE` from `lib/action-result.ts`
(or a new `lib/constants.ts`) and import it everywhere instead of
redeclaring it.

### IN-04: `UNGATED_ADMIN_PATHS` uses prefix matching (`.startsWith`) instead of exact-path matching

**File:** `lib/supabase/proxy.ts:4-9, 47-49`

**Issue:** The optimistic auth check exempts any path where
`request.nextUrl.pathname.startsWith(path)` for `path` in
`["/admin/login", "/admin/forgot-password", "/admin/reset-password",
"/admin/auth/confirm"]`. A future route such as `/admin/login-history` or
`/admin/reset-password-audit` would silently inherit the ungated treatment
purely because it shares a string prefix with an intentionally public path.
Not exploitable today (no such routes exist), but fragile for a
security-relevant allowlist.

**Fix:**
```ts
const isUngatedAdminPath = UNGATED_ADMIN_PATHS.some(
  (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`)
);
```

### IN-05: Stale comment in `lib/supabase/server.ts` misdescribes the current middleware setup

**File:** `lib/supabase/server.ts:29-32`

**Issue:** The comment on the `setAll` cookie-write try/catch reads "Called
from a Server Component — safe to ignore since Phase 1 has no middleware
refreshing sessions yet." `lib/supabase/proxy.ts`'s `updateSession()` does
now refresh the session cookie on every `/admin/*` request as of this
phase — the comment's premise is out of date and could mislead a future
maintainer reasoning about whether cookie writes here are actually safe to
swallow.

**Fix:** Update the comment to note that `proxy.ts` now handles session
refresh, and that this catch exists purely because Server Component renders
can't mutate cookies regardless of middleware presence.

---

_Reviewed: 2026-07-19T13:36:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
