# Phase 3: Lead Capture, CRM & Automation - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 16
**Analogs found:** 14 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/<ts>_create_crm_schema.sql` | migration | CRUD + RLS | `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql` | role-match |
| `supabase/migrations/<ts>_record_inquiry_rpc.sql` (or combined into schema migration) | migration (RPC) | event-driven / idempotent-write | `supabase/migrations/20260718171228_atomic_package_children_write.sql` | exact |
| `app/api/inquiries/route.ts` | route (Route Handler) | request-response | none (first Route Handler in project) | no analog — use RESEARCH.md Pattern 1/2 |
| `lib/crm/inquiry-schema.ts` | utility (zod schema) | transform/validate | `components/inquiry/inquiry-schema.ts` | exact |
| `lib/resend.ts` | config/service (singleton client) | — | `lib/supabase/server.ts` (client-factory singleton pattern) | role-match |
| `lib/crm/notify-staff.ts` | service | fan-out / event-driven | `actions/users.ts` (service-role client construction pattern) | role-match |
| `components/email/auto-reply-email.tsx` | component (React Email template) | transform | none (first email template in project) | no analog — use RESEARCH.md Code Examples |
| `components/email/internal-notification-email.tsx` | component (React Email template) | transform | none (first email template in project) | no analog — use RESEARCH.md Code Examples |
| `components/inquiry/inquiry-form.tsx` (MODIFIED) | component (form) | request-response | itself (existing, being modified in place) | exact |
| `actions/crm.ts` (`updateStatus`, `updateContact`, `addTag`) | service (Server Actions) | CRUD | `actions/packages.ts` (esp. `publishPackage`/`featurePackage`) + `actions/users.ts` (`updateAccount`) | exact |
| `app/admin/(dashboard)/crm/page.tsx` | controller (Server Component page) | request-response (SSR read) | `app/admin/(dashboard)/packages/page.tsx` | exact |
| `app/admin/(dashboard)/crm/[id]/page.tsx` | controller (Server Component page) | request-response (SSR read) | `app/admin/(dashboard)/packages/[id]/page.tsx` | exact |
| `components/admin/crm-table.tsx` | component (client, `@tanstack/react-table`) | CRUD (list/filter) | `components/admin/users-table.tsx` + `components/admin/sortable-package-list.tsx` | role-match |
| `components/admin/crm-detail.tsx` (timeline + status select) | component (client) | CRUD | `components/admin/package-list-row.tsx` (auto-save `Switch` → here `Select`) | role-match |
| `components/admin/contact-edit-form.tsx` (Edit Contact dialog) | component (form) | CRUD | `components/admin/account-form.tsx` (`EditAccountForm`) | exact |
| `app/admin/(dashboard)/layout.tsx` (MODIFIED — add "Contacts" nav item) | component (layout) | — | itself (existing, being modified in place) | exact |

## Pattern Assignments

### `supabase/migrations/<ts>_create_crm_schema.sql` (migration)

**Analog:** `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql`

**Table + RLS-enable pattern** (lines 20-34):
```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ...
);
alter table profiles enable row level security;
```
Apply this shape to `contacts` (id, email unique, name, phone, tags text[], status, created_by, updated_by, updated_at) and `inquiries` (id, contact_id FK, request_id uuid unique, message, package_id nullable FK to packages, created_at).

**`has_permission()` reuse — do NOT redefine** (lines 47-70): CRM RLS policies call `public.has_permission(auth.uid(), 'can_edit_crm')` exactly as-is; no new permission-check function needed (Security Domain "Elevation of Privilege" mitigation in RESEARCH.md explicitly warns against a parallel function).

**Public/anon INSERT policy shape** — extend, don't copy verbatim (Phase 2 has no anon-write precedent; this is genuinely new, see Pitfall 2 in RESEARCH.md for the narrow-scope requirement): use RESEARCH.md's Code Examples "RLS for `contacts`/`inquiries`" block directly — `for insert to anon, authenticated with check (true)`, and keep SELECT/UPDATE `can_edit_crm`-scoped, read-all `to authenticated using (true)` for CRM-03's universal read.

**Split-policy discipline** (lines 84-91, the profiles SELECT/UPDATE split): mirror this for `contacts`/`inquiries` — a public/broad INSERT policy separate from an admin/permission-scoped UPDATE policy, never one combined policy that could over-grant.

**Soft-delete precedent NOT needed this phase** (lines 114-119 `packages.deleted_at`): CRM-01–07 has no delete requirement (confirmed in 03-UI-SPEC.md's Copywriting Contract "Destructive confirmation — Not applicable this phase") — do not add a `deleted_at` column to `contacts`/`inquiries` speculatively.

---

### `supabase/migrations/<ts>_record_inquiry_rpc.sql` (idempotent RPC)

**Analog:** `supabase/migrations/20260718171228_atomic_package_children_write.sql` (`write_package_children()` — read this file directly for the exact `security invoker`/`set search_path` header shape; RESEARCH.md's Pattern 1 already extracts the precise `record_inquiry()` SQL to use verbatim, reproduced there with `on conflict (request_id) do nothing returning id` and `on conflict (email) do update`).

**Key rule inherited from the analog:** RPC function header uses `language plpgsql`, explicit `security invoker` (not `definer` — RESEARCH.md Pattern 1 explains why: this function must respect RLS since it's called by the anon-key Route Handler client, unlike `has_permission()`), and `set search_path = public`.

**Audit trigger pattern** (RESEARCH.md Code Examples "Audit trail trigger" — no direct codebase analog exists yet, this is the first `BEFORE UPDATE` trigger in the project; use as specified: `set_updated_by()` function calling `auth.uid()`, trigger on `contacts` `before update`).

---

### `app/api/inquiries/route.ts` (Route Handler — NO existing analog)

No Route Handler exists anywhere in this codebase yet. Build directly from **RESEARCH.md's Pattern 2** (`after()` fire-and-forget) code example verbatim — it is already a complete, concrete reference implementation:
- zod `.safeParse()` → 400 on failure (validation convention matches `lib/formspree.ts`'s error-shape discipline, reuse `FormspreeFieldError`-style thinking for the 400 response body)
- `createClient()` from `lib/supabase/server.ts` (same server client factory every Server Action already uses — confirm cookie-based session is NOT required here since this route is unauthenticated by design; `createClient()` still works, it will just resolve to the anon role for an unauthenticated request)
- `supabase.rpc("record_inquiry", {...})` → gate `after()` calls on `is_new`
- Honeypot (`_gotcha`) must be checked server-side here too — client-side-only enforcement (as today's `inquiry-form.tsx` sr-only field) is bypassable via direct POST (Security Domain V13 in RESEARCH.md)

**Reuse for the Formspree forward:** `lib/formspree.ts`'s existing `submitToFormspree()` and `InquiryPayload` type (lines 7-16, 27-51) — call this exact function from inside the `after()` callback per RESEARCH.md's D-02/Pattern 2, do not reimplement.

---

### `lib/crm/inquiry-schema.ts`

**Analog:** `components/inquiry/inquiry-schema.ts` (exact — same zod conventions, same project)

**Full existing file to extend the pattern from** (lines 1-13):
```typescript
import { z } from "zod";

