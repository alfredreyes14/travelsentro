# Cloudflare R2 Image Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Storage with Cloudflare R2 for all uploaded images (destination photos, hero-slide images, partner logos, testimonial photos, package photos).

**Architecture:** A new `lib/storage/` directory holds two small modules — `r2-client.ts` (server-only, wraps `@aws-sdk/client-s3` against R2's S3-compatible endpoint, exposes `uploadObject`/`deleteObject`) and `image-url.ts` (a pure, client-safe function `getPublicImageUrl(key)`). The two existing Server Action files that touch Storage swap their Supabase calls for `r2-client.ts`; the ~13 read-side call sites across 7 files swap their `supabase.storage...getPublicUrl()` calls for `getPublicImageUrl()`. DB columns keep storing path-like strings, now interpreted as R2 object keys — no schema type changes.

**Tech Stack:** `@aws-sdk/client-s3` (new dependency) against Cloudflare R2's S3-compatible API; Next.js Server Actions (unchanged transport — base64-over-Server Action, no new upload route).

## Global Constraints

- Single R2 bucket `travelsentro-media`, folder-prefixed keys: `packages/<packageId>/...`, `destinations/...`, `hero-slides/...`, `partners/...`, `testimonials/...` (spec's Bucket Layout section).
- Public access via the bucket's free `pub-<hash>.r2.dev` URL — no custom domain in this plan (spec's Future: Production Domain section, explicitly out of scope).
- No generic multi-storage-provider abstraction — `r2-client.ts` is R2-specific, called directly from the two action files (spec's Explicit Non-Goals).
- No migration of existing images and no dual-read fallback — dev-only project, clean cutover (spec's Explicit Non-Goals).
- **Deviation from spec wording:** the spec said all `R2_*` env vars are server-only ("never `NEXT_PUBLIC_`-prefixed"). Mapping the actual read-side call sites (Task 3) surfaced one exception: `components/admin/photo-manager.tsx` is a client component that builds thumbnail preview URLs immediately after upload, before any server refetch — it needs the public base URL at runtime in the browser. That one value is not a credential (it's a public bucket URL), so it's named `NEXT_PUBLIC_R2_PUBLIC_URL`. The four credential-bearing vars (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) stay server-only exactly as specified.
- **No unit test framework exists in this repo** (no jest/vitest — only ESLint + `tsc` + the project's own `scripts/verify-*.ts` convention: standalone `tsx` scripts that assert real behavior against live infrastructure). This plan follows that existing convention instead of introducing a new test framework: TypeScript/ESLint checks for mechanical correctness, one new `scripts/verify-r2-storage.ts` for the R2 client itself, and manual browser verification for the admin-form upload flows (matching this project's own instruction to verify UI changes in a browser before calling them done).

---

### Task 1: R2 client module, public-URL helper, and live verification script

**Files:**
- Create: `lib/storage/r2-client.ts`
- Create: `lib/storage/image-url.ts`
- Create: `scripts/verify-r2-storage.ts`
- Modify: `.env.local.example`
- Modify: `package.json` (dependency + npm script)

**Interfaces:**
- Produces: `uploadObject(key: string, body: Buffer, contentType: string): Promise<void>` and `deleteObject(key: string): Promise<void>` from `lib/storage/r2-client.ts` — consumed by Task 2.
- Produces: `getPublicImageUrl(key: string): string` from `lib/storage/image-url.ts` — consumed by Task 3.

- [ ] **Step 1: Install the R2 client dependency**

Run: `npm install @aws-sdk/client-s3`

- [ ] **Step 2: Document the new env vars**

Add to `.env.local.example`, after the existing `SUPABASE_SERVICE_ROLE_KEY` block:

```
# Cloudflare R2 — image storage (replaces Supabase Storage). Server/CLI-only
# credentials, never prefix with NEXT_PUBLIC_ or they will ship to the browser bundle.
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=travelsentro-media

# Public base URL for the R2 bucket (its r2.dev URL for now) — safe to expose
# to the browser (NEXT_PUBLIC_ prefix): components/admin/photo-manager.tsx
# builds thumbnail preview URLs with this client-side, right after upload.
NEXT_PUBLIC_R2_PUBLIC_URL=
```

- [ ] **Step 3: Provision the R2 bucket in Cloudflare (manual, one-time)**

This step needs your action in the Cloudflare dashboard before Step 6 (live verification) can run:

1. Sign in to (or create) a Cloudflare account at https://dash.cloudflare.com.
2. Go to **R2 Object Storage** → **Create bucket** → name it `travelsentro-media` (any region default is fine).
3. Open the bucket → **Settings** → under **Public access**, enable the **r2.dev subdomain**. Copy the resulting `https://pub-<hash>.r2.dev` URL.
4. Go to **R2** → **Manage API tokens** → **Create API token** → permission **Object Read & Write**, scoped to the `travelsentro-media` bucket. Copy the **Access Key ID** and **Secret Access Key** shown (the secret is shown once).
5. Your Account ID is shown in the R2 dashboard's right sidebar (or in any bucket's **Settings** page).
6. Fill in `.env.local` (create it from `.env.local.example` if it doesn't already have these keys) with the five values from steps 3–5: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=travelsentro-media`, `NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-<hash>.r2.dev`.

Tell me once `.env.local` is filled in so we can continue to the live verification step.

- [ ] **Step 4: Write the R2 client module**

`lib/storage/r2-client.ts`:

```ts
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Constructed per-call rather than module-top-level, so a missing env var
 * only throws when a storage operation actually runs (e.g. inside a Server
 * Action at request time), never at build time / module import time.
 */
function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    })
  );
}
```

- [ ] **Step 5: Write the public-URL helper**

`lib/storage/image-url.ts`:

```ts
/**
 * Builds a public URL for an R2 object key. Pure and client-safe (no AWS
 * SDK import, no credentials) — components/admin/photo-manager.tsx calls
 * this directly in the browser to build thumbnail preview URLs right after
 * upload, before any server refetch.
 */
export function getPublicImageUrl(key: string): string {
  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;
}
```

- [ ] **Step 6: Write the live verification script**

`scripts/verify-r2-storage.ts`:

```ts
/**
 * Live-HTTP verification that lib/storage/r2-client.ts and
 * lib/storage/image-url.ts work end-to-end against a real R2 bucket:
 * uploads a disposable test object, fetches its public URL and checks the
 * bytes round-trip correctly, deletes it, then confirms the delete took
 * effect. Always attempts cleanup in a finally block, mirroring
 * scripts/verify-permission-denial.ts's disposable-resource convention.
 *
 * Run via `npm run verify:r2-storage` (-> `tsx --env-file=.env.local
 * scripts/verify-r2-storage.ts`). Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and NEXT_PUBLIC_R2_PUBLIC_URL to be
 * set in .env.local (see .env.local.example) — provision the bucket in the
 * Cloudflare dashboard first.
 */
import { uploadObject, deleteObject } from "../lib/storage/r2-client";
import { getPublicImageUrl } from "../lib/storage/image-url";

const REQUIRED_ENV_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "NEXT_PUBLIC_R2_PUBLIC_URL",
] as const;

for (const name of REQUIRED_ENV_VARS) {
  if (!process.env[name]) {
    throw new Error(
      `Missing ${name} in the environment. Provision the R2 bucket in the ` +
        `Cloudflare dashboard and populate .env.local (see .env.local.example) ` +
        `before running \`npm run verify:r2-storage\`.`
    );
  }
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const testKey = `verify/${Date.now()}.txt`;
  const testBody = "r2-verify-payload";
  const results: CheckResult[] = [];

  try {
    await uploadObject(testKey, Buffer.from(testBody), "text/plain");
    results.push({
      name: "uploadObject succeeds",
      pass: true,
      detail: `uploaded key=${testKey}`,
    });

    const url = getPublicImageUrl(testKey);
    const res = await fetch(url);
    const body = await res.text();
    const fetchPass = res.status === 200 && body === testBody;
    results.push({
      name: "Uploaded object is publicly readable",
      pass: fetchPass,
      detail: fetchPass
        ? `status=${res.status} body matches`
        : `status=${res.status} (want 200) body="${body}" (want "${testBody}") url=${url}`,
    });

    await deleteObject(testKey);
    results.push({
      name: "deleteObject succeeds",
      pass: true,
      detail: `deleted key=${testKey}`,
    });

    const resAfterDelete = await fetch(url);
    const deletedPass = resAfterDelete.status !== 200;
    results.push({
      name: "Deleted object is no longer readable",
      pass: deletedPass,
      detail: deletedPass
        ? `status=${resAfterDelete.status} (not 200, as expected)`
        : `status=${resAfterDelete.status} (want non-200 after delete)`,
    });
  } catch (err) {
    results.push({
      name: "Script ran without throwing",
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    // Best-effort cleanup even if an assertion above never reached delete.
    await deleteObject(testKey).catch(() => {});
  }

  console.log(`\nverify-r2-storage\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify-r2-storage failed:", err);
  process.exit(1);
});
```

- [ ] **Step 7: Register the verify script in package.json**

In `package.json`'s `"scripts"` block, add (after `"verify:permission-denial"`):

```json
    "verify:r2-storage": "tsx --env-file=.env.local scripts/verify-r2-storage.ts",
```

- [ ] **Step 8: Run the verification script**

Run: `npm run verify:r2-storage`
Expected: all 4 checks print `[PASS]` and the script exits 0. If it fails on the first check, double-check the five env vars against what the Cloudflare dashboard showed in Step 3.

- [ ] **Step 9: Commit**

```bash
git add lib/storage/r2-client.ts lib/storage/image-url.ts scripts/verify-r2-storage.ts .env.local.example package.json package-lock.json
git commit -m "feat: add Cloudflare R2 storage client and verification script"
```

---

### Task 2: Swap the upload/delete Server Actions to R2

**Files:**
- Modify: `actions/site-content-uploads.ts`
- Modify: `actions/package-photos.ts`

**Interfaces:**
- Consumes: `uploadObject(key, body, contentType)`, `deleteObject(key)` from `lib/storage/r2-client.ts` (Task 1).
- Produces: no change to either file's exported function signatures (`uploadSiteContentImage`, `deleteSiteContentImage`, `uploadPhotos`, `deletePhoto`, `reorderPhotos`) — callers (the 4 admin forms and `photo-manager.tsx`) need zero changes.

- [ ] **Step 1: Swap `actions/site-content-uploads.ts`**

This file's `supabase` client is used only for `.storage` calls (no DB table reads), so it's removed entirely. Replace the full file:

```ts
"use server";

import { requirePermission } from "@/lib/auth/dal";
import { uploadObject, deleteObject } from "@/lib/storage/r2-client";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type UploadImageInput = {
  name: string;
  type: string;
  base64: string;
};

function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}

/**
 * Uploads a single image to R2 and returns its object key. Unlike
 * package-photos.ts's uploadPhotos (multi-photo gallery, per-file
 * display_order computed from a running max), each hero slide/testimonial/
 * partner has at most one image, so there is no "current max" to race on --
 * the random suffix (not an index) is sufficient. Does NOT call
 * revalidatePath -- the uploaded image isn't attached to any visible entity
 * until the owning createSlide/createTestimonial/createPartner/updateSlide/
 * etc. call runs afterward and revalidates.
 */
export async function uploadSiteContentImage(
  folder: "hero-slides" | "testimonials" | "partners" | "destinations",
  file: UploadImageInput
): Promise<ActionResult & { storagePath?: string }> {
  await requirePermission("can_manage_packages");

  const buffer = Buffer.from(file.base64, "base64");
  const extension = extensionFromMimeType(file.type);
  const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

  try {
    await uploadObject(storagePath, buffer, file.type);
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true, storagePath };
}

/**
 * Standalone Storage-only utility for the admin form's "replace/remove
 * image before saving" UX -- does NOT also delete a database row (unlike
 * package-photos.ts's deletePhoto, which deletes both together) and is NOT
 * chained from deleteSlide/deleteTestimonial/deletePartner in this phase,
 * so a deleted entity's Storage object can become orphaned. This is an
 * accepted, documented scope limit, not a silent gap.
 */
export async function deleteSiteContentImage(
  storagePath: string
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  try {
    await deleteObject(storagePath);
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Swap `actions/package-photos.ts`'s storage calls**

This file keeps `createClient`/`supabase` (still needed for `packages`/`package_photos` table reads and writes) — only the two `.storage.from(...)` calls change, and the key prefix gains an explicit `packages/` folder (single-bucket layout, spec's Bucket Layout section).

In `actions/package-photos.ts`, add the import (after the existing `createClient` import):

```ts
import { uploadObject, deleteObject } from "@/lib/storage/r2-client";
```

Replace the upload loop body (currently lines 76–89):

```ts
  for (const [index, file] of files.entries()) {
    const buffer = Buffer.from(file.base64, "base64");
    const extension = extensionFromMimeType(file.type);
    const storagePath = `packages/${packageId}/photo-${Date.now()}-${index}.${extension}`;

    try {
      await uploadObject(storagePath, buffer, file.type);
    } catch {
      return { ok: false, error: GENERIC_ERROR_MESSAGE };
    }
```

(The rest of the loop body — the `package_photos` insert — is unchanged.)

Replace the delete call (currently lines 150–156):

```ts
  try {
    await deleteObject(photo.storage_path);
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add actions/site-content-uploads.ts actions/package-photos.ts
git commit -m "feat: upload/delete site-content and package images via R2"
```

---

### Task 3: Swap read-side URL resolution to R2

**Files:**
- Modify: `app/(public)/page.tsx:45-58,86-90,98-102,133,153-157,181-185,210-212,233-235`
- Modify: `app/(public)/packages/page.tsx:119-123`
- Modify: `app/(public)/packages/[slug]/page.tsx:100-104`
- Modify: `app/admin/(dashboard)/content/page.tsx:128-136,166-168`
- Modify: `app/admin/(dashboard)/packages/page.tsx:57-61`
- Modify: `app/admin/(dashboard)/packages/destinations/page.tsx:47-51`
- Modify: `components/admin/photo-manager.tsx:1-32,152,166-169,308`

**Interfaces:**
- Consumes: `getPublicImageUrl(key: string): string` from `lib/storage/image-url.ts` (Task 1).

- [ ] **Step 1: `app/(public)/page.tsx`**

Add the import (with the other `@/` imports):

```ts
import { getPublicImageUrl } from "@/lib/storage/image-url";
```

Replace the `firstPhotoUrl` helper (lines 45–58) — it no longer needs `supabase`/`bucket` params since there's one bucket and the key alone resolves the URL:

```ts
/** Resolves the first photo (by display_order) to a public image URL. */
function firstPhotoUrl(photos: PackagePhotoRef[]): string | null {
  const [firstPhoto] = [...photos].sort(
    (a, b) => a.display_order - b.display_order
  );
  return firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null;
}
```

Update its two call sites:

- Line ~86–90 (package-type hero slide): `imageUrl: firstPhotoUrl(slide.packages.package_photos),`
- Line ~133 (featured items): `photoUrl: firstPhotoUrl(pkg.package_photos),`

Replace the promo-slide image (lines 98–102):

```ts
      const imageUrl = slide.image_storage_path
        ? getPublicImageUrl(slide.image_storage_path)
        : null;
```

Replace the testimonial photo URL (lines 153–157):

```ts
      photoUrl: testimonial.photo_storage_path
        ? getPublicImageUrl(testimonial.photo_storage_path)
        : null,
```

Replace the destination photo URL (lines 181–185):

```ts
      photoUrl: d.photo_storage_path
        ? getPublicImageUrl(d.photo_storage_path)
        : null,
```

Replace the brand-partner logo URL (lines 210–212):

```ts
      logoUrl: getPublicImageUrl(partner.logo_storage_path),
```

Replace the corporate-client logo URL (lines 233–235):

```ts
      logoUrl: getPublicImageUrl(client.logo_storage_path),
```

- [ ] **Step 2: `app/(public)/packages/page.tsx`**

Add the import, then replace lines 119–123:

```ts
            const photoUrl = firstPhoto
              ? getPublicImageUrl(firstPhoto.storage_path)
              : null;
```

- [ ] **Step 3: `app/(public)/packages/[slug]/page.tsx`**

Add the import, then replace lines 100–104:

```ts
    .map((photo) => ({
      url: getPublicImageUrl(photo.storage_path),
      alt: photo.alt_text ?? pkg.name,
    }));
```

- [ ] **Step 4: `app/admin/(dashboard)/content/page.tsx`**

Add the import, then replace lines 128–136:

```ts
      let imageUrl: string | null = null;
      if (row.slide_type === "package" && row.packages) {
        const [firstPhoto] = [...row.packages.package_photos].sort(
          (a, b) => a.display_order - b.display_order
        );
        imageUrl = firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null;
      } else if (row.image_storage_path) {
        imageUrl = getPublicImageUrl(row.image_storage_path);
      }
```

Replace lines 166–168 (`mapPartnerRow`):

```ts
      logoUrl: getPublicImageUrl(row.logo_storage_path),
```

- [ ] **Step 5: `app/admin/(dashboard)/packages/page.tsx`**

Add the import, then replace lines 57–61:

```ts
    const photoUrl = firstPhoto
      ? getPublicImageUrl(firstPhoto.storage_path)
      : null;
```

- [ ] **Step 6: `app/admin/(dashboard)/packages/destinations/page.tsx`**

Add the import, then replace lines 47–51:

```ts
    photoUrl: row.photo_storage_path
      ? getPublicImageUrl(row.photo_storage_path)
      : null,
```

- [ ] **Step 7: `components/admin/photo-manager.tsx`**

Remove the now-unused Supabase client import and instance. Change:

```ts
import { createClient } from "@/lib/supabase/client";
```

to:

```ts
import { getPublicImageUrl } from "@/lib/storage/image-url";
```

Remove this line from inside `PhotoManager`:

```ts
  const supabase = createClient();
```

Remove the `urlFor` helper entirely (it added no value once it no longer closes over `supabase`):

```ts
  function urlFor(storagePath: string): string {
    return supabase.storage.from("package-photos").getPublicUrl(storagePath)
      .data.publicUrl;
  }
```

Update its one call site (in the `<PhotoThumbnail>` render):

```ts
                  url={getPublicImageUrl(photo.storagePath)}
```

- [ ] **Step 8: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused-import warnings.

- [ ] **Step 9: Commit**

```bash
git add app/\(public\)/page.tsx "app/(public)/packages/page.tsx" "app/(public)/packages/[slug]/page.tsx" "app/admin/(dashboard)/content/page.tsx" "app/admin/(dashboard)/packages/page.tsx" "app/admin/(dashboard)/packages/destinations/page.tsx" components/admin/photo-manager.tsx
git commit -m "feat: resolve image URLs via R2 instead of Supabase Storage"
```

---

### Task 4: Update the seed script

**Files:**
- Modify: `scripts/seed.ts:1-4,344-368` (import block and photo-upload loop)

**Interfaces:**
- Consumes: `uploadObject(key, body, contentType)` from `lib/storage/r2-client.ts` (Task 1).

- [ ] **Step 1: Add the import**

In `scripts/seed.ts`, add after the existing `import type { Database } from '../types/database'` line:

```ts
import { uploadObject } from '../lib/storage/r2-client'
```

- [ ] **Step 2: Replace the photo-upload block**

Replace the current upload block (lines 344–356):

```ts
  // Upload photos to R2, then insert package_photos rows.
  for (const photo of pkg.photos) {
    const fileBuffer = readFileSync(join(SEED_ASSETS_DIR, photo.file))
    const storagePath = `packages/${packageId}/photo-${photo.displayOrder + 1}.jpg`

    try {
      await uploadObject(storagePath, fileBuffer, 'image/jpeg')
    } catch (err) {
      throw new Error(
        `Failed to upload photo ${photo.file} for "${pkg.name}": ${err instanceof Error ? err.message : String(err)}`
      )
    }

    const { error: photoRowError } = await supabase.from('package_photos').insert({
      package_id: packageId,
      storage_path: storagePath,
      display_order: photo.displayOrder,
      alt_text: photo.altText,
    })

    if (photoRowError) {
      throw new Error(`Failed to insert package_photos row for "${pkg.name}": ${photoRowError.message}`)
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts
git commit -m "feat: upload seed package photos to R2"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the seed script**

Run: `npm run seed`
Expected: completes without error; console output shows each package's photos uploaded successfully (no Supabase Storage errors — uploads now go through `uploadObject`).

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Note the local URL it prints (e.g. `http://localhost:3000`).

- [ ] **Step 3: Verify the public site renders R2-hosted images**

In a browser, visit the homepage and `/packages`. Confirm: hero carousel images, featured package photos, destination tiles, testimonials, and partner logos all render. Open devtools' Network tab and confirm the image requests go to `https://pub-<hash>.r2.dev/...` (your `NEXT_PUBLIC_R2_PUBLIC_URL`), not a Supabase URL.

- [ ] **Step 4: Verify each admin upload form**

Sign in to `/admin` and, for each of the following, upload a new image and confirm it saves and displays correctly on the corresponding public page afterward:
- Destinations (`/admin/packages/destinations`) — add/edit a destination photo.
- Homepage Content → Hero Slides (`/admin/content`) — add a promo slide image.
- Homepage Content → Testimonials — add a testimonial photo.
- Homepage Content → Partners & Clients — add a partner logo.
- A package's Photos tab (`/admin/packages/<id>`) — upload multiple photos, drag to reorder, delete one. Confirm the thumbnail preview appears immediately after upload (this exercises `photo-manager.tsx`'s client-side `getPublicImageUrl` call from Task 3).

- [ ] **Step 5: Confirm deletes actually remove the R2 object**

Delete a package photo via the Photos tab, then open its previous public URL (`<NEXT_PUBLIC_R2_PUBLIC_URL>/packages/<id>/photo-....jpg`) directly in the browser. Expected: not found (not the deleted image).

If every check in Steps 3–5 passes, the migration is functionally complete — proceed to Task 6 to remove the now-unused Supabase Storage buckets. If anything fails, stop and debug before Task 6 (the old Supabase buckets are still intact as a fallback until then).

---

### Task 6: Drop the old Supabase Storage buckets

**Files:**
- Create: `supabase/migrations/20260808120000_drop_supabase_storage_buckets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Drop the Supabase Storage buckets and their RLS policies now that image
-- storage has moved to Cloudflare R2 (docs/superpowers/specs/2026-08-08-r2-image-storage-design.md).
-- Dev-only project -- no production images to preserve, run only after
-- Task 5's end-to-end verification has confirmed R2 fully replaces them.

drop policy "manage_packages can upload package photos" on storage.objects;
drop policy "manage_packages can update package photos" on storage.objects;
drop policy "manage_packages can delete package photos" on storage.objects;
drop policy "Public read access for package photos" on storage.objects;

drop policy "manage_packages can upload site content" on storage.objects;
drop policy "manage_packages can update site content" on storage.objects;
drop policy "manage_packages can delete site content" on storage.objects;
drop policy "Public read access for site content" on storage.objects;

delete from storage.objects where bucket_id in ('package-photos', 'site-content');
delete from storage.buckets where id in ('package-photos', 'site-content');
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration applies with no errors.

- [ ] **Step 3: Verify the buckets are gone**

Run (via `supabase db push`'s target project, e.g. through the Supabase SQL editor or `supabase db execute`):

```sql
select id from storage.buckets where id in ('package-photos', 'site-content');
```

Expected: zero rows.

- [ ] **Step 4: Re-run the full verification from Task 5**

Run: `npm run dev`, then repeat Task 5's Steps 3–4 (public site + all 5 admin upload forms). Expected: everything still works — proves nothing was silently still depending on the dropped Supabase buckets.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260808120000_drop_supabase_storage_buckets.sql
git commit -m "chore: drop unused Supabase Storage buckets now that images live on R2"
```
