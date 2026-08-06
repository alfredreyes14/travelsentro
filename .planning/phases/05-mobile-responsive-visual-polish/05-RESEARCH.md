# Phase 5: Mobile Responsive & Visual Polish - Research

**Researched:** 2026-07-24
**Domain:** CSS responsive/zoom reflow, admin data-table→card retrofit, shadcn/ui polish
**Confidence:** MEDIUM-HIGH (codebase-verified for architecture; WCAG/library patterns externally cited)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Public Site Responsiveness**
- **D-01:** Primary driver is a concrete, reported bug: the public site layout does not reflow correctly when the browser's zoom level is changed (distinct from device-width media queries, which is what PUBL-09 already validated in Phase 1). Treat this as a site-wide audit across all public pages (package list, package detail, inquiry/Contact Us form) — not a single-page fix.
- **D-02:** Acceptance bar for the zoom fix: no horizontal overflow and no overlapping elements up to 200% browser zoom (WCAG reflow-style bar), verified across all public pages.

**Admin Data Tables**
- **D-03:** `crm-table.tsx`, the packages table, and the users table switch to a stacked-card layout below the mobile breakpoint — not horizontal-scroll-only, not progressive column-hiding.
- **D-04:** Bulk row-selection (checkboxes) for messaging (MSG-03/MSG-04's bulk email/SMS) must be preserved in the mobile card layout — same multi-select-then-bulk-send flow as desktop, not a desktop-only feature.

**Admin Sidebar Navigation**
- **D-05:** Keep the existing shadcn `SidebarProvider` slide-out drawer pattern for mobile (already functional via built-in `useIsMobile()`) — no bottom tab bar. Scope is polish only: trigger placement, tap targets, open/close feel.

**Styling Scope**
- **D-06:** "Enhanced styling" means deeper polish within the existing locked brand system — `#021F4A` navy / `#F49314` marigold / `#FAF7F2` sand, Inter + Plus Jakarta Sans, weights 400/600 only. No palette or typography changes.
- **D-07:** Priority polish targets (all in scope): empty & loading states (tables/lists currently show bare states while loading or when empty), spacing & visual rhythm, hover/focus/active interactive states, and shadows/depth for cards/dialogs/dropdowns.

### Claude's Discretion
- Exact mobile breakpoint values (e.g., Tailwind's default `sm`/`md`) for switching table↔card layout and for sidebar drawer collapse — use standard Tailwind breakpoints unless research surfaces a reason to diverge.
- Specific shadow/elevation scale, skeleton-loading component choice, and hover/focus token values — implement using the Tailwind/shadcn conventions already established across Phases 1–4.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

**Aside (not phase scope, flagged for cleanup):** `.planning/debug/admin-brand-color-hierarchy-inverted.md` is a stale, uncommitted debug artifact describing a brand-color hierarchy bug that was already fixed in commits `f923f06`/`29c819e` (per git log on `app/globals.css` and `02-UI-SPEC.md`). Safe to delete; not an open issue for this phase.
</user_constraints>

## Summary

This is a retrofit phase with no new libraries to introduce — everything needed (`@tanstack/react-table`, `@dnd-kit/*`, shadcn `Card`/`Table`/`Skeleton`/`Sidebar`, Tailwind v4) is already installed and in use. The work is entirely CSS/markup restructuring plus one concrete, locatable bug fix.

Direct codebase inspection surfaced a strong, verifiable root-cause candidate for the reported zoom-reflow bug: `components/packages/package-gallery.tsx`'s lightbox carousel navigation buttons are positioned with `sm:-left-12`/`sm:-right-12` (48px negative offsets, pushing them outside the Dialog's own `max-w-[calc(100%-2rem)]` boundary). At high browser zoom on a `sm:max-w-2xl` dialog, these offsets place the buttons partially or fully outside the visual viewport, which is exactly the "content overlaps or requires horizontal scroll" failure mode WCAG 1.4.10 Reflow tests for. No other public-page component (grid layouts, header/footer nav, forms) shows fixed-px-width or viewport-unit anti-patterns — the rest of the public site already uses fluid `max-w-*` + `flex-wrap`/`grid-cols-1 sm:grid-cols-2` patterns that should reflow correctly under zoom. The Next.js default viewport meta tag (`width=device-width, initial-scale=1`) is in effect project-wide — nothing disables pinch/zoom.

For the admin retrofit: `crm-table.tsx` is the only true `@tanstack/react-table` instance (with `enableRowSelection`) — the "packages table" is actually a `@dnd-kit/sortable`-driven `<Table>` with **no** TanStack Table involved, and the "users table" is a plain, unlibrary'd `<Table>`. All three need independent card-breakpoint treatment; dnd-kit's `useSortable()` is markup-agnostic (its `attributes`/`listeners`/`setNodeRef`/`transform`/`transition` return values attach to *any* element), so the packages list's drag-to-reorder can move from `<TableRow>` to `<Card>` without touching drag logic. The sidebar (`components/ui/sidebar.tsx`) already has a complete, working `useIsMobile()` (768px) → `Sheet`-based drawer implementation; scope here is genuinely CSS-only polish, not new logic. Skeleton loading states exist for `/admin/crm` and `/admin/crm/[id]` only — `/admin/packages` and `/admin/users` have no `loading.tsx` at all, a concrete, verifiable gap for D-07.

**Primary recommendation:** Fix the gallery lightbox nav-button overflow first (cheapest, most concrete zoom-reflow fix), then do a systematic 200%-zoom pass over all 5 public routes using Chrome DevTools' device toolbar zoom (not just the responsive-width simulator, which does not reproduce zoom-specific reflow bugs). For the admin retrofit, build one shared `useIsMobile()`-driven (or CSS-only `md:hidden`/`hidden md:block`) pattern reused across all three tables so `crm-table.tsx`, `sortable-package-list.tsx`, and `users-table.tsx` switch at the same `768px`/`md` breakpoint the sidebar already uses — do not invent a second breakpoint definition.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Zoom-reflow layout fix (public site) | Browser / Client (CSS) | — | Pure CSS positioning/sizing issue; no server or data-layer involvement. |
| Table→card responsive breakpoint | Browser / Client (CSS + React conditional render) | — | Rendering decision based on viewport width; row-selection state already lives client-side in each table component. |
| Bulk-select checkbox flow in card mode | Browser / Client (React state) | API / Backend (unchanged) | `rowSelection`/`enableRowSelection` state and the `MessageComposeDialog` trigger stay client-side; the Server Actions they call (`sendBulkEmail`/`sendBulkSms`) are untouched by this phase. |
| Sidebar drawer polish | Browser / Client (CSS) | — | `SidebarProvider`/`useIsMobile()` logic already correct; only Tailwind class changes needed. |
| Empty/loading state coverage | Frontend Server (SSR `loading.tsx`) + Browser (Skeleton component) | — | Next.js App Router `loading.tsx` files are server-rendered route-level Suspense boundaries; the `Skeleton` primitive itself is a plain client-agnostic div. |
| Shadow/depth/hover-focus-active tokens | Browser / Client (CSS via `app/globals.css` tokens) | — | Must reuse existing `--card`, `ring-foreground/10`, `shadow-md`/`shadow-lg` conventions already established in `dialog.tsx`/`dropdown-menu.tsx`/`select.tsx` — no new token system. |

## Package Legitimacy Audit

**Not applicable.** This phase installs no new packages — all libraries used (`@tanstack/react-table@8.21.3`, `@dnd-kit/core`/`@dnd-kit/sortable`, `@base-ui/react`-backed shadcn primitives, `tailwindcss@4`) are already present in `package.json` and already vetted in Phases 1–4. `npm ls @tanstack/react-table @dnd-kit/core @dnd-kit/sortable` confirms all three resolve in `node_modules` — no `npm install` step belongs in this phase's plan.

## Standard Stack

### Core (already installed — no version changes needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-table` | ^8.21.3 [VERIFIED: package.json] | Headless table logic for `crm-table.tsx` (sorting/filtering/`enableRowSelection`) | Already wired; headless design means switching the *rendering* from `<Table>` to `<Card>` requires zero changes to `useReactTable()` config — only `flexRender`/JSX output changes. |
| `@dnd-kit/core` + `@dnd-kit/sortable` | (installed, version not re-pinned in this research) [VERIFIED: package.json] | Drag-reorder for the packages list | `useSortable()`'s returned `attributes`/`listeners`/`setNodeRef`/`transform`/`transition` are plain props/refs — attach to a `<Card>` exactly as they currently attach to `<TableRow>` in `package-list-row.tsx`. No new dnd-kit API needed for card mode. |
| `tailwindcss` | ^4 [VERIFIED: package.json] | Responsive breakpoints, all styling | CSS-first `@theme` config in `app/globals.css` — confirmed no `--breakpoint-*` overrides present, so this project uses Tailwind's stock breakpoints: `sm` 640px/40rem, `md` 768px/48rem, `lg` 1024px/64rem, `xl` 1280px/80rem, `2xl` 1536px/96rem [CITED: tailwindcss.com/docs/responsive-design]. |
| shadcn/ui `Skeleton` | installed [VERIFIED: components/ui/skeleton.tsx] | Loading placeholders | Trivial `animate-pulse bg-muted` div — already used correctly in `app/admin/(dashboard)/crm/loading.tsx`; same pattern needs replicating for `packages/loading.tsx` and `users/loading.tsx` (currently absent). |
| shadcn/ui `Sidebar` (`SidebarProvider`/`Sidebar`/`SidebarTrigger`) | installed [VERIFIED: components/ui/sidebar.tsx] | Admin drawer nav | `useIsMobile()` hook (`hooks/use-mobile.ts`) hardcodes `MOBILE_BREAKPOINT = 768`, matching Tailwind's `md`. Mobile path already renders via `Sheet` (a proper focus-trapped, ESC-closable drawer) — no rebuild needed, D-05 confirmed polish-only. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind `@container` queries (already used in `card.tsx`'s `CardHeader`: `@container/card-header`) | built into Tailwind v4 | Optional: size card-internal layout by the card's own width rather than the viewport, if a table→card component is reused in more than one width context | Not required for this phase's fixed full-width admin card lists, but available if a card layout needs to work both full-width and in a future narrower container. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Card-per-row conditional render (`md:hidden`/`hidden md:block` twin markup) | CSS-only responsive table (`display: block` row transforms via `::before` pseudo-labels) | The CSS-only "responsive table" trick (no duplicate markup) is a known pattern, but D-03 explicitly rejects "progressive column-hiding" and implies a genuinely different card layout (photo/avatar, stacked fields) — twin-markup (render two JSX branches gated by breakpoint or by `useIsMobile()`) is more flexible for that visual redesign and is the pattern already implicitly established by `useIsMobile()` existing in this codebase. |
| Duplicate JSX per breakpoint (`useIsMobile()` conditional) | CSS-only `hidden md:block` / `block md:hidden` twin markup, no JS hook | Prefer the CSS-only twin-markup approach for the three tables: it avoids a hydration-mismatch flash (SSR renders both, CSS hides one) that `useIsMobile()`'s client-only `window.innerWidth` check causes on first paint. Reserve `useIsMobile()`-style JS hooks for cases needing behavior (not just layout) branching. |

