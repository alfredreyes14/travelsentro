---
phase: 02-admin-access-package-management
reviewed: 2026-07-19T15:45:00Z
depth: standard
files_reviewed: 46
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
  - next.config.ts
  - scripts/seed-admin.ts
  - scripts/verify-password-reset-redirect.ts
  - scripts/verify-permission-denial.ts
  - supabase/config.toml
  - supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql
  - supabase/migrations/20260718171228_atomic_package_children_write.sql
  - types/database.ts
findings:
  critical: 0
  warning: 9
  info: 3
  total: 12
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-19T15:45:00Z
**Depth:** standard
**Files Reviewed:** 46 (per `files_reviewed_list`; ui/hooks/scripts/migrations included as context)
**Status:** issues_found

## Summary

This is a re-review of Phase 2 after gap-closure plans 02-16 (CR-01, photo upload body-size/batching) and 02-17 (CR-02, admin self-/last-admin deactivation lockout). Both prior Critical findings were independently re-verified against current source and confirmed correctly fixed — no new Critical findings were found in this pass. The AUTH-01 diagnostic-only logging added in 02-18 (`app/admin/auth/confirm/route.ts`) was reviewed and is correctly scoped (no raw PKCE code or session data logged); it remains open by design and is not flagged here.

This review does carry forward the prior review's 7 unresolved Warning findings (WR-01 through WR-07), since none of the intervening gap-closure plans touched the files they live in — they are still present in the current source, confirmed by direct re-read. It also surfaces one new Warning (missing error handling in `photo-manager.tsx`'s `handleDelete`, which leaves the UI in a silently-incorrect state on failure) and a hardening note on the password-reset redirect origin derivation. Info-level items are minor completeness/DRY notes, not action-blocking.

### CR-01 / CR-02 re-verification (confirmed fixed, not reopened)

- **CR-01 (photo upload body-size limit):** `next.config.ts` now sets `experimental.serverActions.bodySizeLimit: "10mb"` (line 25), and `components/admin/photo-manager.tsx`'s `handleFilesSelected` now calls `uploadPhotos(packageId, [file])` once per selected file inside a sequential `for...of` loop (lines 191-201), never batching multiple files' base64 payloads into one call. Confirmed correctly landed.
- **CR-02 (self-/last-admin deactivation lockout):** `actions/users.ts`'s `deactivateAccount()` (lines 127-166) now captures `caller` from `requireAdmin()`, unconditionally rejects `caller.id === id` (lines 133-135), and rejects deactivation when no other active admin exists (lines 141-150). `scripts/seed-admin.ts`'s break-glass `existingAdmin` lookup now filters `.eq('is_active', true)` (line 70), so it can actually recover from this lockout state. Confirmed correctly landed. (See Info section below for one residual, non-blocking hardening note on this same code path.)

## Warnings

### WR-01: `createPackage`'s `sort_order` can collide after a soft-delete (carried forward, unchanged)

