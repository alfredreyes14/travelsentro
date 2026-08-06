# Phase 2: Admin Access & Package Management - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin and Staff can securely log into an admin panel with email/password. Admin can create, edit, and deactivate Admin/Staff accounts, and toggle each Staff member's permissions (message customers / manage packages / edit CRM data) — enforced both in the UI and at the API/data layer. Admin/Staff with "manage packages" permission can create, edit, delete, publish/unpublish, feature, and reorder tour packages, reflected on the Phase 1 public site. No CRM, messaging, or automation yet (Phase 3/4).

</domain>

<decisions>
## Implementation Decisions

### First Admin Bootstrap
- **D-01:** The very first Admin account is created via a repo-committed seed script (env-var driven: `ADMIN_EMAIL` / `ADMIN_PASSWORD`), consistent with Phase 1's `scripts/seed.ts` pattern. No manual Supabase dashboard steps, no gated sign-up route.
- **D-02:** A `profiles` row (role, permissions, name) is auto-created via a Postgres trigger on `auth.users` insert, defaulting to Staff / no-permissions. App code (seed script or admin-create-account action) updates role/permissions afterward — every auth user always has a matching profile, can't get out of sync.
- **D-03:** Bootstrap seed uses a placeholder credential (e.g. `admin@travelsentro.test`) for now, not the real business owner email — same script, swap via env var right before launch.
- **D-04:** The seed script checks for an existing `role='admin'` profile first and no-ops if found — safe to re-run accidentally without creating duplicate admins.

### Account Lifecycle & Session Behavior
- **D-05:** Deactivating a Staff/Admin account kills their session immediately — every server request re-validates `is_active` via the already-locked `getUser()` convention, not just at next login.
- **D-06:** Include a self-serve forgot-password flow using Supabase Auth's `resetPasswordForEmail()`.
- **D-07:** Session/token lifetime uses Supabase's defaults (short-lived access token, automatic silent refresh via refresh token) — no custom expiry configuration.
- **D-08:** No custom failed-login lockout logic — rely on Supabase Auth's built-in rate limiting (appropriate for a 2-5 person internal team, not a public attack surface).

### Package CRUD & Data Lifecycle
- **D-09:** Package delete is a **soft delete** (`deleted_at` / `is_deleted` flag) — hides from public site and admin list but preserves the row and photos. Chosen specifically because Phase 3's CRM will link leads to `package_id`; a hard delete would orphan that history.
- **D-10:** Manual package display order (PKG-06) is set via a **drag-and-drop list** in the admin package index, writing `sort_order` on drop.
- **D-11:** Package photo management: multi-upload to Supabase Storage, drag-to-reorder (writes `package_photos.display_order`), per-photo delete. Matches the existing `package_photos` schema exactly — no schema changes needed.
- **D-12:** Itinerary days and inclusion/exclusion/bring list items are edited via **dynamic repeatable fields** (add/remove rows) using react-hook-form's `useFieldArray` — already in the stack, no new library.

### Admin Panel Layout & Permission UX
- **D-13:** When Staff lack a permission (e.g. no "manage packages"), that nav item/section is **hidden entirely** — not shown-disabled. Note: server-side enforcement (AUTH-05) is required regardless of what's shown in the nav.
- **D-14:** Phase 2's admin nav has only **Packages** and **Users** (accounts/permissions) sections. CRM and Messaging nav items are added in Phase 3/4 when those features actually exist — not stubbed as "coming soon" placeholders now.
- **D-15:** Post-login, Admin/Staff land directly on the **Packages list** — no dashboard/home page in Phase 2, since there's no lead/messaging data yet to summarize. (See Deferred Ideas — a real dashboard is a good fit once Phase 3 CRM data exists.)
- **D-16:** Publish/unpublish (PKG-04) and featured (PKG-05) toggles are **inline switches on the package list row** — requires adding shadcn's `switch` component (not yet installed).