**Installation:** None — no new packages required for this phase.

## Architecture Patterns

### System Architecture Diagram

```
Browser viewport / zoom level
        │
        ▼
┌───────────────────────────────────────────────┐
│  Tailwind responsive CSS (md: 768px breakpoint) │
│  ─ decides which of two markup branches renders │
└───────────────────────────────────────────────┘
        │                              │
        ▼ (< md)                       ▼ (>= md)
┌─────────────────────┐      ┌─────────────────────┐
│  Card-stack layout    │      │  <Table> layout       │
│  (Card + CardContent) │      │  (existing Table.tsx)  │
└─────────────────────┘      └─────────────────────┘
        │                              │
        └──────────────┬───────────────┘
                        ▼
        Shared row-selection state (rowSelection
        from useReactTable, or local useState for
        the two non-TanStack tables) — same
        Checkbox components, same onCheckedChange
        handlers, rendered inside whichever branch
        is visible.
                        │
                        ▼
        "N selected" bulk action bar (existing,
        unchanged) → MessageComposeDialog (bulk
        mode) → existing sendBulkEmail/sendBulkSms
        Server Actions (untouched by this phase)
```

### Recommended Project Structure

No new directories. Card-mode rendering branches live inside the existing table components:

```
components/admin/
├── crm-table.tsx            # add card-mode branch inside existing component
├── sortable-package-list.tsx # add card-mode branch; useSortable() attaches to Card instead of TableRow
├── package-list-row.tsx     # split into TableRow variant + new PackageListCard variant, sharing the same useSortable() hook call site pattern
├── users-table.tsx          # add card-mode branch
```

