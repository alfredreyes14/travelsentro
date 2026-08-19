# Hero Slide Automatic Focal Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically compute and apply a content-aware crop focal point for promo-type hero slide images, so admin-uploaded photos frame correctly at every hero breakpoint without manual tuning.

**Architecture:** A new `lib/image/focal-point.ts` module runs `smartcrop-sharp`'s saliency detection once per uploaded image inside the existing `uploadSiteContentImage` Server Action, producing one normalized `(x, y)` point stored on the `hero_slides` row. The public homepage applies it as CSS `object-position` at render time — no per-breakpoint crop logic, no runtime computation cost.

**Tech Stack:** Next.js 16 Server Actions, Supabase (Postgres + `@supabase/supabase-js`), `sharp` + `smartcrop-sharp` (new deps), R2 object storage (existing).

**Spec:** `docs/superpowers/specs/2026-08-19-hero-slide-focal-point-design.md`

## Global Constraints

- Scope is **promo-type hero slides only** (`hero_slides.image_storage_path`). Package-linked slides, `package_photos`, destinations, partners, and testimonials are untouched.
- Focal point computation is **best-effort and must never fail the upload or the backfill loop** — a failed/unsupported image just leaves `focal_x`/`focal_y` as `null`.
- `focal_x`/`focal_y` are nullable; `null` must render identically to today's default-center crop (no visual regression for un-backfilled rows).
- No external paid APIs — `smartcrop-sharp` runs locally, consistent with this project's free-tier-first constraint (see `.claude/CLAUDE.md`).
- Follow this repo's existing conventions: double-quoted strings + semicolons in `lib/`/`actions/`/`components/`/`scripts/verify-*.ts`; `tsx --env-file=.env.local` for scripts needing env vars; Supabase service-role client only inside `scripts/`, never in `app/`/`actions/`.

---

### Task 1: Focal point computation module

**Files:**
- Modify: `package.json` (add `sharp`, `smartcrop-sharp` as direct dependencies; add `verify:hero-focal-point` script)
- Create: `lib/image/focal-point.ts`
- Create: `scripts/verify-hero-focal-point.ts`

**Interfaces:**
- Produces: `computeFocalPoint(buffer: Buffer): Promise<{ x: number; y: number } | null>` from `lib/image/focal-point.ts` — normalized `[0,1]` coordinates, `null` on any analysis failure, never throws. Task 3 and Task 6 both import this.

- [ ] **Step 1: Write the verify script against the not-yet-existing module**

Create `scripts/verify-hero-focal-point.ts`:

