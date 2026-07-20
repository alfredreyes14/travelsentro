---
phase: 03-lead-capture-crm-automation
plan: 05
subsystem: ui
tags: [nextjs, react, react-hook-form, zod, date-fns, supabase, admin-panel]

# Dependency graph
requires:
  - phase: 03-lead-capture-crm-automation (03-01)
    provides: contacts/inquiries schema, can_edit_crm-scoped UPDATE RLS policy, contacts_set_updated_by audit trigger
  - phase: 03-lead-capture-crm-automation (03-04)
    provides: lib/crm/status.ts shared status contract, CrmTable row-click linking to /admin/crm/[id]
provides:
  - "/admin/crm/[id] -- contact detail page: inquiry timeline (newest-first, per-inquiry package linkage), permission-gated status editor, Edit Contact dialog"
  - "actions/crm.ts -- updateStatus(id, status), updateContact(id, {name, phone, tags}), both can_edit_crm-guarded Server Actions"
  - "components/admin/contact-edit-form.tsx -- ContactEditForm, mirrors Phase 2's EditAccountForm dialog pattern, email genuinely non-editable"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Permission-gated rendering (not permission-gated hiding): canEdit renders an editable Select vs a read-only Badge for the same status data, matching CRM-03's 'Staff without can_edit_crm sees identical data read-only' requirement"
    - "Single-field auto-save via useState+startTransition+optimistic-revert-on-failure (mirrors PackageListRow's handlePublishChange), reused for the status Select instead of a Switch"

key-files:
  created:
    - actions/crm.ts
    - components/admin/contact-edit-form-schema.ts
    - components/admin/contact-edit-form.tsx
    - "app/admin/(dashboard)/crm/[id]/page.tsx"
    - "app/admin/(dashboard)/crm/[id]/loading.tsx"
    - components/admin/crm-detail.tsx
  modified: []

key-decisions:
  - "actions/crm.ts declares two distinct error-message constants (STATUS_ERROR_MESSAGE, CONTACT_ERROR_MESSAGE) per 03-UI-SPEC.md's Copywriting Contract, rather than one shared GENERIC_ERROR_MESSAGE -- status-update failures and contact-edit failures have different exact copy"
  - "CrmDetailContact/CrmDetailInquiry types defined locally in crm-detail.tsx (not imported from types/database.ts) since the page.tsx query shape (joined inquiries+packages, mapped view model) doesn't match the raw generated Row types"
  - "page.tsx casts the joined contacts+inquiries+packages query result via `as unknown as ContactDetail` (same pattern as app/admin/(dashboard)/packages/[id]/page.tsx's PackageDetail cast for its own nested-relation ambiguity)"

patterns-established:
  - "Contact detail Server Component page (universal-read guard) -> client CrmDetail component -> permission-gated Select/Badge and Dialog/ContactEditForm sub-tree, extending 03-04's universal-read-page pattern to a detail route with mixed read/write permission gating on one page"

requirements-completed: [CRM-02, CRM-03, CRM-04, CRM-06, CRM-07]