### Pattern 1: Twin-markup responsive table/card (no hook, CSS-only)
**What:** Render both the `<Table>` and the card-stack markup unconditionally; hide one via Tailwind `hidden md:block` (table) / `md:hidden` (cards). Both share the same data array and the same `rowSelection`/`onCheckedChange` state.
**When to use:** For `crm-table.tsx` and `users-table.tsx`, where there's no drag-and-drop context to duplicate.
**Example:**
```tsx
// Source: pattern derived from TanStack Table community discussion
// (github.com/TanStack/table discussion #4700 "render row as a card
// instead of table") + this codebase's existing table.tsx overflow-x-auto wrapper
<>
  <div className="hidden overflow-hidden rounded-xl border border-border md:block">
    <Table>{/* existing TableHeader/TableBody, unchanged */}</Table>
  </div>
  <div className="flex flex-col gap-3 md:hidden">
    {rows.map((row) => (
      <Card key={row.id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(c) => row.toggleSelected(!!c)}
            aria-label="Select contact"
          />
          {/* name, status badge, tags — same data, card-shaped layout */}
        </div>
      </Card>
    ))}
  </div>
</>
```

### Pattern 2: dnd-kit `useSortable()` attached to a Card (packages list, card mode)
**What:** The same `useSortable({ id: item.id })` call already used in `package-list-row.tsx` returns props/refs that are element-agnostic — reuse them verbatim on a `<Card>` node.
**When to use:** `sortable-package-list.tsx` / a new `PackageListCard` sibling to `PackageListRow`.
**Example:**
```tsx
// Source: dndkit.com/concepts/sortable — useSortable() attributes/listeners
// are plain HTML props, not TableRow-specific
function PackageListCard({ item, onMutated, onDeleted }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <Card ref={setNodeRef} style={style} className="p-4">
      <div className="flex items-center gap-3">
        <button type="button" className="..." {...attributes} {...listeners}>
          <GripVerticalIcon />
        </button>
        {/* photo, name, Published/Featured switches, actions menu */}
      </div>
    </Card>
  );
}
```
Note: `DndContext`/`SortableContext` wrap the *list*, not individual rows — the card-mode branch stays inside the same `DndContext`/`SortableContext` pair already in `sortable-package-list.tsx`, just rendering `PackageListCard` instead of `PackageListRow` when `md:hidden` is active.

