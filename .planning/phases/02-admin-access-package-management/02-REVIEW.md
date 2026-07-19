---
phase: 02-admin-access-package-management
reviewed: 2026-07-19T00:00:00Z
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
  critical: 1
  warning: 6
  info: 3
  total: 10
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 52
**Status:** issues_found

## Summary

Reviewed the RBAC/auth plumbing (`lib/auth/dal.ts`, `lib/supabase/proxy.ts`, `lib/supabase/server.ts`), the package/photo/user Server Actions, the admin package-management UI, the two RLS/RPC migrations, and the dev-only verification scripts. The permission model itself (profiles + `has_permission()` SECURITY DEFINER helper + split SELECT/UPDATE RLS policies + independent `requirePermission`/`requireAdmin` checks in every Server Action) is sound and consistently applied — every mutating action is double-gated by an app-level check and a matching RLS policy, and the `write_package_children` RPC correctly wraps the itinerary/inclusions/faq_facts delete+reinsert in one transaction.

The most significant finding is a client-state bug in the package list: deleting a package (`softDeletePackage`) reports success but the row does not actually disappear from the admin table, because `SortablePackageList`'s local `items` state is seeded from `initialItems` once and never re-synced when the parent Server Component re-renders after `router.refresh()`. Several Server Actions also have gaps in defense-in-depth (unvalidated upload MIME types, un-scoped bulk photo-reorder updates, no rollback on partial account-creation failure, no guard against self/last-admin deactivation) that are worth closing even though the primary permission boundary (RLS + `requirePermission`) still holds in each case. A couple of code comments have also drifted from the current implementation and are actively misleading for future maintainers.

Per the task brief, the two previously-flagged, still-open issues (bare/unstyled `/admin/reset-password` render and the second-reset-link bounce-to-login) were not re-investigated; nothing new surfaced in this pass that adds evidence toward either root cause beyond what `.planning/debug/password-reset-bounce-to-login.md` already documents.

## Critical Issues

### CR-01: Soft-deleted package stays visible in the admin list after deletion

**File:** `components/admin/sortable-package-list.tsx:49` (state) and `:85-87` (refresh trigger), invoked from `components/admin/package-list-row.tsx:108-123`

**Issue:** `SortablePackageList` seeds its local list from props once:

```tsx
export function SortablePackageList({ initialItems }: { initialItems: AdminPackageListItem[] }) {
  const [items, setItems] = useState(initialItems);
  ...
  function handleMutated() {
    router.refresh();
  }
```

When a row's dropdown "Delete" action succeeds, `PackageListRow.handleDelete()` calls `softDeletePackage(item.id)` then `onMutated()`, which calls `router.refresh()`. `router.refresh()` re-fetches the parent Server Component (`app/admin/(dashboard)/packages/page.tsx`) and passes a fresh (now-shorter) `initialItems` array down as a prop — but `useState(initialItems)` only consumes that value on the component's *first* mount. Because `SortablePackageList` is not remounted (same position in the tree, same component type, and the `items.length === 0` branch in `packages/page.tsx` only swaps in the empty-state UI when the list becomes fully empty), React preserves the stale `items` state. The deleted package's row therefore remains rendered — with a working drag handle and a now-dangling `packageId` — until the admin does a hard navigation or full reload. The `PackageListRow` instance itself isn't unmounted either, since its `key={item.id}` is still present in the un-updated `items` array.

This reproduces on every delete except when it's the very last remaining package in the list (that case swaps to the "No packages yet" branch, which *does* change component identity and incidentally "fixes" itself).

**Fix:** Sync local state whenever the prop changes, e.g.:

```tsx
export function SortablePackageList({ initialItems }: { initialItems: AdminPackageListItem[] }) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  ...
```

or simpler/more robust: have `PackageListRow`'s delete handler report the deleted id back up (`onDeleted(item.id)`) and filter it out of `items` directly, the same way `PhotoManager` already does its own local removal on delete — avoiding a dependency on `router.refresh()` re-hydrating child state at all.

## Warnings

### WR-01: `createPackage`'s sort_order can collide with an existing package after any soft-delete

**File:** `actions/packages.ts:81-97`

**Issue:**

```ts
const { count } = await supabase
  .from("packages")
  .select("id", { count: "exact", head: true })
  .is("deleted_at", null);
...
sort_order: count ?? 0,
```

`count` is the number of currently-active (non-deleted) packages, not `MAX(sort_order) + 1`. Soft-deleting a package (`softDeletePackage`) never renumbers the remaining rows' `sort_order`, so once any package has been deleted, `count` under-counts relative to the highest `sort_order` still in use. Example: packages A(0), B(1), C(2) exist; B is soft-deleted; `count` of active packages is now 2; the next `createPackage` call assigns the new package `sort_order = 2`, colliding with C's existing `sort_order = 2`. The admin list's `.order("sort_order", { ascending: true })` query then has two rows with an equal, arbitrarily-broken tie, producing unstable/surprising ordering until the next manual drag-reorder (which does fully renumber the active set).

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

