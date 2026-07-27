# Phase 2: Admin Access & Package Management - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 24
**Analogs found:** 20 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `proxy.ts` | middleware | request-response | none (new file convention) | no-analog (see RESEARCH.md Pattern 1, bundled Next.js docs) |
| `lib/supabase/proxy.ts` | utility | request-response | `lib/supabase/server.ts` | role-match (same `@supabase/ssr` client-factory shape) |
| `lib/supabase/server.ts` (modify: real cookie writes) | utility | request-response | `lib/supabase/server.ts` (itself, extend) | exact |
| `lib/supabase/client.ts` (reuse, unmodified) | utility | request-response | `lib/supabase/client.ts` (itself) | exact |
| `lib/auth/dal.ts` | utility (DAL/service) | request-response | none in codebase; use RESEARCH.md Pattern 2 verbatim | no-analog (bundled Next.js docs authentication.md) |
| `actions/auth.ts` | service (Server Action) | request-response | `lib/formspree.ts` (async fetch/result-shape) + `scripts/seed.ts` (service-role Supabase usage) | role-match |
| `actions/packages.ts` | service (Server Action, CRUD) | CRUD | `scripts/seed.ts` (Supabase table upsert/insert/delete patterns) | role-match |
| `actions/package-photos.ts` | service (Server Action, file-I/O) | file-I/O | `scripts/seed.ts` lines 265-289 (Storage upload + `package_photos` insert) | strong role+flow match |
| `actions/users.ts` | service (Server Action, CRUD) | CRUD | `scripts/seed.ts` (Supabase mutation shape) + RESEARCH.md `auth.admin.createUser` example | role-match |
| `supabase/migrations/<ts>_admin_access_package_management.sql` | migration | CRUD/schema | `supabase/migrations/20260718114727_create_package_schema.sql` | exact |
| `app/(admin)/layout.tsx` | component (layout) | request-response | `app/(public)/layout.tsx` | role-match |
| `app/(admin)/login/page.tsx` | component (page + form) | request-response | `app/(public)/contact/page.tsx` (form-hosting page) + `components/inquiry/inquiry-form.tsx` (form pattern) | role-match |
| `app/(admin)/forgot-password/page.tsx` | component (page + form) | request-response | `components/inquiry/inquiry-form.tsx` | role-match |
| `app/(admin)/reset-password/page.tsx` | component (page + form) | request-response | `components/inquiry/inquiry-form.tsx` | role-match |
| `app/(admin)/packages/page.tsx` | component (Server Component, list) | CRUD (read) | `app/(public)/packages/page.tsx` | exact |
| `app/(admin)/packages/new/page.tsx` | component (page, form host) | CRUD (create) | `app/(public)/packages/[slug]/page.tsx` (data shape) + `components/inquiry/inquiry-form.tsx` (form pattern) | role-match |
| `app/(admin)/packages/[id]/page.tsx` | component (Server Component, edit) | CRUD (read+update) | `app/(public)/packages/[slug]/page.tsx` | exact (query/join shape) |
| `app/(admin)/users/page.tsx` | component (Server Component, list) | CRUD (read) | `app/(public)/packages/page.tsx` | role-match |
| `components/admin/package-form.tsx` | component (form) | CRUD | `components/inquiry/inquiry-form.tsx` | exact |
| `components/admin/package-form-schema.ts` | utility (zod schema) | transform/validation | `components/inquiry/inquiry-schema.ts` | exact |
| `components/admin/account-form.tsx` | component (form) | CRUD | `components/inquiry/inquiry-form.tsx` | exact |
| `components/admin/package-list-row.tsx` | component | CRUD (inline toggle) | `components/packages/package-card.tsx` | role-match |
| `components/admin/photo-manager.tsx` | component (drag/upload) | file-I/O | none — new pattern; use RESEARCH.md Pattern 6 (`@dnd-kit`) as source | no-analog |
| `components/admin/sortable-package-list.tsx` | component (drag reorder) | event-driven | none — new pattern; use RESEARCH.md Pattern 6 | no-analog |

## Pattern Assignments

