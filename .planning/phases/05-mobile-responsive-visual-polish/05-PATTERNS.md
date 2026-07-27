# Phase 5: Mobile Responsive & Visual Polish - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 11
**Analogs found:** 11 / 11 (this is a retrofit phase — every "new" file is a modification of an existing file, so the analog is almost always the file itself / its nearest sibling)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `components/packages/package-gallery.tsx` | component | request-response (client render) | itself (bugfix in place) | exact |
| `components/admin/crm-table.tsx` | component (table→card) | CRUD (row selection + navigation) | itself + `components/admin/users-table.tsx` (twin-markup precedent) | exact |
| `components/admin/users-table.tsx` | component (table→card) | CRUD | itself + `crm-table.tsx` (selection pattern to mirror, minus selection) | exact |
| `components/admin/sortable-package-list.tsx` | component (table→card, dnd) | CRUD + event-driven (drag reorder) | itself + `package-list-row.tsx` | exact |
| `components/admin/package-list-row.tsx` (split into row + new `PackageListCard`) | component | CRUD + event-driven (drag reorder) | itself | exact |
| `app/admin/(dashboard)/packages/loading.tsx` (new) | route (Suspense boundary) | request-response | `app/admin/(dashboard)/crm/loading.tsx` | exact |
| `app/admin/(dashboard)/users/loading.tsx` (new) | route (Suspense boundary) | request-response | `app/admin/(dashboard)/crm/loading.tsx` | exact |
| `app/admin/(dashboard)/layout.tsx` | provider/layout | request-response | itself | exact |
| `components/ui/sidebar.tsx` | component (polish only) | request-response | itself (no logic change) | exact |
| `components/ui/card.tsx` | component (shared primitive, shadow polish) | request-response | `components/ui/dialog.tsx` / `dropdown-menu.tsx` / `select.tsx` (shadow scale reference) | role-match (elevation convention source, not structural analog) |
| Public pages: `app/(public)/page.tsx`, `packages/page.tsx`, `packages/[slug]/page.tsx`, `contact/page.tsx` (zoom-reflow audit, likely no/minimal edits beyond gallery) | component | request-response | `components/packages/package-gallery.tsx` (only confirmed offender) | audit-only, no strong structural analog needed |

## Pattern Assignments

### `components/packages/package-gallery.tsx` (component, request-response) — bugfix

**Analog:** itself — this is a targeted CSS fix, not a structural rewrite.

**Root cause** (lines 76-77):
```tsx
<CarouselPrevious className="left-2 sm:-left-12" />
<CarouselNext className="right-2 sm:-right-12" />
```
These negative offsets (`-3rem` at `sm:` and above) push the buttons outside the Dialog's `max-w-[calc(100%-2rem)]` boundary at high browser zoom, producing WCAG 1.4.10 reflow failures (D-01/D-02).

