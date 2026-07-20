---
phase: 02-admin-access-package-management
reviewed: 2026-07-20T09:44:29Z
depth: standard
files_reviewed: 53
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
  warning: 10
  info: 5
  total: 16
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-20T09:44:29Z
**Depth:** standard
**Files Reviewed:** 53
**Status:** issues_found

## Summary

This is an independent re-review of the Phase 2 admin auth/RBAC and package-management surface (Server Actions, DAL, RLS migrations, admin pages, and their client forms/tables). A prior 02-REVIEW.md pass exists in this directory (dated 2026-07-19) whose CR-01/CR-02 findings were confirmed fixed and whose Warning/Info items were largely still present at re-read; this review re-verifies those against the current source and adds one new Critical and several new findings, superseding the prior file.

The permission-gating pattern (`requirePermission`/`requireAdmin` in `lib/auth/dal.ts` + independent RLS policies) is applied consistently and correctly across `actions/packages.ts` and `actions/package-photos.ts`, and the atomic `write_package_children()` RPC correctly closes the partial-write hazard it documents. However, one genuine blocking gap was found: `deactivateAccount()` explicitly guards against self-deactivation and removing the last active admin, but the sibling `updateAccount()` action — reachable from the exact same "Edit Account" UI, on any row including the caller's own — has neither guard, so a normal role/permission edit can silently lock every admin out of the panel with no in-app recovery path. The remaining findings are mostly missing server-side re-validation, non-atomic multi-row writes, and defense-in-depth gaps where RLS alone doesn't back up an application-level invariant.

## Critical Issues

### CR-01: `updateAccount()` allows self-demotion and removal of the last admin, unlike `deactivateAccount()`

**File:** `actions/users.ts:98-125`
**Issue:** `deactivateAccount()` (lines 127-166) explicitly rejects self-deactivation (`caller.id === id`) and rejects deactivating the last active admin (an `otherActiveAdminCount` check) — both guarded specifically because, per the code's own comment, "an admin could sign themselves out of the entire panel... with no recovery" (T-02-40/T-02-41). `updateAccount()`, invoked when an Admin edits any account's Role/permissions via `components/admin/account-form.tsx`'s `EditAccountForm` (reachable from `components/admin/users-table.tsx`'s "Edit" menu item on *any* row, including the signed-in admin's own — there is no client-side restriction either), has no equivalent checks. `requireAdmin()` only confirms the *caller* is currently an admin at the time of the call; it does not stop the caller from writing `role: "staff"` onto their own row, or onto the last other admin's row, via this same Server Action.

Because `getProfile()` in `lib/auth/dal.ts` re-checks `role` on every request, the very next request from that account hits `requireAdminOrRedirect()`/`requirePermissionOrRedirect()` and is denied — potentially leaving **zero** accounts with `role = 'admin'`, with no in-app recovery (only `scripts/seed-admin.ts`, a CLI script requiring server env credentials, can fix it). This is reachable with zero malicious intent — an ordinary "Edit Account" save on the wrong row is enough.
**Fix:**
```ts
// actions/users.ts
export async function updateAccount(
  id: string,
  values: AccountInput
): Promise<ActionResult> {
  const caller = await requireAdmin();
  const supabase = await createClient();

  // Mirror deactivateAccount()'s guards for role changes away from admin.
  if (values.role !== "admin") {
    if (caller.id === id) {
      return { ok: false, error: "You can't remove your own admin role." };
    }

    const { count: otherActiveAdminCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", id);

    if (!otherActiveAdminCount) {
      return {
        ok: false,
        error: "Can't remove the last remaining admin's admin role.",
      };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: values.name,
      role: values.role,
      can_manage_packages: values.canManagePackages,
      can_message_customers: values.canMessageCustomers,
      can_edit_crm: values.canEditCrm,
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
```

## Warnings

### WR-01: `createAccount()` leaves an orphaned, fully-functional auth account on partial failure