### Pattern 3: Fix zoom-reflow overflow (gallery lightbox)
**What:** Negative-offset absolutely-positioned buttons (`sm:-left-12`/`sm:-right-12`) escape their container's `max-w-[calc(100%-2rem)]` boundary at high zoom.
**When to use:** `components/packages/package-gallery.tsx` `CarouselPrevious`/`CarouselNext` usage, and audit any other component using `-left-12`/`-right-12`/negative-inset utilities inside a width-constrained ancestor.
**Fix approach:** Constrain the buttons within the dialog's padding box (e.g., `left-2`/`right-2` at all breakpoints instead of `sm:-left-12`/`sm:-right-12`), or increase the dialog's own horizontal padding/`max-w` to accommodate the offset without escaping the visual viewport. Verify fix by testing at 200% zoom with DevTools' zoom control (not the device-width simulator).

### Anti-Patterns to Avoid
- **Testing "zoom" via DevTools responsive-mode width shrinking:** This simulates a narrower *viewport*, not an actual OS/browser zoom level, and will not reproduce this bug class (fixed-offset elements escaping a percentage-constrained container). Use actual browser zoom (Cmd/Ctrl + `+`) or DevTools' Rendering panel zoom, not the device toolbar's width field.
- **Introducing a second "isMobile" breakpoint definition:** `hooks/use-mobile.ts` already hardcodes 768px matching Tailwind's `md`. Any new card-breakpoint logic must use `md:` Tailwind classes (or import `useIsMobile()` if JS branching is unavoidable) — never hardcode a different pixel value like 640 or 900.
- **`overflow: scroll` instead of `overflow: auto`/`overflow-x-auto`:** Forces a visible scrollbar track even with no overflow, which itself narrows the effective content width and can cause secondary reflow bugs [CITED: web search finding, Smashing Magazine viewport-units article]. The existing `table.tsx` wrapper already correctly uses `overflow-x-auto`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mobile drawer / off-canvas nav | A custom slide-out `<div>` + backdrop + focus trap | Existing `SidebarProvider`/`Sheet`-backed `Sidebar` (already built, D-05 confirms reuse) | Already handles focus trap, ESC-to-close, click-outside, and cookie-persisted open state — rebuilding any of this is pure regression risk for zero benefit. |
| Drag-and-drop reordering in card mode | A new pointer-event drag implementation for cards | `@dnd-kit/sortable`'s existing `useSortable()` (already wired to `package-list-row.tsx`) | dnd-kit is explicitly markup-agnostic; the sensor/keyboard/touch handling is already correct and accessible (keyboard sensor via `sortableKeyboardCoordinates`) — do not fork drag logic per breakpoint. |
| Loading skeletons | Custom shimmer CSS/spinners | Existing shadcn `Skeleton` component + Next.js `loading.tsx` route convention (already the pattern in `crm/loading.tsx`) | `Skeleton` is a two-line `animate-pulse bg-muted` div; matching column/row shapes to the real table for `packages/loading.tsx` and `users/loading.tsx` is templating work, not a new component. |
| Zoom/reflow detection | A custom JS `matchMedia`/`window.devicePixelRatio` zoom-detection hook | Standard responsive CSS (media queries via Tailwind breakpoints) + WCAG 1.4.10 manual test protocol | Browser zoom already triggers the same CSS media-query recalculation as a narrower viewport in modern browsers — the fix is fluid/percentage layout, not zoom-level detection JS. |