export const inquirySchema = z.object({
  name: z.string().min(1, "Please enter your name"),
  email: z.email("Enter a valid email address"),
  phone: z.string().min(7, "Enter a valid phone number"),
  message: z.string().min(1, "Please add a short message"),
  _gotcha: z.string().max(0).optional(),
});

export type InquiryFormValues = z.infer<typeof inquirySchema>;
```
The new `inquiryRequestSchema` (server-side, Route Handler body) adds `requestId: z.uuid()` and `packageId: z.uuid().nullable().optional()` on top of this exact shape — RESEARCH.md's Code Examples section has the full target schema already written out. Keep the `z.email()`/top-level-validator convention (zod 4 API, already established here — do not use `z.string().email()`).

---

### `lib/resend.ts` (new singleton client)

**Analog (factory-singleton shape):** `lib/supabase/server.ts` — read for the "one exported factory function wrapping an SDK client constructor, env-var-driven" convention already established in this codebase. Concretely:
```typescript
// lib/resend.ts — new, mirrors the "one client factory per external service" convention
import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);
```
No auth/session wiring needed (unlike `lib/supabase/server.ts`'s cookie-based client) — this is a simple server-only singleton, safe because it's never imported into a `"use client"` module (same discipline `actions/users.ts` applies to its inline service-role client, lines 53-60).

---

### `lib/crm/notify-staff.ts` (fan-out query, D-06)

**Analog:** `actions/users.ts`'s service-role client construction (lines 14-27, 43-60) — same underlying problem (a caller without ordinary RLS-scoped access to `profiles` needs to read across rows).

**WebSocket polyfill + inline service-role client pattern to reuse** (lines 21-27, 56-60):
```typescript
async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    (globalThis as any).WebSocket = WebSocket;
  }
}
// ...
const serviceRoleClient = createServiceRoleClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
```
**Deviation per RESEARCH.md Pitfall 5:** prefer a narrowly-scoped `security definer` RPC (e.g. `get_notification_recipients()`, returning only `email` for `can_message_customers=true or role='admin', is_active=true` rows) over importing the service-role client into a Route Handler's `after()` callback — this avoids a second service-role call site outside the existing admin-Server-Action blast radius. If the RPC route is taken, no `lib/resend.ts`-adjacent service-role code is needed at all; use the plain anon-key `createClient()` calling the RPC instead.

**Fan-out query shape** (whichever path chosen) — RESEARCH.md Pattern 3 has the exact `.or("role.eq.admin,can_message_customers.eq.true")` filter and the `bcc` (never `to: [...]`) discipline for the send call.

---

### `components/email/auto-reply-email.tsx` / `internal-notification-email.tsx` (NO existing analog)

First React Email templates in the project. Build directly from `react-email` package imports (NOT `@react-email/components` — deprecated, confirmed in RESEARCH.md's Package Legitimacy Audit). No in-repo analog; keep visual treatment simple per 03-UI-SPEC.md's Scope Note (navy `#021F4A` / marigold `#F49314` / sand `#FAF7F2`, no pixel-level contract enforced).

