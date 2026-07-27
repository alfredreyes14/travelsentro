# Phase 6: Public Site Content Sections & Hero Carousel - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 24
**Analogs found:** 24 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `actions/hero-slides.ts` | service (Server Action) | CRUD | `actions/packages.ts` | exact |
| `actions/value-props.ts` | service (Server Action) | CRUD | `actions/packages.ts` | exact |
| `actions/testimonials.ts` | service (Server Action) | CRUD | `actions/packages.ts` | exact |
| `actions/partners.ts` | service (Server Action) | CRUD | `actions/packages.ts` (write) + `actions/package-photos.ts` (upload) | exact |
| `actions/site-content-uploads.ts` | service (Server Action) | file-I/O | `actions/package-photos.ts` | exact |
| `supabase/migrations/<ts>_create_homepage_content_schema.sql` | migration | batch/DDL | `supabase/migrations/20260718114727_create_package_schema.sql`, `20260718150801_admin_rbac_and_package_write_policies.sql` | exact |
| `components/homepage/hero-carousel.tsx` | component (client) | streaming/animated | `components/packages/package-gallery.tsx` (Carousel usage) | role-match |
| `components/homepage/why-choose-us.tsx` | component (server) | request-response | existing `<PackageCard>`-consuming server sections in `app/(public)/packages/page.tsx` | role-match |
| `components/homepage/featured-packages-grid.tsx` | component (server) | CRUD-read | `app/(public)/packages/page.tsx` grid + `components/packages/package-card.tsx` | exact |
| `components/homepage/testimonials-section.tsx` | component (server) | request-response | `app/(public)/packages/page.tsx` grid pattern | role-match |
| `components/homepage/brand-partners.tsx` | component (server) | request-response, conditional | new pattern; closest precedent is conditional-render gating in `app/admin/(dashboard)/layout.tsx` (`canManagePackages && (...)`) | partial-match |
| `components/homepage/corporate-clients.tsx` | component (server) | request-response, conditional | same as `brand-partners.tsx` | partial-match |
| `components/admin/content/hero-slide-form.tsx` + `-schema.ts` | component (client form) | CRUD | `components/admin/account-form.tsx` + `account-form-schema.ts` | exact |
| `components/admin/content/hero-slides-list.tsx` | component (client, dnd-kit) | CRUD + reorder | `components/admin/sortable-package-list.tsx` | exact |
| `components/admin/content/value-prop-form.tsx` + `-schema.ts` | component (client form) | CRUD | `components/admin/account-form.tsx` | exact |
| `components/admin/content/testimonial-form.tsx` + `-schema.ts` | component (client form, image upload) | CRUD + file-I/O | `components/admin/account-form.tsx` (form shape) + `components/admin/photo-manager.tsx` (image upload) | exact |
| `components/admin/content/partner-form.tsx` + `-schema.ts` | component (client form, image upload + type select) | CRUD + file-I/O | `components/admin/account-form.tsx` (role `<Select>`) + `components/admin/photo-manager.tsx` (upload) | exact |
| `app/admin/(dashboard)/content/page.tsx` | route (server, Tabs) | request-response | `app/admin/(dashboard)/packages/[id]/page.tsx`-style detail page using `package-form.tsx`'s Tabs (see below) + `components/admin/users-table.tsx` list/dialog composition | role-match |
| `app/admin/(dashboard)/layout.tsx` (MODIFIED) | route/layout | request-response | itself — extend existing `canManagePackages &&` nav pattern | exact (self) |
| `app/(public)/page.tsx` (MODIFIED) | route (server) | request-response | itself — currently a static hero; extend with server data fetches like `app/(public)/packages/page.tsx` | exact (self) |
| `components/admin/content/star-rating-input.tsx` | component (client, small) | transform (display/input) | `lucide-react` `StarIcon` usage documented in RESEARCH.md Code Example 4 (no existing codebase analog — net-new pattern) | no analog |

## Pattern Assignments

### `actions/hero-slides.ts`, `actions/value-props.ts`, `actions/testimonials.ts`, `actions/partners.ts` (service, CRUD)

**Analog:** `actions/packages.ts` (full file read, 271 lines)

**Imports pattern** (lines 1-8):
```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
```
For the new files, swap the last import for each content type's own form-values type (e.g. `HeroSlideFormValues` from `hero-slide-form-schema.ts`).