```ts
/**
 * Sanity-checks lib/image/focal-point.ts's computeFocalPoint() against a
 * real local image (public/default-hero.jpg) -- no test framework exists in
 * this repo (see scripts/verify-*.ts convention), so this is a manual
 * run-and-eyeball check rather than an assertion suite.
 *
 * Run via `npm run verify:hero-focal-point`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeFocalPoint } from "../lib/image/focal-point";

async function main() {
  const imagePath = join(process.cwd(), "public", "default-hero.jpg");
  const buffer = readFileSync(imagePath);

  const focalPoint = await computeFocalPoint(buffer);

  if (!focalPoint) {
    throw new Error(
      "computeFocalPoint returned null for a valid local JPEG -- something is broken."
    );
  }

  if (
    focalPoint.x < 0 ||
    focalPoint.x > 1 ||
    focalPoint.y < 0 ||
    focalPoint.y > 1
  ) {
    throw new Error(
      `Focal point out of [0,1] range: x=${focalPoint.x}, y=${focalPoint.y}`
    );
  }

  console.log(
    `OK -- computed focal point for public/default-hero.jpg: x=${focalPoint.x.toFixed(3)}, y=${focalPoint.y.toFixed(3)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`'s `"scripts"` block (alongside the other `verify:*` entries):

```json
"verify:hero-focal-point": "tsx --env-file=.env.local scripts/verify-hero-focal-point.ts",
```

- [ ] **Step 2: Run it to confirm it fails (module doesn't exist yet)**

Run: `npm run verify:hero-focal-point`
Expected: FAIL — `Cannot find module '../lib/image/focal-point'` (or TypeScript equivalent).

- [ ] **Step 3: Install dependencies**

```bash
npm install sharp@0.34.5 smartcrop-sharp@2.0.8
```

`sharp` is already a transitive dependency (via Next.js's image optimizer) at this exact version — pinning avoids a second, divergent copy. `smartcrop-sharp` is new. Both are Node-only; Next.js already lists `sharp` in its default `serverExternalPackages`, so no `next.config.ts` change is needed.

- [ ] **Step 4: Implement `lib/image/focal-point.ts`**

```ts
import sharp from "sharp";
import { crop } from "smartcrop-sharp";

export type FocalPoint = { x: number; y: number };

/**
 * Computes a single normalized [0,1] focal point for an image buffer, using
 * smartcrop-sharp's saliency-based "most interesting region" detection. The
 * detected region's center becomes the focal point, applied uniformly across
 * every breakpoint via CSS object-position at render time (no per-breakpoint
 * crop math needed).
 *
 * Never throws -- callers treat a null return as "no focal point available,"
 * not an error, since this is a best-effort quality enhancement, not a
 * required step in the upload or backfill path.
 */
export async function computeFocalPoint(
  buffer: Buffer
): Promise<FocalPoint | null> {
  try {
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return null;

    const { topCrop } = await crop(buffer, { width: 100, height: 100 });

    return {
      x: clamp01((topCrop.x + topCrop.width / 2) / width),
      y: clamp01((topCrop.y + topCrop.height / 2) / height),
    };
  } catch {
    return null;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
```

- [ ] **Step 5: Run the verify script again to confirm it passes**

Run: `npm run verify:hero-focal-point`
Expected: PASS — prints `OK -- computed focal point for public/default-hero.jpg: x=0.XXX, y=0.XXX` with both values inside `[0, 1]`.

- [ ] **Step 6: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint lib/image/focal-point.ts scripts/verify-hero-focal-point.ts
```
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/image/focal-point.ts scripts/verify-hero-focal-point.ts
git commit -m "feat: add automatic image focal point computation

Wraps smartcrop-sharp's saliency detection in a single computeFocalPoint()
helper, returning a normalized [0,1] point for use as CSS object-position.
Never throws -- best-effort only, per docs/superpowers/specs/2026-08-19-hero-slide-focal-point-design.md."
```

---

### Task 2: Database migration

**Files:**
- Create: `supabase/migrations/20260819224500_add_hero_slide_focal_point.sql`
- Modify: `types/database.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: `hero_slides.focal_x: number | null`, `hero_slides.focal_y: number | null` on `Database["public"]["Tables"]["hero_slides"]["Row"/"Insert"/"Update"]`. Task 3–6 depend on these being present in the generated types.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260819224500_add_hero_slide_focal_point.sql`:

```sql
-- Adds a computed, normalized [0,1] focal point to promo-type hero slide
-- images (hero_slides.image_storage_path), used as CSS object-position at
-- render time instead of a fixed center crop. Both columns are nullable --
-- null means "no focal point yet," and rendering falls back to the current
-- default-center crop, so every existing row keeps working unchanged until
-- scripts/backfill-hero-slide-focal-points.ts (or a future upload) fills
-- them in. See docs/superpowers/specs/2026-08-19-hero-slide-focal-point-design.md.
alter table hero_slides
  add column focal_x numeric,
  add column focal_y numeric;

comment on column hero_slides.focal_x is
  'Normalized [0,1] horizontal focal point for object-position cropping of image_storage_path. Null = default center crop.';
comment on column hero_slides.focal_y is
  'Normalized [0,1] vertical focal point for object-position cropping of image_storage_path. Null = default center crop.';
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

```bash
supabase db push
```
Expected: reports the new migration applied, no errors.

- [ ] **Step 3: Confirm it's synced**

```bash
supabase migration list
```
Expected: `20260819224500` appears in both the `Local` and `Remote` columns.

- [ ] **Step 4: Regenerate typed schema**

```bash
supabase gen types typescript --linked > types/database.ts
```

- [ ] **Step 5: Confirm the new columns are present and the app still typechecks**

```bash
grep -n "focal_x\|focal_y" types/database.ts
npx tsc --noEmit
```
Expected: `focal_x`/`focal_y` appear under `hero_slides`'s `Row`, `Insert`, and `Update` shapes; `tsc` reports no errors (nothing consumes these fields yet, so nothing should break).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260819224500_add_hero_slide_focal_point.sql types/database.ts
git commit -m "feat: add focal_x/focal_y columns to hero_slides

Nullable, additive migration -- existing rows keep rendering at the
current default-center crop until backfilled or re-uploaded."
```

---

### Task 3: Compute focal point at upload time

**Files:**
- Modify: `actions/site-content-uploads.ts`

**Interfaces:**
- Consumes: `computeFocalPoint(buffer: Buffer): Promise<{ x: number; y: number } | null>` (Task 1).
- Produces: `uploadSiteContentImage()` return type gains optional `focalX?: number; focalY?: number`, present only when `folder === "hero-slides"` and analysis succeeded. Task 4 consumes this.

- [ ] **Step 1: Update `uploadSiteContentImage`**

In `actions/site-content-uploads.ts`, add the import and change the function:

```ts
import { computeFocalPoint } from "@/lib/image/focal-point";
```

Replace the existing function body:

```ts
export async function uploadSiteContentImage(
  folder: "hero-slides" | "testimonials" | "partners" | "destinations",
  file: UploadImageInput
): Promise<
  ActionResult & { storagePath?: string; focalX?: number; focalY?: number }
> {
  await requirePermission("can_manage_packages");

  if (!ALLOWED_FOLDERS.includes(folder)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const buffer = Buffer.from(file.base64, "base64");
  const extension = extensionFromMimeType(file.type);
  const storagePath = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;

  // Focal point analysis only runs for hero-slides today -- the only folder
  // whose images get object-cover cropped at multiple aspect ratios in the
  // public hero carousel (docs/superpowers/specs/2026-08-19-hero-slide-focal-point-design.md).
  // computeFocalPoint() never throws, so it's safe inside this Promise.all --
  // only the R2 upload itself can make this reject.
  let focalPoint: { x: number; y: number } | null = null;

  try {
    const [, computed] = await Promise.all([
      uploadObject(storagePath, buffer, file.type),
      folder === "hero-slides"
        ? computeFocalPoint(buffer)
        : Promise.resolve(null),
    ]);
    focalPoint = computed;
  } catch {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return {
    ok: true,
    storagePath,
    ...(focalPoint ? { focalX: focalPoint.x, focalY: focalPoint.y } : {}),
  };
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint actions/site-content-uploads.ts
```
Expected: both clean.

- [ ] **Step 3: Verify behavior with a throwaway script**

Run a quick one-off check (not committed) to confirm folder-scoping works — from the repo root:

```bash
npx tsx --env-file=.env.local -e "
import('./actions/site-content-uploads.ts').then(async () => {
  console.log('module loads cleanly');
});
"
```
Expected: no import errors. (Full behavioral verification — that a real hero-slides upload returns `focalX`/`focalY` and a testimonials upload doesn't — happens end-to-end in Task 4's manual admin check, since this function requires an authenticated admin session via `requirePermission` and can't be called standalone.)

- [ ] **Step 4: Commit**

```bash
git add actions/site-content-uploads.ts
git commit -m "feat: compute focal point for hero-slide image uploads

uploadSiteContentImage() now runs computeFocalPoint() alongside the R2
upload when folder is hero-slides, returning focalX/focalY on success."
```

---

### Task 4: Persist focal point through the admin form

**Files:**
- Modify: `components/admin/content/hero-slide-form-schema.ts`
- Modify: `components/admin/content/hero-slide-form.tsx`
- Modify: `actions/hero-slides.ts`
- Modify: `app/admin/(dashboard)/content/page.tsx`

**Interfaces:**
- Consumes: `uploadSiteContentImage()`'s `focalX`/`focalY` fields (Task 3); `hero_slides.focal_x`/`focal_y` columns (Task 2).
- Produces: `hero_slides` rows with `focal_x`/`focal_y` populated on create/update. Task 5 reads these back on the public site.

- [ ] **Step 1: Add the fields to the form schema**

In `components/admin/content/hero-slide-form-schema.ts`, add `focalX`/`focalY` to **both** branches (both must declare the same field names — see the existing comment on `heroSlideFormSchema`):

```ts
const packageSlideSchema = z.object({
  slideType: z.literal("package"),
  packageId: z.string().min(1, "Please select a package"),
  headline: z.string().optional(),
  subheading: z.string().optional(),
  ctaLabel: z.string().optional(),
  externalLink: z.string().optional(),
  imageStoragePath: z.string().optional(),
  focalX: z.number().optional(),
  focalY: z.number().optional(),
});
```

```ts
const promoSlideSchema = z.object({
  slideType: z.literal("promo"),
  packageId: z.string().optional(),
  headline: z.string().min(1, "Please enter a headline"),
  subheading: z.string().optional(),
  ctaLabel: z.string().optional(),
  externalLink: z.string().optional(),
  imageStoragePath: z.string().min(1, "Please upload an image"),
  focalX: z.number().optional(),
  focalY: z.number().optional(),
});
```

- [ ] **Step 2: Thread focal point through `HeroSlideValues` and the two Server Actions**

In `actions/hero-slides.ts`:

```ts
export type HeroSlideValues = {
  slideType: "package" | "promo";
  packageId?: string;
  imageStoragePath?: string;
  focalX?: number;
  focalY?: number;
  headline?: string;
  subheading?: string;
  ctaLabel?: string;
  externalLink?: string;
};
```

In `createSlide`'s `.insert({...})` call, add:

```ts
      focal_x: values.focalX ?? null,
      focal_y: values.focalY ?? null,
```

In `updateSlide`'s `.update({...})` call, add the same two lines.

- [ ] **Step 3: Thread focal point through the form component**

In `components/admin/content/hero-slide-form.tsx`:

Add to `HeroSlideRecord`:

```ts
export type HeroSlideRecord = {
  id: string;
  slideType: "package" | "promo";
  packageId: string | null;
  imageStoragePath: string | null;
  focalX: number | null;
  focalY: number | null;
  headline: string | null;
  subheading: string | null;
  ctaLabel: string | null;
  externalLink: string | null;
  sortOrder: number;
};
```

In `CreateHeroSlideForm`'s `defaultValues`, add `focalX: undefined, focalY: undefined,`.

In `EditHeroSlideForm`'s `defaultValues` object, add `focalX: slide.focalX ?? undefined, focalY: slide.focalY ?? undefined,`.

Change `handleImageChange`'s signature and body:

```ts
  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string, focalX?: number, focalY?: number) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("hero-slides", {
        name: file.name,
        type: file.type,
        base64,
      });

      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath, result.focalX, result.focalY);
        toast.success("Image uploaded.");
      } else {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsUploadingImage(false);
      event.target.value = "";
    }
  }
```

Change the `imageStoragePath` field's `onChange` to also set the focal point fields:

```tsx
                      onChange={(event) =>
                        handleImageChange(event, (storagePath, focalX, focalY) => {
                          field.onChange(storagePath);
                          form.setValue("focalX", focalX);
                          form.setValue("focalY", focalY);
                        })
                      }
```

- [ ] **Step 4: Map the DB row's focal point in the admin content page**

In `app/admin/(dashboard)/content/page.tsx`, in the `heroSlides` mapping, add to the `record` object:

```ts
        focalX: row.focal_x,
        focalY: row.focal_y,
```

(Right after `imageStoragePath: row.image_storage_path,`.)

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint components/admin/content/hero-slide-form-schema.ts components/admin/content/hero-slide-form.tsx actions/hero-slides.ts "app/admin/(dashboard)/content/page.tsx"
```
Expected: both clean.

- [ ] **Step 6: Manual verification**

```bash
npm run dev
```
In the admin panel (`/admin/content`), add a new promo hero slide, upload a photo with an off-center subject, and save. Then edit that same slide again (without touching the image) and save — confirm the toast/save succeeds and no console error appears (proves `focalX`/`focalY` round-trip through the edit form without being wiped to `null`).

- [ ] **Step 7: Commit**

```bash
git add components/admin/content/hero-slide-form-schema.ts components/admin/content/hero-slide-form.tsx actions/hero-slides.ts "app/admin/(dashboard)/content/page.tsx"
git commit -m "feat: persist hero slide focal point through admin form

focalX/focalY flow from uploadSiteContentImage's result through the form
state into createSlide/updateSlide, and survive edit-without-reupload."
```

---

### Task 5: Render the focal point on the public homepage

**Files:**
- Modify: `components/homepage/hero-carousel.tsx`
- Modify: `app/(public)/page.tsx`

**Interfaces:**
- Consumes: `hero_slides.focal_x`/`focal_y` (Task 2, populated by Task 3/4).
- Produces: visual crop change on `/` for promo slides with a computed focal point; no change for `null` ones.

- [ ] **Step 1: Add focal point fields to `HeroSlideDisplay` and apply them**

In `components/homepage/hero-carousel.tsx`, update the type:

```ts
export type HeroSlideDisplay = {
  id: string;
  slideType: "package" | "promo";
  imageUrl: string | null;
  focalX: number | null;
  focalY: number | null;
  headline: string;
  subheading: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
};
```

Update the slide `<Image>` to apply the focal point as `object-position`, falling back to CSS default center when absent:

```tsx
                <Image
                  src={slide.imageUrl}
                  alt={slide.headline}
                  fill
                  sizes="100vw"
                  priority={index === 0}
                  className="object-cover"
                  style={
                    slide.focalX != null && slide.focalY != null
                      ? {
                          objectPosition: `${slide.focalX * 100}% ${slide.focalY * 100}%`,
                        }
                      : undefined
                  }
                />
```

- [ ] **Step 2: Populate focal point in the homepage's slide mapping**

In `app/(public)/page.tsx`'s slide-mapping function, set it explicitly on both branches — `null` for package slides (out of scope), the row's values for promo slides:

```ts
      if (slide.slide_type === "package" && slide.packages) {
        return {
          id: slide.id,
          slideType: "package",
          imageUrl: firstPhotoUrl(slide.packages.package_photos),
          focalX: null,
          focalY: null,
          headline: slide.packages.name,
          subheading: slide.subheading,
          ctaLabel: "View Package",
          ctaHref: `/packages/${slide.packages.slug}`,
        };
      }

      const imageUrl = slide.image_storage_path
        ? getPublicImageUrl(slide.image_storage_path)
        : null;

      return {
        id: slide.id,
        slideType: "promo",
        imageUrl,
        focalX: slide.focal_x,
        focalY: slide.focal_y,
        headline: slide.headline ?? "",
        subheading: slide.subheading,
        ctaLabel: slide.cta_label || null,
        ctaHref: slide.cta_label ? (slide.external_link ?? null) : null,
      };
```

- [ ] **Step 3: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint components/homepage/hero-carousel.tsx "app/(public)/page.tsx"
```
Expected: both clean.

- [ ] **Step 4: Manual verification**

```bash
npm run build
```
Expected: build succeeds (confirms the homepage Server Component still compiles/prerenders with the new fields — see the `revalidate = 60` static-generation note from the earlier performance work). Then `npm run dev`, load `/`, and confirm the promo slide created in Task 4 crops toward its subject rather than dead-center at both a narrow (mobile) and wide (desktop) viewport.

- [ ] **Step 5: Commit**

```bash
git add components/homepage/hero-carousel.tsx "app/(public)/page.tsx"
git commit -m "feat: apply computed focal point to public hero carousel

Promo hero slides with a stored focal point render with object-position
set to it; package slides and un-backfilled promo slides keep default
center crop."
```

---

### Task 6: Backfill existing promo hero slides

**Files:**
- Create: `scripts/backfill-hero-slide-focal-points.ts`
- Modify: `package.json` (add `backfill:hero-focal-points` script)

**Interfaces:**
- Consumes: `computeFocalPoint()` (Task 1), `getPublicImageUrl()` (existing `lib/storage/image-url.ts`).
- Produces: no new interface — this is a one-off data migration, run once against the real project.

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill-hero-slide-focal-points.ts`:

```ts
/**
 * One-off backfill: computes and persists focal_x/focal_y for existing
 * promo-type hero_slides rows that predate the automatic focal-point
 * feature. Safe to re-run -- only touches rows still missing a focal point
 * (see docs/superpowers/specs/2026-08-19-hero-slide-focal-point-design.md).
 *
 * Run via `npm run backfill:hero-focal-points`.
 *
 * SECURITY: this script uses the Supabase service-role key, which bypasses
 * Row Level Security. It must only ever run from a CLI/dev-tooling context
 * (never imported from app/ or components/, never bundled into the app) --
 * mirrors scripts/seed.ts.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { getPublicImageUrl } from "../lib/storage/image-url";
import { computeFocalPoint } from "../lib/image/focal-point";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run backfill:hero-focal-points`."
  );
}

