# Destinations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-managed Destinations catalog (Local/International), a homepage section, package linkage, and `/packages?destination=slug` filtering, per `docs/superpowers/specs/2026-08-07-destinations-design.md`.

**Architecture:** One new Postgres table (`destinations`) with RLS reusing the existing `can_manage_packages` permission and a disable-guard trigger; a nullable `packages.destination_id` FK; admin CRUD following this repo's existing hero-slides/partners content pattern (Server Actions + react-hook-form + zod); a pure-presentational homepage section fed by a server-side fetch, mirroring `FeaturedPackagesGrid`/`TestimonialsSection`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Storage), react-hook-form + zod v4, shadcn/ui (Base UI), Tailwind v4.

## Global Constraints

- No new permission — every `destinations` RLS policy and Server Action reuses `can_manage_packages` (`.claude/CLAUDE.md`'s fixed 2-role/3-permission model).
- No new Storage bucket — destination photos go in the existing `site-content` bucket under a `destinations/` prefix.
- This repo has **no test framework** (`package.json` has no `test`/`typecheck` script). Verification steps use `npm run lint`, `npx tsc --noEmit`, `npm run build`, direct SQL against the local Supabase stack, and manual dev-server checks — not unit tests.
- Local Supabase CLI stack: DB on `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, applied via `npx supabase db reset` (re-applies every migration from scratch). Use `npx supabase gen types typescript --local > types/database.ts` to regenerate types — no project-ref/network dependency.
- `searchParams` on a Next.js 16 App Router page is typed `Promise<{ ... }>` (confirmed via `app/unsubscribe/page.tsx`), never a plain object.
- zod v4 error customization uses `{ error: "..." }`, not `required_error`/`invalid_type_error` (see `components/admin/package-form-schema.ts`).
- Dialog/Dropdown trigger composition uses Base UI's `render={<Button ... />}` prop, never Radix's `asChild`.
- Every Server Action returns `ActionResult` (`lib/action-result.ts`: `{ ok: true } | { ok: false; error: string }`), gates with `await requirePermission("can_manage_packages")`, and calls `revalidatePath(...)` on every affected route right before returning `{ ok: true }`.
- Storage thumbnails in admin list rows use a plain `<img>`, never `next/image` — `site-content` isn't in `next.config.ts`'s Image Optimizer `remotePatterns`.

---

### Task 1: Database schema — `destinations` table, RLS, disable-guard trigger, `packages.destination_id`

**Files:**
- Create: `supabase/migrations/20260807120000_create_destinations_schema.sql`

**Interfaces:**
- Produces: table `public.destinations(id uuid pk, name text, slug text unique, region text check(local|international), photo_storage_path text nullable, is_active boolean default true, sort_order integer default 0, created_at timestamptz)`; column `public.packages.destination_id uuid references destinations(id)` (default RESTRICT on delete); trigger `destinations_prevent_disable_with_active_packages` that raises on disabling a destination with ≥1 active (`is_published = true`, `deleted_at is null`) linked package.

- [ ] **Step 1: Write the migration file**

```sql
-- Destinations catalog (admin-managed, Local/International), and a nullable
-- packages.destination_id FK linking packages to a destination.
--
-- RLS mirrors hero_slides' shape (20260727075208_create_homepage_content_schema.sql)
-- with one difference: public read is scoped to `is_active = true` directly
-- in the policy (not `using (true)`), matching the is_published fix already
-- applied to packages (20260718140000_fix_public_read_rls_is_published.sql)
-- -- RLS itself is the authorization boundary, not just the app's
-- query-layer filter.
--
-- Business rule: an admin cannot disable (is_active: true -> false) a
-- destination while at least one active (is_published, not soft-deleted)
-- package still references it -- enforced by a BEFORE UPDATE trigger so the
-- rule holds regardless of entry point, not just the admin UI. Hard delete
-- needs no special code: packages.destination_id's default (RESTRICT) FK
-- behavior already blocks deleting a destination referenced by any package.

-- ============================================================================
-- destinations
-- ============================================================================
create table destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  region text not null check (region in ('local', 'international')),
  photo_storage_path text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table destinations enable row level security;

create policy "public read" on destinations
  for select using (is_active = true);

create policy "manage_packages can read all destinations" on destinations
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert destinations" on destinations
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update destinations" on destinations
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete destinations" on destinations
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- packages.destination_id -- nullable FK, default (RESTRICT) delete behavior
-- ============================================================================
alter table packages add column destination_id uuid references destinations(id);

-- ============================================================================
-- Disable guard: block is_active true -> false while an active package
-- still references this destination. SECURITY INVOKER (not DEFINER, mirrors
-- write_package_children's rationale in
-- 20260718171228_atomic_package_children_write.sql): the calling admin's own
-- RLS-scoped visibility is sufficient here since the packages this counts
-- (is_published = true) are also covered by packages' own public-read policy.
-- ============================================================================
create or replace function public.prevent_disable_destination_with_active_packages()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_active_count integer;
begin
  if old.is_active = true and new.is_active = false then
    select count(*) into v_active_count
    from packages
    where destination_id = old.id
      and is_published = true
      and deleted_at is null;

    if v_active_count > 0 then
      raise exception 'Cannot disable "%" — % active package(s) still use this destination.', old.name, v_active_count;
    end if;
  end if;

  return new;
end;
$$;

create trigger destinations_prevent_disable_with_active_packages
  before update on destinations
  for each row
  execute function public.prevent_disable_destination_with_active_packages();
```

- [ ] **Step 2: Apply the migration to the local Supabase stack**

Run: `npx supabase db reset`
Expected: output ends with `Finished supabase db reset ... Applying migration 20260807120000_create_destinations_schema.sql`, no errors.

- [ ] **Step 3: Verify the table, RLS, and trigger via direct SQL**

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
insert into destinations (name, slug, region) values ('Palawan Test', 'palawan-test', 'local') returning id, is_active;
"
```
Expected: one row returned, `is_active = true`.

Run (disable guard — should succeed, no packages reference it yet):
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
update destinations set is_active = false where slug = 'palawan-test';
select is_active from destinations where slug = 'palawan-test';
"
```
Expected: `is_active = false` — update succeeds since no package references it.

Run (disable guard — should now be BLOCKED):
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
update destinations set is_active = true where slug = 'palawan-test';
insert into packages (slug, name, from_price, duration_days, is_published, destination_id)
  select 'test-pkg-guard', 'Test Package', 1000, 1, true, id from destinations where slug = 'palawan-test';
update destinations set is_active = false where slug = 'palawan-test';
"
```
Expected: the final `update` FAILS with `ERROR: Cannot disable \"Palawan Test\" — 1 active package(s) still use this destination.`

Run (delete guard — should be BLOCKED by FK RESTRICT):
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
delete from destinations where slug = 'palawan-test';
"
```
Expected: FAILS with a foreign key violation (`update or delete on table \"destinations\" violates foreign key constraint`).

Run (cleanup test rows):
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
delete from packages where slug = 'test-pkg-guard';
delete from destinations where slug = 'palawan-test';
"
```
Expected: both deletes succeed now that the referencing package is gone.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260807120000_create_destinations_schema.sql
git commit -m "$(cat <<'EOF'
feat: add destinations schema with disable-guard trigger

New destinations table (Local/International, admin-managed via
can_manage_packages RLS) plus packages.destination_id FK. A BEFORE
UPDATE trigger blocks disabling a destination while an active
package still references it; hard delete is blocked by the FK's
default RESTRICT behavior.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Regenerate `types/database.ts`

**Files:**
- Modify: `types/database.ts`

**Interfaces:**
- Consumes: the `destinations` table and `packages.destination_id` column from Task 1.
- Produces: `Database["public"]["Tables"]["destinations"]` (`Row`/`Insert`/`Update`/`Relationships`), and `destination_id` added to `Database["public"]["Tables"]["packages"]`.

- [ ] **Step 1: Regenerate from the local stack**

Run: `npx supabase gen types typescript --local > types/database.ts`
Expected: command exits 0, file is rewritten.

- [ ] **Step 2: Verify the new table entry is alphabetically placed and shaped correctly**

Run: `grep -A 12 "^      destinations: {" types/database.ts`
Expected output shape (exact field names/order may vary slightly by CLI version, but must contain all of):
```typescript
destinations: {
  Row: {
    created_at: string
    id: string
    is_active: boolean
    name: string
    photo_storage_path: string | null
    region: string
    slug: string
    sort_order: number
  }
  Insert: { ... same fields, id/created_at/is_active/sort_order/photo_storage_path optional ... }
  Update: { ... all optional ... }
  Relationships: []
}
```

- [ ] **Step 3: Verify `packages.destination_id` was added**

Run: `grep -A 15 '^      packages: {' types/database.ts | grep destination_id`
Expected: `destination_id: string | null` appears in the `Row` block, and `Relationships` for `packages` now includes an entry with `foreignKeyName` referencing `destinations`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors, if any, are out of scope for this task).

- [ ] **Step 5: Commit**

```bash
git add types/database.ts
git commit -m "$(cat <<'EOF'
chore: regenerate database types for destinations schema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Widen the shared image-upload action, then add `actions/destinations.ts`

**Files:**
- Modify: `actions/site-content-uploads.ts`
- Create: `actions/destinations.ts`

**Interfaces:**
- Consumes: `requirePermission` (`lib/auth/dal.ts`), `createClient` (`lib/supabase/server.ts`), `ActionResult` (`lib/action-result.ts`), `DestinationFormValues` (produced by Task 4 — see note in Step 3 below on ordering).
- Produces: `uploadSiteContentImage(folder: "hero-slides" | "testimonials" | "partners" | "destinations", file)`; `createDestination(values): Promise<ActionResult & {id?: string}>`; `updateDestination(id, values): Promise<ActionResult>`; `toggleDestinationActive(id, isActive): Promise<ActionResult>`; `deleteDestination(id): Promise<ActionResult>`.

- [ ] **Step 1: Widen `uploadSiteContentImage`'s folder union**

In `actions/site-content-uploads.ts`, change:

```typescript
export async function uploadSiteContentImage(
  folder: "hero-slides" | "testimonials" | "partners",
  file: UploadImageInput
): Promise<ActionResult & { storagePath?: string }> {
```

to:

```typescript
export async function uploadSiteContentImage(
  folder: "hero-slides" | "testimonials" | "partners" | "destinations",
  file: UploadImageInput
): Promise<ActionResult & { storagePath?: string }> {
```

- [ ] **Step 2: Typecheck the one-line change**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Create `actions/destinations.ts`**

Note: this imports `DestinationFormValues` from `components/admin/content/destination-form-schema.ts`, which Task 4 creates. Since this is a type-only import and TypeScript resolves it at compile time, write this file now (per the plan's file-by-file order) but the project won't typecheck clean until Task 4's schema file also exists — Step 4 below typechecks accordingly (expect an unresolved-module error until Task 4 lands; do not treat that as a blocker for this task's commit, since Task 4 is next).

```typescript
"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { DestinationFormValues } from "@/components/admin/content/destination-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

const FK_VIOLATION = "23503";

/**
 * Creates a new destination, appending it to the end of the admin list's
 * current order (mirrors createSlide/createPackage's count-based sort_order
 * append). New destinations default to is_active = true at the DB level --
 * this action never sets is_active explicitly, matching how createPackage
 * never sets is_published to anything but an explicit value it controls.
 */
export async function createDestination(
  values: DestinationFormValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { count } = await supabase
    .from("destinations")
    .select("id", { count: "exact", head: true });

  const { data: created, error: createError } = await supabase
    .from("destinations")
    .insert({
      name: values.name,
      slug: values.slug,
      region: values.region,
      photo_storage_path: values.photoStoragePath || null,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (createError || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true, id: created.id };
}

/**
 * Updates a destination's content fields. Never touches is_active or
 * sort_order -- those are toggleDestinationActive's and a future
 * reorderDestinations' concern only, mirroring updatePackage/updateSlide
 * never touching is_published/sort_order.
 */
export async function updateDestination(
  id: string,
  values: DestinationFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("destinations")
    .update({
      name: values.name,
      slug: values.slug,
      region: values.region,
      photo_storage_path: values.photoStoragePath || null,
    })
    .eq("id", id)
    .select("id")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true };
}

/**
 * Flips is_active. The disable-guard trigger (Task 1) can reject the
 * true -> false transition with a raised Postgres exception -- its message
 * is already a safe, human-readable string (e.g. 'Cannot disable "Palawan"
 * — 2 active package(s)...'), so it's surfaced directly via error.message
 * instead of the generic fallback.
 */
export async function toggleDestinationActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true };
}

/**
 * Hard-deletes a destination. Unlike softDeletePackage, destinations has no
 * deleted_at column -- deletion is blocked instead by packages.destination_id's
 * default (RESTRICT) FK behavior whenever any package (active or not) still
 * references this row, surfaced here as a friendly error rather than the
 * raw Postgres FK-violation message.
 */
export async function deleteDestination(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("destinations")
    .delete()
    .eq("id", id);

  if (deleteError) {
    if (deleteError.code === FK_VIOLATION) {
      return {
        ok: false,
        error: "Remove or reassign packages using this destination first.",
      };
    }
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/");
  revalidatePath("/packages");
  revalidatePath("/admin/packages/destinations");
  return { ok: true };
}
```

- [ ] **Step 4: Commit**

```bash
git add actions/site-content-uploads.ts actions/destinations.ts
git commit -m "$(cat <<'EOF'
feat: add destinations Server Actions

createDestination/updateDestination/toggleDestinationActive/
deleteDestination, mirroring actions/hero-slides.ts's CRUD shape.
toggleDestinationActive surfaces the disable-guard trigger's message
directly; deleteDestination catches the FK-violation (23503) from a
still-referenced destination with a friendly error. Also widens
uploadSiteContentImage's folder union to accept "destinations".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Destination form (schema + component)

**Files:**
- Create: `components/admin/content/destination-form-schema.ts`
- Create: `components/admin/content/destination-form.tsx`

**Interfaces:**
- Consumes: `createDestination`/`updateDestination` (Task 3), `uploadSiteContentImage` (Task 3), `readFileAsBase64` (`lib/read-file-as-base64.ts`).
- Produces: `destinationFormSchema`, `type DestinationFormValues = { name: string; slug: string; region: "local" | "international"; photoStoragePath?: string }`; `type DestinationRecord = { id: string; name: string; slug: string; region: "local" | "international"; photoStoragePath: string | null; isActive: boolean; sortOrder: number }`; `<DestinationForm mode="create" onSuccess={...} />` / `<DestinationForm mode="edit" destination={DestinationRecord} onSuccess={...} />` — consumed by Task 5's list.

- [ ] **Step 1: Write `destination-form-schema.ts`**

```typescript
import { z } from "zod";

export const destinationFormSchema = z.object({
  name: z.string().min(1, "Please enter a destination name"),
  slug: z
    .string()
    .min(1, "Please enter a slug")
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens only"
    ),
  region: z.enum(["local", "international"], {
    error: "Please select a region",
  }),
  photoStoragePath: z.string().optional(),
});