**Constant + permission-gate pattern** (lines 10-11, 72-77):
```typescript
const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export async function createPackage(
  values: PackageFormValues
): Promise<ActionResult & { id?: string }> {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-18).
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  ...
```
Every new Server Action (`createSlide`, `updateValueProp`, `deleteTestimonial`, `createPartner`, etc.) must start with `await requirePermission("can_manage_packages");` before any Supabase call — same permission string reused, no new toggle (per CONTEXT.md discretion + PROJECT.md fixed-3-toggle rule).

**Simple update-and-toggle pattern** (lines 217-239, `featurePackage`) — good template for `updateTestimonial`/`updatePartner` (single-row update + `.select().single()` + error check):
```typescript
export async function featurePackage(
  id: string,
  isFeatured: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .update({ is_featured: isFeatured })
    .eq("id", id)
    .select("slug")
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${data.slug}`);
  revalidatePath("/admin/packages");
  return { ok: true };
}
```

**Reorder pattern** (lines 247-271, `reorderPackages`) — direct template for `reorderSlides` (and optionally `reorderTestimonials`/`reorderPartners`):
```typescript
export async function reorderPackages(
  order: { id: string; sortOrder: number }[]
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const results = await Promise.all(
    order.map((item) =>
      supabase
        .from("packages")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
    )
  );

  if (results.some((result) => result.error)) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/packages");
  revalidatePath("/admin/packages");
  return { ok: true };
}
```

**Soft-delete/hard-delete pattern** (lines 170-191, `softDeletePackage`) — for the new tables (no soft-delete requirement stated, so `deleteSlide`/`deleteTestimonial`/`deletePartner` should hard-delete, mirroring `deletePhoto` in `package-photos.ts` below rather than this soft-delete variant; kept here only as the error-handling shape reference).

**CRITICAL DEVIATION from analog — revalidatePath target:** Every one of these new actions must call `revalidatePath("/")` (the homepage), NOT `revalidatePath("/packages")`/`/admin/packages`. This is flagged explicitly in RESEARCH.md Pitfall 4. Also revalidate `/admin/content` for the admin list to reflect immediately.

---

### `actions/site-content-uploads.ts` (service, file-I/O)

**Analog:** `actions/package-photos.ts` (full file read, 208 lines)

**Imports + helper pattern** (lines 1-28):
```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type UploadPhotoInput = {
  name: string;
  type: string;
  base64: string;
};

