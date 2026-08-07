# Cloudflare R2 Image Storage — Design Spec

**Date:** 2026-08-08
**Status:** Approved by user, pending implementation plan.

## Summary

Replace Supabase Storage with Cloudflare R2 for all uploaded images (destination photos, hero-slide promo images, partner logos, testimonial photos, package photos). The project is still in development with no production images to preserve, so this is a clean cutover, not a migration — no dual-read fallback, no backfill. R2 is chosen for its larger free tier and zero egress fees. Public URLs are served via R2's free `pub-<hash>.r2.dev` URL for now; the design keeps switching to a custom domain before production launch a one-env-var change (see Future: Production Domain below).

## Architecture

A single new module, `lib/storage/r2.ts`, wraps an S3-compatible client (`@aws-sdk/client-s3` — R2 exposes an S3-compatible API; this is Cloudflare's recommended client for hosts outside Cloudflare Workers, which Vercel is). It exposes three functions:

```ts
uploadImage(folder: string, file: { name: string; type: string; base64: string }): Promise<{ key: string }>
deleteImage(key: string): Promise<void>
getPublicImageUrl(key: string): string
```

No generic multi-provider abstraction — there are only two call sites and one provider, so this is just centralizing R2 client setup and key-naming logic in one place instead of duplicating it.

`getPublicImageUrl(key)` builds `${R2_PUBLIC_URL}/${key}` — the DB never stores full URLs, only object keys, which is what makes the future domain swap a one-env-var change.

## Bucket Layout

Single bucket `travelsentro-media`, folder-prefixed, mirroring the current path scheme so key-naming logic barely changes:

```
travelsentro-media/
  packages/<packageId>/photo-<timestamp>-<index>.<ext>
  destinations/<timestamp>-<uuid8>.<ext>
  hero-slides/<timestamp>-<uuid8>.<ext>
  partners/<timestamp>-<uuid8>.<ext>
  testimonials/<timestamp>-<uuid8>.<ext>
```

Public access via the bucket's built-in r2.dev URL (dashboard toggle, no DNS).

## Components Touched

- **`actions/site-content-uploads.ts`** — `uploadSiteContentImage()` / `deleteSiteContentImage()` call `r2.ts`'s `uploadImage`/`deleteImage` instead of `supabase.storage.from("site-content")`. Same base64-in, path-out signature; `requirePermission("can_manage_packages")` gate unchanged.
- **`actions/package-photos.ts`** — `uploadPhotos()` / `deletePhoto()` / `reorderPhotos()` call R2 for the storage operations; `reorderPhotos()` (DB-only, no storage calls) is unaffected. Permission gate unchanged.
- **Read-side URL resolution** — introduce the call to `getPublicImageUrl(key)` at each of the ~7 current `supabase.storage.from(...).getPublicUrl(...)` call sites, replacing per-component duplication with the shared helper:
  - `app/(public)/page.tsx`, `app/(public)/packages/page.tsx`, `app/(public)/packages/[slug]/page.tsx`
  - `app/admin/(dashboard)/content/page.tsx`, `app/admin/(dashboard)/packages/page.tsx`, `app/admin/(dashboard)/packages/destinations/page.tsx`
  - `components/admin/photo-manager.tsx` (client-side; imports the same helper instead of calling `createClient().storage...`)
- **`lib/read-file-as-base64.ts`** — unchanged; client-side base64 read stays identical regardless of storage backend.
- **`scripts/seed.ts`** — seed photo upload calls switch to `uploadImage()`.

## Database

No schema changes to column types — `photo_storage_path`, `image_storage_path`, `logo_storage_path`, and `package_photos.storage_path` keep storing path-like strings, now interpreted as R2 object keys.

New migration drops the now-unused Supabase Storage infrastructure (dev-only, nothing to preserve):
```sql
delete from storage.objects where bucket_id in ('package-photos', 'site-content');
delete from storage.buckets where id in ('package-photos', 'site-content');
-- drop the storage.objects RLS policies created for these buckets in
-- 20260718150801_admin_rbac_and_package_write_policies.sql and
-- 20260727075208_create_homepage_content_schema.sql
```

## Environment Variables

New server-only vars (never `NEXT_PUBLIC_`-prefixed — all storage operations happen in Server Actions), added to `.env.local.example` with the same one-comment-per-var style as existing entries:

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=travelsentro-media
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

## Provisioning (manual, one-time)

Not a Vercel Marketplace integration — requires manual Cloudflare dashboard steps before implementation can be verified end-to-end:
1. Create/confirm a Cloudflare account.
2. Create the `travelsentro-media` R2 bucket.
3. Enable the bucket's public r2.dev URL.
4. Create an API token scoped to R2 Object Read & Write.
5. Note the Account ID, Access Key ID, Secret Access Key, and the r2.dev public URL.

These values go into `.env.local` for local dev and `vercel env add` for deployed environments.

## New Dependency

`@aws-sdk/client-s3` (no existing S3/R2 client in the project).

## Future: Production Domain

Before going live, r2.dev must be replaced with a custom domain (e.g. `cdn.travelsentro.com`) bound to the bucket through Cloudflare — r2.dev has no SLA and can be rate-limited. Because the DB stores only object keys and `getPublicImageUrl()` builds URLs from `R2_PUBLIC_URL`, this swap is: bind the custom domain in the Cloudflare dashboard, update `R2_PUBLIC_URL`, redeploy. No code or data changes. Out of scope for this implementation.

## Explicit Non-Goals

- No migration of existing images — none exist yet (dev-only project).
- No dual-read fallback between Supabase Storage and R2.
- No generic multi-storage-provider abstraction layer.
- No custom-domain setup (see Future section above).
- No change to the base64-over-Server-Action upload transport, permission checks, or client-side form UX.