### WR-02: `createAccount` leaves an orphaned active Staff account on partial failure

**File:** `actions/users.ts:62-92`

**Issue:** `createAccount` first calls `serviceRoleClient.auth.admin.createUser(...)` (creates the auth user + password, `email_confirm: true`), then updates the auto-created `profiles` row with the admin-chosen name/role/permissions. If the `profiles` update fails (`updateError`), the function returns `{ ok: false, error: GENERIC_ERROR_MESSAGE }` — but the auth user already exists, is fully confirmed, has the admin-supplied password, and (via the `on_auth_user_created` trigger) has an active `profiles` row with `role='staff'`, `is_active=true`, and all three permissions `false`. The admin sees a failure toast and has no indication a live, loginable account was actually created. Repeating the "Add Staff Account" flow with the same email would then fail confusingly (email already registered) rather than surfacing the orphaned account.

**Fix:** On `updateError`, roll back the created auth user:

```ts
if (updateError) {
  await serviceRoleClient.auth.admin.deleteUser(created.user.id).catch(() => {});
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-03: No guard against an admin deactivating their own (or the last remaining) admin account

**File:** `actions/users.ts:127-145`, `scripts/seed-admin.ts:64-80`

**Issue:** `deactivateAccount(id)` only checks `requireAdmin()` on the *caller* — it never checks whether `id` refers to the caller's own account, nor whether `id` is the last remaining active admin. Since `getProfile()` (`lib/auth/dal.ts:35-52`) re-checks `is_active` on every request, an admin who deactivates their own account (or the only other active admin, leaving none) is signed out of the entire admin panel on their very next request, with no in-app path back in.

The obvious "break glass" recovery — re-running `scripts/seed-admin.ts` — does **not** help in this exact scenario: its existing-admin check is `... .eq('role', 'admin').limit(1).maybeSingle()` (line ~66-71), which matches on `role` alone and ignores `is_active`. A deactivated-but-still-`role='admin'` profile satisfies that check, so the script no-ops instead of promoting/reactivating anything, leaving manual database access as the only recovery path.

**Fix:** In `deactivateAccount`, reject deactivating the caller's own id, and/or reject deactivating the last remaining `is_active=true, role='admin'` row:

```ts
const profile = await requireAdmin();
if (profile.id === id) {
  return { ok: false, error: "You can't deactivate your own account." };
}
```
Separately, consider having `seed-admin.ts`'s existing-admin check also filter on `is_active = true` so it can actually recover from this state.

### WR-04: Photo uploads have no server-side MIME-type or size validation

**File:** `actions/package-photos.ts:25-28`, `:76-89`

**Issue:** `uploadPhotos` decodes whatever base64 payload the client sends and derives the storage extension purely from the client-supplied `file.type`:

```ts
function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}
...
const { error: uploadError } = await supabase.storage.from("package-photos").upload(
  storagePath, buffer, { contentType: file.type, upsert: false }
);
```

The `<input accept="image/*">` restriction in `photo-manager.tsx` is client-side only and trivially bypassed (e.g. direct call to the Server Action, or a modified request). There's no allow-list of accepted MIME types (`image/jpeg`, `image/png`, `image/webp`, …), no per-file size cap, and no cap on the number of files per call. Because the `package-photos` bucket is public-read (`getPublicUrl`), an authenticated `can_manage_packages` caller could store and publicly serve arbitrary file content (e.g. `text/html`, `application/octet-stream`) under an attacker-chosen `Content-Type`. This is gated behind a real permission today, so it isn't an unauthenticated vulnerability, but it's a meaningful defense-in-depth gap for a public-facing storage bucket.

**Fix:** Validate `file.type` against an explicit image allow-list and enforce a byte-size ceiling before calling `.upload()`:

```ts
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

if (!ALLOWED_TYPES.has(file.type) || buffer.byteLength > MAX_BYTES) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-05: `reorderPhotos` bulk-updates by id without scoping to the caller's `packageId`

**File:** `actions/package-photos.ts:175-208` (update loop at `:193-200`)

**Issue:**

```ts
export async function reorderPhotos(
  packageId: string,
  order: { id: string; displayOrder: number }[]
): Promise<ActionResult> {
  ...
  const results = await Promise.all(
    order.map((item) =>
      supabase.from("package_photos").update({ display_order: item.displayOrder }).eq("id", item.id)
    )
  );
```

