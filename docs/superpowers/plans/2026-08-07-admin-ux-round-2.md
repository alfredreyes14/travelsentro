# Admin UX Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second admin-panel UX polish pass, scoped to every page reachable from the sidebar (Packages, Destinations, Content, Users), fixing the two concrete inconsistencies found during review: page-header typography that diverges between Users and every other admin page, and the Destinations list lacking the search/toolbar treatment every other list already got in round 1.

**Architecture:** One new shared primitive, `PageHeader`, replaces the near-identical (but inconsistent) title/description markup duplicated at the top of every admin page. The Destinations list gets the same `DataTableToolbar` + client-side search pattern round 1 already applied to `users-table.tsx` and `crm-table.tsx`.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, shadcn/ui (`data-slot` convention + `cn()` from `@/lib/utils`), `lucide-react` icons.

## Global Constraints

- No new npm dependencies.
- Follow the existing `data-slot="..."` convention on every new primitive.
- Use `cn()` from `@/lib/utils` for all conditional/merged className logic.
- Every task that changes rendered UI must be manually verified in a running dev server at both a mobile width (375px) and a desktop width (1280px) before being marked done.
- Run `npm run lint` after every task and fix any new warnings/errors before committing.
- Do not modify `components/admin/admin-nav.tsx`, `admin-sidebar-header.tsx`, `admin-topbar.tsx`, `admin-user-footer.tsx`, `app/admin/(dashboard)/layout.tsx`, `components/ui/sidebar.tsx`, or `components/ui/table.tsx` — these belong to an unrelated in-progress rework already sitting uncommitted in the working tree.
- If `docs/superpowers/plans/2026-08-07-package-fields-rework.md` has already been executed, `app/admin/(dashboard)/packages/[id]/page.tsx`'s header will already show "{name} · {slug}" as its description line — Task 1 below preserves that when converting it to `PageHeader`. If that plan hasn't run yet, the description is just `{pkg.name}` — either way, only the wrapping markup changes, not the description content itself.

## Explicit Non-Goals

- No pass over `components/admin/content/hero-slide-form.tsx`, `partner-form.tsx`, or `testimonial-form.tsx` — these weren't read as part of scoping this plan, and adding tasks against files not yet reviewed would risk placeholder/guessed instructions. A follow-up plan can cover them once reviewed the same way `destinations-list.tsx` was here.
- No changes to `components/admin/package-form.tsx` beyond what `2026-08-07-package-fields-rework.md` already does — that plan's Task 5 is this round's package-form contribution.

---

### Task 1: `PageHeader` primitive

**Files:**
- Create: `components/admin/page-header.tsx`

**Interfaces:**
- Produces: `PageHeader` — `{ title: string; description: string } & React.ComponentProps<"div">`, exported from `@/components/admin/page-header`. Renders the standardized title/description block every admin page uses at its top.

- [ ] **Step 1: Create the component**

Standardize on the larger, more common variant already used by `/admin/packages`, `/admin/packages/destinations`, and `/admin/content` (`text-[28px]` heading + `text-base` description) rather than the smaller one-off used by `/admin/users` (`text-[24px]` + `text-sm`) — the larger variant is the majority pattern.

```tsx
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  title: string;
  description: string;
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-4",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {title}
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
```

(`children` renders to the right of the title/description block — e.g. an "Add Package" button — matching the existing `flex items-center justify-between` pattern already used on `/admin/packages`.)

- [ ] **Step 2: Verify**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: no errors. `PageHeader` is unused until Step 3+ below, which is expected (named export, not flagged as unused).

- [ ] **Step 3: Commit**

```bash
git add components/admin/page-header.tsx
git commit -m "feat(admin): add shared PageHeader primitive"
```

---

### Task 2: Apply `PageHeader` to every sidebar-linked admin page

**Files:**
- Modify: `app/admin/(dashboard)/packages/page.tsx`
- Modify: `app/admin/(dashboard)/packages/destinations/page.tsx`
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx`
- Modify: `app/admin/(dashboard)/content/page.tsx`
- Modify: `app/admin/(dashboard)/users/page.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 1.

- [ ] **Step 1: `packages/page.tsx`**

Find the header block (current lines 74-92):

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

Replace with:

```tsx
      <PageHeader
        title="Packages"
        description="Drag to reorder, and toggle Published/Featured — changes go live on the public site immediately."
      >
        <Button
          size="lg"
          render={<Link href="/admin/packages/new" />}
          nativeButton={false}
        >
          Add Package
        </Button>
      </PageHeader>
```

Add the import alongside the other component imports (current line 6):

```tsx
import { PageHeader } from "@/components/admin/page-header";
```

- [ ] **Step 2: `packages/destinations/page.tsx`**

Find the header block (current lines 54-64):

```tsx
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
```

Replace with:

```tsx
      <PageHeader
        title="Destinations"
        description="Manage the Local/International destinations shown on the homepage and available when linking a package. A destination can't be disabled or deleted while an active package still uses it."
      />
```

Add the import alongside the existing `DestinationsList` import:

```tsx
import { PageHeader } from "@/components/admin/page-header";
```

- [ ] **Step 3: `packages/[id]/page.tsx`**

Find the header block:

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

