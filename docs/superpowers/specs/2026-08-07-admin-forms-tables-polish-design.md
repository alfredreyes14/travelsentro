# Admin Forms & Tables UX Polish — Design

## Context

The admin panel's forms and tables are functionally solid (consistent shadcn/ui
primitives, semantic design tokens, responsive card fallbacks on tables, decent
empty states, toast feedback) but have accumulated visual/UX inconsistencies
across components built at different times. This is a polish + consistency
pass, not a functional overhaul.

**Scope:** Admin panel only. Forms and tables under `components/admin/` and
`components/ui/form.tsx` / `components/ui/table.tsx`. Explicitly out of scope:
login/reset/forgot-password forms and the public inquiry form.

**Motivation:** General visual/UX polish + consistency across components that
were built at different times and feel inconsistent with each other.

## Approach: shared primitives first

Build a small set of shared primitives once, then apply them across all
affected forms/tables, rather than doing one-off per-component tweaks. This is
the only approach that genuinely delivers "consistency" rather than more
divergence.

## Section 1 — Shared primitives

1. **`FormSection`** — addition to `components/ui/form.tsx`. A labeled
   grouping wrapper (`<FormSection title="Permissions">...</FormSection>`)
   rendering a subtle heading + divider, for clustering related fields.
2. **Input prefix/suffix support** — extend `components/ui/input.tsx` with
   optional `prefix`/`suffix` props (e.g. `<Input prefix="₱" />`,
   `<Input suffix="days" />`), implemented as a wrapping div around the
   existing input, not a new standalone component.
3. **`FormActionBar`** — a sticky bottom bar
   (`sticky bottom-0 bg-background/95 backdrop-blur border-t`) holding the
   submit button, for forms with meaningful scroll length. Short dialog forms
   keep their existing bare `<Button className="self-start">` pattern.
4. **`DataTableToolbar` pattern** — a documented, composable layout (search
   input + filter slot + bulk-action slot) rendered consistently by both
   `crm-table.tsx` and `users-table.tsx`. Not a heavy abstraction — just a
   consistent shape both tables follow.

No new dependencies; built from existing shadcn primitives + Tailwind.

## Section 2 — Forms

- **`package-form.tsx`**:
  - Price field gets `prefix="₱"`; duration field gets `suffix="days"`.
  - Itinerary/inclusions/exclusions/bring-items field-array items get numbered
    headers ("Day 1", "Item 1") inside a slightly more defined card
    (`bg-muted/30` instead of bare border).
  - "Remove" buttons on field-array items get a destructive-outline style
    consistent with table row delete actions.
  - Removing a day/item with existing text prompts a confirm dialog (reuse
    `AlertDialog`, matching the account-deactivation confirm pattern) since
    these are hard to undo mid-edit.
  - Submit button moves into `FormActionBar`, sticky at the bottom, visible
    across all 4 tabs.
- **`account-form.tsx`**: the 3 permission `Switch` fields (Manage Packages,
  Message Customers, Edit CRM Data) move into a `FormSection title="Permissions"`
  instead of being loose siblings after Role, in both create and edit modes.
- **`contact-edit-form.tsx`** and content forms (`destination-form.tsx`,
  `hero-slide-form.tsx`, `partner-form.tsx`, `testimonial-form.tsx`): no
  structural change — these are short, single-purpose dialog forms already.
  They inherit shared-primitive fixes automatically if/when they use a field
  that benefits (e.g. prefix/suffix), but grouping is not forced onto forms
  that don't need it.
- Out of scope: login/reset/forgot-password forms, public inquiry form.

## Section 3 — Tables

- **`users-table.tsx`**: gains a search input (client-side filter by
  name/email), styled identically to `crm-table.tsx`'s search
  (`relative` wrapper + `SearchIcon` + `pl-8` input). No new status/role
  filter dropdown — staff lists are small enough not to warrant it.
- **`crm-table.tsx`**: adds clickable column-header sorting (name, status,
  created) via `@tanstack/react-table`'s `getSortedRowModel` (table is
  already React Table-powered, so this is additive). A sort-direction chevron
  appears on the active column header.
- **`sortable-package-list.tsx`**: no functional change — it's manually
  ordered by design via drag-reorder (`dnd-kit`), and column sorting would
  conflict with that. It inherits shared `Table`/`TableHead` styling passively
  if those primitives change, but no primitive changes are planned that would
  affect it.
- Empty-state and "no matches" card styling already match between tables —
  left as-is.

## Section 4 — Verification

Visual/UX changes are verified by running the dev server and clicking through
each changed form and table at both desktop and mobile widths, confirming:

- Sticky `FormActionBar` behavior on the package form across all 4 tabs.
- Prefix/suffix rendering on price/duration fields.
- Field-array item numbering, styling, and remove-confirmation flow.
- `FormSection` grouping in the account form (create + edit).
- Users table search filtering.
- CRM table column sorting (toggle asc/desc/none per column).
- No regressions to existing empty-state, filter, and bulk-select behavior in
  either table.

No new automated tests are planned — there is no existing UI test convention
in this repo to extend. If that should change, it's a separate decision.

## Explicitly out of scope

- Login, forgot-password, reset-password forms.
- Public-facing inquiry form.
- The in-progress admin sidebar/layout refactor (uncommitted
  `admin-nav.tsx` / `admin-topbar.tsx` / etc.) — untouched by this pass.
- Pagination for tables (not currently needed at current data volumes).
- Column sorting or toolbar changes to `sortable-package-list.tsx`.