### Claude's Discretion
- Exact admin route structure (e.g. `/admin/packages`, `/admin/users`) and middleware/layout wiring for the `(admin)` route group.
- Specific drag-and-drop library choice for package reorder and photo reorder (e.g. `@dnd-kit`).
- Exact `profiles` table schema shape (columns beyond role/permissions/is_active) and the Postgres trigger implementation details.
- Form validation rules and error/success UI states for login, account management, and package CRUD forms.
- Which additional shadcn components to install beyond `switch` (e.g. `table`, `select`, `alert-dialog` for delete confirmation).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & requirements
- `.planning/PROJECT.md` — Core value, business context, constraints, Key Decisions table
- `.planning/REQUIREMENTS.md` §Package Management (PKG-01–06) and §Admin Auth & Users (AUTH-01–05) — full requirement list this phase must satisfy
- `.planning/ROADMAP.md` §Phase 2 — goal, success criteria, dependencies
- `.claude/CLAUDE.md` §Auth & Roles: Supabase Auth vs Custom — locks the `profiles` table + RLS pattern, explicitly rules out Auth Hooks/JWT custom claims, and mandates `getUser()` over `getSession()` server-side

### Prior phase (schema this phase extends)
- `supabase/migrations/20260718114727_create_package_schema.sql` — existing `packages`, `package_photos`, `itinerary_days`, `package_inclusions`, `faq_facts` tables; all have public-read RLS only, **no write policies yet** — this phase must add authenticated write policies scoped to the "manage packages" permission
- `supabase/migrations/20260718140000_fix_public_read_rls_is_published.sql` — most recent RLS fix, scoped public reads to `is_published`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase/client.ts`, `lib/supabase/server.ts` — Supabase client factories already scaffolded with `@supabase/ssr`, explicitly written anticipating Phase 2's real session handling (comments in both files reference this phase by name)
- shadcn components already installed: `accordion`, `badge`, `button`, `card`, `carousel`, `dialog`, `form`, `input`, `label`, `separator`, `sonner`, `textarea` — `form.tsx` is hand-authored (react-hook-form Form/FormField/FormControl/FormMessage wrapper) since the CLI's registry stub was empty
- `react-hook-form` + `zod` + `@hookform/resolvers` already set up (used in Phase 1's inquiry form) — same pattern applies to package/account admin forms

### Established Patterns
- No middleware exists yet (`middleware.ts` absent) — Phase 2 is the first phase to add auth-gated routing
- No `(admin)` route group exists yet — only `app/(public)/` — this phase creates the admin route group and its layout/nav from scratch
- Package data model is fully normalized across 5 tables (packages, package_photos, itinerary_days, package_inclusions, faq_facts) with FK cascades already in place

### Integration Points
- New `profiles` table needs to be added (does not exist yet) alongside a role/permission RLS policy scheme referenced in CLAUDE.md
- Admin write operations must add INSERT/UPDATE/DELETE RLS policies to all 5 existing package tables — currently default-deny
- Admin package CRUD, once live, must keep the Phase 1 public list/detail pages working unchanged (they already read via `is_published`)

</code_context>

<specifics>
## Specific Ideas

- The bootstrap admin credential is explicitly a placeholder for now (`admin@travelsentro.test` or similar) — real business owner credentials get swapped in via env var before launch, not during this phase.
- Soft-delete choice for packages was made specifically anticipating Phase 3's CRM `package_id` linkage, not just as a general "safety" preference.

</specifics>

<deferred>
## Deferred Ideas

- **Real admin dashboard** (lead/message activity summary) — raised during Admin Panel Layout discussion. There's nothing meaningful to show in Phase 2 (no CRM/messaging data exists), but once Phase 3 (CRM) ships, a proper dashboard summarizing new leads and recent activity is a good fit; Phase 4 (messaging) could add send stats on top. Not part of Phase 2 — revisit in Phase 3 or 4 discussion.

</deferred>

---

*Phase: 2-Admin Access & Package Management*
*Context gathered: 2026-07-18*
