# Package Fields Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the package data model and admin form per `docs/superpowers/specs/2026-08-07-package-fields-rework-design.md` — remove Best Time to Go/Group Size/Duration Days, make Destination and Duration required, rename From Price to Price per pax, add an optional fixed-amount Discount, add plain-text Remarks, add a required (≥1) repeatable Travel Dates list with optional per-date fees, auto-generate a `TSP-000001`-style package code that replaces the editable slug, and let admins add photos to a package before its first real save — updating both the admin form and the public site to match.

**Architecture:** One migration handles all schema changes (column drops/renames/additions, the new `package_travel_dates` table, the destination-required-to-publish check, the package-code sequence/trigger, and the updated `write_package_children()` RPC). `actions/packages.ts` collapses to a `createDraftPackage()` (minimal insert + redirect) plus a single `updatePackage()` that now carries all real validation. `package-form.tsx` grows a Travel Dates tab and loses its create-mode branch entirely, since every package has a real id from the moment "Add Package" is clicked. Public pages (`package-card.tsx`, the detail page) drop `TripFacts` in favor of plain `SECTION_CARD` blocks consistent with the existing Included/Excluded sections.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), react-hook-form + zod, `@hookform/resolvers/zod`, existing shadcn/ui primitives (no new dependencies — travel dates use a plain `<input type="date">` via the existing `Input` component).

## Global Constraints

- No new npm dependencies.
- Follow the existing `data-slot="..."` convention and `cn()` usage already established in this codebase.
- Every Server Action keeps the exact `ActionResult` return shape (`{ ok: true } | { ok: false; error: string }`) and `requirePermission("can_manage_packages")` gate already used throughout `actions/packages.ts`.
- No automated test suite exists in this project — verification is `npm run lint`, `npx tsc --noEmit`, and manual `npm run dev` checks in a browser, matching the project's established pattern (see `docs/superpowers/plans/2026-08-07-admin-forms-tables-polish.md`).
- Do not modify `components/admin/admin-nav.tsx`, `admin-sidebar-header.tsx`, `admin-topbar.tsx`, `admin-user-footer.tsx`, `app/admin/(dashboard)/layout.tsx`, `components/ui/sidebar.tsx`, or `components/ui/table.tsx` — these belong to an unrelated in-progress rework already sitting uncommitted in the working tree.
- This plan applies a migration to the project's linked Supabase instance (`supabase db push`) — this is the same workflow every prior migration in `supabase/migrations/` already used (confirm the CLI is linked to the intended project before running it).

---

### Task 1: Migration — schema changes, `package_travel_dates`, package code generation, updated RPC

**Files:**
- Create: `supabase/migrations/20260807180000_package_fields_rework.sql`

**Interfaces:**
- Produces: `packages.price_per_pax` (renamed from `from_price`), `packages.discount_amount` (nullable numeric), `packages.remarks` (nullable text), `packages.duration_days` dropped, `packages_destination_required_if_published` check constraint, `package_travel_dates` table (`id, package_id, travel_date, additional_fee, created_at`), `package_code_seq` sequence, `generate_package_code()` trigger function auto-populating `packages.slug` as `TSP-000001`-style codes, and `write_package_children(p_package_id uuid, p_itinerary jsonb, p_inclusions jsonb, p_travel_dates jsonb)` (replaces the old 5-arg version).

- [ ] **Step 1: Write the migration file**

```sql
-- Package fields rework: remove duration_days/faq_facts fields, add
-- discount_amount/remarks/package_travel_dates, make destination required
-- before publish, and auto-generate the package "code" (replaces the
-- user-editable slug) as TSP-000001-style values.
--
-- Ordering matters: duration_label is backfilled from duration_days BEFORE
-- duration_days is dropped, so no existing package silently loses its
-- duration text.

-- ============================================================================
-- 1. Backfill duration_label, then drop duration_days
-- ============================================================================
update packages
set duration_label = duration_days || ' day' || case when duration_days = 1 then '' else 's' end
where duration_label is null;

alter table packages drop column duration_days;

-- ============================================================================
-- 2. Rename from_price -> price_per_pax; add discount_amount and remarks
-- ============================================================================
alter table packages rename column from_price to price_per_pax;

alter table packages add column discount_amount numeric
  check (discount_amount is null or discount_amount >= 0);

alter table packages add column remarks text;

-- ============================================================================
-- 3. Destination required-to-publish: a package can be drafted without a
-- destination, but can never be published without one. Any already-
-- published package with no destination is unpublished here rather than
-- guessed at -- an admin must assign a real destination and republish.
-- ============================================================================
update packages set is_published = false
where is_published = true and destination_id is null;

alter table packages add constraint packages_destination_required_if_published
  check (not is_published or destination_id is not null);

-- ============================================================================
-- 4. Drop faq_facts entirely -- best_time_to_go/group_size are removed, and
-- those were faq_facts' only two content columns.
-- ============================================================================
drop table faq_facts;

-- ============================================================================
-- 5. package_travel_dates -- at-least-one-row-per-package is enforced at the
-- app layer (write_package_children below), same as itinerary_days always
-- has been -- not a DB constraint, since a freshly auto-created draft
-- package has zero travel dates until its first real save.
-- ============================================================================
create table package_travel_dates (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  travel_date date not null,
  additional_fee numeric check (additional_fee is null or additional_fee >= 0),
  created_at timestamptz not null default now()
);

alter table package_travel_dates enable row level security;

create policy "public read" on package_travel_dates
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_travel_dates.package_id and p.is_published and p.deleted_at is null
    )
  );

create policy "manage_packages can read all package_travel_dates" on package_travel_dates
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can insert package_travel_dates" on package_travel_dates
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can update package_travel_dates" on package_travel_dates
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));

create policy "manage_packages can delete package_travel_dates" on package_travel_dates
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- ============================================================================
-- 6. Package code generation -- replaces the user-editable slug. Any
-- client-supplied slug value is overwritten by this trigger; TSP-000001
-- format, globally sequential, assigned once at insert time and never
-- changed again. USAGE on the sequence must be granted explicitly to
-- authenticated -- Postgres does not grant it by default, and this trigger
-- runs with the inserting role's own privileges (no SECURITY DEFINER).
-- ============================================================================
create sequence package_code_seq start 1;

grant usage, select on sequence package_code_seq to authenticated;

create function public.generate_package_code()
returns trigger
language plpgsql
as $$
begin
  new.slug := 'TSP-' || lpad(nextval('package_code_seq')::text, 6, '0');
  return new;
end;
$$;

create trigger packages_set_code
  before insert on packages
  for each row
  execute function public.generate_package_code();

-- ============================================================================
-- 7. write_package_children() -- drop faq_facts params, add travel dates.
-- Same atomic delete+reinsert-in-one-transaction shape as
-- 20260718171228_atomic_package_children_write.sql. The old 5-arg overload
-- is dropped explicitly first since its signature is changing, not just its
-- body (create or replace alone would leave the old overload in place).
-- ============================================================================
drop function public.write_package_children(uuid, jsonb, jsonb, text, text);

create function public.write_package_children(
  p_package_id uuid,
  p_itinerary jsonb,
  p_inclusions jsonb,
  p_travel_dates jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from itinerary_days where package_id = p_package_id;
  delete from package_inclusions where package_id = p_package_id;
  delete from package_travel_dates where package_id = p_package_id;

  insert into itinerary_days (package_id, day_number, title, description)
  select
    p_package_id,
    (elem->>'day_number')::integer,
    elem->>'title',
    elem->>'description'
  from jsonb_array_elements(p_itinerary) as elem;

  insert into package_inclusions (package_id, kind, label, sort_order)
  select
    p_package_id,
    elem->>'kind',
    elem->>'label',
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_inclusions) as elem;

  insert into package_travel_dates (package_id, travel_date, additional_fee)
  select
    p_package_id,
    (elem->>'travel_date')::date,
    (elem->>'additional_fee')::numeric
  from jsonb_array_elements(p_travel_dates) as elem;
end;
$$;

grant execute on function public.write_package_children(uuid, jsonb, jsonb, jsonb) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration `20260807180000_package_fields_rework` applies with no errors. If it fails on the `faq_facts` drop or the destination backfill, inspect the actual current data (`select id, name, is_published, destination_id from packages where destination_id is null;`) before re-running — this migration is written to be safe against any current data state, but confirm the backfill step 3 didn't unpublish a package you expected to stay live.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260807180000_package_fields_rework.sql
git commit -m "feat(db): rework package fields, add travel dates, auto-generate package codes"
```