**Fix approach:** Constrain nav buttons inside the dialog's own padding box at all breakpoints:
```tsx
<CarouselPrevious className="left-2" />
<CarouselNext className="right-2" />
```
Verify with actual browser zoom (Cmd/Ctrl + "+", not DevTools' width-only responsive simulator) up to 200%, per the WCAG 1.4.10 protocol in RESEARCH.md.

**Audit checklist for other public files:** grep for `-left-`, `-right-`, `-top-`, `-bottom-` negative-offset utilities inside any `max-w-[...]`-constrained ancestor across `app/(public)/**`. RESEARCH.md's static sweep found no other matches, but D-01 requires a live 200%-zoom pass across all 5 public routes as final verification, not just this static fix.

---

### `components/admin/crm-table.tsx` (component, CRUD) — table→card retrofit

**Analog:** itself (existing TanStack Table wiring stays; only the render branch changes)

**Imports pattern** (lines 1-48) — no changes needed; `Card`/`CardContent` will need to be added to the existing import block:
```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// ADD:
import { Card, CardContent } from "@/components/ui/card";
```

**Row-selection + opt-out guard pattern to preserve verbatim in card mode** (lines 79-98):
```tsx
cell: ({ row }) => (
  <div onClick={(e) => e.stopPropagation()} className="inline-flex">
    {row.original.opted_out ? (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Checkbox checked={false} disabled aria-label="Opted out" />
        </TooltipTrigger>
        <TooltipContent>Opted out — excluded from bulk sends</TooltipContent>
      </Tooltip>
    ) : (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(!!checked)}
        aria-label="Select row"
      />
    )}
  </div>
),
```
**Critical:** the card-mode branch must call `row.getIsSelected()` / `row.toggleSelected()` / reuse this exact `opted_out` branch — do not re-implement selection state separately for cards (STRIDE tampering risk flagged in RESEARCH.md).

**Existing table render to wrap in `hidden md:block`** (lines 262-297): unchanged, wrap in a container div.

**New card-mode branch to add (sibling, `md:hidden`)** — model on RESEARCH.md's Pattern 1 example, reusing `rows` from `table.getRowModel().rows` and the same `flexRender`-free direct field access already used per-column (`row.original.name`, `row.original.email`, `row.original.status`, `row.original.tags`, `row.original.createdAt`):
```tsx
<div className="flex flex-col gap-3 md:hidden">
  {rows.map((row) => (
    <Card
      key={row.id}
      className="cursor-pointer p-4"
      onClick={() => router.push(`/admin/crm/${row.original.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div onClick={(e) => e.stopPropagation()}>
          {/* same opted_out-guarded Checkbox block as column cell above */}
        </div>
        <div className="flex-1">
          <p className="font-medium">{row.original.name}</p>
          <p className="text-sm text-muted-foreground">{row.original.email}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[row.original.status]} className={STATUS_BADGE_CLASSNAME[row.original.status]}>
          {STATUS_LABELS[row.original.status]}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {row.original.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
      </div>
    </Card>
  ))}
</div>
```

**Bulk action bar** (lines 234-247) is already viewport-agnostic (`flex items-center gap-3`) — no changes needed, it sits above both branches and reads from the same `selectedRows`/`rowSelection` state.

**Empty-match state pattern to keep untouched** (lines 249-260) — already brand-token-based (`bg-card`, `ring-foreground/10`), reuse as-is for D-07 empty-state consistency across all three tables.

---

### `components/admin/users-table.tsx` (component, CRUD) — table→card retrofit

**Analog:** itself, cross-referencing `crm-table.tsx`'s twin-markup structure (no row-selection needed here — D-03/D-04 only require selection preservation for `crm-table.tsx`)

**Existing table structure to wrap in `hidden md:block`** (lines 98-179): unchanged.

**New card-mode branch** (`md:hidden`) — reuse the exact same field rendering (badges for role/permissions/status, `DropdownMenu` for actions) per profile:
```tsx
<div className="flex flex-col gap-3 md:hidden">
  {profiles.map((profile) => (
    <Card key={profile.id} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{profile.name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
        </div>
        {/* reuse existing DropdownMenu block verbatim (lines 151-173) */}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
          {profile.role === "admin" ? "Admin" : "Staff"}
        </Badge>
        <Badge variant={profile.is_active ? "secondary" : "destructive"}>
          {profile.is_active ? "Active" : "Inactive"}
        </Badge>
        {/* reuse existing permission-badge block verbatim (lines 124-141) */}
      </div>
    </Card>
  ))}
</div>
```

**Dialogs (Add/Edit/Deactivate)** (lines 85-95, 181-223) are unchanged — they're already viewport-agnostic overlays, not part of the table/card branch.

---

### `components/admin/sortable-package-list.tsx` + `components/admin/package-list-row.tsx` (component, event-driven drag reorder)

**Analog:** itself — `useSortable()` is markup-agnostic per RESEARCH.md's confirmed finding; the hook call site pattern moves verbatim from `<TableRow>` to `<Card>`.

**Current `useSortable()` wiring to replicate on a new `PackageListCard`** (`package-list-row.tsx` lines 54-72):
```tsx
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: item.id });

