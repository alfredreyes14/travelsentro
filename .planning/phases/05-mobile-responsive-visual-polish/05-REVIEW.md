---
phase: 05-mobile-responsive-visual-polish
reviewed: 2026-07-25T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app/admin/(dashboard)/layout.tsx
  - app/admin/(dashboard)/packages/loading.tsx
  - app/admin/(dashboard)/users/loading.tsx
  - components/admin/crm-table.tsx
  - components/admin/package-list-card.tsx
  - components/admin/sortable-package-list.tsx
  - components/admin/users-table.tsx
  - components/packages/package-gallery.tsx
  - components/ui/alert-dialog.tsx
  - components/ui/card.tsx
  - components/ui/dialog.tsx
findings:
  critical: 0
  warning: 6
  info: 8
  total: 14
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-07-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This pass re-reviews all 11 files at their current state, superseding the prior 05-REVIEW.md (which predated plan 05-06 and did not cover `alert-dialog.tsx`/`dialog.tsx`). Confirmed: the `shadow-sm` (Card) / `shadow-md` (Dialog, AlertDialog) elevation-hierarchy fix from plan 05-06 is present and correctly applied — `components/ui/dialog.tsx` and `components/ui/alert-dialog.tsx` both carry `shadow-md ring-1 ring-foreground/10`, and `components/ui/card.tsx` carries `shadow-sm ring-1 ring-foreground/10`, giving dialogs a visibly higher elevation than cards. No regression there.

No critical/blocker-level defects were found (no injection, auth bypass, secret leakage, or crash risk in these files). The remaining issues cluster around: (1) a real state-sync bug in `SortablePackageList` that silently drops server-refreshed data after mount, (2) a reachable duplicate-React-key path in `CrmTable`'s tag rendering, and (3) several mobile-usability gaps in the new touch-first card surfaces this phase introduces (`crm-table.tsx`'s mobile `Card`, `package-list-card.tsx`) — keyboard-unreachable row navigation, a missing `touch-action` hint on the drag handle, and an actions-menu tap target far smaller than the drag handle on the same card. Several duplication/robustness items are recorded as Info per this review's severity rubric (code duplication classifies as Info, not Warning).

## Warnings

### WR-01: `SortablePackageList` never re-syncs with fresh server data after mount

**File:** `components/admin/sortable-package-list.tsx:50`
**Issue:** `items` is seeded once via `useState(initialItems)` and there is no `useEffect` (or any other mechanism) that re-syncs it when the `initialItems` prop changes on a parent re-render. `handleMutated()` (lines 86-88) calls `router.refresh()` after a publish/feature toggle succeeds, which re-runs the `page.tsx` Server Component and passes a fresh `items` array as `initialItems` — but because `SortablePackageList` stays mounted at the same tree position (no `key` change on the caller side, confirmed in `app/admin/(dashboard)/packages/page.tsx:107`: `<SortablePackageList initialItems={items} />`), React does **not** re-initialize the `useState` call, so the new data is silently dropped. The only mutation that actually patches local `items` is `handleDeleted` (lines 90-92); anything else that changes the underlying list (another admin/tab adding, deleting, or reordering a package) will not appear until a full navigation away and back.
**Fix:**
```tsx
useEffect(() => {
  setItems(initialItems);
}, [initialItems]);
```
or key `SortablePackageList` on a server-provided version/count so React remounts it when the underlying data changes, keeping only the transient drag-order in local state.

### WR-02: Duplicate React keys possible in `CrmTable` tag lists

**File:** `components/admin/crm-table.tsx:136` (desktop), `components/admin/crm-table.tsx:338` (mobile)
**Issue:** Both the desktop `tags` column cell and the mobile card key tag `Badge`s by the tag string itself (`key={tag}`), assuming tags are unique per contact. They are not guaranteed to be: `components/admin/contact-edit-form.tsx:49-52` builds the tags array via `.split(",").map(t => t.trim()).filter(Boolean)` with no de-duplication, so an admin entering `"vip, vip"` produces `["vip", "vip"]`, which reaches `CrmTable` unmodified through `AdminContactListItem.tags`. Duplicate keys cause React reconciliation warnings and can lead to incorrect/inconsistent re-renders of the affected badges.
**Fix:** Key by `${tag}-${index}` in both render sites, or de-duplicate at the source in `contact-edit-form.tsx`'s submit handler (`tags: [...new Set(tags)]`), which fixes the underlying data-quality issue rather than only the rendering symptom.

