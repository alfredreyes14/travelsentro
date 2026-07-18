# Phase 2: Admin Access & Package Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 2-Admin Access & Package Management
**Areas discussed:** First Admin Bootstrap, Account lifecycle & session behavior, Package CRUD & data lifecycle, Admin panel layout & permission UX

---

## First Admin Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script | Repo-committed script creates the Supabase Auth user + profiles row from env vars, consistent with Phase 1's scripts/seed.ts pattern | ✓ |
| Manual via Supabase Dashboard | Create the auth user and profiles row by hand, once | |
| One-time gated sign-up route | A /admin/setup page gated by a one-time secret, letting the owner set their own password | |

**User's choice:** Seed script
**Notes:** Chosen for consistency with the existing Phase 1 seed script convention and repeatability across environments.

| Option | Description | Selected |
|--------|-------------|----------|
| DB trigger on auth.users insert | Postgres trigger auto-creates a profiles row on new auth user, defaulting to Staff/no-permissions | ✓ |
| App code creates both explicitly | Seed script / admin action creates auth user then explicitly inserts profiles row | |

**User's choice:** DB trigger on auth.users insert
**Notes:** Guarantees every auth user always has a matching profile — can't get out of sync.

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder for now | Dev placeholder email/password now, swap via env var before launch | ✓ |
| Real business owner email now | Use actual business owner credentials from the start | |

**User's choice:** Placeholder for now
**Notes:** Real credential handoff hasn't happened yet.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, skip if any Admin exists | Script checks for existing role='admin' profile first, no-ops if found | ✓ |
| No guard needed | Trust manual, intentional single run | |

**User's choice:** Yes, skip if any Admin exists
**Notes:** Safe to re-run accidentally without creating duplicate admins.

---

## Account lifecycle & session behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Kill session immediately | Deactivation sets is_active=false, re-validated via getUser() on every request | ✓ |
| Block next login only | Deactivation only prevents future sign-ins; existing session keeps working until natural expiry | |

**User's choice:** Kill session immediately
**Notes:** Matters when deactivating someone for cause.

| Option | Description | Selected |
|--------|-------------|----------|
| Include it | Supabase Auth's resetPasswordForEmail() self-serve reset flow | ✓ |
| Skip for now | Admin resets manually via dashboard/admin API if someone is locked out | |

**User's choice:** Include it
**Notes:** Small team will eventually lock themselves out; minimal extra work since Supabase ships this natively.

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase default, auto-refresh | Default JWT expiry with automatic silent refresh, no custom config | ✓ |
| Short session, frequent re-login | Configure shorter refresh token lifetime | |

**User's choice:** Supabase default, auto-refresh
**Notes:** Standard behavior sufficient; no specific security concern raised about shared devices.

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on Supabase built-ins | Supabase Auth's built-in rate limiting on sign-in attempts | ✓ |
| Add custom lockout after N failed attempts | Track failed attempts per account, lock out after threshold | |

**User's choice:** Rely on Supabase built-ins
**Notes:** Unnecessary complexity for a 2-5 person internal team, not a public attack surface.

---

## Package CRUD & data lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Soft delete | deleted_at/is_deleted flag; row and photos preserved | ✓ |
| Hard delete | DELETE row (cascades) + Storage cleanup | |

**User's choice:** Soft delete
**Notes:** Chosen specifically because Phase 3's CRM will link leads to package_id — hard delete would orphan that history.

| Option | Description | Selected |
|--------|-------------|----------|
| Drag-and-drop list | Draggable admin package index writing sort_order on drop | ✓ |
| Numeric sort_order field per package | Plain number input on edit form | |

**User's choice:** Drag-and-drop list
**Notes:** More intuitive for a non-technical business owner reordering a small catalog.

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-upload + drag reorder + delete | Upload multiple photos, drag to reorder, per-photo delete | ✓ |
| One-at-a-time upload, numbered reorder | Individual uploads, numeric display_order field | |

**User's choice:** Multi-upload + drag reorder + delete
**Notes:** Matches the existing package_photos schema (storage_path + display_order) exactly.

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic repeatable fields | Add/remove rows via react-hook-form's useFieldArray | ✓ |
| Fixed max rows with empty-state | Pre-render fixed number of rows | |

**User's choice:** Dynamic repeatable fields
**Notes:** react-hook-form already in the stack; no new library needed.

---

## Admin panel layout & permission UX

| Option | Description | Selected |
|--------|-------------|----------|
| Hide entirely | Nav item/section not shown at all when Staff lack the permission | ✓ |
| Visible but disabled with tooltip | Grayed-out nav item with explanation | |

**User's choice:** Hide entirely
**Notes:** Server-side enforcement (AUTH-05) still required regardless of what's shown.

| Option | Description | Selected |
|--------|-------------|----------|
| Packages, Users, (CRM/Messaging placeholders) | Only ship working sections now; CRM/Messaging added when they exist in Phase 3/4 | ✓ |
| Full nav with disabled future sections | Show all eventual sections now with "Coming soon" labels | |

**User's choice:** Packages, Users, (CRM/Messaging placeholders)
**Notes:** Keeps nav honestly scoped to what Phase 2 actually delivers.

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect straight to Packages list | No separate dashboard/home page in Phase 2 | ✓ |
| Minimal placeholder dashboard now | Bare-bones welcome + package count landing page | |

**User's choice:** Redirect straight to Packages list (after a free-text follow-up: user asked whether a dashboard would exist eventually — clarified yes, likely Phase 3/4 once there's CRM/messaging data to summarize; user then confirmed no dashboard needed in Phase 2 specifically)
**Notes:** See Deferred Ideas — real dashboard revisited in Phase 3/4.

| Option | Description | Selected |
|--------|-------------|----------|
| Inline switch on the package list | Toggle switch directly in each admin table row for is_published and is_featured | ✓ |
| Only inside the edit form | Checkboxes within the full package edit form | |

**User's choice:** Inline switch on the package list
**Notes:** Requires adding shadcn's switch component (not yet installed).

---

## Claude's Discretion

- Exact admin route structure and middleware/layout wiring for the (admin) route group
- Drag-and-drop library choice for package reorder and photo reorder
- Exact profiles table schema shape beyond role/permissions/is_active, and trigger implementation details
- Form validation rules and error/success UI states for login, account management, package CRUD
- Which additional shadcn components to install beyond switch (table, select, alert-dialog, etc.)

## Deferred Ideas

- Real admin dashboard (lead/message activity summary) — nothing meaningful to show in Phase 2; revisit in Phase 3 or 4 once CRM/messaging data exists.