### `proxy.ts` + `lib/supabase/proxy.ts` (middleware, request-response)

**Analog:** `lib/supabase/server.ts` (existing client-factory shape); no proxy.ts exists yet in this codebase — the concrete implementation must be copied from RESEARCH.md Pattern 1, itself sourced from the bundled Next.js 16.2.10 docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). **Critical: this project is Next.js 16 — the file is `proxy.ts` exporting `proxy()`, NOT `middleware.ts`/`middleware()`.**

**Existing client-factory shape to extend** (`lib/supabase/server.ts:13-37`):
```typescript
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore since Phase 1
            // has no middleware refreshing sessions yet.
          }
        },
      },
    }
  );
}
```
Note the comment on lines 6-11 explicitly anticipates this phase — remove the "Phase 1 has no auth" caveat once `proxy.ts` exists to make cookie writes actually take effect.

**New `proxy.ts` pattern to copy verbatim** (source: RESEARCH.md Pattern 1 / bundled Next.js docs):
```typescript
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
```
`lib/supabase/proxy.ts`'s `updateSession()` must construct `response` **inside** the `setAll` callback (Pitfall 2) — see RESEARCH.md Pattern 1 full example.

---

### `lib/auth/dal.ts` (service/DAL, request-response)

**No direct codebase analog** — first server-only DAL in this project. Copy RESEARCH.md Pattern 2 verbatim (sourced from bundled Next.js `authentication.md`). Must import `server-only`, use `cache()`, and call `supabase.auth.getUser()` (never `getSession()`) per CLAUDE.md's locked convention already referenced in `lib/supabase/server.ts`'s comments.

**Supabase client construction to reuse** — same `createClient()` factory from `lib/supabase/server.ts` shown above (already async, already cookie-aware).

---

### `actions/auth.ts`, `actions/packages.ts`, `actions/package-photos.ts`, `actions/users.ts` (Server Actions, CRUD/file-I/O)

**Analog for async result-shape / error handling:** `lib/formspree.ts` (lines 23-51):
```typescript
export type FormspreeResult =
  | { ok: true }
  | { ok: false; errors: FormspreeFieldError[] };

export async function submitToFormspree(
  data: InquiryPayload
): Promise<FormspreeResult> {
  const res = await fetch(FORMSPREE_ENDPOINT, { ... });
  const body = await res.json();
  if (res.ok && "next" in body) {
    return { ok: true };
  }
  const errors: FormspreeFieldError[] = Array.isArray(body?.errors)
    ? body.errors
    : [{ field: undefined, message: body?.error ?? "Submission failed" }];
  return { ok: false, errors };
}
```
Apply this discriminated-union `{ ok: true } | { ok: false, ... }` result shape to every Server Action so client components (`package-form.tsx`, `account-form.tsx`) can branch on `result.ok` exactly like `inquiry-form.tsx` already does (`onSubmit` at lines 39-58).

**Analog for Supabase mutation calls (upsert/insert/delete, error-per-call checking):** `scripts/seed.ts` lines 225-327 — e.g. the upsert-with-error-check pattern:
```typescript
const { data: pkgRow, error: pkgError } = await supabase
  .from('packages')
  .upsert({ ...fields }, { onConflict: 'slug' })
  .select()
  .single();

if (pkgError || !pkgRow) {
  throw new Error(`Failed to upsert package ${pkg.slug}: ${pkgError?.message}`);
}
```
And the Storage-upload-then-insert-row pattern for `actions/package-photos.ts` (lines 265-289):
```typescript
const { error: uploadError } = await supabase.storage.from('package-photos').upload(storagePath, fileBuffer, {
  contentType: 'image/jpeg',
  upsert: true,
});
if (uploadError) { throw new Error(`Failed to upload photo ...: ${uploadError.message}`); }

const { error: photoRowError } = await supabase.from('package_photos').insert({
  package_id: packageId,
  storage_path: storagePath,
  display_order: photo.displayOrder,
  alt_text: photo.altText,
});
```
**Difference in this phase:** Server Actions use the RLS-scoped `createClient()` from `lib/supabase/server.ts` (anon key + user session, RLS-enforced), NOT the service-role client `scripts/seed.ts` uses — except `actions/users.ts`'s `createAccount`, which needs `auth.admin.createUser()` and therefore a **separate service-role client constructed inline in the action**, matching `scripts/seed.ts`'s service-role usage guard (never import service-role client into client-reachable code; keep it server-action-only, same safeguard comment as `scripts/seed.ts` lines 14-17).