### WR-03: Mobile-card and desktop-row navigation in `CrmTable` is not keyboard accessible

**File:** `components/admin/crm-table.tsx:284-290` (desktop `TableRow`), `components/admin/crm-table.tsx:311-317` (mobile `Card`)
**Issue:** Both the desktop table row and the newly-added mobile card use a bare `onClick` on a non-interactive element (`<TableRow>` renders `<tr>`, `<Card>` renders `<div>`) to navigate to `/admin/crm/[id]`. Neither has `role="button"`, `tabIndex={0}`, nor an `onKeyDown` handler for Enter/Space. Keyboard-only users can Tab to the row's checkbox but have no way to activate the "open contact" navigation itself.
**Fix:**
```tsx
<TableRow
  key={row.id}
  role="button"
  tabIndex={0}
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => router.push(`/admin/crm/${row.original.id}`)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(`/admin/crm/${row.original.id}`);
    }
  }}
>
```
Apply the same pattern to the mobile `Card`.

### WR-04: Mobile drag handle is missing `touch-action: none`, risking unreliable touch dragging

**File:** `components/admin/package-list-card.tsx:131-146`
**Issue:** `PackageListCard` is the mobile-only render path for package drag-reordering (rendered inside the `md:hidden` block of `sortable-package-list.tsx:138-160`), and `useSensors` in that file only configures `PointerSensor` + `KeyboardSensor` — no `TouchSensor`, and a repo-wide grep confirms no `touch-action`/`touchAction` is set anywhere in application source. dnd-kit's own documentation calls out that without `touch-action: none` on the draggable handle, the browser's native touch-scroll gesture can win the race against `PointerSensor` and prevent or make unreliable drag activation on touch devices — the exact audience this phase's mobile card targets.
**Fix:**
```tsx
<button
  type="button"
  className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-muted"
  style={{ touchAction: "none" }}
  {...attributes}
  {...listeners}
/>
```
Verify drag-to-reorder on an actual touch device/emulator before shipping.

### WR-05: Mobile "..." actions menu tap target is far smaller than the drag handle on the same card