`packageId` is only used to look up the package's `slug` for `revalidatePath` — the actual `UPDATE` calls key solely on `item.id` from the client-supplied `order` array, with no `.eq("package_id", packageId)` scoping. Any `package_photos.id` reachable by a `can_manage_packages` caller (i.e., any photo in the catalog, per the RLS policy in the 02-01 migration) can have its `display_order` silently rewritten via a request whose `order` array references photos from a different package than the one named in `packageId`. This doesn't cross a permission boundary (the same `can_manage_packages` gate applies catalog-wide), but it is a data-integrity gap: a stale client array, a copy/paste bug in a future caller, or a malformed request can corrupt another package's photo ordering without any error being surfaced.

**Fix:** Scope the update to the intended package:

```ts
supabase
  .from("package_photos")
  .update({ display_order: item.displayOrder })
  .eq("id", item.id)
  .eq("package_id", packageId)
```

### WR-06: `error.tsx`'s hardcoded "Permission Denied" copy is now shown for any unexpected render exception, not just permission denials

**File:** `app/admin/(dashboard)/error.tsx:6-13`

**Issue:** The comment block asserts:

> "Every render-time throw currently reachable under this segment ... is exclusively a permission-gate Forbidden throw, so this boundary renders the UI-SPEC's fixed denial copy unconditionally rather than branching on error content."

That was true when pages called the throw-based `requirePermission()`/`requireAdmin()`. It is no longer true: every page under this segment (`packages/page.tsx`, `packages/new/page.tsx`, `packages/[id]/page.tsx`, `users/page.tsx`) now calls the redirect-based `requirePermissionOrRedirect()`/`requireAdminOrRedirect()` (see `lib/auth/dal.ts:85-110`), which redirects to `/admin/forbidden` instead of throwing. `error.tsx`'s boundary is therefore no longer reachable via the permission-gate path at all — it now only fires for genuinely unexpected exceptions (a Supabase query throwing, a null-dereference bug, etc.), yet it will still render "Permission Denied. Contact an Admin if you think this is a mistake." for those unrelated failures, actively misleading users (and whoever debugs their report) about the real cause.

**Fix:** Either update the boundary to render a generic "Something went wrong" message (reserving "Permission Denied" for the dedicated `/admin/forbidden` page, which is the sole intended destination now), or update the stale comment and confirm this dual-purpose behavior is intentional.

## Info

### IN-01: `profiles.role` is typed as a bare `string`, not a literal union

**File:** `types/database.ts:194,205,216`

**Issue:** The generated `Database["public"]["Tables"]["profiles"]` type has `role: string` (Row/Insert/Update), even though the migration defines `role text not null default 'staff' check (role in ('admin', 'staff'))`. All application code (`lib/auth/dal.ts`, `actions/users.ts`) narrows this manually with `profile.role === "admin"` string comparisons, which works but gets no compile-time protection against a typo'd role string being passed through `updateAccount`/`createAccount`'s `role: values.role` (those call sites are typed via `AccountInput.role: "admin" | "staff"`, so today it's safe, but the generated DB type itself offers no guardrail for future call sites).

**Fix:** If regenerating `types/database.ts` via `supabase gen types`, consider a Postgres `enum` for `role` (or manually narrow the generated type) so `role` is `"admin" | "staff"` end-to-end.

### IN-02: Dead/no-op `try/catch` around `headers()` in `getSiteOrigin()`

**File:** `actions/auth.ts:19-28`

**Issue:**

```ts
try {
  const headersList = await headers();
  ...
} catch {
  // headers() is only available within a request scope — fall through.
}
```

`getSiteOrigin()` is only ever invoked from `requestPasswordReset()`, itself a Server Action, which always executes within request scope — `headers()` cannot throw here in practice. The catch branch is unreachable dead code in the current call graph; harmless, but worth removing or re-documenting if it's meant as defensive boilerplate for a future caller.

### IN-03: Stale comment in `lib/supabase/server.ts` claims no middleware refreshes sessions

**File:** `lib/supabase/server.ts:29-32`

**Issue:** The `setAll` cookie-write catch comment reads: `"Called from a Server Component — safe to ignore since Phase 1 has no middleware refreshing sessions yet."` This phase (Phase 2) added `lib/supabase/proxy.ts`'s `updateSession()`, which *does* refresh the session cookie on every `/admin/*` request. The comment's justification is now inaccurate and could mislead a future reader into thinking there's no middleware-level session refresh in place at all.

**Fix:** Update the comment to reflect that `lib/supabase/proxy.ts` now handles session refresh, and that the try/catch here remains solely for the Server-Component-render case where cookie writes are disallowed regardless of middleware.

---

_Reviewed: 2026-07-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