---

### Task 2: Sync `types/database.ts`

**Files:**
- Modify: `types/database.ts:100-456` (the `destinations` through `packages` blocks — no changes needed to `destinations`, but `faq_facts` is removed and `packages` changes)

**Interfaces:**
- Consumes: the schema from Task 1.
- Produces: `Database["public"]["Tables"]["packages"]["Row"]` with `price_per_pax`, `discount_amount`, `remarks`, no `duration_days`; `Database["public"]["Tables"]["package_travel_dates"]["Row"]`; no more `Database["public"]["Tables"]["faq_facts"]`.

- [ ] **Step 1: Remove the `faq_facts` block**

Delete lines 133-161 (the entire `faq_facts: { ... }` block) from `types/database.ts`.

- [ ] **Step 2: Update the `packages` block**

Find the `packages` block (originally lines 404-456):

```ts
      packages: {
        Row: {
          created_at: string
          deleted_at: string | null
          destination_id: string | null
          duration_days: number
          duration_label: string | null
          from_price: number
          id: string
          is_featured: boolean
          is_published: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          destination_id?: string | null
          duration_days: number
          duration_label?: string | null
          from_price: number
          id?: string
          is_featured?: boolean
          is_published?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          destination_id?: string | null
          duration_days?: number
          duration_label?: string | null
          from_price?: number
          id?: string
          is_featured?: boolean
          is_published?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
```

Replace with:

```ts
      packages: {
        Row: {
          created_at: string
          deleted_at: string | null
          destination_id: string | null
          discount_amount: number | null
          duration_label: string | null
          id: string
          is_featured: boolean
          is_published: boolean
          name: string
          price_per_pax: number
          remarks: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          destination_id?: string | null
          discount_amount?: number | null
          duration_label?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          name: string
          price_per_pax: number
          remarks?: string | null
          slug?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          destination_id?: string | null
          discount_amount?: number | null
          duration_label?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          name?: string
          price_per_pax?: number
          remarks?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
```

(Note `slug?: string` in `Insert` — the DB trigger assigns it, so it's no longer required from the client.)

- [ ] **Step 3: Add the `package_travel_dates` block**

Insert this new block alphabetically, immediately after the `package_photos` block (originally ending at line 403, right before `packages`):

```ts
      package_travel_dates: {
        Row: {
          additional_fee: number | null
          created_at: string
          id: string
          package_id: string
          travel_date: string
        }
        Insert: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id: string
          travel_date: string
        }
        Update: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id?: string
          travel_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_travel_dates_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: errors now surface in every file still referencing `from_price`, `duration_days`, `faq_facts`, `bestTimeToGo`/`groupSize`/`fromPrice`/`durationDays` — this is expected and confirms the type sync is correct; those files are fixed in the following tasks.

- [ ] **Step 5: Commit**

```bash
git add types/database.ts
git commit -m "chore(types): sync database types with package fields rework"
```

*(If the Supabase CLI is available and linked, `supabase gen types typescript --linked > types/database.ts` regenerates this file directly from the live schema instead of hand-editing — either approach is fine as long as the result matches the schema in Task 1.)*

---

### Task 3: Rewrite `actions/packages.ts`

**Files:**
- Modify: `actions/packages.ts`

**Interfaces:**
- Consumes: `PackageFormValues` from Task 4 (`components/admin/package-form-schema.ts`).
- Produces: `createDraftPackage(): Promise<ActionResult & { id?: string }>` (replaces `createPackage`), `updatePackage(id: string, values: PackageFormValues): Promise<ActionResult>` (now the only content-save path). `softDeletePackage`, `publishPackage`, `featurePackage`, `reorderPackages` keep their existing signatures; `publishPackage` gains a friendly error for the new destination-required-to-publish check.

- [ ] **Step 1: Replace `writePackageChildren`**

Find the function (current lines 24-64) and replace it with:

```ts
async function writePackageChildren(
  supabase: SupabaseServerClient,
  packageId: string,
  values: PackageFormValues
): Promise<ActionResult> {
  const inclusionRows = [
    ...values.inclusions.map((item, index) => ({
      kind: "included",
      label: item.label,
      sort_order: index,
    })),
    ...values.exclusions.map((item, index) => ({
      kind: "excluded",
      label: item.label,
      sort_order: index,
    })),
    ...values.bringItems.map((item, index) => ({
      kind: "bring",
      label: item.label,
      sort_order: index,
    })),
  ];

  const { error } = await supabase.rpc("write_package_children", {
    p_package_id: packageId,
    p_itinerary: values.itinerary.map((day, index) => ({
      day_number: index + 1,
      title: day.title,
      description: day.description,
    })),
    p_inclusions: inclusionRows,
    p_travel_dates: values.travelDates.map((item) => ({
      travel_date: item.date,
      additional_fee: item.additionalFee ?? null,
    })),
  });

  if (error) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true };
}
```

Update the doc comment above it (currently lines 15-23) to drop the `faq_facts` mention:

```ts
/**
 * Atomically replaces a package's itinerary_days/package_inclusions/
 * package_travel_dates rows via the write_package_children() RPC. The RPC
 * runs the delete+reinsert sequence inside a single Postgres transaction,
 * so a failed insert can never leave the package's pre-existing content
 * partially deleted. day_number/kind/sort_order are all derived from array
 * position, never user-entered fields.
 */
```

- [ ] **Step 2: Replace `createPackage` with `createDraftPackage`**

Find `createPackage` (current lines 66-121) and replace the whole function (including its doc comment) with:

```ts
/**
 * Creates a brand-new package as a minimal unpublished draft -- just enough
 * (a placeholder name, is_published: false) for a real package id to exist
 * immediately. app/admin/(dashboard)/packages/new/page.tsx calls this
 * directly and redirects to the edit page, so the Photos tab is usable
 * right away. destination/duration/travel dates stay empty until the
 * admin's first real Save, which is always updatePackage from here on.
 */
