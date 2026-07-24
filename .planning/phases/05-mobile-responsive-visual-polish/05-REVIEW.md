---
phase: 05-mobile-responsive-visual-polish
reviewed: 2026-07-24T15:53:04Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - app/admin/(dashboard)/layout.tsx
  - app/admin/(dashboard)/packages/loading.tsx
  - app/admin/(dashboard)/users/loading.tsx
  - components/admin/crm-table.tsx
  - components/admin/package-list-card.tsx
  - components/admin/sortable-package-list.tsx
  - components/admin/users-table.tsx
  - components/packages/package-gallery.tsx
  - components/ui/card.tsx
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-07-24T15:53:04Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the mobile-responsive/visual-polish changes to the admin shell (sidebar layout, loading skeletons), the CRM contacts table, package list (desktop table + mobile card + drag-reorder), the users table, the public package photo gallery, and the base `Card` primitive. No critical/security-level defects were found — no injection, XSS, secret leakage, or auth bypass in these files, and the responsive dual-render pattern (desktop `<Table>` / mobile `<Card>` list) is applied consistently and correctly gated behind `md:` breakpoints in each of `crm-table.tsx`, `sortable-package-list.tsx`, and `users-table.tsx`.

The main concerns are (1) a stale-state bug in `SortablePackageList` where the package list silently stops reflecting server data after the first `router.refresh()`, (2) near-total logic duplication between the desktop `PackageListRow` and mobile `PackageListCard` components (confirmed by reading `components/admin/package-list-row.tsx`, which is not in this phase's file list but is the direct desktop counterpart), and (3) a React-key correctness gap in `CrmTable`'s tag rendering that is reachable given the actual (non-deduplicating) tag-entry form upstream. None of these are exploitable/security issues, but items 1 and 3 are genuine functional defects, not just style nits.

## Warnings

### WR-01: `SortablePackageList` never re-syncs with fresh server data after mount

**File:** `components/admin/sortable-package-list.tsx:50`
**Issue:** `items` is seeded once via `useState(initialItems)` (line 50) and there is no `useEffect` (or any other mechanism) that re-syncs it when the `initialItems` prop changes on a parent re-render. `handleMutated()` (line 86-88) calls `router.refresh()` after a publish/feature toggle succeeds (invoked from `PackageListCard`/`PackageListRow`'s `onMutated`), which re-runs the `page.tsx` Server Component and passes a fresh `items` array as `initialItems` — but because `SortablePackageList` stays mounted (same position in the tree, no `key` change), React does **not** re-initialize the `useState` call, so the new data is silently dropped.
In practice this means: a package added, removed, or reordered by another admin/tab, or any list-level change other than the `handleDeleted` local filter (line 90-92) which is the only mutation that actually patches `items` locally, will not appear until the user does a hard navigation away from and back to `/admin/packages`. This is a classic "copying props into state without syncing" bug.
**Fix:**
```tsx
// Option A: sync on prop change
useEffect(() => {
  setItems(initialItems);
}, [initialItems]);

// Option B (preferred): don't fork state at all — key the component on a
// server-provided version/count so React remounts it when data changes,
// or lift only the transient drag-order into local state and keep the
// authoritative list from props.
```

### WR-02: Duplicate React keys possible in `CrmTable` tag lists

**File:** `components/admin/crm-table.tsx:136, 338`
**Issue:** Both the desktop cell (`{row.original.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}`, line ~135-139) and the mobile card (line ~337-341) key tag badges by the tag string itself, assuming tags are unique per contact. They are not: `components/admin/contact-edit-form.tsx` builds the tags array with `values.tags.split(",").map(t => t.trim()).filter(Boolean)` and performs no de-duplication, so an admin typing `"vip, vip"` (or pasting a duplicate) produces `["vip", "vip"]`, which reaches `CrmTable` unmodified via `AdminContactListItem.tags`. Duplicate keys cause React reconciliation warnings and can lead to incorrect/inconsistent re-renders of the affected badges.
**Fix:** Key by index in combination with the tag (`key={`${tag}-${i}`}`), or de-duplicate tags at the source in `contact-edit-form.tsx`'s submit handler (`tags = [...new Set(tags)]`), which also fixes the underlying data-quality issue rather than just papering over the symptom in the renderer.

### WR-03: `PackageListCard` and `PackageListRow` duplicate ~150 lines of business logic verbatim

**File:** `components/admin/package-list-card.tsx:1-125` (cross-referenced against `components/admin/package-list-row.tsx:1-125`, not in this phase's scope but the direct desktop counterpart rendered by `sortable-package-list.tsx`)
**Issue:** `GENERIC_ERROR_MESSAGE`, the `useSortable`/`useState`/`useTransition` wiring, and all three handlers (`handlePublishChange`, `handleFeatureChange`, `handleDelete`) are copy-pasted identically between the two files — only the surrounding JSX (table row vs. card) differs. Any future bug fix (e.g., an error-handling change, a new field on the toggle payload, an analytics call) has to be made twice and will silently drift if one copy is missed. This is exactly the kind of duplication the desktop/mobile split invites and should be centralized.
**Fix:** Extract a shared hook, e.g.:
```tsx
function usePackageListItemActions(
  item: AdminPackageListItem,
  onMutated: () => void,
  onDeleted: (id: string) => void
) {
  const [isPublished, setIsPublished] = useState(item.isPublished);
  const [isFeatured, setIsFeatured] = useState(item.isFeatured);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // ...handlePublishChange / handleFeatureChange / handleDelete here...
  return { isPublished, isFeatured, isDeleteOpen, setIsDeleteOpen, isPending, handlePublishChange, handleFeatureChange, handleDelete };
}
```
and have both `PackageListCard` and `PackageListRow` call it, keeping only the presentational JSX distinct.

### WR-04: `CrmTable`'s empty-state branch is unreachable given its only call site, leaving a silent gap if reused

**File:** `components/admin/crm-table.tsx:198-199, 250-351`
**Issue:** `hasNoMatches = hasContacts && rows.length === 0` (lines 198-199) only shows the "No contacts match your search" empty state when `contacts.length > 0` but the *filtered* result set is empty. If `contacts` itself is empty (`hasContacts === false`), the code falls through to the `else` branch and renders the full table/card shell with zero rows and no "no contacts" messaging at all — a bare header row on desktop and nothing on mobile. Today this path is masked because the only caller, `app/admin/(dashboard)/crm/page.tsx`, already guards `items.length === 0` before ever mounting `CrmTable`, so `contacts` is never actually empty in production. But `CrmTable` is an exported component with a general-purpose prop contract, and this gap is silent: nothing in its own logic handles the genuinely-empty case, so any future caller (or a future edit to the guard in `page.tsx`) reintroduces a blank, unexplained UI with no compiler or runtime signal.
**Fix:** Make `CrmTable` self-sufficient regardless of caller behavior — collapse the condition to `rows.length === 0` and vary the copy based on whether filters are active:
```tsx
const hasActiveFilters = globalFilter !== "" || columnFilters.length > 0;
const showEmptyState = rows.length === 0;
// ...
{showEmptyState ? (
  <EmptyState
    title={hasActiveFilters ? "No contacts match your search" : "No contacts yet"}
    description={hasActiveFilters ? "Try a different name, status, or tag." : "Contacts appear here automatically as soon as someone submits an inquiry."}
    action={hasActiveFilters ? <Button onClick={handleClearFilters}>Clear filters</Button> : null}
  />
) : ( ... )}
```

## Info

### IN-01: Shared `isPending` flag disables both switches on unrelated mutations

**File:** `components/admin/package-list-card.tsx:63-108, 164-178`
**Issue:** `handlePublishChange` and `handleFeatureChange` both run inside the same `useTransition()` (line 66), and both `Switch` components read `disabled={isPending}` (lines 167, 177). Toggling "Published" therefore also disables the unrelated "Featured" switch (and vice versa) until the in-flight mutation resolves. Not incorrect, but a minor UX inconsistency — a user may perceive the Featured switch as unresponsive while only Published is loading. Same pattern exists in `package-list-row.tsx`.
**Fix:** Use two independent `useTransition()` instances (one per switch) if independent enable/disable behavior is desired.

### IN-02: Redundant Tailwind utility in `Card`

**File:** `components/ui/card.tsx:15`
**Issue:** The base class list already applies `has-data-[slot=card-footer]:pb-0` unconditionally. The `data-[size=sm]:has-data-[slot=card-footer]:pb-0` variant appended right after it (still on line 15) is a no-op — the unconditional class already covers the `size=sm` case, so the size-scoped duplicate never changes behavior.
**Fix:** Remove the redundant `data-[size=sm]:has-data-[slot=card-footer]:pb-0` segment.

### IN-03: Gallery thumbnail/carousel items keyed by URL assume photo URLs are unique per package

**File:** `components/packages/package-gallery.tsx:35, 63`
**Issue:** Both the thumbnail grid (`key={photo.url}`, line 35) and the carousel (`key={photo.url}`, line 63) key on the photo URL. If a package ever ends up with the same photo URL assigned twice (e.g., an admin re-selects the same uploaded file for two gallery slots), React will emit duplicate-key warnings and the two duplicate entries may not update independently.
**Fix:** Key by index (`key={`${photo.url}-${index}`}`) or a stable per-photo id if one exists upstream in the photos table.

### IN-04: `AdminContactListItem.phone` is defined but never rendered

**File:** `components/admin/crm-table.tsx:55`
**Issue:** The `phone: string | null` field is part of the exported `AdminContactListItem` type and is populated by the caller (`crm/page.tsx`), but no column or card field in `CrmTable` ever displays it. Either dead data being passed through for no reason, or a missing column that was intended for the mobile-polish pass.
**Fix:** Either add a phone display (e.g., in the mobile card under email) or drop the field from the type/query if genuinely unused by this component.

### IN-05: Desktop/mobile permission and status badge JSX duplicated within the same file

**File:** `components/admin/users-table.tsx:138-155` vs `231-251`, and `157-165` vs `252-256`
**Issue:** The permission-badge block (`Packages`/`Messages`/`CRM`/`All`) and the active/inactive status `Badge` are each written out twice — once for the desktop `<TableCell>` and once for the mobile `<Card>` — with identical conditional logic and copy. Lower risk than WR-03 since it's local to one file and both copies are easy to spot together, but still a maintenance smell.
**Fix:** Extract a small `<AccountBadges profile={profile} />` subcomponent used by both the desktop and mobile render paths.

---

_Reviewed: 2026-07-24T15:53:04Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