const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.6 : 1,
};
```

**Drag-handle button pattern to replicate** (lines 130-146):
```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <button
        type="button"
        className="flex size-11 items-center justify-center text-muted-foreground"
        {...attributes}
        {...listeners}
      />
    }
  >
    <GripVerticalIcon />
    <span className="sr-only">Drag to reorder</span>
  </TooltipTrigger>
  <TooltipContent>Drag to reorder</TooltipContent>
</Tooltip>
```

**Mutation handlers to reuse verbatim** (lines 74-125): `handlePublishChange`, `handleFeatureChange`, `handleDelete` — all call existing Server Actions (`publishPackage`, `featurePackage`, `softDeletePackage`) with the same optimistic-toggle + toast-on-error pattern. Card mode must call the *same* handlers, not new ones (ASVS V4 access-control note in RESEARCH.md — same Server Actions, no new UI path).

**New `PackageListCard` structure** (per RESEARCH.md Pattern 2), reusing `Switch` for Published/Featured and the existing `DropdownMenu`/`AlertDialog` blocks (lines 182-227) verbatim:
```tsx
function PackageListCard({ item, onMutated, onDeleted }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <Card ref={setNodeRef} style={style} className="p-4">
      <div className="flex items-center gap-3">
        {/* drag handle button — same as row */}
        {/* Image thumbnail — same size/12 relative wrapper as TableCell version */}
        <div className="flex-1">
          <p className="font-medium">{item.name}</p>
          <div className="mt-1 flex items-center gap-3">
            {/* Published + Featured Switch blocks, same handlers */}
          </div>
        </div>
        {/* DropdownMenu actions — same as row */}
      </div>
    </Card>
  );
}
```

**Where the branch lives:** `sortable-package-list.tsx` renders `PackageListRow` inside `<Table>`/`SortableContext` today — add a parallel `md:hidden` branch rendering `PackageListCard` inside the *same* `DndContext`/`SortableContext`, per RESEARCH.md's explicit note that the context wraps the list, not individual rows.

---

### `app/admin/(dashboard)/packages/loading.tsx` and `app/admin/(dashboard)/users/loading.tsx` (route, request-response) — new files

**Analog:** `app/admin/(dashboard)/crm/loading.tsx` (full file, 21 lines — copy structure exactly, adjust skeleton shapes)

**Full pattern to replicate** (`crm/loading.tsx` lines 1-20):
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function CrmLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-full" />
        {/* repeat h-10 rows to match row count aesthetic */}
      </div>
    </div>
  );
}
```
For `packages/loading.tsx`, shape rows to hint at drag-handle + thumbnail + name + two switches (e.g., a `h-14` row with an inline `size-10` skeleton for the thumbnail). For `users/loading.tsx`, shape rows to hint at name + email + role badge + permission badges + status + actions (a `h-14` row is sufficient — do not over-engineer exact column widths).

---

### `app/admin/(dashboard)/layout.tsx` (provider/layout) — sidebar trigger/polish only

**Analog:** itself — D-05 confirms `SidebarProvider`/`Sidebar`/`SidebarTrigger` logic is correct and must not change; only Tailwind classes on the trigger/header wrapper change.

**Current trigger placement** (lines 103-107):
```tsx
<SidebarInset>
  <header className="flex items-center gap-2 border-b border-border px-4 py-3">
    <SidebarTrigger />
  </header>
  <div className="flex-1 p-6">{children}</div>
</SidebarInset>
```
Polish scope: tap-target sizing on `SidebarTrigger` (check `components/ui/sidebar.tsx` for its default `size` prop), header padding/shadow for visual separation, spacing between trigger and any future breadcrumb/title slot. Do not touch `SidebarProvider`, `getProfile()` gating, or the permission-conditional `SidebarMenuItem` blocks (lines 50-74) — those are logic, not polish.

---

### `components/ui/card.tsx` (component, shared primitive) — shadow/depth polish (D-07)

**Analog for elevation scale to match:** `components/ui/dropdown-menu.tsx` (lines 44, 138) and `components/ui/select.tsx` (line 86) — both floating surfaces already use `shadow-md`/`shadow-lg` + `ring-1 ring-foreground/10`.