**Key insight:** Every capability this phase needs (drawer, drag-reorder, skeleton, headless table state) is already installed and correctly implemented at the *logic* layer in this codebase. The entire phase is CSS/markup retrofit work, not new engineering — treat any task that proposes a new dependency or a new state-management pattern as a scope-creep red flag.

## Common Pitfalls

### Pitfall 1: Gallery lightbox nav buttons escape dialog bounds at zoom
**What goes wrong:** `PackageGallery`'s `CarouselPrevious`/`CarouselNext` use `left-2 sm:-left-12` / `right-2 sm:-right-12` (from `package-gallery.tsx`), placing the buttons 48px outside the Dialog's left/right edge at `sm:` and above. The Dialog itself is capped at `max-w-[calc(100%-2rem)]` (from `dialog.tsx`), which normally leaves a 1rem gutter — but at high zoom that gutter's *effective CSS-px* margin shrinks relative to the fixed 48px (`-left-12` = `-3rem` = 48px) offset, since `rem`-based Tailwind spacing scales with browser zoom identically to `px`-equivalent viewport width, but the *dialog's percentage-based max-width* is computed against the zoomed (shrunk) viewport while the button's negative offset is a large fraction of that already-shrunk width. Net effect: the button can render partially off the visible viewport edge, producing exactly WCAG 1.4.10's "content overlaps or requires horizontal scrolling" failure.
**Why it happens:** Negative-offset absolutely-positioned children were designed assuming ample surrounding whitespace at desktop zoom (100%); they were never tested against WCAG's 200%/400% zoom bar.
**How to avoid:** Constrain carousel nav buttons inside the dialog's own padding box at all breakpoints (`left-2`/`right-2` without the negative `sm:` override), or verify explicitly at 200% zoom that the negative offset still lands inside the viewport.
**Warning signs:** Any `-left-N`/`-right-N`/`-top-N`/`-bottom-N` Tailwind utility on an element inside a `max-w-[...]`-constrained ancestor.