/**
 * Node 20 has no native global WebSocket (added in Node 22); @supabase/supabase-js
 * always constructs a RealtimeClient, which requires one even though this
 * script never uses realtime features. Same polyfill as scripts/seed.ts.
 */
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

async function main() {
  await ensureWebSocketPolyfill();

  const supabase = createClient<Database>(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rows, error } = await supabase
    .from("hero_slides")
    .select("id, image_storage_path")
    .eq("slide_type", "promo")
    .not("image_storage_path", "is", null)
    .is("focal_x", null);

  if (error) {
    throw new Error(`Failed to query hero_slides: ${error.message}`);
  }

  console.log(`Found ${rows.length} promo slide(s) missing a focal point.`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    // Guaranteed non-null by the .not("image_storage_path", "is", null)
    // filter above -- Supabase's generated types don't narrow on filters.
    const imageUrl = getPublicImageUrl(row.image_storage_path!);

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`fetch failed: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      const focalPoint = await computeFocalPoint(buffer);
      if (!focalPoint) {
        console.warn(`  Skipped ${row.id} (${imageUrl}) -- analysis failed.`);
        skipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("hero_slides")
        .update({ focal_x: focalPoint.x, focal_y: focalPoint.y })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      console.log(
        `  Updated ${row.id}: x=${focalPoint.x.toFixed(3)}, y=${focalPoint.y.toFixed(3)}`
      );
      updated++;
    } catch (err) {
      console.warn(
        `  Skipped ${row.id} (${imageUrl}) -- ${(err as Error).message}`
      );
      skipped++;
    }
  }

  console.log(`Done. ${updated} updated, ${skipped} skipped, ${rows.length} total.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`'s `"scripts"` block:

```json
"backfill:hero-focal-points": "tsx --env-file=.env.local scripts/backfill-hero-slide-focal-points.ts",
```

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint scripts/backfill-hero-slide-focal-points.ts
```
Expected: both clean.

- [ ] **Step 3: Dry-run confirmation before writing**

```bash
npx tsx --env-file=.env.local -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('hero_slides').select('id, slide_type, image_storage_path, focal_x').eq('slide_type', 'promo');
console.log(error ?? data);
"
```
Expected: lists every promo slide's current `focal_x` (all `null` at this point) — confirms what the backfill is about to touch before running it for real.

- [ ] **Step 4: Run the backfill against the real project**

```bash
npm run backfill:hero-focal-points
```
Expected: logs one line per promo slide (`Updated ...` or `Skipped ...`), ending with a summary line. Zero rows found is a valid, non-error outcome if no promo slides exist yet.

- [ ] **Step 5: Verify the result**

```bash
npx tsx --env-file=.env.local -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('hero_slides').select('id, focal_x, focal_y').eq('slide_type', 'promo');
console.log(data);
"
```
Expected: every promo row that has an image now shows non-null `focal_x`/`focal_y` (or is one of the logged `Skipped` rows). Reload the public homepage and confirm existing promo slides now crop toward their subject.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-hero-slide-focal-points.ts package.json
git commit -m "feat: backfill focal points for existing promo hero slides

One-off, idempotent script; already run against the live project as part
of this change (see task notes in docs/superpowers/plans/2026-08-19-hero-slide-focal-point.md)."
```