**Current Card base classes** (lines 14-17):
```tsx
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl"
```
No `shadow-*` utility present today (confirmed gap per RESEARCH.md Pitfall 4). Recommended addition per RESEARCH.md: append `shadow-sm` (the smallest step in Tailwind's default scale, below dropdown/select's `shadow-md`/`shadow-lg`) to keep the ring+shadow distinction intentional — static in-flow cards stay visually lighter than floating overlays. Do not introduce `shadow-xl` or a custom box-shadow value not already present in `dropdown-menu.tsx`/`select.tsx`/`dialog.tsx`.

**Dialog's existing shadow for cross-reference** — grep confirms `dialog.tsx` also uses the `shadow-md`/`shadow-lg` overlay convention (not read in full here since D-07 doesn't require editing `dialog.tsx`/`dropdown-menu.tsx`/`select.tsx` — they're the source of truth, not targets).

---

## Shared Patterns

### Twin-markup responsive table→card breakpoint (D-03, applies to `crm-table.tsx`, `users-table.tsx`, `sortable-package-list.tsx`)
**Source:** RESEARCH.md Pattern 1 (no existing codebase precedent — this is the first table→card retrofit in the project)
**Apply to:** All three table components
```tsx
<div className="hidden overflow-hidden rounded-xl border border-border md:block">
  <Table>{/* existing markup, unchanged */}</Table>
</div>
<div className="flex flex-col gap-3 md:hidden">
  {/* new Card-per-row markup */}
</div>
```
**Rule:** Use CSS-only `hidden md:block` / `md:hidden` twin markup — do NOT introduce `useIsMobile()` for this switch (causes SSR/hydration flash per RESEARCH.md Pitfall 2). Reserve `useIsMobile()` for cases where the component tree itself must differ (already used correctly inside `components/ui/sidebar.tsx`, untouched).

### Breakpoint value
**Source:** `hooks/use-mobile.ts` (`MOBILE_BREAKPOINT = 768`, matches Tailwind's `md`)
**Apply to:** All card-breakpoint work — never hardcode a different pixel value (RESEARCH.md Anti-Pattern).

### Row-selection / opt-out guard preservation
**Source:** `components/admin/crm-table.tsx` lines 79-98 (see above)
**Apply to:** `crm-table.tsx` card-mode branch only (the only table with `enableRowSelection`)
**Rule:** Card mode must call the identical `row.getIsSelected()`/`row.toggleSelected()`/`opted_out` branch — never a parallel `useState`-based selection implementation.

### Loading skeleton structure
**Source:** `app/admin/(dashboard)/crm/loading.tsx` (full file)
**Apply to:** New `packages/loading.tsx`, `users/loading.tsx`

### Elevation/shadow convention
**Source:** `components/ui/dropdown-menu.tsx` lines 44, 138; `components/ui/select.tsx` line 86 (`shadow-md`/`shadow-lg` for floating surfaces); `components/ui/card.tsx` line 15 (`ring-1 ring-foreground/10`, no shadow, for static surfaces)
**Apply to:** `components/ui/card.tsx` polish (add `shadow-sm`, keep the ring — do not invert the convention)

### Server Action call-site preservation (security)
**Source:** `components/admin/package-list-row.tsx` lines 74-125 (`publishPackage`/`featurePackage`/`softDeletePackage`); `components/admin/crm-table.tsx`'s `MessageComposeDialog` bulk trigger; `components/admin/users-table.tsx`'s `deactivateAccount`
**Apply to:** All new card-mode branches — call the exact same handler functions already defined in the component, never duplicate Server Action calls in a new card-only code path (ASVS V4 note from RESEARCH.md).

## No Analog Found

None — every file in scope either has itself as the analog (in-place modification/retrofit) or a clear sibling analog within the same phase's file set. This is expected for a retrofit-only phase with no new capabilities.

## Metadata

**Analog search scope:** `components/admin/`, `components/packages/`, `components/ui/`, `app/admin/(dashboard)/`, `app/(public)/`, `hooks/use-mobile.ts`
**Files scanned:** 11 target files + 4 reference-only files (`dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `hooks/use-mobile.ts`)
**Pattern extraction date:** 2026-07-24