### Pitfall 2: Assuming `useIsMobile()`'s SSR mismatch is harmless
**What goes wrong:** `useIsMobile()` (`hooks/use-mobile.ts`) initializes via `getIsMobile()`, which returns `false` when `typeof window === "undefined"` (i.e., during SSR) regardless of actual client width, then corrects itself in a `useEffect` after hydration. If new card-breakpoint logic reuses this hook (rather than pure CSS `hidden md:block`), every admin page will briefly flash the desktop table layout on load before snapping to cards on narrow/mobile viewports.
**Why it happens:** `window` is unavailable during server rendering; the hook can only guess `false` (desktop) as a safe default and correct after mount.
**How to avoid:** Prefer the CSS-only twin-markup pattern (Pattern 1 above) for the table→card switch — it has zero hydration flash because both branches render identically on server and client, with pure CSS `display` toggling. Reserve `useIsMobile()` for cases (like the sidebar's `Sheet` vs. inline rendering) where the *component tree itself* must differ, not just its visibility.
**Warning signs:** A visible layout "pop" from table to cards immediately after page load on mobile devices.

### Pitfall 3: Packages/Users routes have no loading.tsx (empty-state gap for D-07)
**What goes wrong:** `/admin/packages` and `/admin/users` render with a blank white flash while the initial Supabase query resolves, because — unlike `/admin/crm`, which has `app/admin/(dashboard)/crm/loading.tsx` — no `loading.tsx` exists for these two routes.
**Why it happens:** The `loading.tsx` Next.js App Router convention was added ad hoc for CRM in Phase 3 and never retrofitted to Phases 2's packages/users pages.
**How to avoid:** Add `app/admin/(dashboard)/packages/loading.tsx` and `app/admin/(dashboard)/users/loading.tsx` mirroring `crm/loading.tsx`'s `Skeleton`-based structure, shaped to each page's actual column layout (packages: drag-handle + thumbnail + name + two switches + actions; users: name + email + role badge + permission badges + status + actions).
**Warning signs:** Grep for `loading.tsx` under `app/admin/(dashboard)/` and confirm one exists per route segment that does a server-side data fetch.

### Pitfall 4: Card component has no shadow, only a ring — "add shadows" scope could silently break the established depth convention
**What goes wrong:** `components/ui/card.tsx` currently uses `ring-1 ring-foreground/10` for definition, with **no** `shadow-*` utility at all, while `dialog.tsx`/`dropdown-menu.tsx`/`select.tsx` already use `shadow-md`/`shadow-lg` for their elevated/floating surfaces. If D-07's "shadows/depth for cards/dialogs/dropdowns" polish is implemented inconsistently (e.g., adding a shadow to `Card` but not adjusting the existing ring, or picking an elevation scale unrelated to the dialog/dropdown shadow sizes already in use), the result is visual inconsistency rather than polish.
**Why it happens:** Cards (static, in-flow content) and Dialogs/Dropdowns (floating, overlaid content) historically use different elevation conventions in this codebase — ring for static cards, shadow for floating overlays — and D-07 doesn't distinguish between the two.
**How to avoid:** Keep the ring/shadow distinction intentional: cards can gain a *subtle* `shadow-sm` in addition to their existing ring (more depth without becoming "floating"), while dialogs/dropdowns keep their existing `shadow-md`/`shadow-lg` — do not invent a third elevation value not derivable from the two already in use.
**Warning signs:** A new `shadow-xl` or custom `box-shadow` value appearing that doesn't match Tailwind's default shadow scale already used elsewhere (`shadow-sm`, `shadow-md`, `shadow-lg`).

## Code Examples

### WCAG 1.4.10 Reflow test protocol (manual, per page)
```
1. Open each of the 5 in-scope public routes: /, /packages, /packages/[slug], /contact,
   and the inquiry form's submitted/error states.
2. Set browser zoom to 200% (minimum bar per D-02) via Cmd/Ctrl + "+" three times
   (Chrome/Firefox default zoom step is 110%, 125%, 150%, 175%, 200%).
3. At each zoom level, confirm:
   - No horizontal scrollbar appears on the page body.
   - No two elements visually overlap.
   - All interactive elements (buttons, links, form fields) remain fully visible
     and clickable without being clipped by a container edge.
4. Repeat at 400% for pages with meaningful text-heavy content (WCAG's own
   normative bar), noting 400% may legitimately require the 320px-equivalent
   single-column reflow described in the SC.
```
[CITED: w3.org/WAI/WCAG21/Understanding/reflow.html]

### Existing skeleton pattern to replicate (from `crm/loading.tsx`)
```tsx
// Source: app/admin/(dashboard)/crm/loading.tsx (already in codebase)
import { Skeleton } from "@/components/ui/skeleton";

export default function PackagesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Horizontal-scroll tables on mobile (`overflow-x-auto` wrapper only, as in current `table.tsx`) | Stacked-card layout below breakpoint (D-03 decision) | This phase | Users no longer need to scroll sideways to see hidden columns on the CRM/packages/users admin lists — but the underlying `<Table>` markup and `overflow-x-auto` wrapper remain for the `md:` and above desktop view, unchanged. |
| Progressive column-hiding (`hidden sm:table-cell` per column) | Rejected by D-03 in favor of full card redesign | This phase | Avoids the common TanStack Table community pattern (column `meta.className` hiding) that the user explicitly ruled out — do not reach for it as a shortcut. |

**Deprecated/outdated:** None — no library versions in this phase are behind current; this is a pure retrofit of already-current code.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The gallery lightbox nav-button negative-offset issue (`package-gallery.tsx`) is *the* (or *a*) root cause of the reported "layout does not adjust when browser zoom level is adjusted" bug | Common Pitfalls #1, Summary | This is a code-derived hypothesis, not confirmed via a live browser zoom test in this research session. If the planner/executor doesn't verify it live at 200% zoom against the actual reported repro steps, the fix could be incomplete — the phase's D-01 audit scope ("everywhere / not sure") means other, undiscovered causes may also exist across the 5 public routes. Recommend the plan include a first task that reproduces the bug live before committing to this as the sole fix. |
| A2 | No other public-site component beyond the gallery lightbox has a zoom-reflow-triggering pattern | Summary, Architecture Patterns | Based on a `grep` sweep for `100vw`, `w-[`, `min-w-[`, negative-offset utilities, and `container` — a static-analysis sweep can miss dynamically-computed inline styles or interaction-triggered layout (e.g., focus-visible ring overflow, tooltip positioning). The planner should still budget time for a full live 200%-zoom pass per D-01's site-wide audit requirement, not rely solely on this static finding. |

**If this table is empty:** N/A — see entries above; both are code-derived hypotheses that should be confirmed via live browser testing during execution, not treated as pre-verified fixes.

## Open Questions

1. **Exact card-layout field selection for each of the 3 admin tables**
   - What we know: CONTEXT.md leaves specific breakpoint values to Claude's discretion but doesn't specify which columns/fields appear in the mobile card view for each table (e.g., does the packages card show both Published and Featured switches, or collapse them into a single status row?).
   - What's unclear: Whether all desktop columns must have a card-mode equivalent, or whether some (e.g., "Created" timestamp in CRM table) can be dropped/de-prioritized in the condensed card view.
   - Recommendation: Default to showing all existing columns' data in the card (nothing silently dropped), reorganized for card-shaped legibility (primary identifier + status badges prominent, secondary metadata smaller/muted) — this matches D-06/D-07's "polish, don't remove capability" framing.

2. **Whether the zoom-reflow audit needs to cover the admin panel too**
   - What we know: D-01/D-02 explicitly scope the zoom bug to "the public site" (package list, package detail, inquiry/Contact Us form).
   - What's unclear: Whether admin pages should get the same 200%-zoom audit given the phase also does an admin retrofit (D-03 through D-07) — a card-layout table is arguably *more* zoom-resilient than a fixed table, so there may be positive spillover, but it hasn't been explicitly tested/verified as a requirement.
   - Recommendation: Treat admin-panel zoom-reflow as a beneficial side effect of D-03's card conversion, not a separately-scoped requirement — don't add a dedicated admin zoom-audit task unless the planner wants extra assurance.

## Environment Availability

Skipped — this phase has no new external tool/service dependencies. All required packages (`@tanstack/react-table`, `@dnd-kit/core`, `@dnd-kit/sortable`, Tailwind v4, shadcn/ui primitives) are already installed and verified present in `node_modules` per the Package Legitimacy Audit section above. No new Supabase schema, no new API integrations, no new environment variables.

## Validation Architecture

Skipped — `.planning/config.json`'s `workflow.nyquist_validation` is explicitly `false`.

## Security Domain

`security_enforcement` is `true` (ASVS level 1) per `.planning/config.json`, but this phase is CSS/markup-only — no new input handling, no new auth/session logic, no new data mutation paths. All Server Actions this phase's UI touches (`sendBulkEmail`, `sendBulkSms`, `publishPackage`, `featurePackage`, `reorderPackages`, `deactivateAccount`) are pre-existing, already-guarded (`requirePermission()`/`requireAdmin()`) code paths from Phases 2–4 and are not modified by this phase.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Unchanged — this phase touches no auth flows. |
| V3 Session Management | No | Unchanged. |
| V4 Access Control | No (verify, don't change) | Card-mode rendering must call the *same* permission-gated Server Actions as table-mode — a plan task should explicitly confirm the card branch's buttons/checkboxes wire to the identical `sendBulkEmail`/`publishPackage`/etc. calls, not new ones, so AUTH-05's server-side enforcement isn't accidentally bypassed by a new UI path. |
| V5 Input Validation | No | No new form inputs introduced. |
| V6 Cryptography | No | Not applicable. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| New card-mode UI accidentally omits the `opted_out` disabled-checkbox guard present in table mode (`crm-table.tsx`'s `row.original.opted_out` branch disabling selection) | Tampering (bypassing consent/opt-out enforcement) | Card-mode checkbox rendering must reuse the exact same `row.original.opted_out ? <disabled Checkbox/Tooltip> : <enabled Checkbox>` branch logic as the existing table `cell` renderer — do not re-implement the opt-out check separately for the card view. |

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `components/admin/crm-table.tsx` — confirmed TanStack Table + `enableRowSelection` + opt-out-aware checkbox pattern
- `components/admin/sortable-package-list.tsx`, `components/admin/package-list-row.tsx` — confirmed dnd-kit sortable `<Table>` (not TanStack Table) implementation
- `components/admin/users-table.tsx` — confirmed plain (no table library) `<Table>` implementation
- `components/ui/sidebar.tsx`, `hooks/use-mobile.ts` — confirmed `useIsMobile()` = 768px, `Sheet`-backed mobile drawer already functional
- `components/ui/card.tsx`, `components/ui/skeleton.tsx`, `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/select.tsx` — confirmed existing ring/shadow depth conventions
- `components/packages/package-gallery.tsx`, `components/ui/carousel.tsx` — confirmed negative-offset nav button pattern (zoom-reflow root-cause hypothesis)
- `app/globals.css` — confirmed locked brand tokens, no `--breakpoint-*` overrides (stock Tailwind v4 breakpoints in effect)
- `app/layout.tsx`, `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md` — confirmed no custom viewport meta export; Next.js default `width=device-width, initial-scale=1` is in effect (rules out a viewport-meta-disables-zoom hypothesis)
- `app/admin/(dashboard)/crm/loading.tsx` vs. absence of `packages/loading.tsx`/`users/loading.tsx` — confirmed empty-state/loading gap

### Secondary (MEDIUM confidence — WebSearch, cross-referenced)
- [W3C WAI — Understanding SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html) — official criterion text, 320 CSS px / 400% zoom relationship
- [Deque University — 1.4.10 Reflow](https://dequeuniversity.com/resources/wcag2.1/1.4.10-reflow) — testing methodology
- [Smashing Magazine — New CSS Viewport Units Do Not Solve The Classic Scrollbar Problem](https://www.smashingmagazine.com/2023/12/new-css-viewport-units-not-solve-classic-scrollbar-problem/) — scrollbar-gutter reflow causes
- [TanStack Table GitHub Discussion #4700 — "render row as a card instead of table"](https://github.com/TanStack/table/discussions/4700) — confirms headless table works with card-shaped row rendering
- [dndkit.com/concepts/sortable](https://dndkit.com/concepts/sortable/) — confirms `useSortable()` markup-agnostic drag-handle pattern
- [tailwindcss.com/docs/responsive-design](https://tailwindcss.com/docs/responsive-design) — confirmed default breakpoint values for Tailwind v4

### Tertiary (LOW confidence)
- None — all findings above were either codebase-verified or corroborated by an official/primary source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all versions read directly from `package.json`.
- Architecture: HIGH — table/card/sidebar/dnd-kit structure read directly from source files, not inferred.
- Pitfalls: MEDIUM — the zoom-reflow root-cause hypothesis (Pitfall 1) is a strong code-derived candidate but not live-browser-confirmed in this research session; flagged in Assumptions Log for execution-time verification.

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (30 days — stable stack, no fast-moving dependencies in scope)