coverage:
  - id: D1
    description: "actions/crm.ts exports updateStatus(id, status) and updateContact(id, {name, phone, tags}), both requirePermission('can_edit_crm')-guarded, updateContact never touches email, both revalidate /admin/crm and /admin/crm/[id] on success"
    requirement: "CRM-04"
    verification:
      - kind: other
        ref: "grep -c 'requirePermission(\"can_edit_crm\")' actions/crm.ts (2), grep -c 'export async function updateStatus'/'export async function updateContact' (1 each), grep -c '.update({ email' (0), grep -c 'revalidatePath(\"/admin/crm\")' (2); npm run build succeeds"
        status: pass
    human_judgment: false
  - id: D2
    description: "Edit Contact dialog form (contact-edit-form-schema.ts + contact-edit-form.tsx) mirrors EditAccountForm's structure exactly; email field has no FormField wrapper (disabled+readOnly plain Input), tags round-trip via comma-separated text"
    requirement: "CRM-03"
    verification:
      - kind: other
        ref: "grep -c 'contactEditSchema' (2 -- import + export), grep -c 'name=\"email\"' components/admin/contact-edit-form.tsx (0), grep -c 'updateContact(contact.id' (1), grep -c 'Save Changes' (1); npm run build succeeds"
        status: pass
    human_judgment: false
  - id: D3
    description: "/admin/crm/[id] fetches contact + newest-first inquiry timeline (joined to packages) with a universal-read guard (getProfile() only, no redirect-based permission gate), notFound() on missing id"
    requirement: "CRM-02"
    verification:
      - kind: other
        ref: "grep -c 'requirePermissionOrRedirect' app/admin/(dashboard)/crm/[id]/page.tsx (0), grep -c 'notFound()' (1); npm run build succeeds and /admin/crm/[id] appears in the build's route list"
        status: pass
    human_judgment: true
    rationale: "No authenticated Staff/Admin browser session was exercised live this session (build-time and static grep verification only) -- visiting /admin/crm/[id] as both a can_edit_crm and a non-can_edit_crm session, confirming the Select-vs-Badge rendering split, the auto-save/revert-on-failure behavior, and the timeline's package-link/General-inquiry branching against real Supabase-seeded contact/inquiry rows is deferred to end-of-phase UAT."
  - id: D4
    description: "CrmDetail renders permission-gated status editor (Select when canEdit, plain Badge otherwise) with optimistic auto-save + revert-on-failure, and audit meta text (created/updated by/when) matching 03-UI-SPEC.md's exact copy contract, sourced from 03-01's denormalized created_by_name/updated_by_name columns"
    requirement: "CRM-07"
    verification:
      - kind: other
        ref: "grep -c 'updateStatus(contact.id' components/admin/crm-detail.tsx (1), grep -c 'canEdit' (4), grep -c 'General inquiry' (1), grep -c 'Tabs' (0, confirms no tabs per UI-SPEC); static code inspection of the created_by/updated_by conditional branches against the Copywriting Contract's exact audit-meta strings"
        status: pass
    human_judgment: true
    rationale: "Audit-meta copy branches (system-created vs staff-created; never-edited vs staff-edited) were verified by reading the implementation against the UI-SPEC's exact copy contract, not by driving a live browser session against contacts in each of those 4 states -- deferred to end-of-phase UAT once such contacts exist via the ingestion pipeline (03-02) and this plan's own updateContact()."

# Metrics
duration: 18min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 5: CRM Contact Detail Page Summary

**`/admin/crm/[id]` contact detail page with a newest-first inquiry timeline (per-inquiry package linkage), permission-gated status editor (auto-save Select vs read-only Badge), and an "Edit Contact" dialog mirroring Phase 2's EditAccountForm pattern with a genuinely non-editable email field**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-20T12:44:23Z
- **Completed:** 2026-07-20T13:02:00Z
- **Tasks:** 3 completed
- **Files modified:** 6 (all created)

## Accomplishments
- `actions/crm.ts`: `updateStatus(id, status)` and `updateContact(id, {name, phone, tags})`, both `requirePermission("can_edit_crm")`-guarded Server Actions, `updateContact` never touches `email`, both revalidate `/admin/crm` and `/admin/crm/[id]`
- `components/admin/contact-edit-form-schema.ts` + `contact-edit-form.tsx`: Edit Contact dialog form mirroring `EditAccountForm`'s exact structure, including its read-only-email technique (plain `disabled readOnly` `Input`, no `FormField` wrapper) -- email is genuinely non-editable even by a `can_edit_crm` session (D-04)
- `app/admin/(dashboard)/crm/[id]/page.tsx`: universal-read Server Component (`getProfile()` session validation only, no redirect-based permission gate -- CRM-03), fetches the contact plus its full inquiry history newest-first (joined to `packages` for per-inquiry linkage), `notFound()` on a missing id
- `app/admin/(dashboard)/crm/[id]/loading.tsx`: skeleton loading boundary for the route
- `components/admin/crm-detail.tsx`: header (contact name, permission-gated status `Select`-or-`Badge` with optimistic auto-save + revert-on-failure, audit meta text following the exact copy contract), "Contact Info" `Card` (email/phone/tags, "Edit Contact" button only when `canEdit`), "Inquiry History" timeline (connecting-rule entries, relative date with full-date tooltip, message text, package-link badge or "General inquiry" muted text)
- `npm run build` succeeds after every task; `/admin/crm/[id]` appears in the build's route list

## Task Commits

Each task was committed atomically:

1. **Task 1: actions/crm.ts -- updateStatus, updateContact** - `3ee8fd7` (feat)
2. **Task 2: Edit Contact dialog form (schema + component)** - `44fa355` (feat)
3. **Task 3: Contact detail Server Component page + timeline/status client component** - `4d463a1` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `actions/crm.ts` - `updateStatus(id, status)`, `updateContact(id, {name, phone, tags})`
- `components/admin/contact-edit-form-schema.ts` - `contactEditSchema`, `ContactEditFormValues`
- `components/admin/contact-edit-form.tsx` - `ContactEditForm({ contact, onSuccess })`
- `app/admin/(dashboard)/crm/[id]/page.tsx` - contact detail Server Component (universal-read guard, joined contact+inquiries+packages fetch)
- `app/admin/(dashboard)/crm/[id]/loading.tsx` - skeleton loading boundary
- `components/admin/crm-detail.tsx` - `CrmDetail({ contact, inquiries, canEdit })`

