---
phase: 03-lead-capture-crm-automation
plan: 04
subsystem: ui
tags: [nextjs, react, tanstack-table, date-fns, supabase, admin-panel]

# Dependency graph
requires:
  - phase: 03-lead-capture-crm-automation (03-01)
    provides: contacts table schema, RLS "authenticated staff can read all contacts" policy
provides:
  - "/admin/crm -- searchable, filterable contact list Server Component page"
  - "components/admin/crm-table.tsx -- AdminContactListItem type + CrmTable client component consumed by 03-05's detail page and future contact-edit UI"
  - "lib/crm/status.ts -- shared CONTACT_STATUSES/ContactStatus/STATUS_LABELS/STATUS_BADGE_VARIANT/STATUS_BADGE_CLASSNAME contract"
  - "unconditional 'Contacts' nav item in app/admin/(dashboard)/layout.tsx"
affects: [03-05 (CRM contact detail page consumes lib/crm/status.ts and links from crm-table.tsx row click)]

# Tech tracking
tech-stack:
  added: ["@tanstack/react-table@8.21.3", "date-fns@4.4.0"]
  patterns:
    - "Client-side @tanstack/react-table global filter (name/tags) + column filter (status) over a Server-Component-fetched, RLS-authorized dataset"
    - "Permission-universal nav item (no gating boolean) contrasted with existing canManagePackages/canManageUsers-gated items"

key-files:
  created:
    - lib/crm/status.ts
    - components/admin/crm-table.tsx
    - "app/admin/(dashboard)/crm/page.tsx"
    - "app/admin/(dashboard)/crm/loading.tsx"
  modified:
    - "app/admin/(dashboard)/layout.tsx"
    - package.json
    - package-lock.json

key-decisions:
  - "Won's green badge applied via a Partial<Record> utility-class override (STATUS_BADGE_CLASSNAME) layered on the secondary variant, not a new badge.tsx cva variant -- per 03-UI-SPEC.md's explicit instruction to keep the shared Badge component's variant surface unchanged"
  - "Status column filter uses a literal inline filterFn (not a registered TanStack filter-fn name) with an 'all' sentinel value, since base-ui's Select primitive requires a non-empty string value for the 'All statuses' option"
  - "contacts.status (plain string in generated database.ts) is cast to ContactStatus at the page.tsx mapping boundary rather than widening the shared type, keeping lib/crm/status.ts's contract strict for consumers"

patterns-established:
  - "Universal-read admin page: getProfile() only (session validation), no requirePermissionOrRedirect -- reserved for pages where every authenticated Staff/Admin has read access regardless of a specific permission toggle"

requirements-completed: [CRM-05]

coverage:
  - id: D1
    description: "/admin/crm is reachable via an unconditional sidebar 'Contacts' nav item, visible regardless of can_edit_crm"
    requirement: "CRM-05"
    verification:
      - kind: other
        ref: "grep -c 'href=\"/admin/crm\"' (1), grep -c 'canViewCrm' (0, confirms no gating boolean introduced) against app/admin/(dashboard)/layout.tsx; npm run build succeeds and /admin/crm route appears in build output"
        status: pass
    human_judgment: true
    rationale: "No authenticated Staff/Admin browser session was exercised live in this plan (build-time and static grep verification only) -- visiting /admin/crm as both an Admin and a can_edit_crm=false Staff session to confirm the nav item and page both render is deferred to end-of-phase UAT."
  - id: D2
    description: "Contact list is searchable by name/tag and filterable by status in one toolbar (CrmTable's Input + Select wired to @tanstack/react-table's globalFilterFn/column filterFn)"
    requirement: "CRM-05"
    verification:
      - kind: other
        ref: "static code inspection of components/admin/crm-table.tsx (globalFilterFn checks name+tags substring match; status column filterFn checks exact match or 'all' passthrough) plus npm run build type-check success"
        status: pass
    human_judgment: true
    rationale: "No live browser interaction (typing into the search box, selecting a status) was performed against real Supabase-seeded contact rows -- functional correctness of the filter logic was verified by reading the implementation against RESEARCH.md's reference pattern, not by driving the UI. Recommend exercising at end-of-phase UAT once test contacts exist via 03-02/03-03's ingestion pipeline."
  - id: D3
    description: "Row click navigates to /admin/crm/{id}; zero-contacts and zero-matches empty states render distinct UI-SPEC-exact copy"
    requirement: "CRM-05"
    verification:
      - kind: other
        ref: "static code inspection: TableRow onClick={() => router.push(`/admin/crm/${row.original.id}`)}; page.tsx renders 'No contacts yet' when items.length===0; crm-table.tsx renders 'No contacts match your search' + Clear filters button when rows.length===0 && contacts.length>0"
        status: pass
    human_judgment: true
    rationale: "/admin/crm/[id] does not exist until 03-05 lands, so a live click-through to a 404 (expected/acceptable per this plan's own verification note) was not exercised in a browser this session -- deferred to 03-05's own verification or end-of-phase UAT."