**File:** `actions/users.ts:37-96`
**Issue:** `createAccount()` first creates the Supabase Auth user via the service-role client with `email_confirm: true` (lines 62-67), then separately updates the auto-created `profiles` row with the admin-chosen name/role/permissions (lines 79-88). If that second update fails (network blip, transient DB error), the function returns `{ ok: false, error: GENERIC_ERROR_MESSAGE }`, but the auth user from step 1 is never rolled back. The submitted email/password now belongs to a real, confirmed, login-capable account (defaulting to `role='staff'`, all permissions `false`, via the `on_auth_user_created` trigger), even though the admin was told the operation failed. A retry with the same email then fails with "already registered," and the admin has no way to discover the orphaned account from the Users list (its `name` stays `null`, indistinguishable from an intentionally-created zero-permission account).
**Fix:** On `updateError`, delete the just-created auth user before returning, so `createAccount()` is effectively atomic:
```ts
if (updateError) {
  await serviceRoleClient.auth.admin.deleteUser(created.user.id);
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-02: Server Actions accept unvalidated input — Zod schemas run client-side only

**File:** `actions/users.ts:37,98`; `actions/packages.ts:72,127`
**Issue:** `createAccountSchema`/`editAccountSchema` (min-8 password, valid email, non-empty name) and `packageFormSchema` (positive integer price/duration, slug regex) are only ever invoked via `zodResolver()` inside the client forms. The Server Actions themselves (`createAccount`, `updateAccount`, `createPackage`, `updatePackage`) accept the typed object directly with no server-side re-parse. Since Server Actions are directly callable HTTP endpoints, not gated by the browser form, a caller bypassing the UI can submit e.g. a password as short as Supabase's own `minimum_password_length` allows (defaults to 6 in `supabase/config.toml:177`, weaker than the app's intended 8-char policy), a negative `fromPrice`/`durationDays`, or a slug that doesn't match the public route's expected format.
**Fix:** Re-run the same Zod schema (`.safeParse`) at the top of each Server Action and return `{ ok: false, error }` on failure:
```ts
const parsed = createAccountSchema.safeParse(values);
if (!parsed.success) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}
```

### WR-03: `uploadPhotos()` trusts the client-supplied MIME type with no allow-list check

**File:** `actions/package-photos.ts:25-28,76-89`
**Issue:** `UploadPhotoInput.type` is an arbitrary client-supplied string, used both as the Storage object's `contentType` (line 84) and, via `extensionFromMimeType()`, to derive the stored file's extension. There is no allow-list check (e.g. `type.startsWith("image/")`) and no verification against the actual file bytes. Any account holding `can_manage_packages` (a Staff-grantable, non-admin permission) can set `type` to anything (e.g. `text/html`), causing arbitrary content to be stored in the **public** `package-photos` bucket with an attacker-chosen `Content-Type`. The client's `accept="image/*"` on `components/admin/photo-manager.tsx:278`'s file input is a UI hint only, not enforcement.
**Fix:**
```ts
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
for (const [index, file] of files.entries()) {
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  // ...
}
```

### WR-04: `reorderPhotos`/`reorderPackages` write via non-atomic per-row updates, and `reorderPhotos` has no `package_id` scoping

**File:** `actions/package-photos.ts:175-208`; `actions/packages.ts:247-271`
**Issue:** Both functions apply a client-supplied reorder array via `Promise.all(order.map((item) => supabase.from(...).update({...}).eq("id", item.id)))` with no surrounding transaction — a partial failure mid-batch leaves some rows updated and others not, desyncing client and server order until the next successful reorder. `reorderPhotos` additionally never filters by `.eq("package_id", packageId)`, so a stale/crafted client payload containing an `id` from a *different* package silently rewrites that unrelated package's photo ordering; `revalidatePath` only refreshes the intended package's slug, so the corrupted ordering on the unrelated package isn't even reflected until its own page next revalidates for an unrelated reason.
**Fix:** Scope `reorderPhotos`'s update with `.eq("package_id", packageId)`, and consider wrapping both reorder operations in a single RPC (mirroring the `write_package_children` pattern already used elsewhere in this phase) so a partial failure can't leave sort order inconsistent.

### WR-05: `getSiteOrigin()` falls back to trusting the raw `Host`/`X-Forwarded-Proto` headers

**File:** `actions/auth.ts:14-31`
**Issue:** When `NEXT_PUBLIC_SITE_URL` is unset, `getSiteOrigin()` builds the password-reset `redirectTo` origin from the incoming request's `host`/`x-forwarded-proto` headers, which are attacker-influenceable in the absence of a trusted reverse proxy that overwrites them. This is the classic precursor to Host Header Injection / password-reset-link poisoning. Actual impact is currently bounded entirely by Supabase Auth's own `URI_ALLOW_LIST` enforcement on the hosted project — a spoofed origin must already be on that allow-list to receive the PKCE code — so this isn't directly exploitable against a correctly-configured deployment, but it turns "env var not set" from a broken-link bug into a security-relevant misconfiguration, and provides no defense-in-depth of its own.
**Fix:** Gate the header-based fallback behind non-production environments and fail loudly if `NEXT_PUBLIC_SITE_URL` is missing in production, rather than silently deriving an origin from client-supplied headers:
```ts
if (process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
}
```

### WR-06: Self-deactivation / last-admin protections exist only in application code, not in RLS

**File:** `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql:88-91`; `actions/users.ts:127-166`
**Issue:** The `"admin can update profiles"` RLS policy permits any admin to update any `profiles` row, including their own, with no restriction. Every other write path in this phase explicitly frames RLS as an "independent second layer" alongside the Server Action's permission check (see the `AUTH-05` comments throughout `actions/packages.ts`/`actions/package-photos.ts`). For account deactivation (and, per CR-01, role edits) that second independent layer doesn't exist at the database level — the self-deactivation and last-admin checks live *only* in `actions/users.ts`, so a direct REST/RPC call against Supabase with a valid admin session (bypassing the Server Action entirely) can deactivate itself or demote the last admin with no DB-level backstop.
**Fix:** Add a `BEFORE UPDATE` trigger (or check constraint referencing a helper function) on `profiles` that rejects an update setting `is_active = false` or `role <> 'admin'` on a row that is either the caller's own or the last active admin, giving this invariant the same database-level backing the rest of the schema already has.

### WR-07: `photo-manager.tsx`'s `handleDelete` has no error handling — a thrown Server Action leaves the UI silently wrong

**File:** `components/admin/photo-manager.tsx:225-238`
**Issue:** Unlike every other mutation handler in this phase (`handlePublishChange`/`handleFeatureChange`/`handleDelete` in `package-list-row.tsx`, `handleDeactivate` in `users-table.tsx`, and this same file's own `handleDragEnd`), `handleDelete` calls `await deletePhoto(photoId)` with no try/catch:
```tsx
async function handleDelete(photoId: string) {
  setDeletingId(photoId);
  const previousPhotos = photos;
  setPhotos((current) => current.filter((photo) => photo.id !== photoId));

  const result = await deletePhoto(photoId);   // can throw, not just reject with {ok:false}
  if (!result.ok) { ... }
  setDeletingId(null);
}
```
`deletePhoto` is a Server Action that can *throw* — e.g. `requirePermission("can_manage_packages")` throwing `Error("Forbidden")` if permissions are revoked mid-session, or an unexpected network/Supabase exception. If it throws here, the optimistic `setPhotos` removal (already applied above the `await`) is never rolled back, no error toast is shown, and `setDeletingId(null)` never runs — the user is left believing the photo was deleted (and the delete button stays permanently disabled for that photo) when it was not.
**Fix:**
```tsx
async function handleDelete(photoId: string) {
  setDeletingId(photoId);
  const previousPhotos = photos;
  setPhotos((current) => current.filter((photo) => photo.id !== photoId));
  try {
    const result = await deletePhoto(photoId);
    if (!result.ok) {
      toast.error(result.error);
      setPhotos(previousPhotos);
    } else {
      toast.success("Photo deleted.");
    }
  } catch {
    toast.error(GENERIC_ERROR_MESSAGE);
    setPhotos(previousPhotos);
  } finally {
    setDeletingId(null);
  }
}
```

### WR-08: `createPackage`'s `sort_order` can collide after a soft-delete, and its count query swallows errors

**File:** `actions/packages.ts:82-98`
**Issue:** New packages get `sort_order: count ?? 0`, where `count` is the number of active (non-deleted) rows (`.is("deleted_at", null)`). Soft-deleting a package never renumbers `sort_order` for the remaining rows, so this active-row *count* can collide with an already-in-use `sort_order` once at least one prior package has been soft-deleted (e.g. 3 packages with `sort_order` 0/1/2; delete #2 → 2 active rows remain, but `sort_order` values 0 and 2 are still in use → a new package gets `sort_order: 2`, colliding with the still-existing row). Separately, the `count` query's `error` is never checked — on a transient failure `count` is `null`, and the code silently falls back to `sort_order: 0`, sending the new package to the very top of the list instead of surfacing a failure.
**Fix:**
```ts
const { data: maxRow, error: maxRowError } = await supabase
  .from("packages")
  .select("sort_order")
  .order("sort_order", { ascending: false })
  .limit(1)
  .maybeSingle();