---

### `components/inquiry/inquiry-form.tsx` (MODIFIED — D-01/D-08)

**Analog:** itself (full file already read above, 178 lines). Changes needed per D-01/D-03/D-08:
1. Replace `submitToFormspree(...)` call (line 42-45) with `fetch("/api/inquiries", { method: "POST", body: JSON.stringify({...}) })`.
2. Add `const requestId = crypto.randomUUID();` generated once per submit attempt (RESEARCH.md Code Examples, "Client-generated idempotency key").
3. Add `packageId` prop (passed down from the per-package page, parallel to existing `packageName` prop) included in the POST body.
4. UI/markup/copy stays byte-identical (03-UI-SPEC.md Scope Note: "the inquiry form's client-visible markup, layout, and copy are unchanged").
5. Keep `toast.success`/`toast.error` + `GENERIC_ERROR_MESSAGE` convention exactly as today (lines 22-23, 47-57).

---

### `actions/crm.ts` (`updateStatus`, `updateContact`, `addTag`)

**Analog:** `actions/packages.ts` (`publishPackage`/`featurePackage` — single-field auto-save toggle shape) + `actions/users.ts` (`updateAccount` — multi-field edit-form shape).

**`updateStatus()` — copy `publishPackage`'s shape exactly** (packages.ts lines 193-215):
```typescript
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
  revalidatePath("/packages");
  revalidatePath(`/packages/${data.slug}`);
  revalidatePath("/admin/packages");
  return { ok: true };
}
```
For `updateStatus(id, status)`: `await requirePermission("can_edit_crm")`, update `contacts.status`, `revalidatePath("/admin/crm")` + `revalidatePath(`/admin/crm/${id}`)`.