# Metrics
duration: 15min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 4: CRM Contact List Summary

**Searchable/filterable `/admin/crm` contact list built on `@tanstack/react-table`, with a shared status-badge contract (`lib/crm/status.ts`) and an unconditional "Contacts" sidebar nav item**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-20T12:16:00Z
- **Completed:** 2026-07-20T12:31:32Z
- **Tasks:** 3 completed
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- Installed `@tanstack/react-table@8.21.3` and `date-fns@4.4.0` at the pinned versions from 03-RESEARCH.md
- `lib/crm/status.ts`: shared `CONTACT_STATUSES`/`ContactStatus`/`STATUS_LABELS`/`STATUS_BADGE_VARIANT`/`STATUS_BADGE_CLASSNAME` contract, including the Won-green exception, ready for 03-05 to reuse
- `components/admin/crm-table.tsx`: self-contained client component with a search box (name+tag global filter) and status `Select` (column filter), status/tag badges, relative "Created" date, and whole-row-click navigation to `/admin/crm/[id]` -- no per-row dropdown menu, per 03-UI-SPEC.md's explicit deviation from `users-table.tsx`
- `app/admin/(dashboard)/crm/page.tsx`: universal-read Server Component (session validation only via `getProfile()`, no `requirePermissionOrRedirect`), fetches+maps `contacts`, renders "No contacts yet" empty state or `CrmTable`
- `app/admin/(dashboard)/crm/loading.tsx`: skeleton loading boundary for the route
- `app/admin/(dashboard)/layout.tsx`: unconditional "Contacts" nav item (no `canViewCrm` gating boolean), positioned between Packages and Users
- `npm run build` succeeds after every task; `/admin/crm` appears in the build's route list

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, shared status contract, CrmTable client component** - `f3049ee` (feat)
2. **Task 2: Contact list Server Component page + loading skeleton** - `c5f4326` (feat)
3. **Task 3: Unconditional "Contacts" nav item** - `90bafa3` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/crm/status.ts` - CONTACT_STATUSES, ContactStatus, STATUS_LABELS, STATUS_BADGE_VARIANT, STATUS_BADGE_CLASSNAME
- `components/admin/crm-table.tsx` - AdminContactListItem type, CrmTable client component (search/filter/badges/row-click)
- `app/admin/(dashboard)/crm/page.tsx` - contact list Server Component
- `app/admin/(dashboard)/crm/loading.tsx` - skeleton loading boundary
- `app/admin/(dashboard)/layout.tsx` - added unconditional "Contacts" nav item
- `package.json` / `package-lock.json` - added `@tanstack/react-table@8.21.3`, `date-fns@4.4.0`

## Decisions Made
- Won's green badge applied via `STATUS_BADGE_CLASSNAME`'s utility-class override on the `secondary` variant rather than a new `badge.tsx` `cva` variant, per 03-UI-SPEC.md's instruction not to grow the shared Badge component's variant surface for a single-phase need.
- Status column filter uses an inline `filterFn` function plus an `"all"` sentinel value (rather than TanStack's built-in `equals` filter fn name and an empty-string "no filter" convention), because base-ui's `Select` primitive needs a non-empty string value bound to every `SelectItem` including the "All statuses" option.
- `contacts.status` (typed as plain `string` in the generated `types/database.ts`) is cast to `ContactStatus` at the `page.tsx` fetch-to-view-model mapping boundary, keeping `lib/crm/status.ts`'s own type strict for downstream consumers (03-05) instead of widening it to accept arbitrary strings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

An initial `Write` call for `components/admin/crm-table.tsx` accidentally wrote a one-line garbage placeholder (a stray unterminated import) before the real content was written in the very next tool call. This was caught immediately (the file was re-verified after the corrective `Write`, `npm run build` passed, and the correct content was confirmed present) — no garbage content was ever committed to git. Documented here only for transparency, not tracked as a deviation since it never affected a committed task.

## User Setup Required

None - no external service configuration required. This plan only added a frontend dependency (`@tanstack/react-table`, `date-fns`) and new/modified application code; no new environment variables or dashboard configuration.

## Next Phase Readiness

- `lib/crm/status.ts` and `components/admin/crm-table.tsx`'s `AdminContactListItem` type are ready for 03-05's `/admin/crm/[id]` detail page and `crm-detail.tsx` to import and reuse directly.
- Row click already targets `/admin/crm/${id}`, which currently 404s until 03-05 lands — expected and explicitly called out as acceptable in this plan's own `<verification>` block.
- No live authenticated-session UI verification (search typing, status filter selection, nav item visibility across roles, row-click 404 confirmation) was performed this session — all three coverage entries above are flagged `human_judgment: true` and deferred to end-of-phase UAT once 03-05 completes the detail route and/or test contacts exist via the (already-shipped) 03-02 ingestion pipeline.

---
*Phase: 03-lead-capture-crm-automation*
*Completed: 2026-07-20*