if (maxRowError) {
  return { ok: false, error: GENERIC_ERROR_MESSAGE };
}

const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;
```

### WR-09: `deletePhoto` removes the Storage object before the DB row, risking an orphaned row on partial failure

**File:** `actions/package-photos.ts:125-169`
**Issue:** Storage removal (line 150-152) happens before the `package_photos` row delete (line 158-161). If the DB delete fails after a successful Storage removal (e.g. transient DB error), the `package_photos` row survives referencing a now-missing Storage object — a permanently broken image on the public site with no automatic recovery, and the caller is told the whole operation failed even though the Storage object really is gone.
**Fix:** Reverse the order — delete the DB row first, then remove the Storage object. This fails closed (the row survives with a still-working image) rather than failing open (the row survives with a permanently broken image).

### WR-10: Photo mutations never revalidate the admin packages list

**File:** `actions/package-photos.ts:116,167,206-207`
**Issue:** `uploadPhotos`, `deletePhoto`, and `reorderPhotos` only call `revalidatePath(`/packages/${pkg.slug}`)` (the public detail page). None call `revalidatePath("/admin/packages")`, so the admin list's thumbnail (sourced from the first photo by `display_order`, per `app/admin/(dashboard)/packages/page.tsx`) can go stale after an upload/delete/reorder until some unrelated action happens to revalidate that path.
**Fix:** Add `revalidatePath("/admin/packages")` alongside the existing `revalidatePath` call in all three functions.

## Info

### IN-01: Stale comment in `lib/supabase/server.ts` about "Phase 1 has no middleware"

**File:** `lib/supabase/server.ts:29-32`
**Issue:** The comment justifying the swallowed cookie-write error says "safe to ignore since Phase 1 has no middleware refreshing sessions yet." Phase 2 added `lib/supabase/proxy.ts` (`updateSession()`) plus the root `proxy.ts`, which now does exactly that on every `/admin/*` request. The comment is now inaccurate.
**Fix:** Update the comment to reflect that `proxy.ts` now refreshes sessions, and clarify the try/catch here is only needed because Server Components can't mutate cookies at all, regardless of middleware.

### IN-02: "Deactivate" menu item is shown for the signed-in admin's own row

**File:** `components/admin/users-table.tsx:164-171`
**Issue:** `Deactivate` is hidden only when `!profile.is_active`; it's still shown for the current admin's own account row. The server correctly rejects self-deactivation (`actions/users.ts:133-135`), so this isn't exploitable, but it's a confusing affordance — clicking it opens a confirmation dialog that will always fail.
**Fix:** Pass the current user's id down and also hide `Deactivate` when `profile.id === currentUserId`.

### IN-03: `PhotoManager`'s drag handler doesn't use `useTransition`, unlike its `SortablePackageList` counterpart

**File:** `components/admin/photo-manager.tsx:240-264`
**Issue:** `SortablePackageList.handleDragEnd` wraps its `reorderPackages` call in `startTransition` (`components/admin/sortable-package-list.tsx:69-82`), but `PhotoManager.handleDragEnd` calls `reorderPhotos(...).then(...)` directly with no transition — the same "Pattern 6" optimistic-reorder pattern implemented inconsistently.
**Fix:** Wrap the `reorderPhotos` call in `useTransition`/`startTransition` for consistency.

### IN-04: `deactivateAccount`'s admin-count query silently swallows errors

**File:** `actions/users.ts:141-150`
**Issue:** `const { count: otherActiveAdminCount } = await supabase.from("profiles")...` doesn't check `error`. If the count query itself fails, `count` comes back `null`, and `!otherActiveAdminCount` is `true`, so the function reports `"Can't deactivate the last remaining admin."` even when the real count is unknown. This fails closed (safe), but the error message is misleading about *why* the action was blocked.
**Fix:** Check `error` explicitly and return `GENERIC_ERROR_MESSAGE` in that branch, reserving the "last remaining admin" message for a genuinely-known zero count.

### IN-05: Uploaded photos have no way to set `alt_text` from the admin UI

**File:** `actions/package-photos.ts:99`; `components/admin/photo-manager.tsx`
**Issue:** `uploadPhotos` always inserts `alt_text: null`, and there's no form field anywhere in `PhotoManager` to set or edit it afterward, so every photo's `alt` attribute renders as `""` (`photo.altText ?? ""` in `PhotoThumbnail`) — an accessibility/completeness gap if these photos are also rendered on the public site using the same `alt_text` value.
**Fix:** Not blocking for this phase's scope; worth a follow-up task to add an editable alt-text field per photo in `PhotoManager`.

---

_Reviewed: 2026-07-20T09:44:29Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