**`updateContact()` — copy `updateAccount`'s shape** (users.ts lines 98-154, minus the self-demotion/last-admin guards which don't apply to a CRM contact): `requirePermission("can_edit_crm")`, single `.update({ name, phone, tags })`, `GENERIC_ERROR_MESSAGE` on failure, `revalidatePath`.

**Shared boilerplate to reuse verbatim across all three actions:**
```typescript
"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
```
(from `lib/action-result.ts`, full file: `export type ActionResult = { ok: true } | { ok: false; error: string };`)

---

### `app/admin/(dashboard)/crm/page.tsx`

**Analog:** `app/admin/(dashboard)/packages/page.tsx` (full file read above).

**Guard + fetch + map-to-view-model pattern** (lines 31-71): `requirePermissionOrRedirect` is NOT the right guard here — per 03-UI-SPEC.md's interaction notes, CRM read is universal for any authenticated Staff, not permission-gated. Use `getProfile()` alone (no permission check) for the page-level guard, matching `app/admin/(dashboard)/layout.tsx`'s existing top-level `getProfile()` call — do not add a redundant `requirePermissionOrRedirect("can_edit_crm")` on the list page itself (that would incorrectly block read-only Staff).

**Empty-state JSX shape to copy exactly** (lines 94-105):
```tsx
{items.length === 0 ? (
  <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
    <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
      No packages yet
    </h2>
    <p className="text-base leading-[1.5] text-muted-foreground">...</p>
  </div>
) : (
  <SortablePackageList initialItems={items} />
)}
```
Swap copy per 03-UI-SPEC.md's Copywriting Contract ("No contacts yet" / "Contacts appear here automatically...").

**Page header shape** (lines 74-92) — `font-heading text-[28px] leading-[1.2] font-semibold` for `<h1>Contacts</h1>`, no "Add" button (contacts are never manually created, per UI-SPEC).

---

### `app/admin/(dashboard)/crm/[id]/page.tsx`

**Analog:** `app/admin/(dashboard)/packages/[id]/page.tsx` (full file read above).

**Guard + `notFound()` + nested-select pattern** (lines 30-56):
```tsx
export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("can_manage_packages");
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .select(`*, package_photos(...), itinerary_days(...)`)
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  ...
}
```
For the CRM detail page: no `requirePermissionOrRedirect` (same universal-read rule as the list page — call `getProfile()` for session validation only), `.select("*, inquiries(*, packages(id, name, slug))")` ordered by `created_at desc` for the timeline, `notFound()` on missing contact.

---

### `components/admin/crm-table.tsx`

**Analog (row/table shell + Dialog/DropdownMenu conventions):** `components/admin/users-table.tsx` (full file read above) — **but per 03-UI-SPEC.md's explicit deviation note**, do NOT copy the per-row `DropdownMenu` pattern (lines 150-173 of users-table.tsx); Contacts rows are directly clickable (whole `<TableRow>` navigates), no dropdown, since there's only one action (view detail).

**Table shell to copy** (users-table.tsx lines 98-111, `Table`/`TableHeader`/`TableRow`/`TableHead` composition) — then wire `@tanstack/react-table`'s `getFilteredRowModel`/`globalFilterFn` underneath per RESEARCH.md's Code Examples block (already a complete reference implementation, reproduced there).

**Badge variant reuse for role/status columns** (users-table.tsx lines 117-123, 143-149):
```tsx
<Badge variant={profile.role === "admin" ? "default" : "secondary"}>
  {profile.role === "admin" ? "Admin" : "Staff"}
</Badge>
```
Apply the same `variant` prop mechanism for the 5-way status badge mapping in 03-UI-SPEC.md's Color section (New=`default`, Contacted=`outline`, Qualified=`secondary`, Won=green override via utility class — not a new `cva` variant per UI-SPEC's explicit instruction, Lost=`destructive`).