**Required addition not present in any analog:** every Server Action must open with `await requirePermission('manage_packages')` (or the relevant permission) from `lib/auth/dal.ts` before doing any mutation (AUTH-05), and package-mutating actions must call `revalidatePath` for the relevant public route(s) after success (Anti-Patterns in RESEARCH.md — no existing code does this yet since Phase 1 has no admin mutations).

---

### `supabase/migrations/<ts>_admin_access_package_management.sql` (migration, CRUD/schema)

**Analog:** `supabase/migrations/20260718114727_create_package_schema.sql` — copy its exact structure: table `create table ... primary key default gen_random_uuid()`, `alter table ... enable row level security`, then one `create policy` per operation.

**Existing table+RLS pattern to replicate for `profiles`** (lines 10-25):
```sql
create table packages (
  id uuid primary key default gen_random_uuid(),
  ...
  created_at timestamptz not null default now()
);

alter table packages enable row level security;

create policy "public read" on packages
  for select using (true);
```

**New this phase — write policies must be added to all 5 existing tables** (`packages`, `package_photos`, `itinerary_days`, `package_inclusions`, `faq_facts`), none of which currently have INSERT/UPDATE/DELETE policies (confirmed: the existing migration file only has `for select using (true)` per table, no write policies exist). Use RESEARCH.md Pattern 3's `SECURITY DEFINER` plpgsql `has_permission()` helper — **must be `language plpgsql`, not `language sql`**, to avoid the profiles-table RLS recursion bug (Pitfall 1).

**Also update** `supabase/migrations/20260718140000_fix_public_read_rls_is_published.sql`'s pattern — read this migration during planning to see the exact existing public-read policy text that needs `and deleted_at is null` appended (Pitfall 4 / Open Question 1).

**Storage RLS reminder:** the existing `package-photos` bucket policy (`create policy "Public read access for package photos" on storage.objects for select using (bucket_id = 'package-photos');`) is read-only — this migration must add separate `storage.objects` INSERT/UPDATE/DELETE policies scoped by `manage_packages` permission (Pitfall/Assumption A3); table RLS does not cover Storage writes.

---

### `app/(admin)/layout.tsx` (component/layout, request-response)

**Analog:** `app/(public)/layout.tsx` — read this file directly before building the admin layout to match the existing font-variable/`<html>`/`<body>` wiring convention (both layouts share the root `app/layout.tsx` fonts already wired per UI-SPEC.md). Admin layout additionally calls `lib/auth/dal.ts`'s `getProfile()` to build the sidebar's conditional Packages/Users sections (D-13 hide-entirely).

---

### `app/(admin)/packages/page.tsx` (Server Component list, CRUD read)

**Analog:** `app/(public)/packages/page.tsx` (full file, lines 1-77) — near-exact match for the Supabase query shape:
```typescript
const supabase = await createClient();
const { data: packages, error } = await supabase
  .from("packages")
  .select("*, package_photos(storage_path, display_order)")
  .eq("is_published", true)
  .order("sort_order", { ascending: true });

if (error) {
  console.error("Failed to load packages:", error.message);
}
const rows = (packages ?? []) as PackageWithPhotos[];
```
**Differences for the admin version:** drop `.eq("is_published", true)` (admin sees all non-deleted packages, i.e. `.eq('deleted_at', null)` or equivalent), add `.is('deleted_at', null)`, wrap `rows` in `sortable-package-list.tsx` (drag reorder, PKG-06) instead of a static grid, and each row renders inline `switch` toggles (publish/feature) instead of `PackageCard`'s public presentation. Also reuses `supabase.storage.from("package-photos").getPublicUrl(...)` exactly as-is (lines 65-69) for thumbnail rendering.