function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}
```

**Base64-decode-then-Storage-upload-then-row-insert pattern** (lines 38-118, `uploadPhotos`):
```typescript
export async function uploadPhotos(
  packageId: string,
  files: UploadPhotoInput[]
): Promise<ActionResult & { photos?: UploadedPhoto[] }> {
  await requirePermission("can_manage_packages");
  if (files.length === 0) return { ok: true, photos: [] };

  const supabase = await createClient();
  // ... look up max display_order, then per-file:
  for (const [index, file] of files.entries()) {
    const buffer = Buffer.from(file.base64, "base64");
    const extension = extensionFromMimeType(file.type);
    const storagePath = `${packageId}/photo-${Date.now()}-${index}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("package-photos")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

    const { data: photoRow, error: insertError } = await supabase
      .from("package_photos")
      .insert({ package_id: packageId, storage_path: storagePath, display_order: displayOrder, alt_text: null })
      .select("id, storage_path, display_order, alt_text")
      .single();
    // ...
  }
  revalidatePath(`/packages/${pkg.slug}`);
  return { ok: true, photos: uploaded };
}
```
For `uploadSiteContentImage`, swap the bucket to `"site-content"`, path shape to something like `${contentType}/${Date.now()}-${index}.${ext}` (e.g. `hero-slides/...`, `testimonials/...`, `partners/...`), and — per RESEARCH.md D-03 — `revalidatePath("/")` instead of a package slug path.

**Delete + Storage-remove pattern** (lines 125-169, `deletePhoto`):
```typescript
export async function deletePhoto(photoId: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");
  const supabase = await createClient();
  const { data: photo, error: photoError } = await supabase
    .from("package_photos")
    .select("storage_path, package_id")
    .eq("id", photoId)
    .single();
  if (photoError || !photo) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const { error: removeError } = await supabase.storage
    .from("package-photos")
    .remove([photo.storage_path]);
  if (removeError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  const { error: deleteError } = await supabase
    .from("package_photos")
    .delete()
    .eq("id", photoId);
  if (deleteError) return { ok: false, error: GENERIC_ERROR_MESSAGE };

  revalidatePath(`/packages/${pkg.slug}`);
  return { ok: true };
}
```

**IMPORTANT — client-side sequential upload requirement (RESEARCH.md Pitfall 7):** `reorderPhotos`/`uploadPhotos` computes `display_order`/`sort_order` from the current max at call time. The calling client component (`photo-manager.tsx`) always awaits uploads ONE AT A TIME in a `for...of` loop — never `Promise.all` — to avoid a race on the max. Any new upload UI (hero slide image, testimonial photo, partner logo) must copy this sequential-await loop.

---

### `components/admin/content/hero-slides-list.tsx` (component, CRUD + reorder)

**Analog:** `components/admin/sortable-package-list.tsx` (full file read, 163 lines)

**Full dnd-kit wiring pattern** (lines 1-84):
```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { reorderPackages } from "@/actions/packages";
// ...

export function SortablePackageList({ initialItems }: { initialItems: AdminPackageListItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [, startReordering] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    const previousItems = items;
    setItems(reordered);

    startReordering(async () => {
      try {
        const result = await reorderPackages(
          reordered.map((item, index) => ({ id: item.id, sortOrder: index }))
        );
        if (!result.ok) {
          toast.error(result.error);
          setItems(previousItems); // optimistic rollback on failure
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        setItems(previousItems);
      }
    });
  }
  // ... renders <DndContext><SortableContext>{items.map(...)}
```
Copy this shape for `HeroSlidesList`, swapping `reorderPackages` for `reorderSlides` and rendering a hero-slide row/card instead of `PackageListRow`/`PackageListCard`. Optional reuse for testimonials/partners reorder if the planner decides those need drag-reorder too (RESEARCH.md leaves this open — value props/testimonials/partners could use simple `sort_order` increment on create instead).

**Drag handle + per-row upload/delete pattern** (from `photo-manager.tsx`, lines 61-120) — useful for the per-slide thumbnail row in `hero-slides-list.tsx`:
```typescript
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: photo.id });
const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.6 : 1,
};
// grip handle button carries {...attributes} {...listeners}, 44px touch target via size-11
```

---

### `components/admin/content/{hero-slide,value-prop,testimonial,partner}-form.tsx` + `-schema.ts` (component, CRUD form)

**Analog:** `components/admin/account-form.tsx` (imports/structure read, lines 1-90) + its co-located `account-form-schema.ts`

**Imports pattern** (lines 1-34):
```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createAccount, updateAccount } from "@/actions/users";
import {
  createAccountSchema, editAccountSchema,
  type CreateAccountFormValues, type EditAccountFormValues,
} from "./account-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
```

**Dual create/edit mode dispatch pattern** (lines 39-58):
```typescript
type AccountFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; account: Profile; onSuccess: () => void };

export function AccountForm(props: AccountFormProps) {
  if (props.mode === "create") {
    return <CreateAccountForm onSuccess={props.onSuccess} />;
  }
  return <EditAccountForm account={props.account} onSuccess={props.onSuccess} />;
}
```

**Form submit + toast + reset pattern** (lines 60-90):
```typescript
function CreateAccountForm({ onSuccess }: { onSuccess: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: { name: "", email: "", password: "", role: "staff", ... },
  });

  async function onSubmit(values: CreateAccountFormValues) {
    setIsSubmitting(true);
    try {
      const result = await createAccount(values);
      if (result.ok) {
        toast.success("Staff account created.");
        form.reset();
        onSuccess();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }
```
`partner-form.tsx` should reuse the `<Select>` field pattern (role select in account-form) for the `partnerType` field (`brand_partner` | `corporate_client`). `testimonial-form.tsx`/`hero-slide-form.tsx`/`partner-form.tsx` additionally need an image-upload field — combine this form shape with `photo-manager.tsx`'s `readFileAsBase64()` helper (lines 43-59) and sequential upload-then-submit flow.

---

### `app/admin/(dashboard)/content/page.tsx` (route, Tabs-based CRUD page)

**Analog:** `components/admin/users-table.tsx` (full file read, 309 lines) for the Dialog-wraps-Form-then-list composition; `app/admin/(dashboard)/layout.tsx` for permission-gated nav.

**Dialog + AlertDialog composition pattern** (lines 83-97, 264-306):
```typescript
<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
  <DialogTrigger render={<Button size="lg" />}>
    Add Staff Account
  </DialogTrigger>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Add Staff Account</DialogTitle>
    </DialogHeader>
    <AccountForm mode="create" onSuccess={handleMutationSuccess} />
  </DialogContent>
</Dialog>
...
<AlertDialog open={deactivatingAccount !== null} onOpenChange={(open) => !open && setDeactivatingAccount(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Deactivate this account?</AlertDialogTitle>
      <AlertDialogDescription>...</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" disabled={isDeactivating} onClick={handleDeactivate}>
        {isDeactivating ? "Deactivating..." : "Deactivate"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
This is the exact shape for each of the 4 tabs' Add/Edit dialog + delete AlertDialog (per UI-SPEC's copywriting contract — titles/bodies already specified there).

**Empty-state pattern** (lines 99-107):
```typescript
{profiles.length === 0 ? (
  <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
    <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
      No accounts yet
    </h2>
    <p className="text-base leading-[1.5] text-muted-foreground">
      Add a Staff or Admin account to get started.
    </p>
  </div>
) : ( /* table/card list */ )}
```
Reuse verbatim shape for each tab's empty state (copy per UI-SPEC's Copywriting Contract table).

**Permission-gated nav item pattern** (`app/admin/(dashboard)/layout.tsx` lines 47-57):
```typescript
{canManagePackages && (
  <SidebarMenuItem>
    <SidebarMenuButton size="lg" render={<Link href="/admin/packages" />}>
      <PackageIcon />
      <span>Packages</span>
    </SidebarMenuButton>
  </SidebarMenuItem>
)}
```
Add a new `{canManagePackages && (<SidebarMenuItem>...<Link href="/admin/content" />...Content...</SidebarMenuItem>)}` block immediately after/near the Packages item — same `canManagePackages` boolean (no new permission), per CONTEXT.md discretion.

---

### `app/(public)/page.tsx` (MODIFIED — homepage composition)

**Analog:** itself (current 23-line file, full read above) + query shape from RESEARCH.md's own Architecture Patterns (grounded in this repo's `app/(public)/packages/page.tsx` query conventions, not separately re-read here since RESEARCH.md already extracted the exact query patterns).

**Current file (baseline to extend, not replace):**
```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 sm:px-8">
      <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
        Discover the Philippines with TravelSentro
      </h1>
      <p className="max-w-xl text-base leading-[1.5] text-foreground">...</p>
      <div>
        <Button render={<Link href="/packages" />} nativeButton={false} size="lg">
          Browse Packages
        </Button>
      </div>
    </div>
  );
}
```
Must become an `async` Server Component (drop the plain function body, add `await createClient()` + parallel/sequential Supabase queries per RESEARCH.md's Architecture Patterns section), composing `<HeroCarousel>`, `<WhyChooseUs>`, `<FeaturedPackagesGrid>`, `<TestimonialsSection>`, `<InquiryForm />`, `<BrandPartners>`, `<CorporateClients>` in that order (UI-SPEC Section Layout).

**Inquiry form reuse — zero new code (D-05, HOME-07):**
```typescript
// From app/(public)/contact/page.tsx line 3, 25 (existing, unchanged)
import { InquiryForm } from "@/components/inquiry/inquiry-form";
// ...
<InquiryForm />  {/* general inquiry — packageName/packageId both undefined, confirmed optional in inquiry-form.tsx lines 24-29 */}
```

---

### `components/homepage/featured-packages-grid.tsx` (component, server, CRUD-read)

**Analog:** existing `<PackageCard>` component + `app/(public)/packages/page.tsx`'s query/grid shape (per RESEARCH.md Code Example 2, grounded directly in that file).

```typescript
const { data: featured } = await supabase
  .from("packages")
  .select("*, package_photos(storage_path, display_order)")
  .eq("is_published", true)
  .eq("is_featured", true)
  .order("sort_order", { ascending: true })
  .limit(6);