**File:** `actions/packages.ts:81-98`
**Issue:** New packages get `sort_order: count ?? 0`, where `count` is the number of active (non-deleted) rows. Soft-deleting a package does not renumber `sort_order` for the remaining rows, so this active-row *count* can collide with an existing `sort_order` value already in use once at least one prior package has been soft-deleted (e.g. 3 packages with `sort_order` 0/1/2, delete #2 → 2 active rows remain but `sort_order` values 0 and 2 are in use → a new package gets `sort_order: 2`, colliding with the still-existing row).
**Fix:**
```ts
const { data: maxRow } = await supabase
  .from("packages")
  .select("sort_order")
  .order("sort_order", { ascending: false })
  .limit(1)
  .maybeSingle();
const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;
```

### WR-02: `createAccount` leaves an orphaned auth user on partial failure (carried forward, unchanged)

**File:** `actions/users.ts:37-96`
**Issue:** `serviceRoleClient.auth.admin.createUser(...)` (line 62) creates a fully-active auth user before the subsequent `profiles` UPDATE (line 79). If that update fails (network blip, RLS edge case, etc.), the function returns a generic error but the auth user remains — an orphaned, unconfigured (default staff, no permissions) but real, login-capable account with no name/role/permissions ever explicitly set by the admin who thought creation failed.
**Fix:** On `updateError`, call `serviceRoleClient.auth.admin.deleteUser(created.user.id)` before returning the error, or wrap in a retry-safe reconciliation step.

### WR-03: `reorderPhotos` updates rows by `id` alone with no `package_id` scoping, non-atomically (carried forward, unchanged)

**File:** `actions/package-photos.ts:175-208`
**Issue:** `order.map((item) => supabase.from("package_photos").update({ display_order: item.displayOrder }).eq("id", item.id))` never filters by `package_id`. A stale/malformed/crafted client payload (e.g. a direct Server Action call with an `id` belonging to a different package) can rewrite another package's photo ordering. The `Promise.all` of independent per-row updates is also non-atomic — a partial failure can leave `display_order` values inconsistent across photos.
**Fix:** Add `.eq("package_id", packageId)` to each update, and/or wrap the whole reorder in a single RPC (mirroring the `write_package_children` pattern already used elsewhere in this phase for exactly this atomicity concern).

### WR-04: `reorderPackages` persists order via non-atomic per-row writes (carried forward, unchanged)

**File:** `actions/packages.ts:247-271`
**Issue:** Same shape as WR-03 — `Promise.all` of independent `update` calls, no single transaction. A partial failure (e.g. network drop mid-batch) leaves some rows updated and others not, causing client/server `sort_order` desync until the next successful reorder.
**Fix:** Wrap in a single `write_packages_order`-style RPC executed in one transaction, consistent with `write_package_children`'s existing atomic pattern.

### WR-05: `deletePhoto` removes the Storage object before the DB row (carried forward, unchanged)

**File:** `actions/package-photos.ts:125-169`
**Issue:** Storage removal (line 150) happens before the `package_photos` row delete (line 158). If the DB delete fails after a successful Storage removal, the `package_photos` row survives referencing a now-missing Storage object — a broken image on the public site with no automatic recovery.
**Fix:** Reverse the order (DB delete first, then Storage removal), or accept the row-survives-orphaned-storage-path direction only if it's paired with a cleanup job — DB-first is safer since it fails closed (row visible with a working image) rather than failing open (row survives with a broken image).

### WR-06: No server-side MIME-type or size validation on photo uploads (carried forward, unchanged)

**File:** `actions/package-photos.ts:25-28, 76-89`
**Issue:** `extensionFromMimeType()` and the Storage `upload()` call both trust the client-supplied `file.type` string end-to-end with no server-side allow-list check (e.g. `image/jpeg`, `image/png`, `image/webp` only) and no explicit size ceiling beyond the blanket 10mb Server Action body limit (which bounds the whole request, not a single file's content-type appropriateness). Any account with `can_manage_packages` could upload a non-image file (e.g. `type: "text/html"`) to a public-read Storage bucket with a spoofed `Content-Type`.
**Fix:** Validate `file.type` against an explicit image MIME allow-list server-side before calling `storage.upload()`, and reject anything else with a clear `ActionResult` error.

### WR-07: Photo mutations never revalidate `/admin/packages` (carried forward, unchanged)

**File:** `actions/package-photos.ts:116, 167, 206-207`
**Issue:** `uploadPhotos`, `deletePhoto`, and `reorderPhotos` only call `revalidatePath(`/packages/${pkg.slug}`)` (the public detail page). None call `revalidatePath("/admin/packages")`, so the admin list's thumbnail (sourced from the first photo by `display_order`, per `app/admin/(dashboard)/packages/page.tsx`) can go stale after an upload/delete/reorder until the admin manually navigates away and back or triggers some other action that does revalidate that path.
**Fix:** Add `revalidatePath("/admin/packages")` alongside the existing `revalidatePath` calls in all three functions.

### WR-08: `photo-manager.tsx`'s `handleDelete` has no error handling — failure leaves UI silently wrong (new this review)

**File:** `components/admin/photo-manager.tsx:225-238`
**Issue:** Unlike every other mutation handler in this phase (`handlePublishChange`/`handleFeatureChange`/`handleDelete` in `package-list-row.tsx`, `handleDeactivate` in `users-table.tsx`, `handleDragEnd` in this same file), `handleDelete` calls `await deletePhoto(photoId)` with **no try/catch**:
```tsx
async function handleDelete(photoId: string) {
  setDeletingId(photoId);
  const previousPhotos = photos;
  setPhotos((current) => current.filter((photo) => photo.id !== photoId));

  const result = await deletePhoto(photoId);   // <- can throw, not just reject with {ok:false}
  if (!result.ok) {
    toast.error(result.error);
    setPhotos(previousPhotos);
  } else {
    toast.success("Photo deleted.");
  }
  setDeletingId(null);
}
```
`deletePhoto` is a Server Action that can *throw* (not just return `{ok:false}`) — e.g. if `requirePermission("can_manage_packages")` throws `Error("Forbidden")` (a permission revoked mid-session, a stale tab, etc.) or on an unexpected network/Supabase exception. If it throws here, the optimistic `setPhotos` removal (already applied above the `await`) is never rolled back, no error toast is ever shown, and the user is left believing the photo was deleted when it was not — a UI/DB state mismatch that only self-corrects on the next full page load.
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

### WR-09: Password-reset redirect origin trusts client-supplied `Host`/`x-forwarded-proto` headers when `NEXT_PUBLIC_SITE_URL` is unset

**File:** `actions/auth.ts:14-31`
**Issue:** `getSiteOrigin()` falls back to `` `${protocol}://${host}` `` built directly from the incoming request's `host` and `x-forwarded-proto` headers whenever `NEXT_PUBLIC_SITE_URL` is not set. Both headers are, in general, client-influenceable at the HTTP layer. If this env var is ever left unset in a deployed environment (a plausible misconfiguration, not just local dev — the code comment frames the fallback as "local dev" but nothing prevents it from silently activating in a misconfigured production deploy), a request with a spoofed `Host` header to `requestPasswordReset` could cause the reset email's `redirectTo` origin to point at an attacker-influenced value. Actual impact is bounded by Supabase's own server-side redirect-URL allow-list (`URI_ALLOW_LIST` / `additional_redirect_urls` in `supabase/config.toml` for local, and the hosted project's equivalent config for prod) — a spoofed origin has to already be on that allow-list to actually receive the PKCE code — so this is not directly exploitable against a correctly-configured hosted project, but it removes a layer of defense-in-depth and turns "env var not set" from a broken-links bug into a security-relevant misconfiguration.
**Fix:** Fail loudly instead of silently falling back to header-derived values outside of local development — e.g. gate the header-based fallback behind `process.env.NODE_ENV !== "production"`, and throw/log an error in production if `NEXT_PUBLIC_SITE_URL` is missing rather than deriving an origin from the request.

## Info

### IN-01: `deactivateAccount`'s admin-count query silently swallows errors

**File:** `actions/users.ts:141-150`
**Issue:** `const { count: otherActiveAdminCount } = await supabase.from("profiles")...` does not check `error`. If the count query itself fails (RLS edge case, transient DB error), `count` comes back `null`, and `!otherActiveAdminCount` is `true`, so the function reports `"Can't deactivate the last remaining admin."` even when the real admin count is unknown. This fails closed (safe — no deactivation proceeds), so it is not a security issue, but the error message shown to the caller is misleading about *why* the action was blocked.
**Fix:** Check `error` explicitly and return the existing `GENERIC_ERROR_MESSAGE` in that branch, reserving the "last remaining admin" message for the case where the count is genuinely known to be zero.

### IN-02: 10mb Server Action body limit (CR-01's fix) still has residual headroom risk for very large modern photos

**File:** `next.config.ts:25`
**Issue:** Not a defect in the 02-16 fix — `10mb` matches the review's own suggested value and closes the confirmed 1MB-default failure. Noting for awareness only: base64 encoding's ~33% overhead means the effective raw-file ceiling is closer to ~7.5MB. Some modern phone cameras (48MP HEIC/JPEG at max quality) can exceed that. Not a regression and not something to fix reactively without a concrete repro — flagging only so a future oversized-upload report isn't mistaken for CR-01 recurring.
**Fix:** None required now. If a future realistic upload still fails at 10mb, consider a direct-to-Storage signed-upload flow (bypasses the Server Action body limit entirely) rather than raising the limit further.

### IN-03: Uploaded photos have no way to set `alt_text` from the admin UI

**File:** `actions/package-photos.ts:99`, `components/admin/photo-manager.tsx`
**Issue:** `uploadPhotos` always inserts `alt_text: null` (line 99), and there is no form field anywhere in `PhotoManager` to set or edit it afterward. Every photo's `alt` attribute therefore renders as `""` (`photo.altText ?? ""` in `PhotoThumbnail`), which is a completeness/accessibility gap if these photos are also rendered on the public site with the same `alt_text` value.
**Fix:** Not blocking for this phase's scope, but worth a follow-up task to add an editable alt-text field per photo in `PhotoManager`.

---

_Reviewed: 2026-07-19T15:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