export async function createDraftPackage(): Promise<
  ActionResult & { id?: string }
> {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-18).
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  // New packages append to the end of the admin list's current order.
  const { count } = await supabase
    .from("packages")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const { data: created, error } = await supabase
    .from("packages")
    .insert({
      name: "Untitled Package",
      price_per_pax: 0,
      is_published: false,
      is_featured: false,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/packages");
  return { ok: true, id: created.id };
}
```

- [ ] **Step 3: Replace `updatePackage`**

Find `updatePackage` (current lines 123-163) and replace the whole function (including its doc comment) with:

```ts
/**
 * Updates a package's full Details/Travel Dates/Itinerary/Inclusions
 * content -- the only save path now that every package gets a real id at
 * creation time (see createDraftPackage). Never touches
 * is_published/is_featured/sort_order -- those stay 02-04's concern only
 * (publish/feature switches, drag-reorder).
 */
export async function updatePackage(
  id: string,
  values: PackageFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("packages")
    .update({
      name: values.name,
      price_per_pax: values.pricePerPax,
      discount_amount: values.discountAmount ?? null,
      duration_label: values.durationLabel,
      destination_id: values.destinationId,
      remarks: values.remarks || null,
    })
    .eq("id", id)
    .select("slug")
    .single();

  if (updateError || !updated) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const childResult = await writePackageChildren(supabase, id, values);
  if (!childResult.ok) {
    return childResult;
  }

  revalidatePath("/packages");
  revalidatePath(`/packages/${updated.slug}`);
  revalidatePath("/admin/packages");
  return { ok: true };
}
```

- [ ] **Step 4: Add a friendly error to `publishPackage` for the destination-required check**

Find `publishPackage` (current lines 195-217):

```ts
export async function publishPackage(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("slug")
    .single();

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
```

Replace with:

```ts
export async function publishPackage(
  id: string,
  isPublished: boolean
): Promise<ActionResult> {
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .update({ is_published: isPublished })
    .eq("id", id)
    .select("slug")
    .single();

  // Postgres check_violation — packages_destination_required_if_published.
  if (error?.code === "23514") {
    return {
      ok: false,
      error: "Assign a destination to this package before publishing it.",
    };
  }

  if (error || !data) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
```

(Leave the rest of `publishPackage`, and `softDeletePackage`/`featurePackage`/`reorderPackages` below it, unchanged.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: `actions/packages.ts` itself now type-checks clean against the Task 2 types (callers in `package-form.tsx`/the admin pages still error until Tasks 4-6 land — expected).

- [ ] **Step 6: Commit**

```bash
git add actions/packages.ts
git commit -m "feat(admin): collapse package create/update into draft-create + single update path"
```

---

### Task 4: Rewrite `package-form-schema.ts`

**Files:**
- Modify: `components/admin/package-form-schema.ts`

**Interfaces:**
- Produces: `PackageFormValues` — `name, pricePerPax, discountAmount?, durationLabel, destinationId, remarks?, travelDates: {date, additionalFee?}[] (min 1), itinerary, inclusions, exclusions, bringItems`. No more `slug`, `fromPrice`, `durationDays`, `bestTimeToGo`, `groupSize`.

- [ ] **Step 1: Replace the file**

```ts
import { z } from "zod";

/**
 * Itinerary day: day_number is NOT a form field — it's computed from the
 * row's array index at submit time (actions/packages.ts).
 */
const itineraryDaySchema = z.object({
  title: z.string().min(1, "Please enter a day title"),
  description: z.string().min(1, "Please enter a day description"),
});

/**
 * Shared shape for inclusions/exclusions/bring-items rows — kind and
 * sort_order are computed at submit time (actions/packages.ts), not
 * user-entered.
 */
const inclusionItemSchema = z.object({
  label: z.string().min(1, "Please enter a label"),
});

/**
 * `date` is a plain "YYYY-MM-DD" string from a native <input type="date">
 * — no date library needed. additionalFee is the optional per-date
 * surcharge (e.g. a peak-season upcharge).
 */
const travelDateSchema = z.object({
  date: z.string().min(1, "Please pick a date"),
  additionalFee: z
    .number({ error: "Fee must be a positive number" })
    .positive("Fee must be a positive number")
    .optional(),
});

export const packageFormSchema = z
  .object({
    name: z.string().min(1, "Please enter a package name"),
    pricePerPax: z
      .number({ error: "Price must be a positive number" })
      .int("Price must be a positive number")
      .positive("Price must be a positive number"),
    discountAmount: z
      .number({ error: "Discount must be a positive number" })
      .positive("Discount must be a positive number")
      .optional(),
    durationLabel: z.string().min(1, "Please enter the duration"),
    destinationId: z.string().min(1, "Please select a destination"),
    remarks: z.string().optional(),
    travelDates: z
      .array(travelDateSchema)
      .min(1, "Add at least one travel date"),
    itinerary: z.array(itineraryDaySchema),
    inclusions: z.array(inclusionItemSchema),
    exclusions: z.array(inclusionItemSchema),
    bringItems: z.array(inclusionItemSchema),
  })
  .refine(
    (values) =>
      values.discountAmount === undefined ||
      values.discountAmount < values.pricePerPax,
    {
      message: "Discount must be less than the price per pax",
      path: ["discountAmount"],
    }
  );

export type PackageFormValues = z.infer<typeof packageFormSchema>;
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: `package-form-schema.ts` itself compiles clean; `package-form.tsx` (unmodified until Task 5) now errors referencing removed fields — expected.

- [ ] **Step 3: Commit**

```bash
git add components/admin/package-form-schema.ts
git commit -m "feat(admin): rework package form schema for the fields rework"
```

---

### Task 5: Rewrite `package-form.tsx`

**Files:**
- Modify: `components/admin/package-form.tsx`

**Interfaces:**
- Consumes: `PackageFormValues` and `packageFormSchema` from Task 4; `createDraftPackage`/`updatePackage` no longer both imported — only `updatePackage` (Task 3).
- Produces: `PackageForm` now requires `packageId: string` (no longer optional) — its only caller after Task 7 is `app/admin/(dashboard)/packages/[id]/page.tsx`, which already always has a real id.

- [ ] **Step 1: Replace the entire file**

```tsx
"use client";

import { useState } from "react";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updatePackage } from "@/actions/packages";
import {
  packageFormSchema,
  type PackageFormValues,
} from "./package-form-schema";
import { PhotoManager, type PhotoManagerPhoto } from "./photo-manager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { FormActionBar } from "@/components/admin/form-action-bar";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export type PackageDestinationOption = { id: string; name: string };

const EMPTY_DEFAULTS: PackageFormValues = {
  name: "",
  pricePerPax: 0,
  discountAmount: undefined,
  durationLabel: "",
  destinationId: "",
  remarks: "",
  travelDates: [],
  itinerary: [],
  inclusions: [],
  exclusions: [],
  bringItems: [],
};

/**
 * Maps each tab's string value to the PackageFormValues field names rendered
 * on it, used by onInvalid to find and switch to the first tab containing a
 * validation error. Declaration order is the search order. The "photos" tab
 * has no schema-backed fields and is intentionally excluded.
 */
const TAB_FIELD_MAP: Array<{
  tab: string;
  fields: Array<keyof PackageFormValues>;
}> = [
  {
    tab: "details",
    fields: [
      "name",
      "pricePerPax",
      "discountAmount",
      "durationLabel",
      "destinationId",
      "remarks",
    ],
  },
  { tab: "travel-dates", fields: ["travelDates"] },
  { tab: "itinerary", fields: ["itinerary"] },
  { tab: "inclusions", fields: ["inclusions", "exclusions", "bringItems"] },
];

/**
 * Tabbed edit form for a package's Details, Travel Dates, Itinerary,
 * Photos, and Inclusions content. Every package that reaches this form
 * already has a real id (see app/admin/(dashboard)/packages/new/page.tsx,
 * which creates a minimal draft and redirects here) — there is no separate
 * create mode, submit always calls updatePackage.
 */
export function PackageForm({
  packageId,
  defaultValues,
  initialPhotos = [],
  destinations = [],
}: {
  packageId: string;
  defaultValues?: Partial<PackageFormValues>;
  initialPhotos?: PhotoManagerPhoto[];
  destinations?: PackageDestinationOption[];
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
  });

  const travelDatesArray = useFieldArray({
    control: form.control,
    name: "travelDates",
  });
  const itineraryArray = useFieldArray({
    control: form.control,
    name: "itinerary",
  });
  const inclusionsArray = useFieldArray({
    control: form.control,
    name: "inclusions",
  });
  const exclusionsArray = useFieldArray({
    control: form.control,
    name: "exclusions",
  });
  const bringItemsArray = useFieldArray({
    control: form.control,
    name: "bringItems",
  });

  const [pendingRemoval, setPendingRemoval] = useState<{
    label: string;
    onConfirm: () => void;
  } | null>(null);

  function requestRemove(
    hasContent: boolean,
    label: string,
    onConfirm: () => void
  ) {
    if (hasContent) {
      setPendingRemoval({ label, onConfirm });
    } else {
      onConfirm();
    }
  }

  async function onSubmit(values: PackageFormValues) {
    setIsSubmitting(true);
    try {
      const result = await updatePackage(packageId, values);
      if (result.ok) {
        toast.success("Package saved.");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function onInvalid(errors: FieldErrors<PackageFormValues>) {
    const erroredTab = TAB_FIELD_MAP.find(({ fields }) =>
      fields.some((field) => field in errors)
    );
    if (erroredTab) {
      setActiveTab(erroredTab.tab);
    }
    toast.error("Please fix the highlighted fields before submitting.");
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-6"
        noValidate
      >
        <Card className="gap-4 p-5 sm:p-8">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as string)}
        >
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="travel-dates">Travel Dates</TabsTrigger>
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="inclusions">Inclusions</TabsTrigger>
          </TabsList>

          <TabsContent
            value="details"
            keepMounted
            className="flex flex-col gap-4 pt-4"
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
                      placeholder="Batad Rice Terraces Trek"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="destinationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination</FormLabel>
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

            <FormField
              control={form.control}
              name="pricePerPax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price per pax (PHP)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      prefix="₱"
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="discountAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Discount (PHP, optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="number"
                      min={1}
                      prefix="₱"
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ""
                            ? undefined
                            : event.target.valueAsNumber
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    A fixed amount off the price per pax.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="durationLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="3 days, 2 nights"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remarks (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent
            value="travel-dates"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            {travelDatesArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-[16px] leading-[1.2] font-semibold">
                    Date {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(
                          form.getValues(`travelDates.${index}.date`) ||
                            form.getValues(`travelDates.${index}.additionalFee`)
                        ),
                        `Date ${index + 1}`,
                        () => travelDatesArray.remove(index)
                      )
                    }
                  >
                    Remove date
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.date`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.additionalFee`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional fee (optional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="number"
                          min={1}
                          prefix="₱"
                          onChange={(event) =>
                            field.onChange(
                              event.target.value === ""
                                ? undefined
                                : event.target.valueAsNumber
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        e.g. a peak-season surcharge for this date.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                travelDatesArray.append({ date: "", additionalFee: undefined })
              }
            >
              Add travel date
            </Button>
          </TabsContent>

          <TabsContent
            value="itinerary"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            {itineraryArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-3 rounded-lg border border-input bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-[16px] leading-[1.2] font-semibold">
                    Day {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(
                          form.getValues(`itinerary.${index}.title`) ||
                            form.getValues(`itinerary.${index}.description`)
                        ),
                        `Day ${index + 1}`,
                        () => itineraryArray.remove(index)
                      )
                    }
                  >
                    Remove day
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name={`itinerary.${index}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} type="text" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`itinerary.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() =>
                itineraryArray.append({ title: "", description: "" })
              }
            >
              Add day
            </Button>
          </TabsContent>

          <TabsContent
            value="photos"
            keepMounted
            className="flex flex-col gap-4 pt-4"
          >
            <PhotoManager packageId={packageId} initialPhotos={initialPhotos} />
          </TabsContent>

          <TabsContent
            value="inclusions"
            keepMounted
            className="flex flex-col gap-6 pt-4"
          >
            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                Included
              </h3>
              {inclusionsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <span className="pt-2 self-start text-sm text-muted-foreground">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`inclusions.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(form.getValues(`inclusions.${index}.label`)),
                        `Included item ${index + 1}`,
                        () => inclusionsArray.remove(index)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => inclusionsArray.append({ label: "" })}
              >
                Add included item
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                Excluded
              </h3>
              {exclusionsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <span className="pt-2 self-start text-sm text-muted-foreground">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`exclusions.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(form.getValues(`exclusions.${index}.label`)),
                        `Excluded item ${index + 1}`,
                        () => exclusionsArray.remove(index)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => exclusionsArray.append({ label: "" })}
              >
                Add excluded item
              </Button>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="font-heading text-[16px] leading-[1.2] font-semibold">
                What to Bring
              </h3>
              {bringItemsArray.fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <span className="pt-2 self-start text-sm text-muted-foreground">
                    {index + 1}.
                  </span>
                  <FormField
                    control={form.control}
                    name={`bringItems.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} type="text" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      requestRemove(
                        Boolean(form.getValues(`bringItems.${index}.label`)),
                        `Item to bring ${index + 1}`,
                        () => bringItemsArray.remove(index)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => bringItemsArray.append({ label: "" })}
              >
                Add item to bring
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        </Card>

        <AlertDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => !open && setPendingRemoval(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {pendingRemoval?.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete its content. This can&apos;t be undone once
                you save the package.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  pendingRemoval?.onConfirm();
                  setPendingRemoval(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FormActionBar>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </FormActionBar>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: `package-form.tsx` compiles clean now. Errors remain in `app/admin/(dashboard)/packages/[id]/page.tsx` and `.../new/page.tsx` until Tasks 6-7 — expected.

- [ ] **Step 3: Commit**

```bash
git add components/admin/package-form.tsx
git commit -m "feat(admin): rework package form with Travel Dates tab and always-on Photos tab"
```

---

### Task 6: Draft-create-and-redirect for "New Package"

**Files:**
- Modify: `app/admin/(dashboard)/packages/new/page.tsx`

**Interfaces:**
- Consumes: `createDraftPackage()` from Task 3.

- [ ] **Step 1: Replace the file**

```tsx
import { redirect } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createDraftPackage } from "@/actions/packages";

/**
 * Creates a minimal draft package immediately and redirects straight to its
 * edit page — there is no standalone create form anymore. Every package
 * gets a real id (and a usable Photos tab) from the moment "Add Package" is
 * clicked, so the rest of the flow lives entirely in
 * app/admin/(dashboard)/packages/[id]/page.tsx.
 */
export default async function NewPackagePage() {
  await requirePermissionOrRedirect("can_manage_packages");

  const result = await createDraftPackage();
  if (!result.ok || !result.id) {
    throw new Error(result.ok ? "Missing package id" : result.error);
  }

  redirect(`/admin/packages/${result.id}`);
}
```

- [ ] **Step 2: Verify**

Run: `npm run dev`, sign in as an admin, go to `/admin/packages`, click "Add Package".
Expected: immediate redirect to `/admin/packages/<new-id>` with the edit form showing "Untitled Package", an empty required-field state, and a working Photos tab.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(dashboard)/packages/new/page.tsx"
git commit -m "feat(admin): make New Package a draft-create-and-redirect flow"
```

---

### Task 7: Update the admin edit page

**Files:**
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx`

**Interfaces:**
- Consumes: updated `Database["public"]["Tables"]["packages"]["Row"]` / `package_travel_dates` types from Task 2; `PackageForm` from Task 5 (now always `packageId: string`).

- [ ] **Step 1: Update the query and type**

Find the top of the file (current lines 14-27):

```tsx
type FaqFactsRow = Database["public"]["Tables"]["faq_facts"]["Row"];

type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Database["public"]["Tables"]["package_photos"]["Row"][];
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  // faq_facts is a to-one relation (isOneToOne: true in types/database.ts),
  // but defensively handle either shape in case the query builder ever
  // returns it as a single-element array.
  faq_facts: FaqFactsRow | FaqFactsRow[] | null;
  destinations: Pick<
    Database["public"]["Tables"]["destinations"]["Row"],
    "id" | "name"
  > | null;
};
```

Replace with:

```tsx
type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Database["public"]["Tables"]["package_photos"]["Row"][];
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  package_travel_dates: Database["public"]["Tables"]["package_travel_dates"]["Row"][];
  destinations: Pick<
    Database["public"]["Tables"]["destinations"]["Row"],
    "id" | "name"
  > | null;
};
```

- [ ] **Step 2: Update the Supabase query**

Find the `select` call (current lines 50-57):

```tsx
        .select(
          `*,
          package_photos(id, storage_path, display_order, alt_text),
          itinerary_days(id, day_number, title, description),
          package_inclusions(id, kind, label, sort_order),
          faq_facts(best_time_to_go, group_size),
          destinations(id, name)`
        )
```

Replace with:

```tsx
        .select(
          `*,
          package_photos(id, storage_path, display_order, alt_text),
          itinerary_days(id, day_number, title, description),
          package_inclusions(id, kind, label, sort_order),
          package_travel_dates(id, travel_date, additional_fee),
          destinations(id, name)`
        )
```

- [ ] **Step 3: Update the data mapping and `defaultValues`**

Find the block from the `faqFacts` extraction through `defaultValues` (current lines 72-126):

```tsx
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
```

Replace with:

```tsx
  const pkg = data as PackageDetail;

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

  const travelDates = [...pkg.package_travel_dates]
    .sort((a, b) => a.travel_date.localeCompare(b.travel_date))
    .map((date) => ({
      date: date.travel_date,
      additionalFee: date.additional_fee ?? undefined,
    }));

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
    pricePerPax: pkg.price_per_pax,
    discountAmount: pkg.discount_amount ?? undefined,
    durationLabel: pkg.duration_label ?? "",
    destinationId: pkg.destination_id ?? "",
    remarks: pkg.remarks ?? "",
    travelDates,
    itinerary,
    inclusions,
    exclusions,
    bringItems,
  };
```

- [ ] **Step 4: Show the package code in the header**

Find the header block (current lines 130-137):

```tsx
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Edit Package
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          {pkg.name}
        </p>
      </div>
```

Replace with:

```tsx
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Edit Package
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          {pkg.name} · {pkg.slug}
        </p>
      </div>
```

- [ ] **Step 5: Verify**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: no errors in this file.

Run: `npm run dev`, open an existing package's edit page.
Expected: header shows "{name} · TSP-00000N", all tabs populate correctly (Travel Dates tab shows any seeded dates once Task 9 runs), Photos tab still works.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(dashboard)/packages/[id]/page.tsx"
git commit -m "feat(admin): update package edit page for travel dates and dropped faq_facts"
```

---

### Task 8: Update public package card and detail page

**Files:**
- Modify: `components/packages/package-card.tsx`
- Modify: `app/(public)/packages/[slug]/page.tsx`
- Delete: `components/packages/trip-facts.tsx`

**Interfaces:**
- Consumes: updated `packages`/`package_travel_dates` types from Task 2.
- Produces: `PackageCard` renders "₱X / pax" (with strike-through original when discounted); the detail page renders Remarks (conditional) and Travel Dates (conditional) as plain `SECTION_CARD` blocks instead of the removed `TripFacts` accordion.

- [ ] **Step 1: Update `package-card.tsx`**

Find the duration/price block (current lines 80-97):

```tsx
      <div className="pointer-events-none relative col-start-1 row-start-1 flex flex-col justify-end gap-1 p-4">
        <p className="truncate text-xs font-medium tracking-wide text-white/80 text-shadow-sm uppercase">
          {pkg.duration_label ?? `${pkg.duration_days} days`}
        </p>

        <h3 className="line-clamp-2 font-heading text-[20px] leading-[1.2] font-semibold text-white text-shadow-sm">
          {pkg.name}
        </h3>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Badge>From ₱{pkg.from_price.toLocaleString("en-PH")}</Badge>

          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <WhatsAppCta packageName={pkg.name} variant="icon-only" />
            <FacebookCta packageName={pkg.name} variant="icon-only" />
          </div>
        </div>
      </div>
```

Replace with:

```tsx
      <div className="pointer-events-none relative col-start-1 row-start-1 flex flex-col justify-end gap-1 p-4">
        <p className="truncate text-xs font-medium tracking-wide text-white/80 text-shadow-sm uppercase">
          {pkg.duration_label ?? "Duration TBA"}
        </p>

        <h3 className="line-clamp-2 font-heading text-[20px] leading-[1.2] font-semibold text-white text-shadow-sm">
          {pkg.name}
        </h3>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            {pkg.discount_amount ? (
              <span className="text-xs text-white/70 text-shadow-sm line-through">
                ₱{pkg.price_per_pax.toLocaleString("en-PH")}
              </span>
            ) : null}
            <Badge>
              ₱
              {(
                pkg.price_per_pax - (pkg.discount_amount ?? 0)
              ).toLocaleString("en-PH")}{" "}
              / pax
            </Badge>
          </div>

          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <WhatsAppCta packageName={pkg.name} variant="icon-only" />
            <FacebookCta packageName={pkg.name} variant="icon-only" />
          </div>
        </div>
      </div>
```

Also update the file's top doc comment (current lines 12-13) to match:

```tsx
/**
 * Immersive overlay card: full-bleed photo with name, duration, "₱X / pax"
 * badge, and icon-only WhatsApp/Facebook CTAs sitting on a bottom gradient
```

- [ ] **Step 2: Delete `trip-facts.tsx`**

```bash
git rm components/packages/trip-facts.tsx
```

- [ ] **Step 3: Update the detail page's imports and type**

Find the imports and type block (current lines 1-69):

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Info,
  ListChecks,
  ListX,
  Mail,
  Route,
  Send,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checklist } from "@/components/packages/checklist";
import { ItineraryAccordion } from "@/components/packages/itinerary-accordion";
import { TripFacts } from "@/components/packages/trip-facts";
import { PackageGallery } from "@/components/packages/package-gallery";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import { StickyCtaBar } from "@/components/packages/sticky-cta-bar";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import type { Database } from "@/types/database";

const SECTION_CARD =
  "flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-6 shadow-sm";

function SectionHeading({
  icon: Icon,
  tone = "secondary",
  children,
}: {
  icon: LucideIcon;
  tone?: "secondary" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone === "destructive"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary/10 text-secondary"
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
        {children}
      </h2>
    </div>
  );
}

type FaqFactsRow = Database["public"]["Tables"]["faq_facts"]["Row"];

type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Database["public"]["Tables"]["package_photos"]["Row"][];
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  // faq_facts is a to-one relation (isOneToOne: true in types/database.ts),
  // but defensively handle either shape in case the query builder ever
  // returns it as a single-element array.
  faq_facts: FaqFactsRow | FaqFactsRow[] | null;
};
```

Replace with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Backpack,
  CalendarDays,
  Clock,
  Info,
  ListChecks,
  ListX,
  Mail,
  Route,
  Send,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checklist } from "@/components/packages/checklist";
import { ItineraryAccordion } from "@/components/packages/itinerary-accordion";
import { PackageGallery } from "@/components/packages/package-gallery";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import { StickyCtaBar } from "@/components/packages/sticky-cta-bar";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import type { Database } from "@/types/database";

const SECTION_CARD =
  "flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-6 shadow-sm";

function SectionHeading({
  icon: Icon,
  tone = "secondary",
  children,
}: {
  icon: LucideIcon;
  tone?: "secondary" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone === "destructive"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary/10 text-secondary"
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
        {children}
      </h2>
    </div>
  );
}

type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Database["public"]["Tables"]["package_photos"]["Row"][];
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  package_travel_dates: Database["public"]["Tables"]["package_travel_dates"]["Row"][];
};
```

- [ ] **Step 4: Update the query and derived data**

Find the query and derived-data block (current lines 85-122):

```tsx
  const { data, error } = await supabase
    .from("packages")
    .select(
      `*,
      package_photos(storage_path, display_order, alt_text),
      itinerary_days(day_number, title, description),
      package_inclusions(kind, label, sort_order),
      faq_facts(best_time_to_go, group_size)`
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !data) notFound();

  const pkg = data as PackageDetail;
  const faqFacts = Array.isArray(pkg.faq_facts)
    ? pkg.faq_facts[0]
    : pkg.faq_facts;

  const photos = [...pkg.package_photos]
    .sort((a, b) => a.display_order - b.display_order)
    .map((photo) => ({
      url: supabase.storage
        .from("package-photos")
        .getPublicUrl(photo.storage_path).data.publicUrl,
      alt: photo.alt_text ?? pkg.name,
    }));

  const inclusions = pkg.package_inclusions
    .filter((item) => item.kind === "included")
    .sort((a, b) => a.sort_order - b.sort_order);
  const exclusions = pkg.package_inclusions
    .filter((item) => item.kind === "excluded")
    .sort((a, b) => a.sort_order - b.sort_order);
  const bringItems = pkg.package_inclusions
    .filter((item) => item.kind === "bring")
    .sort((a, b) => a.sort_order - b.sort_order);
```

Replace with:

```tsx
  const { data, error } = await supabase
    .from("packages")
    .select(
      `*,
      package_photos(storage_path, display_order, alt_text),
      itinerary_days(day_number, title, description),
      package_inclusions(kind, label, sort_order),
      package_travel_dates(travel_date, additional_fee)`
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !data) notFound();

  const pkg = data as PackageDetail;

  const photos = [...pkg.package_photos]
    .sort((a, b) => a.display_order - b.display_order)
    .map((photo) => ({
      url: supabase.storage
        .from("package-photos")
        .getPublicUrl(photo.storage_path).data.publicUrl,
      alt: photo.alt_text ?? pkg.name,
    }));

  const inclusions = pkg.package_inclusions
    .filter((item) => item.kind === "included")
    .sort((a, b) => a.sort_order - b.sort_order);
  const exclusions = pkg.package_inclusions
    .filter((item) => item.kind === "excluded")
    .sort((a, b) => a.sort_order - b.sort_order);
  const bringItems = pkg.package_inclusions
    .filter((item) => item.kind === "bring")
    .sort((a, b) => a.sort_order - b.sort_order);
  const travelDates = [...pkg.package_travel_dates].sort((a, b) =>
    a.travel_date.localeCompare(b.travel_date)
  );
```

- [ ] **Step 5: Update the duration/price header**

Find the header block (current lines 134-149):

```tsx
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-[30px] leading-[1.15] font-semibold sm:text-[36px]">
          {pkg.name}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-foreground/10 bg-card py-1 pr-3.5 pl-1 text-[13px] font-medium text-foreground shadow-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
              <Clock className="size-3.5" aria-hidden="true" />
            </span>
            {pkg.duration_label ?? `${pkg.duration_days} days`}
          </span>
          <Badge className="h-9 rounded-full px-4 text-[15px] font-bold tabular-nums shadow-sm">
            From &#8369;{pkg.from_price.toLocaleString("en-PH")}
          </Badge>
        </div>
      </div>
```

Replace with:

```tsx
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-[30px] leading-[1.15] font-semibold sm:text-[36px]">
          {pkg.name}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-foreground/10 bg-card py-1 pr-3.5 pl-1 text-[13px] font-medium text-foreground shadow-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
              <Clock className="size-3.5" aria-hidden="true" />
            </span>
            {pkg.duration_label ?? "Duration TBA"}
          </span>
          <div className="flex items-center gap-2">
            {pkg.discount_amount ? (
              <span className="text-sm text-muted-foreground line-through">
                &#8369;{pkg.price_per_pax.toLocaleString("en-PH")}
              </span>
            ) : null}
            <Badge className="h-9 rounded-full px-4 text-[15px] font-bold tabular-nums shadow-sm">
              &#8369;
              {(
                pkg.price_per_pax - (pkg.discount_amount ?? 0)
              ).toLocaleString("en-PH")}{" "}
              / pax
            </Badge>
          </div>
        </div>
      </div>
```

- [ ] **Step 6: Replace the "Trip Facts" section with Remarks / Travel Dates / What to Bring**

Find the Trip Facts section (current lines 191-198):

```tsx
      <section className={SECTION_CARD}>
        <SectionHeading icon={Info}>Trip Facts</SectionHeading>
        <TripFacts
          bestTimeToGo={faqFacts?.best_time_to_go ?? ""}
          groupSize={faqFacts?.group_size ?? ""}
          bringItems={bringItems}
        />
      </section>
```

Replace with:

```tsx
      <section className={SECTION_CARD}>
        <SectionHeading icon={Backpack}>What to Bring</SectionHeading>
        <Checklist items={bringItems} kind="bring" />
      </section>

      {travelDates.length > 0 ? (
        <section className={SECTION_CARD}>
          <SectionHeading icon={CalendarDays}>Travel Dates</SectionHeading>
          <ul className="flex flex-col gap-2">
            {travelDates.map((date) => (
              <li
                key={date.travel_date}
                className="flex items-center justify-between gap-2 text-[14px] leading-[1.4] text-foreground"
              >
                <span>
                  {new Date(date.travel_date).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                {date.additional_fee ? (
                  <Badge variant="outline">
                    +&#8369;{date.additional_fee.toLocaleString("en-PH")}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pkg.remarks ? (
        <section className={SECTION_CARD}>
          <SectionHeading icon={Info}>Remarks</SectionHeading>
          <p className="whitespace-pre-line text-base leading-[1.5] text-muted-foreground">
            {pkg.remarks}
          </p>
        </section>
      ) : null}
```

- [ ] **Step 7: Verify**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev`, open `/packages` and a package detail page.
Expected: card shows "₱X / pax" (struck-through original when a discount is set on that package), detail page shows What to Bring / Travel Dates (only if any exist) / Remarks (only if set), no "Trip Facts", no crash on packages with no travel dates or remarks yet.

- [ ] **Step 8: Commit**

```bash
git add components/packages/package-card.tsx "app/(public)/packages/[slug]/page.tsx" components/packages/trip-facts.tsx
git commit -m "feat(public): show price per pax, discount, travel dates, and remarks on package pages"
```

---

### Task 9: Update `scripts/seed.ts`

**Files:**
- Modify: `scripts/seed.ts`

**Interfaces:**
- Produces: `SEED_DESTINATIONS` covering common PH + the requested international list; `SEED_PACKAGES` matching the new `SeedPackage` shape (no `durationDays`/`fromPrice`/`faq`, adds `pricePerPax`, optional `discountAmount`/`remarks`, required `travelDates`); `seedPackage()` upserts by `name` instead of `slug`, since `slug` is now DB-generated and can't be used as a stable idempotency key.

- [ ] **Step 1: Expand `SEED_DESTINATIONS`**

Find the array (current lines 84-93):

```ts
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

Replace with:

```ts
const SEED_DESTINATIONS: SeedDestination[] = [
  { slug: 'palawan', name: 'Palawan', region: 'local', sortOrder: 0 },
  { slug: 'siargao', name: 'Siargao', region: 'local', sortOrder: 1 },
  { slug: 'banaue', name: 'Banaue', region: 'local', sortOrder: 2 },
  { slug: 'boracay', name: 'Boracay', region: 'local', sortOrder: 3 },
  { slug: 'cebu', name: 'Cebu', region: 'local', sortOrder: 4 },
  { slug: 'bohol', name: 'Bohol', region: 'local', sortOrder: 5 },
  { slug: 'baguio', name: 'Baguio', region: 'local', sortOrder: 6 },
  { slug: 'tagaytay', name: 'Tagaytay', region: 'local', sortOrder: 7 },
  { slug: 'japan', name: 'Japan', region: 'international', sortOrder: 0 },
  { slug: 'china', name: 'China', region: 'international', sortOrder: 1 },
  { slug: 'south-korea', name: 'South Korea', region: 'international', sortOrder: 2 },
  { slug: 'malaysia', name: 'Malaysia', region: 'international', sortOrder: 3 },
  { slug: 'thailand', name: 'Thailand', region: 'international', sortOrder: 4 },
  { slug: 'singapore', name: 'Singapore', region: 'international', sortOrder: 5 },
  { slug: 'taiwan', name: 'Taiwan', region: 'international', sortOrder: 6 },
  { slug: 'hong-kong', name: 'Hong Kong', region: 'international', sortOrder: 7 },
]
```

- [ ] **Step 2: Update `SeedPackage` and `SeedTravelDate` types**

Find the type block (current lines 57-75):

```ts
type SeedInclusion = { kind: 'included' | 'excluded' | 'bring'; label: string; sortOrder: number }
type SeedItineraryDay = { dayNumber: number; title: string; description: string }
type SeedPhoto = { file: string; altText: string; displayOrder: number }

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

Replace with:

```ts
type SeedInclusion = { kind: 'included' | 'excluded' | 'bring'; label: string; sortOrder: number }
type SeedItineraryDay = { dayNumber: number; title: string; description: string }
type SeedPhoto = { file: string; altText: string; displayOrder: number }
type SeedTravelDate = { date: string; additionalFee?: number }

type SeedPackage = {
  name: string
  pricePerPax: number
  discountAmount?: number
  durationLabel: string
  remarks?: string
  isPublished: true
  isFeatured: boolean
  sortOrder: number
  destinationSlug: string
  photos: SeedPhoto[]
  itinerary: SeedItineraryDay[]
  inclusions: SeedInclusion[]
  travelDates: SeedTravelDate[]
}
```

- [ ] **Step 3: Update `SEED_PACKAGES` field names and add travel dates**

Find each of the 3 package entries' top-level fields (e.g. current lines 96-105 for the first one):

```ts
  {
    slug: 'palawan-island-hopping',
    name: 'Palawan Island Hopping',
    fromPrice: 8500,
    durationDays: 3,
    durationLabel: '3 days, 2 nights',
    isPublished: true,
    isFeatured: true,
    sortOrder: 0,
    destinationSlug: 'palawan',
```

Replace with:

```ts
  {
    name: 'Palawan Island Hopping',
    pricePerPax: 8500,
    durationLabel: '3 days, 2 nights',
    remarks: 'Boat schedules are weather-dependent and may shift by a day.',
    isPublished: true,
    isFeatured: true,
    sortOrder: 0,
    destinationSlug: 'palawan',
```

Apply the same field rename (`slug`/`fromPrice`/`durationDays` removed, `pricePerPax` added, optional `remarks` added) to the `siargao-surf-island` (current lines 143-152) and `banaue-rice-terraces` (current lines 195-204) entries — use `pricePerPax: 7200` / `remarks: 'Surf lessons require a minimum of 2 participants.'` for Siargao, and `pricePerPax: 6300` / no `remarks` for Banaue.

Find each package's `faq: { ... }` line (e.g. current line 141 for Palawan) and delete it, replacing it with a `travelDates` array. For Palawan (was `faq: { bestTimeToGo: 'November to May (dry season)', groupSize: '2-15 travelers per group' },`):

```ts
    travelDates: [
      { date: '2026-09-12' },
      { date: '2026-10-17', additionalFee: 1500 },
      { date: '2026-11-21' },
    ],
```

For Siargao (was `faq: { bestTimeToGo: 'March to October (surf season)', groupSize: '2-10 travelers per group' },`):

```ts
    travelDates: [
      { date: '2026-09-05' },
      { date: '2026-10-03' },
    ],
```

For Banaue (was `faq: { bestTimeToGo: 'November to May (dry season, clearer trails)', groupSize: '2-12 travelers per group' },`):

```ts
    travelDates: [
      { date: '2026-11-14' },
    ],
```

- [ ] **Step 4: Rewrite `seedPackage()` to key off `name` instead of `slug`**

Find the whole function (current lines 274-381) and replace it with:

```ts
async function seedPackage(pkg: SeedPackage, destinationIdBySlug: Map<string, string>) {
  console.log(`Seeding "${pkg.name}"...`)

  // slug is DB-generated (TSP-000001-style, assigned once at insert time),
  // so it can't be used as an upsert key anymore -- look up any existing
  // row by name instead, and only insert when none exists.
  const { data: existing, error: findError } = await supabase
    .from('packages')
    .select('id')
    .eq('name', pkg.name)
    .maybeSingle()

  if (findError) {
    throw new Error(`Failed to look up existing package "${pkg.name}": ${findError.message}`)
  }

  const payload = {
    name: pkg.name,
    price_per_pax: pkg.pricePerPax,
    discount_amount: pkg.discountAmount ?? null,
    duration_label: pkg.durationLabel,
    remarks: pkg.remarks ?? null,
    is_published: pkg.isPublished,
    is_featured: pkg.isFeatured,
    sort_order: pkg.sortOrder,
    destination_id: destinationIdBySlug.get(pkg.destinationSlug) ?? null,
  }

  const { data: pkgRow, error: pkgError } = existing
    ? await supabase.from('packages').update(payload).eq('id', existing.id).select().single()
    : await supabase.from('packages').insert(payload).select().single()

  if (pkgError || !pkgRow) {
    throw new Error(`Failed to upsert package "${pkg.name}": ${pkgError?.message}`)
  }

  const packageId = pkgRow.id

  // Delete existing child rows for this package so re-runs never duplicate data.
  const [delPhotos, delItinerary, delInclusions, delTravelDates] = await Promise.all([
    supabase.from('package_photos').delete().eq('package_id', packageId),
    supabase.from('itinerary_days').delete().eq('package_id', packageId),
    supabase.from('package_inclusions').delete().eq('package_id', packageId),
    supabase.from('package_travel_dates').delete().eq('package_id', packageId),
  ])
  for (const [label, res] of [
    ['package_photos', delPhotos],
    ['itinerary_days', delItinerary],
    ['package_inclusions', delInclusions],
    ['package_travel_dates', delTravelDates],
  ] as const) {
    if (res.error) throw new Error(`Failed to clear existing ${label} for "${pkg.name}": ${res.error.message}`)
  }

  // Upload photos to Storage, then insert package_photos rows.
  for (const photo of pkg.photos) {
    const fileBuffer = readFileSync(join(SEED_ASSETS_DIR, photo.file))
    const storagePath = `${packageId}/photo-${photo.displayOrder + 1}.jpg`

    const { error: uploadError } = await supabase.storage.from('package-photos').upload(storagePath, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

    if (uploadError) {
      throw new Error(`Failed to upload photo ${photo.file} for "${pkg.name}": ${uploadError.message}`)
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

  // Itinerary days.
  const { error: itineraryError } = await supabase.from('itinerary_days').insert(
    pkg.itinerary.map((day) => ({
      package_id: packageId,
      day_number: day.dayNumber,
      title: day.title,
      description: day.description,
    }))
  )
  if (itineraryError) {
    throw new Error(`Failed to insert itinerary_days for "${pkg.name}": ${itineraryError.message}`)
  }

  // Inclusions / exclusions / bring items.
  const { error: inclusionsError } = await supabase.from('package_inclusions').insert(
    pkg.inclusions.map((item) => ({
      package_id: packageId,
      kind: item.kind,
      label: item.label,
      sort_order: item.sortOrder,
    }))
  )
  if (inclusionsError) {
    throw new Error(`Failed to insert package_inclusions for "${pkg.name}": ${inclusionsError.message}`)
  }

  // Travel dates (at least one per package).
  const { error: travelDatesError } = await supabase.from('package_travel_dates').insert(
    pkg.travelDates.map((date) => ({
      package_id: packageId,
      travel_date: date.date,
      additional_fee: date.additionalFee ?? null,
    }))
  )
  if (travelDatesError) {
    throw new Error(`Failed to insert package_travel_dates for "${pkg.name}": ${travelDatesError.message}`)
  }

  console.log(`  -> done (package_id=${packageId}, slug=${pkgRow.slug})`)
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: `scripts/seed.ts` compiles clean.

Run: `npm run seed`
Expected: "Seed complete." with no errors, 16 destinations and 3 packages logged (each package's log line now shows its DB-assigned `TSP-000001`-style slug instead of the old human-readable one). Re-run it a second time immediately after — expected: same output, no duplicate packages or destinations created (confirms the name-based upsert works).

- [ ] **Step 6: Commit**

```bash
git add scripts/seed.ts
git commit -m "chore(seed): update seed script for package fields rework and expanded destinations"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type check and lint**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

Run: `npm run lint`
Expected: zero errors/warnings.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual walkthrough**

Run: `npm run dev`. As an admin (`can_manage_packages`):
1. `/admin/packages` → "Add Package" → confirm immediate redirect to the new draft's edit page.
2. On the Photos tab, upload a photo immediately (before touching any other tab) — confirm it uploads successfully.
3. Fill in Details (name, destination, price per pax, a discount, duration, remarks), add at least one Travel Date (one with an additional fee, one without), add an itinerary day, add an inclusion — Save. Confirm the toast says "Package saved." with no validation errors.
4. Try removing all Travel Dates and Save — confirm the form blocks submission with "Add at least one travel date" and switches to the Travel Dates tab.
5. Clear the Destination selection and Save — confirm it's blocked with a destination-required error and switches to the Details tab.
6. From `/admin/packages`, toggle this new package's Published switch on — confirm it succeeds now that a destination is set (or shows "Assign a destination to this package before publishing it." if you skipped step 3's destination).
7. Visit the package's public detail page (`/packages/TSP-0000XX`) — confirm price per pax, any discount strike-through, duration, Travel Dates, Remarks, and What to Bring all render correctly, and there's no "Trip Facts"/"Best Time to Go"/"Group Size" anywhere.
8. Visit `/packages` and confirm the card shows "₱X / pax" correctly for both discounted and non-discounted packages.

- [ ] **Step 4: No commit** — this task is verification-only; if any check fails, fix it within the task that owns the affected file and re-run this task.