---

### `app/(admin)/packages/[id]/page.tsx` (Server Component edit, CRUD read+update host)

**Analog:** `app/(public)/packages/[slug]/page.tsx` (full file) — copy the join-query shape verbatim for fetching a package with all children:
```typescript
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
```
**Differences:** query by `id` not `slug`+`is_published` (admin can open unpublished/soft-deleted-view packages), include `id` columns in each child select (needed for `useFieldArray` row identity and photo delete/reorder), and pass the fetched row into `<PackageForm defaultValues={...} />` (a client form) rather than rendering read-only presentation components.

---

### `components/admin/package-form.tsx`, `components/admin/account-form.tsx` (form components, CRUD)

**Analog:** `components/inquiry/inquiry-form.tsx` (full file) — copy this pattern exactly:
- `"use client"` + `useForm` + `zodResolver` + local `isSubmitting` state (lines 1-37)
- `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` wrapper usage (lines 60-144) — this hand-authored wrapper (`components/ui/form.tsx`) is reused unchanged, no changes needed there
- `onSubmit` calling the Server Action, branching on a `result.ok` discriminated union, `toast.success`/`toast.error` from `sonner`, `form.reset()` on success (lines 39-58)
- Generic error message constant pattern (`GENERIC_ERROR_MESSAGE`, line 22-23) — reuse this same string-constant-at-top-of-file convention, copy matches UI-SPEC.md's exact copy: `"Something went wrong saving your changes. Please try again."`

**New this phase, not in the analog:** `useFieldArray` for itinerary/inclusion repeatable rows (RESEARCH.md Pattern 5) and `tabs` wrapping (Details/Itinerary/Photos/Inclusions & FAQ per UI-SPEC.md) — no existing analog, copy RESEARCH.md Pattern 5 directly:
```tsx
const { fields, append, remove } = useFieldArray({ control: form.control, name: 'itinerary' })
{fields.map((field, index) => (
  <div key={field.id}>
    <FormField control={form.control} name={`itinerary.${index}.title`} render={...} />
    <Button type="button" onClick={() => remove(index)}>Remove day</Button>
  </div>
))}
```

---

### `components/admin/package-form-schema.ts` (utility, zod schema/transform)

**Analog:** `components/inquiry/inquiry-schema.ts` (full file):
```typescript
export const inquirySchema = z.object({
  name: z.string().min(1, "Please enter your name"),
  email: z.email("Enter a valid email address"),
  ...
});
export type InquiryFormValues = z.infer<typeof inquirySchema>;
```
Same `z.object` + per-field `.min()`/custom message + exported inferred type pattern applies to package/account schemas — field-level error copy must match UI-SPEC.md's Copywriting Contract exactly (e.g. "Please enter a package name", "Price must be a positive number").

---

### `components/admin/package-list-row.tsx` (component, inline CRUD toggle)

**Analog:** `components/packages/package-card.tsx` — read this file during planning for the existing `pkg`/`photoUrl` prop shape convention (constructed in `app/(public)/packages/page.tsx` lines 61-72) already used to pass a package + resolved public photo URL into a presentation component; the admin row component follows the same prop-passing shape but adds `Switch` components wired to `packages.ts` Server Actions (`publishPackage`, `featurePackage`) and a `dropdown-menu` for Edit/Delete actions.

---

### `components/admin/photo-manager.tsx`, `components/admin/sortable-package-list.tsx` (drag/reorder, new pattern)

**No codebase analog** (first drag-and-drop UI in this project). Copy RESEARCH.md Pattern 6 verbatim:
```tsx
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function handleDragEnd(event: DragEndEvent, items: Package[], setItems: (p: Package[]) => void) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = items.findIndex((i) => i.id === active.id)
  const newIndex = items.findIndex((i) => i.id === over.id)
  const reordered = arrayMove(items, oldIndex, newIndex)
  setItems(reordered)
  reorderPackagesAction(reordered.map((p, idx) => ({ id: p.id, sort_order: idx })))
}
```
Client-side optimistic reorder (local `useState`) + Server Action persistence, matching CLAUDE.md's "local `useState`/`useReducer` for isolated client interactivity only" guidance (no Redux). `photo-manager.tsx` reuses the same `DndContext`/`SortableContext` shape but persists `package_photos.display_order` via `actions/package-photos.ts`'s reorder action instead of `sort_order`.