(If `2026-08-07-package-fields-rework.md` hasn't run yet, this block instead reads `{pkg.name}` alone with no `· {pkg.slug}` — use whatever this file currently contains as the `description` value below.)

Replace with:

```tsx
      <PageHeader title="Edit Package" description={`${pkg.name} · ${pkg.slug}`} />
```

Add the import alongside the other component imports:

```tsx
import { PageHeader } from "@/components/admin/page-header";
```

- [ ] **Step 4: `content/page.tsx`**

Find the header block (current lines 176-184):

```tsx
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Homepage Content
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Manage the hero carousel and homepage content sections — changes go
          live on the public site immediately.
        </p>
      </div>
```

Replace with:

```tsx
      <PageHeader
        title="Homepage Content"
        description="Manage the hero carousel and homepage content sections — changes go live on the public site immediately."
      />
```

Add the import alongside the other component imports:

```tsx
import { PageHeader } from "@/components/admin/page-header";
```

- [ ] **Step 5: `users/page.tsx`**

Find the header block (current lines 29-37) — this is the one that currently diverges (smaller heading, `text-sm` description):

```tsx
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[24px] leading-[1.2] font-semibold">
          Users
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage Admin and Staff accounts and their permissions.
        </p>
      </div>
```

Replace with:

```tsx
      <PageHeader
        title="Users"
        description="Manage Admin and Staff accounts and their permissions."
      />
```

Add the import alongside the other component imports:

```tsx
import { PageHeader } from "@/components/admin/page-header";
```

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev`, visit `/admin/packages`, `/admin/packages/destinations`, an existing package's edit page, `/admin/content`, and `/admin/users` at both 375px and 1280px.
Expected: every page's title/description now renders at the same size (`28px` / `text-base`) with the same spacing — `/admin/users` visibly grows to match the others, everything else looks pixel-identical to before.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/(dashboard)/packages/page.tsx" "app/admin/(dashboard)/packages/destinations/page.tsx" "app/admin/(dashboard)/packages/[id]/page.tsx" "app/admin/(dashboard)/content/page.tsx" "app/admin/(dashboard)/users/page.tsx"
git commit -m "feat(admin): standardize page headers across all sidebar-linked pages"
```

---

### Task 3: Add search to the Destinations list

**Files:**
- Modify: `components/admin/content/destinations-list.tsx`

**Interfaces:**
- Consumes: `DataTableToolbar` from `@/components/admin/data-table-toolbar` (already built in round 1).
- Produces: no new exports — `DestinationsList`'s public props (`initialDestinations`) are unchanged.

With the fields rework plan's seed script (Task 9 there) growing the destinations catalog from 8 to 16, this list — the one admin list round 1 didn't touch, and the only one still missing a search box — needs it now more than before.

- [ ] **Step 1: Add imports and search state**

Update the top imports (current lines 1-31):

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SearchIcon } from "lucide-react";

import {
  deleteDestination,
  toggleDestinationActive,
} from "@/actions/destinations";
import { DestinationForm, type DestinationRecord } from "./destination-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DataTableToolbar } from "@/components/admin/data-table-toolbar";
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
```

Inside `DestinationsList`, right after the existing `isDeleting`/`startDeleting` declaration (current line 66), add:

```tsx
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const hasItems = items.length > 0;
  const hasNoMatches = hasItems && filteredItems.length === 0;
```

- [ ] **Step 2: Replace the top action row with a `DataTableToolbar` + search**

Find the current top-of-render block (current lines 96-110):

```tsx
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
```

Replace with:

```tsx
  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search destinations by name..."
            className="pl-8"
          />
        </div>
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
      </DataTableToolbar>
```

- [ ] **Step 3: Branch on `hasItems`/`hasNoMatches` and render `filteredItems`**

Find the existing conditional render (current lines 112-134):

```tsx
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
```

Replace with:

```tsx
      {!hasItems ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No destinations yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Add a destination so packages can be linked to it and travelers
            can browse by destination on the homepage.
          </p>
        </div>
      ) : hasNoMatches ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No destinations match your search
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Try a different name.
          </p>
          <Button variant="secondary" onClick={() => setSearch("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredItems.map((item) => (
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
```

(Leave `DestinationRow` and everything below it — the edit `Dialog` and delete `AlertDialog` — completely unchanged.)

- [ ] **Step 4: Verify**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev`, open `/admin/packages/destinations`:
- At 1280px: confirm a search box now sits to the left of "Add Destination" in the same row. Type a name substring matching one destination (e.g. "bora") — confirm the list filters to just that row. Type something matching nothing — confirm "No destinations match your search" appears with a working "Clear search" button.
- At 375px: confirm the search box and "Add Destination" button stack vertically (search on top), matching the CRM/Users tables' existing mobile toolbar behavior.

- [ ] **Step 5: Commit**

```bash
git add components/admin/content/destinations-list.tsx
git commit -m "feat(admin): add search to destinations list via DataTableToolbar"
```

---

## Post-plan check

- [ ] Run `npm run build` once to confirm the full production build still succeeds with no type or lint errors introduced.
- [ ] Re-open every touched page (`/admin/packages`, `/admin/packages/destinations`, a package edit page, `/admin/content`, `/admin/users`) at both 375px and 1280px one more time in sequence, confirming nothing regressed between tasks.