// Render each row with the existing <PackageCard pkg={pkg} photoUrl={photoUrl} />
```
Zero new curation code — reuses PKG-05's existing `is_featured` flag (D-04). Do not add a second "homepage featured" column.

---

## Shared Patterns

### Permission Gate (Server Actions)
**Source:** `actions/packages.ts` lines 76-77, `actions/package-photos.ts` lines 44
**Apply to:** All 5 new action files (`hero-slides.ts`, `value-props.ts`, `testimonials.ts`, `partners.ts`, `site-content-uploads.ts`) — every exported function's first line
```typescript
await requirePermission("can_manage_packages");
```
No new permission toggle — reuses the existing 3-toggle model (PROJECT.md Key Decisions, CONTEXT.md discretion item).

### Generic Error Message Constant
**Source:** `actions/packages.ts` line 10-11 (also `package-photos.ts`, `account-form.tsx`, `users-table.tsx`)
**Apply to:** Every new action file and every new client form/list component
```typescript
const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
```
Matches UI-SPEC's Copywriting Contract "Error state — any CRUD save failure" row verbatim.

### ActionResult Return Type
**Source:** `lib/action-result.ts` (referenced throughout `actions/packages.ts`, `actions/package-photos.ts`)
**Apply to:** All new Server Actions — return `{ ok: true, ... }` or `{ ok: false, error: string }`, never throw for expected failure paths.

### revalidatePath Target (DEVIATION FROM ANALOG)
**Source:** RESEARCH.md Pitfall 4, contrasted against `actions/packages.ts`'s `/packages` calls
**Apply to:** All new content Server Actions
```typescript
revalidatePath("/");             // homepage — the only public surface affected (D-03)
revalidatePath("/admin/content"); // admin list page
```
Do NOT copy `revalidatePath("/packages")`/`revalidatePath("/packages/${slug}")` from the packages analog — this phase's content lives only on the homepage.

### Sequential (non-parallel) Image Upload
**Source:** `components/admin/photo-manager.tsx` upload-loop convention (documented, not itself parallel-uploading in the excerpted lines, confirmed by RESEARCH.md Pitfall 7's explicit callout)
**Apply to:** Any new client component uploading hero slide images, testimonial photos, or partner/client logos
```typescript
for (const file of files) {
  await uploadSiteContentImage(...); // never Promise.all — avoids sort_order/display_order race
}
```

### Dialog-wraps-Form CRUD Composition
**Source:** `components/admin/users-table.tsx` lines 83-97, 264-306
**Apply to:** All 4 new admin CRUD tabs (Hero Slides, Why Choose Us, Testimonials, Partners & Clients) — `<Dialog>` for add/edit, `<AlertDialog>` for delete/remove confirmations, copy text sourced from UI-SPEC's Copywriting Contract table.

### dnd-kit Drag-Reorder
**Source:** `components/admin/sortable-package-list.tsx` full file
**Apply to:** `hero-slides-list.tsx` (required per HOME-01's "reorder slides"); optionally testimonials/partners if the planner wants drag-reorder there too (not explicitly required by REQUIREMENTS.md beyond hero slides).

### Star Rating Display (net-new, no existing analog)
**Source:** RESEARCH.md Code Example 4 (verified against installed `lucide-react`)
**Apply to:** `testimonials-section.tsx` (public display) and optionally a `star-rating-input.tsx` for the admin testimonial form (1-5 selectable stars, or a simple `<Select>` 1-5 dropdown reusing `account-form.tsx`'s `<Select>` pattern instead of a custom star-click widget — planner's choice)
```typescript
import { StarIcon } from "lucide-react";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon
          key={i}
          className={i < rating ? "fill-primary text-primary" : "fill-transparent text-muted-foreground"}
        />
      ))}
    </div>
  );
}
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/homepage/hero-carousel.tsx` (Autoplay wiring specifically) | component (client) | streaming/animated | `components/ui/carousel.tsx` + `package-gallery.tsx` establish the base Carousel usage, but no existing component wires the `embla-carousel-autoplay` plugin or the `prefers-reduced-motion` check — this is genuinely new (RESEARCH.md Architecture Pattern 1 is the reference, not a codebase file) |
| `components/homepage/brand-partners.tsx` / `corporate-clients.tsx` (independent dual-count conditional visibility) | component (server) | request-response, conditional | No existing homepage section is conditionally hidden based on a live count query; closest precedent is only the nav's boolean permission gate, a different shape (RESEARCH.md Pattern 3 is the reference) |
| `components/admin/content/star-rating-input.tsx` | component (client) | transform | No rating-input widget exists anywhere in the codebase; build from RESEARCH.md Code Example 4 or use a plain 1-5 `<Select>` instead |

## Metadata

**Analog search scope:** `actions/`, `components/admin/`, `components/inquiry/`, `components/packages/`, `app/admin/(dashboard)/`, `app/(public)/`, `supabase/migrations/`
**Files scanned:** `actions/packages.ts`, `actions/package-photos.ts`, `components/admin/sortable-package-list.tsx`, `components/admin/photo-manager.tsx`, `components/admin/users-table.tsx`, `components/admin/account-form.tsx`, `app/(public)/page.tsx`, `app/admin/(dashboard)/layout.tsx`, `components/inquiry/inquiry-form.tsx`, `app/(public)/contact/page.tsx`
**Pattern extraction date:** 2026-07-27