---

## Shared Patterns

### Supabase Server Client (RLS-scoped)
**Source:** `lib/supabase/server.ts` (lines 13-37, shown above)
**Apply to:** Every Server Component and Server Action reading/writing `profiles`, `packages`, and related tables. Never use the service-role key here — only in `actions/users.ts`'s account-creation path and `scripts/seed.ts`-style scripts.

### Result-shape for Server Action responses
**Source:** `lib/formspree.ts` lines 23-25
```typescript
export type FormspreeResult =
  | { ok: true }
  | { ok: false; errors: FormspreeFieldError[] };
```
**Apply to:** All new Server Actions (`actions/auth.ts`, `actions/packages.ts`, `actions/package-photos.ts`, `actions/users.ts`) — client form components already expect this `{ ok, ... }` branching shape per `inquiry-form.tsx`'s `onSubmit`.

### react-hook-form + zod + shadcn Form wrapper
**Source:** `components/inquiry/inquiry-form.tsx` (full file) + `components/inquiry/inquiry-schema.ts` + `components/ui/form.tsx` (unmodified, hand-authored wrapper)
**Apply to:** Login, forgot/reset password, package create/edit, account create/edit forms — identical `useForm`/`zodResolver`/`FormField` composition, only field sets differ.

### Toast feedback via `sonner`
**Source:** `components/inquiry/inquiry-form.tsx` lines 48-54 (`toast.success(...)`, `toast.error(...)`)
**Apply to:** All admin mutation flows (package/account/photo CRUD, publish/feature toggles, reorder) per UI-SPEC.md's note that `sonner` "supplements inline error copy across all admin mutations."

### Server-only DAL enforcement before every mutation
**Source:** RESEARCH.md Pattern 2 (no existing codebase analog — first phase with auth)
**Apply to:** Every Server Action in `actions/*.ts` — call `requirePermission(perm)` at the top before any Supabase write, regardless of what the UI already hid (D-13/AUTH-05).

### `revalidatePath` after publish/feature/reorder/delete mutations
**Source:** RESEARCH.md Anti-Patterns section (no existing analog — Phase 1's public pages are read-only Server Components with no corresponding writer yet)
**Apply to:** `actions/packages.ts`'s `publishPackage`, `featurePackage`, `reorderPackages`, `softDeletePackage` — must call `revalidatePath('/packages')` and `revalidatePath('/packages/[slug]')` (or `revalidateTag`) so `app/(public)/packages/page.tsx` and `[slug]/page.tsx` reflect changes without a redeploy.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `proxy.ts` | middleware | request-response | First auth-gated routing file in the project (no `middleware.ts` ever existed — Next.js 16 renamed the convention); copy RESEARCH.md Pattern 1 (bundled Next.js docs) |
| `lib/supabase/proxy.ts` | utility | request-response | Companion to `proxy.ts`, same reason |
| `lib/auth/dal.ts` | service/DAL | request-response | First server-only DAL; copy RESEARCH.md Pattern 2 (bundled Next.js `authentication.md`) |
| `components/admin/photo-manager.tsx` | component | file-I/O + event-driven | First drag-and-drop UI; copy RESEARCH.md Pattern 6 (`@dnd-kit` official docs) |
| `components/admin/sortable-package-list.tsx` | component | event-driven | Same as above |
| RLS `SECURITY DEFINER` helper function (in migration) | migration/config | CRUD | First role/permission-checking RLS helper; copy RESEARCH.md Pattern 3, must be `language plpgsql` not `sql` (recursion pitfall) |

## Metadata

**Analog search scope:** `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/` (entire existing codebase — Phase 1 output only, no prior admin/auth code exists)
**Files scanned:** 24 existing source files + 2 migration files
**Pattern extraction date:** 2026-07-18