## Decisions Made
- `actions/crm.ts` declares two distinct error-message constants (`STATUS_ERROR_MESSAGE`, `CONTACT_ERROR_MESSAGE`) rather than reusing one shared `GENERIC_ERROR_MESSAGE`, per 03-UI-SPEC.md's Copywriting Contract specifying different exact wording for status-update failures vs. contact-edit-save failures.
- `CrmDetailContact`/`CrmDetailInquiry` view-model types are defined locally in `crm-detail.tsx` (not imported from `types/database.ts`) since the page's joined-and-mapped query shape doesn't match the raw generated `Row` types for `contacts`/`inquiries`.
- `page.tsx` casts the joined `contacts` + `inquiries` + `packages` query result via `as unknown as ContactDetail`, following the same pattern `app/admin/(dashboard)/packages/[id]/page.tsx` already uses for its own nested-relation typing ambiguity (there for `faq_facts`, here for `inquiries(packages(...))`).

## Deviations from Plan

**1. [Rule 1 - Bug] Removed a literal `requirePermissionOrRedirect` mention from a doc comment**
- **Found during:** Task 3 (self-check against the task's own acceptance criteria)
- **Issue:** The initial `page.tsx` doc comment explained the universal-read guard by naming the redirect-based permission-gate function it deliberately does *not* use ("no `requirePermissionOrRedirect`"), which caused the task's own `grep -c 'requirePermissionOrRedirect'` acceptance check to read 1 instead of the required 0, even though no such call exists in the code.
- **Fix:** Reworded the comment to describe the guard's behavior without naming the sibling function literally.
- **Files modified:** `app/admin/(dashboard)/crm/[id]/page.tsx`
- **Verification:** `grep -c 'requirePermissionOrRedirect' app/admin/(dashboard)/crm/[id]/page.tsx` now returns `0`; `npm run build` still succeeds.
- **Committed in:** `4d463a1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug -- acceptance-criteria-breaking doc comment wording, no functional change)
**Impact on plan:** Cosmetic-only fix to satisfy the plan's own literal grep-based acceptance criteria. No scope creep, no behavior change.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. This plan only added application code (Server Actions, a client dialog form, a Server Component page + client detail view); no new environment variables or dashboard configuration.

## Next Phase Readiness

- Phase 3 (lead-capture-crm-automation) is now feature-complete: 03-01 (schema/RPCs) -> 03-02 (inquiry ingestion) -> 03-03 (automation emails) -> 03-04 (contact list) -> 03-05 (contact detail, this plan) together satisfy CRM-01 through CRM-07 and AUTO-01 through AUTO-03 end-to-end.
- No live authenticated-session UI verification (status Select auto-save + revert, Edit Contact dialog save round-trip, timeline rendering against real Supabase-seeded inquiries, permission-gated rendering split across a `can_edit_crm` and a non-`can_edit_crm` session) was performed this session -- all `human_judgment: true` coverage entries above are deferred to end-of-phase UAT, consistent with 03-01's and 03-04's own deferred-verification notes for the same authenticated-write-path gap (now closed by this plan's `actions/crm.ts`, but not yet exercised live).
- Recommend the end-of-phase UAT pass specifically exercise: (1) a `can_edit_crm` Staff session vs. a non-`can_edit_crm` Staff session both viewing the same contact, confirming identical data with only the edit affordances differing; (2) a status change auto-saving without a page reload; (3) a simulated status-update failure reverting the optimistic UI change; (4) the Edit Contact dialog persisting name/phone/tags while leaving email genuinely non-interactive; (5) a contact with multiple inquiries across different packages (and one general inquiry) rendering the timeline's package-link vs. "General inquiry" branching correctly.

---
*Phase: 03-lead-capture-crm-automation*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: actions/crm.ts
- FOUND: components/admin/contact-edit-form-schema.ts
- FOUND: components/admin/contact-edit-form.tsx
- FOUND: app/admin/(dashboard)/crm/[id]/page.tsx
- FOUND: app/admin/(dashboard)/crm/[id]/loading.tsx
- FOUND: components/admin/crm-detail.tsx
- FOUND: commit 3ee8fd7
- FOUND: commit 44fa355
- FOUND: commit 4d463a1