export type DestinationFormValues = z.infer<typeof destinationFormSchema>;
```

- [ ] **Step 2: Write `destination-form.tsx`**

```tsx
"use client";

import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createDestination, updateDestination } from "@/actions/destinations";
import { uploadSiteContentImage } from "@/actions/site-content-uploads";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import {
  destinationFormSchema,
  type DestinationFormValues,
} from "./destination-form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type DestinationRecord = {
  id: string;
  name: string;
  slug: string;
  region: "local" | "international";
  photoStoragePath: string | null;
  isActive: boolean;
  sortOrder: number;
};

type DestinationFormProps =
  | { mode: "create"; onSuccess: () => void }
  | { mode: "edit"; destination: DestinationRecord; onSuccess: () => void };

/**
 * Renders either the create or edit destination form, mirroring
 * hero-slide-form.tsx's exact dual create/edit dispatch shape.
 */
export function DestinationForm(props: DestinationFormProps) {
  if (props.mode === "create") {
    return <CreateDestinationForm onSuccess={props.onSuccess} />;
  }

  return (
    <EditDestinationForm
      destination={props.destination}
      onSuccess={props.onSuccess}
    />
  );
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CreateDestinationForm({ onSuccess }: { onSuccess: () => void }) {
  return (
    <DestinationFormBody
      defaultValues={{
        name: "",
        slug: "",
        region: "local",
        photoStoragePath: "",
      }}
      submitLabel="Add Destination"
      onSubmit={async (values) => {
        const result = await createDestination(values);
        if (result.ok) {
          toast.success("Destination added.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function EditDestinationForm({
  destination,
  onSuccess,
}: {
  destination: DestinationRecord;
  onSuccess: () => void;
}) {
  return (
    <DestinationFormBody
      defaultValues={{
        name: destination.name,
        slug: destination.slug,
        region: destination.region,
        photoStoragePath: destination.photoStoragePath ?? "",
      }}
      submitLabel="Save Changes"
      onSubmit={async (values) => {
        const result = await updateDestination(destination.id, values);
        if (result.ok) {
          toast.success("Destination updated.");
          onSuccess();
        } else {
          toast.error(result.error);
        }
      }}
    />
  );
}

function DestinationFormBody({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: DestinationFormValues;
  submitLabel: string;
  onSubmit: (values: DestinationFormValues) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(defaultValues.slug));

  const form = useForm<DestinationFormValues>({
    resolver: zodResolver(destinationFormSchema),
    defaultValues,
  });

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (storagePath: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadSiteContentImage("destinations", {
        name: file.name,
        type: file.type,
        base64,
      });

      if (!result.ok) {
        toast.error(result.error);
      } else if (result.storagePath) {
        onUploaded(result.storagePath);
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

  async function handleSubmit(values: DestinationFormValues) {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="Palawan"
                  onBlur={(event) => {
                    field.onBlur();
                    if (!slugTouched) {
                      form.setValue("slug", slugify(event.target.value), {
                        shouldValidate: true,
                      });
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  placeholder="palawan"
                  onChange={(event) => {
                    setSlugTouched(true);
                    field.onChange(event);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="region"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Region</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="international">International</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="photoStoragePath"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Photo (optional)</FormLabel>
              <FormControl>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingImage}
                  onChange={(event) =>
                    handleImageChange(event, (storagePath) =>
                      field.onChange(storagePath)
                    )
                  }
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
              </FormControl>
              {field.value ? (
                <p className="text-sm text-muted-foreground">
                  Photo uploaded.
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting || isUploadingImage}
          className="self-start"
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0 (Task 3's `actions/destinations.ts` import now resolves).

- [ ] **Step 4: Commit**

```bash
git add components/admin/content/destination-form-schema.ts components/admin/content/destination-form.tsx
git commit -m "$(cat <<'EOF'
feat: add destination create/edit form

Mirrors hero-slide-form.tsx's dual create/edit dispatch shape, with
a name/slug/region/photo field set and the shared
uploadSiteContentImage("destinations", ...) upload flow.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Destinations list (with active/inactive toggle + delete)

**Files:**
- Create: `components/admin/content/destinations-list.tsx`

**Interfaces:**
- Consumes: `deleteDestination`/`toggleDestinationActive` (Task 3), `DestinationForm`/`DestinationRecord` (Task 4).
- Produces: `type DestinationListItem = DestinationRecord & { photoUrl: string | null }`; `<DestinationsList initialDestinations={DestinationListItem[]} />` — consumed by Task 6's admin page.

- [ ] **Step 1: Write `destinations-list.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteDestination,
  toggleDestinationActive,
} from "@/actions/destinations";
import { DestinationForm, type DestinationRecord } from "./destination-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type DestinationListItem = DestinationRecord & {
  photoUrl: string | null;
};

/**
 * Combines Dialog-wrapped add/edit DestinationForm with an AlertDialog
 * delete confirmation and a per-row active/inactive Switch, mirroring
 * hero-slides-list.tsx's composition (minus drag-reorder, out of scope
 * per the design spec) and package-list-row.tsx's optimistic-toggle
 * Switch pattern.
 */
export function DestinationsList({
  initialDestinations,
}: {
  initialDestinations: DestinationListItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialDestinations);
  const [prevInitialDestinations, setPrevInitialDestinations] = useState(
    initialDestinations
  );
  if (initialDestinations !== prevInitialDestinations) {
    setPrevInitialDestinations(initialDestinations);
    setItems(initialDestinations);
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDestination, setEditingDestination] =
    useState<DestinationListItem | null>(null);
  const [deletingDestination, setDeletingDestination] =
    useState<DestinationListItem | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  function handleMutationSuccess() {
    setIsCreateOpen(false);
    setEditingDestination(null);
    router.refresh();
  }

  function handleDelete() {
    if (!deletingDestination) return;
    const target = deletingDestination;

    startDeleting(async () => {
      try {
        const result = await deleteDestination(target.id);
        if (result.ok) {
          toast.success("Destination deleted.");
          setItems((current) =>
            current.filter((item) => item.id !== target.id)
          );
          setDeletingDestination(null);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={<Button size="lg" />}>
            Add Destination
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Destination</DialogTitle>
            </DialogHeader>
            <DestinationForm mode="create" onSuccess={handleMutationSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No destinations yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a destination so packages can be linked to it and travelers
            can browse by destination on the homepage.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <DestinationRow
              key={item.id}
              item={item}
              onEdit={() => setEditingDestination(item)}
              onDelete={() => setDeletingDestination(item)}
              onMutated={() => router.refresh()}
            />
          ))}
        </div>
      )}

      <Dialog
        open={editingDestination !== null}
        onOpenChange={(open) => !open && setEditingDestination(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Destination</DialogTitle>
          </DialogHeader>
          {editingDestination && (
            <DestinationForm
              mode="edit"
              destination={editingDestination}
              onSuccess={handleMutationSuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingDestination !== null}
        onOpenChange={(open) => !open && setDeletingDestination(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this destination?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the homepage and package picker
              immediately. Destinations still linked to a package can&apos;t
              be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete Destination"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DestinationRow({
  item,
  onEdit,
  onDelete,
  onMutated,
}: {
  item: DestinationListItem;
  onEdit: () => void;
  onDelete: () => void;
  onMutated: () => void;
}) {
  const [isActive, setIsActive] = useState(item.isActive);
  const [isPending, startTransition] = useTransition();

  function handleActiveChange(checked: boolean) {
    setIsActive(checked);
    startTransition(async () => {
      try {
        const result = await toggleDestinationActive(item.id, checked);
        if (!result.ok) {
          toast.error(result.error);
          setIsActive(!checked);
        } else {
          onMutated();
        }
      } catch {
        toast.error(GENERIC_ERROR_MESSAGE);
        setIsActive(!checked);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      {/* Plain <img>, not next/image -- site-content isn't in
          next.config.ts's Image Optimizer remotePatterns (mirrors
          hero-slides-list.tsx's identical thumbnail convention). */}
      {item.photoUrl ? (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-secondary/10">
          <img
            src={item.photoUrl}
            alt=""
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div className="size-16 shrink-0 rounded-md bg-secondary/10" />
      )}

      <div className="flex-1">
        <p className="font-medium">{item.name}</p>
        <Badge variant="outline" className="capitalize">
          {item.region}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={isActive}
          onCheckedChange={handleActiveChange}
          disabled={isPending}
        />
        <span className="text-sm text-muted-foreground">Active</span>
      </div>

      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit
      </Button>
      <Button variant="destructive" size="sm" onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/admin/content/destinations-list.tsx
git commit -m "$(cat <<'EOF'
feat: add destinations admin list

Add/edit/delete plus an optimistic active/inactive Switch that
reverts and surfaces the disable-guard trigger's error on rejection.
Mirrors hero-slides-list.tsx's composition and
package-list-row.tsx's toggle pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Admin Destinations page + "Manage Destinations" entry point

**Files:**
- Create: `app/admin/(dashboard)/packages/destinations/page.tsx`
- Modify: `app/admin/(dashboard)/packages/page.tsx`

**Interfaces:**
- Consumes: `DestinationsList`/`DestinationListItem` (Task 5), `requirePermissionOrRedirect` (`lib/auth/dal.ts`).

- [ ] **Step 1: Write the admin Destinations page**

```tsx
import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  DestinationsList,
  type DestinationListItem,
} from "@/components/admin/content/destinations-list";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Destinations | TravelSentro Admin",
};

type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];

export default async function AdminDestinationsPage() {
  // AUTH-05 — gate independent of nav hiding; RLS is the second,
  // independent enforcement layer (mirrors every other admin page).
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  // Admin must see inactive destinations too, unlike the public homepage
  // query (is_active = true) -- no filter here, "manage_packages can read
  // all destinations" RLS policy covers it.
  const { data: destinationRows, error } = await supabase
    .from("destinations")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load destinations:", error.message);
  }

  const destinations: DestinationListItem[] = (
    (destinationRows ?? []) as DestinationRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    region: row.region as "local" | "international",
    photoStoragePath: row.photo_storage_path,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    photoUrl: row.photo_storage_path
      ? supabase.storage
          .from("site-content")
          .getPublicUrl(row.photo_storage_path).data.publicUrl
      : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Destinations
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Manage the Local/International destinations shown on the homepage
          and available when linking a package. A destination can&apos;t be
          disabled or deleted while an active package still uses it.
        </p>
      </div>

      <DestinationsList initialDestinations={destinations} />
    </div>
  );
}
```

- [ ] **Step 2: Add a "Manage Destinations" button to the Packages list page**

In `app/admin/(dashboard)/packages/page.tsx`, add the `Link` import (already imports `Link` — confirm, it does) and change the header's button row from:

```tsx
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
            Packages
          </h1>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Drag to reorder, and toggle Published/Featured — changes go live
            on the public site immediately.
          </p>
        </div>
        <Button
          size="lg"
          render={<Link href="/admin/packages/new" />}
          nativeButton={false}
        >
          Add Package
        </Button>
      </div>
```

to:

```tsx
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
            Packages
          </h1>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Drag to reorder, and toggle Published/Featured — changes go live
            on the public site immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            render={<Link href="/admin/packages/destinations" />}
            nativeButton={false}
          >
            Manage Destinations
          </Button>
          <Button
            size="lg"
            render={<Link href="/admin/packages/new" />}
            nativeButton={false}
          >
            Add Package
          </Button>
        </div>
      </div>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (in the background), then in a browser (or via the `chromium-cli`/Playwright pattern used earlier in this session):
1. Log in to `/admin/login` as a seeded admin (see `npm run seed:admin` if no admin exists yet).
2. Visit `/admin/packages` — confirm a "Manage Destinations" button now appears next to "Add Package".
3. Click it → lands on `/admin/packages/destinations`, showing "No destinations yet" (empty, since Task 10's seed hasn't run yet at this point in the plan).
4. Click "Add Destination", fill Name "Palawan", confirm Slug auto-fills "palawan", pick Region "Local", submit without a photo.
5. Confirm the new row appears with an "Active" toggle already on, an Edit and Delete button.
6. Toggle it off — confirm it flips off with no error (no packages reference it yet).
7. Toggle it back on, then click Delete → confirm the AlertDialog appears, confirm deletion succeeds and the row disappears.

Expected: all steps behave as described, no console errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/"(dashboard)"/packages/destinations/page.tsx app/admin/"(dashboard)"/packages/page.tsx
git commit -m "$(cat <<'EOF'
feat: add admin Destinations page and entry point

New /admin/packages/destinations page (gated by can_manage_packages,
shows all destinations including inactive). Adds a "Manage
Destinations" button next to "Add Package" on the Packages list.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Link destinations to packages (form field + actions + admin pages)

**Files:**
- Modify: `components/admin/package-form-schema.ts`
- Modify: `components/admin/package-form.tsx`
- Modify: `actions/packages.ts`
- Modify: `app/admin/(dashboard)/packages/new/page.tsx`
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx`

**Interfaces:**
- Consumes: `destinations` table (Task 1/2).
- Produces: `PackageFormValues.destinationId?: string`; `PackageForm`'s new `destinations?: { id: string; name: string }[]` prop.

- [ ] **Step 1: Add `destinationId` to the package form schema**

In `components/admin/package-form-schema.ts`, add one field to `packageFormSchema`, right after `durationLabel`:

```typescript
  durationLabel: z.string().optional(),
  destinationId: z.string().optional(),
```

- [ ] **Step 2: Add the Destination field to `package-form.tsx`**

Add the `Select` import (the file currently has no `Select` import — add it alongside the existing `Input`/`Textarea` imports):

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

Add a `PackageDestinationOption` type and a `destinations` prop, and include `destinationId` in `EMPTY_DEFAULTS` and `TAB_FIELD_MAP`'s `"details"` entry:

```typescript
export type PackageDestinationOption = { id: string; name: string };
```

```typescript
const EMPTY_DEFAULTS: PackageFormValues = {
  name: "",
  slug: "",
  fromPrice: 0,
  durationDays: 0,
  durationLabel: "",
  destinationId: "",
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
  bestTimeToGo: "",
  groupSize: "",
};
```

```typescript
  { tab: "details", fields: ["name", "slug", "fromPrice", "durationDays", "durationLabel", "destinationId"] },
```

Change the `PackageForm` signature to accept `destinations`:

```typescript
export function PackageForm({
  packageId,
  defaultValues,
  initialPhotos = [],
  destinations = [],
}: {
  packageId?: string;
  defaultValues?: Partial<PackageFormValues>;
  initialPhotos?: PhotoManagerPhoto[];
  destinations?: PackageDestinationOption[];
}) {
```

Add the field to the "details" `TabsContent`, right after the `durationLabel` `FormField`:

```tsx
            <FormField
              control={form.control}
              name="destinationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination (optional)</FormLabel>
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a destination" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {destinations.map((destination) => (
                        <SelectItem key={destination.id} value={destination.id}>
                          {destination.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 3: Include `destination_id` in `createPackage`/`updatePackage`**

In `actions/packages.ts`, add one line to each `.insert()`/`.update()` payload:

`createPackage`'s insert call becomes:
```typescript
    .insert({
      name: values.name,
      slug: values.slug,
      from_price: values.fromPrice,
      duration_days: values.durationDays,
      duration_label: values.durationLabel || null,
      destination_id: values.destinationId || null,
      is_published: false,
      is_featured: false,
      sort_order: count ?? 0,
    })
```

`updatePackage`'s update call becomes:
```typescript
    .update({
      name: values.name,
      slug: values.slug,
      from_price: values.fromPrice,
      duration_days: values.durationDays,
      duration_label: values.durationLabel || null,
      destination_id: values.destinationId || null,
    })
```

- [ ] **Step 4: Fetch active destinations in the "New Package" admin page**

Rewrite `app/admin/(dashboard)/packages/new/page.tsx`:

```tsx
import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "@/components/admin/package-form";

export const metadata: Metadata = {
  title: "New Package | TravelSentro Admin",
};

export default async function NewPackagePage() {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-18).
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();
  const { data: destinationRows, error } = await supabase
    .from("destinations")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load destinations:", error.message);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          New Package
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Create a new tour package. It starts as an unpublished draft until
          you publish it from the package list.
        </p>
      </div>

      <PackageForm destinations={destinationRows ?? []} />
    </div>
  );
}
```

- [ ] **Step 5: Fetch destinations (active ∪ the package's own, even if inactive) in the "Edit Package" admin page**

Rewrite `app/admin/(dashboard)/packages/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "@/components/admin/package-form";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Edit Package | TravelSentro Admin",
};

type FaqFactsRow = Database["public"]["Tables"]["faq_facts"]["Row"];

type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Database["public"]["Tables"]["package_photos"]["Row"][];
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  // faq_facts is a to-one relation (isOneToOne: true), but defensively
  // handle either shape, same as app/(public)/packages/[slug]/page.tsx.
  faq_facts: FaqFactsRow | FaqFactsRow[] | null;
  destinations: Pick<
    Database["public"]["Tables"]["destinations"]["Row"],
    "id" | "name"
  > | null;
};

/**
 * Admin edit page (PKG-01/02). Fetches by id, NOT slug, and with no
 * published filter — an Admin/Staff with can_manage_packages must be able
 * to open and edit an unpublished draft, unlike the public detail page.
 */
export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-18).
  await requirePermissionOrRedirect("can_manage_packages");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, { data: activeDestinationRows, error: destinationsError }] =
    await Promise.all([
      supabase
        .from("packages")
        .select(
          `*,
          package_photos(id, storage_path, display_order, alt_text),
          itinerary_days(id, day_number, title, description),
          package_inclusions(id, kind, label, sort_order),
          faq_facts(best_time_to_go, group_size),
          destinations(id, name)`
        )
        .eq("id", id)
        .single(),
      supabase
        .from("destinations")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  if (error || !data) notFound();
  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
  }

  const pkg = data as PackageDetail;
  const faqFacts = Array.isArray(pkg.faq_facts)
    ? pkg.faq_facts[0]
    : pkg.faq_facts;

  const itinerary = [...pkg.itinerary_days]
    .sort((a, b) => a.day_number - b.day_number)
    .map((day) => ({ title: day.title, description: day.description }));

  const inclusions = pkg.package_inclusions
    .filter((item) => item.kind === "included")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));
  const exclusions = pkg.package_inclusions
    .filter((item) => item.kind === "excluded")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));
  const bringItems = pkg.package_inclusions
    .filter((item) => item.kind === "bring")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));

  const photos = pkg.package_photos.map((photo) => ({
    id: photo.id,
    storagePath: photo.storage_path,
    displayOrder: photo.display_order,
    altText: photo.alt_text,
  }));

  // A package's previously-assigned destination may have since been
  // disabled -- if so it won't be in activeDestinationRows, and the Select
  // would silently show blank instead of the actual saved value. Add it
  // back in so the form always shows what's really saved.
  const activeDestinations = activeDestinationRows ?? [];
  const currentDestination = pkg.destinations;
  const destinationOptions =
    currentDestination &&
    !activeDestinations.some((d) => d.id === currentDestination.id)
      ? [...activeDestinations, currentDestination]
      : activeDestinations;

  const defaultValues: Partial<PackageFormValues> = {
    name: pkg.name,
    slug: pkg.slug,
    fromPrice: pkg.from_price,
    durationDays: pkg.duration_days,
    durationLabel: pkg.duration_label ?? "",
    destinationId: pkg.destination_id ?? "",
    itinerary,
    inclusions,
    exclusions,
    bringItems,
    bestTimeToGo: faqFacts?.best_time_to_go ?? "",
    groupSize: faqFacts?.group_size ?? "",
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Edit Package
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          {pkg.name}
        </p>
      </div>

      <PackageForm
        packageId={pkg.id}
        defaultValues={defaultValues}
        initialPhotos={photos}
        destinations={destinationOptions}
      />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Manual verification**

With `npm run dev` running:
1. Visit `/admin/packages/destinations`, add a destination "Palawan" (Local) if not already present from Task 6's manual check.
2. Visit `/admin/packages/new`, confirm the Details tab now shows a "Destination (optional)" dropdown listing "Palawan".
3. Create a package, selecting "Palawan" as its destination, save.
4. Reopen the package's edit page — confirm "Palawan" is still selected (not blank).
5. Go to `/admin/packages/destinations`, try to toggle "Palawan" inactive — confirm it's now BLOCKED with the trigger's error message (since the package you just created is a draft — check: `is_published` starts `false` on create, so this should actually SUCCEED, not block, since the guard only fires for `is_published = true`; if it succeeds, publish the package first via the Packages list, then retry disabling Palawan and confirm it's blocked this time).
6. Delete the test package (soft-delete via the Packages list), then retry disabling "Palawan" — confirm it now succeeds (soft-deleted packages don't count as active).

Expected: all steps behave as described.

- [ ] **Step 8: Commit**

```bash
git add components/admin/package-form-schema.ts components/admin/package-form.tsx actions/packages.ts app/admin/"(dashboard)"/packages/new/page.tsx "app/admin/(dashboard)/packages/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: link packages to a destination

Adds an optional Destination dropdown to the package form (Details
tab), wires destination_id through createPackage/updatePackage, and
has both admin package pages fetch active destinations -- the edit
page also unions in the package's own destination if it was since
disabled, so an existing selection never silently goes blank.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Public homepage Destinations section

**Files:**
- Create: `components/homepage/destinations-section.tsx`
- Modify: `app/(public)/page.tsx`

**Interfaces:**
- Produces: `type DestinationTile = { id: string; name: string; slug: string; photoUrl: string | null }`; `<DestinationsSection local={DestinationTile[]} international={DestinationTile[]} />`.

- [ ] **Step 1: Write `destinations-section.tsx`**

```tsx
import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type DestinationTile = {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
};

function DestinationCard({ destination }: { destination: DestinationTile }) {
  return (
    <Link
      href={`/packages?destination=${encodeURIComponent(destination.slug)}`}
      className="group flex flex-col gap-2"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-primary/10">
        {destination.photoUrl ? (
          // Plain <img>, not next/image -- site-content isn't in
          // next.config.ts's Image Optimizer remotePatterns.
          <img
            src={destination.photoUrl}
            alt={destination.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <MapPin
              className="size-8 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
        )}
      </div>
      <p className="font-heading text-base font-semibold text-secondary">
        {destination.name}
      </p>
    </Link>
  );
}

function DestinationGroup({
  title,
  destinations,
  emptyMessage,
}: {
  title: string;
  destinations: DestinationTile[];
  emptyMessage: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
        {title}
      </h3>
      {destinations.length === 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="gap-0 overflow-hidden p-0">
                <Skeleton className="aspect-square w-full rounded-none" />
                <Skeleton className="m-2 h-4 w-2/3" />
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {destinations.map((destination) => (
            <DestinationCard key={destination.id} destination={destination} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Homepage "Destinations" section -- pure prop-driven, zero Supabase
 * awareness. Splits admin-managed destinations into Local/International
 * groups; each empty group renders the same skeleton/"coming soon" pattern
 * as FeaturedPackagesGrid/TestimonialsSection instead of disappearing.
 */
export function DestinationsSection({
  local,
  international,
}: {
  local: DestinationTile[];
  international: DestinationTile[];
}) {
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8">
      <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
        Explore Destinations
      </h2>
      <DestinationGroup
        title="Local Spots"
        destinations={local}
        emptyMessage="Local destinations coming soon."
      />
      <DestinationGroup
        title="International"
        destinations={international}
        emptyMessage="International destinations coming soon."
      />
    </section>
  );
}
```

- [ ] **Step 2: Fetch and split destinations in `app/(public)/page.tsx`, insert the section**

Add the import alongside the other homepage section imports:

```typescript
import { DestinationsSection } from "@/components/homepage/destinations-section";
```

Add a fetch block right after the `(4) Testimonials` block and before `(5) Brand partners`:

```typescript
  // (4.5) Destinations -- admin-managed, split into Local/International
  // groups. Public read RLS already scopes this to is_active = true, but
  // the query-layer filter is kept too, matching every other homepage
  // section's belt-and-suspenders pattern (e.g. packages' is_published).
  const { data: destinationsData, error: destinationsError } = await supabase
    .from("destinations")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
  }

  const destinationTiles = (destinationsData ?? []).map(
    (d: Database["public"]["Tables"]["destinations"]["Row"]) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      region: d.region,
      photoUrl: d.photo_storage_path
        ? supabase.storage
            .from("site-content")
            .getPublicUrl(d.photo_storage_path).data.publicUrl
        : null,
    })
  );
  const localDestinations = destinationTiles.filter(
    (d) => d.region === "local"
  );
  const internationalDestinations = destinationTiles.filter(
    (d) => d.region === "international"
  );
```

Insert the section between `FeaturedPackagesGrid` and `TestimonialsSection` in the returned JSX:

```tsx
      <HeroCarousel slides={slides} />
      <WhyChooseUs />
      <FeaturedPackagesGrid items={featuredItems} />
      <DestinationsSection
        local={localDestinations}
        international={internationalDestinations}
      />
      <TestimonialsSection testimonials={testimonials} />
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Manual verification**

With `npm run dev` running, visit `/` and confirm:
1. An "Explore Destinations" section renders between Featured Packages and What Our Customers Say.
2. It shows "Local Spots" with the destinations created in earlier tasks (e.g. Palawan, if still active) as clickable cards.
3. "International" shows the 4-skeleton-card "International destinations coming soon." empty state (no international destinations exist yet — Task 10 seeds them).
4. Clicking a Local Spots card navigates to `/packages?destination=<slug>`.

Expected: all render correctly, no console errors.

- [ ] **Step 5: Commit**

```bash
git add components/homepage/destinations-section.tsx app/"(public)"/page.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage Destinations section

Local/International destination tiles fetched server-side
(is_active = true), each linking to /packages?destination=<slug>.
Empty region groups render the same skeleton/"coming soon" pattern
as FeaturedPackagesGrid/TestimonialsSection. Placed between Featured
Packages and Testimonials.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `/packages?destination=slug` filtering

**Files:**
- Modify: `app/(public)/packages/page.tsx`

**Interfaces:**
- Consumes: `destinations` table (Task 1/2).

- [ ] **Step 1: Rewrite `app/(public)/packages/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { PackageCard } from "@/components/packages/package-card";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Tour Packages | TravelSentro",
  description:
    "Browse TravelSentro's tour packages across the Philippines and reach out on WhatsApp or Facebook to start planning your trip.",
};

type PackageWithPhotos = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Pick<
    Database["public"]["Tables"]["package_photos"]["Row"],
    "storage_path" | "display_order"
  >[];
};

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const { destination: destinationSlug } = await searchParams;
  const supabase = await createClient();

  // Looked up separately (not derived from the packages join below) so the
  // heading still shows a real destination name even when zero packages
  // match -- an inner-joined query returns zero rows in that case, which
  // would otherwise leave destinationName with nothing to read from.
  let destinationName: string | null = null;
  if (destinationSlug) {
    const { data: destinationRow } = await supabase
      .from("destinations")
      .select("name")
      .eq("slug", destinationSlug)
      .eq("is_active", true)
      .maybeSingle();
    destinationName = destinationRow?.name ?? destinationSlug;
  }

  // destinations!inner is required, not the default to-one embed --
  // PostgREST only restricts which *parent* rows come back when the
  // embedded relation is an inner join; without !inner, .eq() on the
  // embedded column just nulls out non-matching embeds instead of
  // filtering the packages themselves.
  const { data: packages, error } = destinationSlug
    ? await supabase
        .from("packages")
        .select(
          "*, package_photos(storage_path, display_order), destinations!inner(slug, name)"
        )
        .eq("is_published", true)
        .eq("destinations.slug", destinationSlug)
        .order("sort_order", { ascending: true })
    : await supabase
        .from("packages")
        .select("*, package_photos(storage_path, display_order)")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });

  if (error) {
    // Surfaced server-side only — the page still renders the empty state
    // below rather than crashing the whole route on a transient DB error.
    console.error("Failed to load packages:", error.message);
  }

  const rows = (packages ?? []) as PackageWithPhotos[];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {destinationName ? `Packages in ${destinationName}` : "Tour Packages"}
        </h1>
        <p className="max-w-xl text-base leading-[1.5] text-muted-foreground">
          Browse our tour packages and reach out on WhatsApp or Facebook to
          start planning your trip.
        </p>
        {destinationName ? (
          <Link
            href="/packages"
            className="w-fit text-sm text-primary underline underline-offset-2"
          >
            Clear filter
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No packages available right now
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Check back soon, or reach out to us directly on WhatsApp or
            Facebook — we&apos;re happy to help you plan your trip.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((pkg) => {
            const [firstPhoto] = [...pkg.package_photos].sort(
              (a, b) => a.display_order - b.display_order
            );
            const photoUrl = firstPhoto
              ? supabase.storage
                  .from("package-photos")
                  .getPublicUrl(firstPhoto.storage_path).data.publicUrl
              : null;

            return <PackageCard key={pkg.id} pkg={pkg} photoUrl={photoUrl} />;
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Manual verification**

With `npm run dev` running:
1. Visit `/packages` (no query param) — confirm heading reads "Tour Packages", no "Clear filter" link, all published packages show.
2. Visit `/packages?destination=palawan` (assuming a package is linked to a "Palawan" destination with slug `palawan` from Task 7/10) — confirm heading reads "Packages in Palawan", a "Clear filter" link appears and returns to `/packages`, and only Palawan-linked packages show.
3. Visit `/packages?destination=nonexistent-slug` — confirm heading reads "Packages in nonexistent-slug" (fallback) and the existing "No packages available right now" empty state renders (no new UI needed, per spec).

Expected: all three cases behave as described.

- [ ] **Step 4: Commit**

```bash
git add app/"(public)"/packages/page.tsx
git commit -m "$(cat <<'EOF'
feat: filter /packages by ?destination=slug

Inner-joins destinations to filter packages by slug, looks up the
destination name separately so the heading still reads correctly on
a zero-match filter, and reuses the page's existing empty-state card
-- no new UI for the empty-filter case.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Seed script — placeholder destinations + backfill

**Files:**
- Modify: `scripts/seed.ts`

**Interfaces:**
- Produces: 8 seeded `destinations` rows (4 local, 4 international); `destination_id` set on the 3 existing `SEED_PACKAGES` entries.

- [ ] **Step 1: Add the `SeedDestination` type and `SEED_DESTINATIONS` array**

Insert after the existing `SeedPackage` type definition and before `const SEED_PACKAGES`:

```typescript
type SeedDestination = {
  slug: string
  name: string
  region: 'local' | 'international'
  sortOrder: number
}

const SEED_DESTINATIONS: SeedDestination[] = [
  { slug: 'palawan', name: 'Palawan', region: 'local', sortOrder: 0 },
  { slug: 'siargao', name: 'Siargao', region: 'local', sortOrder: 1 },
  { slug: 'banaue', name: 'Banaue', region: 'local', sortOrder: 2 },
  { slug: 'boracay', name: 'Boracay', region: 'local', sortOrder: 3 },
  { slug: 'japan', name: 'Japan', region: 'international', sortOrder: 0 },
  { slug: 'thailand', name: 'Thailand', region: 'international', sortOrder: 1 },
  { slug: 'south-korea', name: 'South Korea', region: 'international', sortOrder: 2 },
  { slug: 'singapore', name: 'Singapore', region: 'international', sortOrder: 3 },
]
```

- [ ] **Step 2: Add `destinationSlug` to `SeedPackage` and the 3 existing entries**

Add one field to the `SeedPackage` type:

```typescript
type SeedPackage = {
  slug: string
  name: string
  fromPrice: number
  durationDays: number
  durationLabel: string
  isPublished: true
  isFeatured: boolean
  sortOrder: number
  destinationSlug: string
  photos: SeedPhoto[]
  itinerary: SeedItineraryDay[]
  inclusions: SeedInclusion[]
  faq: { bestTimeToGo: string; groupSize: string }
}
```

Add `destinationSlug: 'palawan',` to the `palawan-island-hopping` entry (right after `sortOrder: 0,`), `destinationSlug: 'siargao',` to `siargao-surf-island` (after `sortOrder: 1,`), and `destinationSlug: 'banaue',` to `banaue-rice-terraces` (after `sortOrder: 2,`).

- [ ] **Step 3: Add `seedDestinations()` and wire it into `seedPackage()`/`seed()`**

Insert a new function after `SEED_PACKAGES` and before `seedPackage`:

```typescript
async function seedDestinations(): Promise<Map<string, string>> {
  console.log(`Seeding ${SEED_DESTINATIONS.length} destinations...`)
  const idBySlug = new Map<string, string>()

  for (const destination of SEED_DESTINATIONS) {
    const { data, error } = await supabase
      .from('destinations')
      .upsert(
        {
          slug: destination.slug,
          name: destination.name,
          region: destination.region,
          sort_order: destination.sortOrder,
        },
        { onConflict: 'slug' }
      )
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`Failed to upsert destination ${destination.slug}: ${error?.message}`)
    }

    idBySlug.set(destination.slug, data.id)
  }

  console.log('  -> destinations done')
  return idBySlug
}
```

Change `seedPackage`'s signature and its upsert payload to accept and use the id map:

```typescript
async function seedPackage(pkg: SeedPackage, destinationIdBySlug: Map<string, string>) {
  console.log(`Seeding "${pkg.name}" (${pkg.slug})...`)

  const { data: pkgRow, error: pkgError } = await supabase
    .from('packages')
    .upsert(
      {
        slug: pkg.slug,
        name: pkg.name,
        from_price: pkg.fromPrice,
        duration_days: pkg.durationDays,
        duration_label: pkg.durationLabel,
        is_published: pkg.isPublished,
        is_featured: pkg.isFeatured,
        sort_order: pkg.sortOrder,
        destination_id: destinationIdBySlug.get(pkg.destinationSlug) ?? null,
      },
      { onConflict: 'slug' }
    )
    .select()
    .single()
```

(The rest of `seedPackage`'s body is unchanged.)

Change `seed()`'s body to seed destinations first and pass the map through:

```typescript
async function seed() {
  await ensureWebSocketPolyfill()

  supabase = createClient<Database>(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  })

  const destinationIdBySlug = await seedDestinations()

  console.log(`Seeding ${SEED_PACKAGES.length} placeholder packages...`)
  for (const pkg of SEED_PACKAGES) {
    await seedPackage(pkg, destinationIdBySlug)
  }
  console.log('Seed complete.')
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Run the seed script against the local stack**

Run: `npm run seed`
Expected: console output shows `Seeding 8 destinations...` then `-> destinations done`, then `Seeding 3 placeholder packages...` with each package logging `-> done (package_id=...)`, ending in `Seed complete.` with exit code 0.

- [ ] **Step 6: Verify the backfill via SQL**

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
select p.slug as package_slug, d.slug as destination_slug, d.region
from packages p
join destinations d on d.id = p.destination_id
order by p.sort_order;
"
```
Expected: 3 rows — `palawan-island-hopping | palawan | local`, `siargao-surf-island | siargao | local`, `banaue-rice-terraces | banaue | local`.

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
select slug, region, is_active from destinations order by region, sort_order;
"
```
Expected: 8 rows total — 4 `region = 'international'` (`japan`, `thailand`, `south-korea`, `singapore`), 4 `region = 'local'` (`palawan`, `siargao`, `banaue`, `boracay`), all `is_active = true`.

- [ ] **Step 7: Re-run to confirm idempotency**

Run: `npm run seed` again.
Expected: exits 0 with no duplicate-key errors; re-run the Step 6 queries and confirm row counts are unchanged (still 3 and 8).

- [ ] **Step 8: Full-app manual verification**

With `npm run dev` running:
1. Visit `/` — confirm the Destinations section now shows 4 Local Spots (Palawan, Siargao, Banaue, Boracay — Boracay as an icon-placeholder tile since it has no photo) and 4 International tiles (Japan, Thailand, South Korea, Singapore, also icon-placeholders).
2. Click "Siargao" — confirm it lands on `/packages?destination=siargao` showing the "Siargao Surf & Island" package only.
3. Click "Japan" — confirm it lands on `/packages?destination=japan` showing the "No packages available right now" empty state, with heading "Packages in Japan".

Expected: all three checks pass.

- [ ] **Step 9: Commit**

```bash
git add scripts/seed.ts
git commit -m "$(cat <<'EOF'
feat: seed placeholder destinations and backfill existing packages

Adds 8 destinations (4 local: Palawan/Siargao/Banaue/Boracay, 4
international: Japan/Thailand/South Korea/Singapore) and links the
3 existing seed packages to their matching local destination.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

- [ ] Run `npx tsc --noEmit && npm run lint && npm run build` from repo root — all three must exit 0.
- [ ] Re-run Task 1 Step 3's SQL checks one more time against the final schema state to confirm nothing in Tasks 2–10 broke the disable/delete guards.
- [ ] Walk the full flow once end-to-end: create a destination → link a package to it → publish the package → confirm the destination can't be disabled → unpublish/soft-delete the package → confirm it now can.