---

### `components/admin/crm-detail.tsx` (status Select + timeline)

**Analog for the auto-save-on-change mechanism:** `components/admin/package-list-row.tsx`'s `handlePublishChange` (lines 74-90) — same `useState` + `startTransition` + optimistic-update-then-revert-on-failure shape, but swap `Switch`/`onCheckedChange` for `Select`/`onValueChange` per 03-UI-SPEC.md's status editor spec:
```tsx
function handlePublishChange(checked: boolean) {
  setIsPublished(checked);
  startTransition(async () => {
    try {
      const result = await publishPackage(item.id, checked);
      if (!result.ok) {
        toast.error(result.error);
        setIsPublished(!checked);
      } else {
        onMutated();
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
      setIsPublished(!checked);
    }
  });
}
```
For status: `handleStatusChange(newStatus)` calls `updateStatus(contact.id, newStatus)`, reverts to previous status on `!result.ok`, no confirmation dialog (matches "auto-save on change, no separate Save button" per UI-SPEC).

**Permission-gated rendering, not hiding** (new pattern this phase — no direct analog since Phase 2's nav pattern is hide-entirely, D-13): render `<Select>` if `can_edit_crm`, else render the plain `<Badge>` only — implement as a simple ternary in the same component, no separate gated wrapper component needed.

---

### `components/admin/contact-edit-form.tsx` (Edit Contact dialog)

**Analog:** `components/admin/account-form.tsx`'s `EditAccountForm` (lines 244-409) — exact structural match per 03-UI-SPEC.md's explicit instruction ("mirrors Phase 2's `AccountForm` edit-dialog pattern exactly").

**Read-only field pattern to copy verbatim** (account-form.tsx lines 307-322, for the non-editable email field):
```tsx
<div className="grid gap-2">
  <Label htmlFor="edit-account-email">Email</Label>
  <Input
    id="edit-account-email"
    value={account.email}
    type="email"
    disabled
    readOnly
  />
</div>
```
Apply identically for the CRM contact-edit dialog's email field (D-04: email is the stable identity key, never editable — UI-SPEC confirms "render it as plain read-only text even when `can_edit_crm` is present").

**Form/submit/toast shape** (account-form.tsx lines 264-279) — copy exactly, swap `updateAccount` for `updateContact`, "Account updated." for a CRM-appropriate success toast, "Save Changes" button label (already matches UI-SPEC's Copywriting Contract verbatim).

**Dialog trigger + shell to copy** (users-table.tsx lines 181-197):
```tsx
<Dialog open={editingAccount !== null} onOpenChange={(open) => !open && setEditingAccount(null)}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
    {editingAccount && <AccountForm mode="edit" account={editingAccount} onSuccess={handleMutationSuccess} />}
  </DialogContent>
</Dialog>
```

---

### `app/admin/(dashboard)/layout.tsx` (MODIFIED — add "Contacts" nav item)

**Analog:** itself (full file read above, lines 1-103).

**Nav item pattern — deviation required per 03-UI-SPEC.md:** unlike the existing `canManagePackages`/`canManageUsers`-gated items (lines 50-65), the new "Contacts" item is **NOT permission-gated** — every authenticated Admin/Staff sees it unconditionally:
```tsx
<SidebarMenuItem>
  <SidebarMenuButton render={<Link href="/admin/crm" />}>
    <ContactIcon />
    <span>Contacts</span>
  </SidebarMenuButton>
</SidebarMenuItem>
```
No `canViewCrm` boolean needed — insert this item unconditionally inside the existing `<SidebarMenu>` (after Packages, before/after Users per free ordering choice), no new profile-derived variable required (contrast with `const canManagePackages = ...` / `const canManageUsers = ...` pattern at lines 32-33, which stays as-is for the two existing items only).

## Shared Patterns

### Server Action permission guard
**Source:** `lib/auth/dal.ts`'s `requirePermission()` (lines 54-64)
**Apply to:** `actions/crm.ts`'s `updateStatus`, `updateContact`, `addTag` — every write action starts with `await requirePermission("can_edit_crm")`, matching the exact pattern every existing `actions/packages.ts` function uses with `"can_manage_packages"`.
```typescript
export async function requirePermission(perm: Permission): Promise<Profile> {
  const profile = await getProfile();
  if (profile.role !== "admin" && !profile[perm]) {
    throw new Error("Forbidden");
  }
  return profile;
}
```

### ActionResult return shape
**Source:** `lib/action-result.ts` (full file, 5 lines)
**Apply to:** All three new `actions/crm.ts` functions — `Promise<ActionResult>` return type, `{ ok: true }` / `{ ok: false, error: GENERIC_ERROR_MESSAGE }` shape, identical `GENERIC_ERROR_MESSAGE` string literal reused verbatim across every actions/*.ts file including this phase's new one:
```typescript
const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
```

### `has_permission()` RLS helper — reuse, do not redefine
**Source:** `supabase/migrations/20260718150801_admin_rbac_and_package_write_policies.sql` lines 47-70
**Apply to:** Every new RLS policy on `contacts`/`inquiries` that needs permission scoping — call `public.has_permission(auth.uid(), 'can_edit_crm')` exactly as existing policies call it with `'can_manage_packages'`. Never write a second permission-check function.

### `revalidatePath` after every mutating Server Action
**Source:** `actions/packages.ts` (every function, e.g. lines 117-119, 157-159) and `actions/users.ts` (lines 94, 152, 193)
**Apply to:** `updateStatus`/`updateContact`/`addTag` — `revalidatePath("/admin/crm")` (list) + `revalidatePath(`/admin/crm/${id}`)` (detail) after every successful write.

### Toast + `useTransition` client-side mutation feedback
**Source:** `components/admin/package-list-row.tsx` (`handlePublishChange`/`handleFeatureChange`, lines 74-108) and `components/admin/users-table.tsx` (`handleDeactivate`, lines 62-80)
**Apply to:** `crm-detail.tsx`'s status Select, `contact-edit-form.tsx`'s submit handler — `toast.success(...)`/`toast.error(result.error)` on `ActionResult`, `toast.error(GENERIC_ERROR_MESSAGE)` in `catch`, `startTransition`/`isPending` disables the control during the mutation.

### `after()` fire-and-forget for all three Route Handler side effects
**Source:** RESEARCH.md Pattern 2 (no in-repo analog — first Route Handler in the project); this is the one genuinely new cross-cutting pattern this phase introduces, not an extension of an existing one.
**Apply to:** `app/api/inquiries/route.ts` — Formspree forward, auto-reply send, internal-notification send. All three gated on `is_new` (Pitfall 3).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/api/inquiries/route.ts` | route | request-response | First Route Handler (`app/api/*`) in the project — no prior Route Handler exists anywhere in this codebase. Use RESEARCH.md Pattern 1/2's fully-written reference implementation instead of an in-repo analog. |
| `components/email/auto-reply-email.tsx` / `internal-notification-email.tsx` | component (email template) | transform | First React Email templates in the project — no prior email-sending code exists at all. Use `react-email` package imports directly per RESEARCH.md's Standard Stack/Package Legitimacy Audit (NOT `@react-email/components`, deprecated). |

## Metadata

**Analog search scope:** `actions/`, `app/admin/(dashboard)/`, `components/admin/`, `components/inquiry/`, `lib/`, `lib/auth/`, `supabase/migrations/`
**Files scanned:** ~20 (all existing actions/*.ts, all admin page.tsx/component files, lib/auth/dal.ts, lib/formspree.ts, lib/action-result.ts, all 5 existing migrations, inquiry-form.tsx + inquiry-schema.ts)
**Pattern extraction date:** 2026-07-20