**File:** `components/admin/package-list-card.tsx:186-192`, `components/admin/users-table.tsx:207-213`
**Issue:** Both mobile cards deliberately size their drag handle / trigger tap targets at `size-11` (44px, matching this phase's sidebar tap-target work — see `app/admin/(dashboard)/layout.tsx:105`, `SidebarTrigger className="size-11"`), but the "..." actions `DropdownMenuTrigger` on the same card uses `Button size="icon-sm"`, which resolves to `size-7` (28px, per `components/ui/button.tsx:31-32`). On a touch surface this is a meaningfully smaller, harder-to-hit control than everything else on the card, well under commonly-cited ~44px minimum touch-target guidance.
**Fix:**
```tsx
<DropdownMenuTrigger render={<Button variant="ghost" className="size-11" />}>
```

### WR-06: "Deactivate account" dialog can render its description without the account name mid-close

**File:** `components/admin/users-table.tsx:282-294`
**Issue:** `AlertDialog open={deactivatingAccount !== null} onOpenChange={(open) => !open && setDeactivatingAccount(null)}` (line 284) clears `deactivatingAccount` to `null` synchronously the instant the dialog starts closing (Cancel, Escape, or backdrop click). `AlertDialogDescription` reads `deactivatingAccount?.name ?? deactivatingAccount?.email` (line 290), both of which become `undefined` the moment `deactivatingAccount` is `null` — so during the `data-closed` exit animation (`alert-dialog.tsx`'s `duration-100 ... data-closed:animate-out`) the popup is still visible while the description re-renders to "  will be signed out immediately..." with the subject's name/email missing.
**Fix:** Retain the last-selected account for display until the dialog has actually closed, e.g. don't clear synchronously in `onOpenChange` — clear only after `handleDeactivate` succeeds, or delay the clear until the close transition ends.

## Info

### IN-01: Shared `isPending` flag disables both switches on unrelated mutations

**File:** `components/admin/package-list-card.tsx:66, 164-178`
**Issue:** `handlePublishChange` and `handleFeatureChange` both run inside the same `useTransition()` (line 66), and both `Switch` components read `disabled={isPending}`. Toggling "Published" therefore also disables the unrelated "Featured" switch (and vice versa) until the in-flight mutation resolves. Same pattern exists in `package-list-row.tsx` (not in this phase's scope).
**Fix:** Use two independent `useTransition()` instances if independent enable/disable behavior is desired.

### IN-02: Redundant Tailwind utility in `Card`

**File:** `components/ui/card.tsx:15`
**Issue:** The class list applies `has-data-[slot=card-footer]:pb-0` unconditionally, then separately appends `data-[size=sm]:has-data-[slot=card-footer]:pb-0`. The size-scoped variant is a no-op — the unconditional class already covers the `size=sm` case with the same property/value, so it never changes rendered output.
**Fix:** Remove the redundant `data-[size=sm]:has-data-[slot=card-footer]:pb-0` segment.

### IN-03: Gallery thumbnail/carousel items keyed by URL assume photo URLs are unique per package

**File:** `components/packages/package-gallery.tsx:35, 63`
**Issue:** Both the thumbnail grid and the carousel key on `photo.url`. If a package ever has the same photo URL assigned to two gallery slots, React will emit duplicate-key warnings and the duplicate entries may not update independently.
**Fix:** Key by `${photo.url}-${index}` or a stable per-photo id if one exists upstream.

### IN-04: `AdminContactListItem.phone` is defined but never rendered

**File:** `components/admin/crm-table.tsx:55`
**Issue:** The `phone: string | null` field is part of the exported `AdminContactListItem` type and is populated by the caller (`crm/page.tsx`), but no column or mobile-card field in `CrmTable` ever displays it — dead data being passed through, or a column intended for the mobile pass that got dropped.
**Fix:** Either surface phone (e.g., under email in the mobile card) or drop the unused field from the type/query.

### IN-05: Desktop/mobile permission and status badge JSX duplicated within `users-table.tsx`

**File:** `components/admin/users-table.tsx:138-155` vs `237-251`, and `157-165` vs `252-256`
**Issue:** The permission-badge block (`Packages`/`Messages`/`CRM`/`All`) and the active/inactive status `Badge` are each written out twice — once for the desktop `<TableCell>`, once for the mobile `<Card>` — with identical conditional logic and copy.
**Fix:** Extract a small `<AccountBadges profile={profile} />` subcomponent used by both render paths.

### IN-06: `PackageListCard` and `PackageListRow` duplicate ~150 lines of business logic verbatim

**File:** `components/admin/package-list-card.tsx:42-125` (cross-referenced against `components/admin/package-list-row.tsx:42-125`, the direct desktop counterpart rendered by `sortable-package-list.tsx`)
**Issue:** `GENERIC_ERROR_MESSAGE`, the `useSortable`/`useState`/`useTransition` wiring, and all three handlers (`handlePublishChange`, `handleFeatureChange`, `handleDelete`) are copy-pasted identically between the two files — only the surrounding JSX (table row vs. card) differs. A future fix to any handler has to be made twice and can silently drift if one copy is missed.
**Fix:** Extract a shared hook (e.g. `usePackageListItemActions(item, onMutated, onDeleted)`) that both components call, keeping only the presentational JSX distinct.

### IN-07: Fragile non-null assertion to locate the checkbox cell on the mobile CRM card

**File:** `components/admin/crm-table.tsx:307-309`
**Issue:** `row.getVisibleCells().find((cell) => cell.column.id === "select")!` uses a non-null assertion. Safe today (no `columnVisibility` state exists on this table), but a latent crash if column visibility is ever introduced and the "select" column becomes hideable.
**Fix:** Derive the checkbox directly via a small shared helper reused by both the column def and the mobile card, instead of searching `getVisibleCells()` by id and asserting.

### IN-08: Dragged mobile package card has no `zIndex` elevation while dragging

**File:** `components/admin/package-list-card.tsx:68-72`
**Issue:** The inline `style` object sets `transform`, `transition`, and `opacity` but not `zIndex`. During a drag gesture, the actively-dragged card can render beneath a still-stationary sibling card — a common dnd-kit visual glitch when `zIndex` isn't elevated for the dragged node.
**Fix:**
```tsx
const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.6 : 1,
  zIndex: isDragging ? 1 : undefined,
};
```

---

_Reviewed: 2026-07-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
