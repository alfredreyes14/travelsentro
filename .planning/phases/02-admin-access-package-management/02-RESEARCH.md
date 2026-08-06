# Phase 2: Admin Access & Package Management - Research

**Researched:** 2026-07-18
**Domain:** Next.js 16 App Router auth-gated admin panel + Supabase Auth/RLS-backed RBAC + package CRUD
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**First Admin Bootstrap**
- **D-01:** The very first Admin account is created via a repo-committed seed script (env-var driven: `ADMIN_EMAIL` / `ADMIN_PASSWORD`), consistent with Phase 1's `scripts/seed.ts` pattern. No manual Supabase dashboard steps, no gated sign-up route.
- **D-02:** A `profiles` row (role, permissions, name) is auto-created via a Postgres trigger on `auth.users` insert, defaulting to Staff / no-permissions. App code (seed script or admin-create-account action) updates role/permissions afterward — every auth user always has a matching profile, can't get out of sync.
- **D-03:** Bootstrap seed uses a placeholder credential (e.g. `admin@travelsentro.test`) for now, not the real business owner email — same script, swap via env var right before launch.
- **D-04:** The seed script checks for an existing `role='admin'` profile first and no-ops if found — safe to re-run accidentally without creating duplicate admins.

**Account Lifecycle & Session Behavior**
- **D-05:** Deactivating a Staff/Admin account kills their session immediately — every server request re-validates `is_active` via the already-locked `getUser()` convention, not just at next login.
- **D-06:** Include a self-serve forgot-password flow using Supabase Auth's `resetPasswordForEmail()`.
- **D-07:** Session/token lifetime uses Supabase's defaults (short-lived access token, automatic silent refresh via refresh token) — no custom expiry configuration.
- **D-08:** No custom failed-login lockout logic — rely on Supabase Auth's built-in rate limiting (appropriate for a 2-5 person internal team, not a public attack surface).

**Package CRUD & Data Lifecycle**
- **D-09:** Package delete is a **soft delete** (`deleted_at` / `is_deleted` flag) — hides from public site and admin list but preserves the row and photos. Chosen specifically because Phase 3's CRM will link leads to `package_id`; a hard delete would orphan that history.
- **D-10:** Manual package display order (PKG-06) is set via a **drag-and-drop list** in the admin package index, writing `sort_order` on drop.
- **D-11:** Package photo management: multi-upload to Supabase Storage, drag-to-reorder (writes `package_photos.display_order`), per-photo delete. Matches the existing `package_photos` schema exactly — no schema changes needed.
- **D-12:** Itinerary days and inclusion/exclusion/bring list items are edited via **dynamic repeatable fields** (add/remove rows) using react-hook-form's `useFieldArray` — already in the stack, no new library.

**Admin Panel Layout & Permission UX**
- **D-13:** When Staff lack a permission (e.g. no "manage packages"), that nav item/section is **hidden entirely** — not shown-disabled. Note: server-side enforcement (AUTH-05) is required regardless of what's shown in the nav.
- **D-14:** Phase 2's admin nav has only **Packages** and **Users** (accounts/permissions) sections. CRM and Messaging nav items are added in Phase 3/4 when those features actually exist — not stubbed as "coming soon" placeholders now.
- **D-15:** Post-login, Admin/Staff land directly on the **Packages list** — no dashboard/home page in Phase 2, since there's no lead/messaging data yet to summarize.
- **D-16:** Publish/unpublish (PKG-04) and featured (PKG-05) toggles are **inline switches on the package list row** — requires adding shadcn's `switch` component (not yet installed).

### Claude's Discretion
- Exact admin route structure (e.g. `/admin/packages`, `/admin/users`) and middleware/layout wiring for the `(admin)` route group.
- Specific drag-and-drop library choice for package reorder and photo reorder (e.g. `@dnd-kit`).
- Exact `profiles` table schema shape (columns beyond role/permissions/is_active) and the Postgres trigger implementation details.
- Form validation rules and error/success UI states for login, account management, and package CRUD forms.
- Which additional shadcn components to install beyond `switch` (e.g. `table`, `select`, `alert-dialog` for delete confirmation).

### Deferred Ideas (OUT OF SCOPE)
- **Real admin dashboard** (lead/message activity summary) — raised during Admin Panel Layout discussion. There's nothing meaningful to show in Phase 2 (no CRM/messaging data exists), but once Phase 3 (CRM) ships, a proper dashboard summarizing new leads and recent activity is a good fit; Phase 4 (messaging) could add send stats on top. Not part of Phase 2 — revisit in Phase 3 or 4 discussion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| AUTH-01 | Admin/Staff can log in to the admin panel with email/password | Pattern 1 (`proxy.ts` session refresh) + Pattern 2 (DAL `verifySession()`) + Supabase `signInWithPassword` via a Server Action in `actions/auth.ts` |
| AUTH-02 | Admin can create new Admin or Staff accounts | `supabase.auth.admin.createUser()` (service-role, server-only) + Pattern 4 (auto-`profiles` trigger) — see Code Examples/Don't Hand-Roll |
| AUTH-03 | Admin can edit or deactivate existing Admin/Staff accounts | `profiles.is_active` toggle + Pattern 3's `SECURITY DEFINER` RLS helper (self-referential `profiles` policy) |
| AUTH-04 | Admin can toggle per-staff permissions individually (message customers / manage packages / edit CRM) | `profiles` table's 3 permission boolean columns, admin-only RLS write policy (Pattern 3) |
| AUTH-05 | A Staff member without a given permission is blocked both in the UI and at the API/data layer | D-13 (UI hide) + Pattern 2 (`requirePermission()` DAL) + Pattern 3 (RLS `has_permission()` helper) — see Security Domain V4 and Anti-Patterns |
| PKG-01 | Create a new tour package (itinerary, price, inclusions/exclusions, photos) | Pattern 3 (RLS insert policy scoped to `manage_packages`) + Pattern 5 (`useFieldArray` for itinerary/inclusions) + Pattern 6 (photo upload, see Don't Hand-Roll) |
| PKG-02 | Edit an existing tour package | Same as PKG-01, Server Action pattern with RLS update policy |
| PKG-03 | Delete a tour package | D-09 soft delete — see Pitfall 4 (interaction with `is_published`) and Open Question 1 |
| PKG-04 | Publish/unpublish a package | D-16 inline switch + Server Action calling `revalidatePath` (Anti-Patterns) so Phase 1's public site reflects the change |
| PKG-05 | Mark a package as featured/highlighted | Same mechanism as PKG-04 |
| PKG-06 | Set manual display order of packages on the public list | D-10 + Pattern 6 (`@dnd-kit` sortable + `arrayMove` + persisted `sort_order`) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives from `.claude/CLAUDE.md` that this phase's plan must comply with:

- **Use `@supabase/ssr`'s `createServerClient`/`createBrowserClient` pattern** for all Supabase client creation in Next.js App Router — do **not** install or use `@supabase/auth-helpers-nextjs` (deprecated, unmaintained).
- **Always call `supabase.auth.getUser()` server-side** (middleware/Server Components/DAL) — never `getSession()` — for authorization decisions, since `getUser()` revalidates the token against Supabase Auth servers rather than trusting a potentially-stale local session. This directly enables D-05's "kills session immediately" requirement.
- **Skip the Auth Hook / JWT `app_metadata` custom-claims RBAC pattern.** For this project's fixed 2-role + 3-boolean-permission model, use a simple `profiles` table + RLS policies checking role/permission columns. The more complex pattern is explicitly called out as over-engineered for this scale.
- **No general-purpose heavy component library** (MUI, Ant Design, Chakra) — shadcn/ui only, Tailwind-native.
- **No Redux / heavy global state libraries** — Server Components + Server Actions handle CRM/admin data fetching/mutation server-side; local `useState`/`useReducer` only for isolated client interactivity (e.g. drag state before a Server Action persists it).
- **Vercel Hobby plan is non-commercial-only** — not a Phase 2 blocker (dev/preview), but the plan should not assume production-readiness on Hobby.
- **Secrets** (Supabase service role key, future Resend/Semaphore keys) belong in `vercel env add` / `.env.local`, never committed to `vercel.json` or a tracked `.env` file — relevant here because `auth.admin.createUser()` requires the service-role key.

## Summary

Phase 2 adds the first authenticated surface to a codebase that has none yet: no `middleware.ts`/`proxy.ts`, no `(admin)` route group, no `profiles` table, and no write RLS policies on any of Phase 1's 5 package tables (all currently default-deny for writes). The single most important finding this session: **this project runs Next.js 16.2.10, which renamed `middleware.ts` to `proxy.ts`** (exported function `proxy`, not `middleware`) — every tutorial, StackOverflow answer, or piece of training data that says "create `middleware.ts`" is stale for this codebase. `AGENTS.md`'s warning ("this is NOT the Next.js you know") is confirmed correct and directly relevant to this phase's core task (session-gated routing).

The stack is otherwise a straight application of already-locked decisions: `@supabase/ssr` (already scaffolded in `lib/supabase/{client,server}.ts` with comments anticipating this exact phase) for session handling, a `profiles` table + RLS for the 2-role/3-permission model (CLAUDE.md explicitly rules out Auth Hooks/JWT custom claims as over-engineered for this scale), Server Actions for all mutations (matches the existing `lib/formspree.ts` + `inquiry-form.tsx` client-invoke pattern, not raw `<form action>`), `react-hook-form`'s `useFieldArray` for itinerary/inclusion rows (already a dependency), and `@dnd-kit` (new dependency, verified clean) for the two drag-and-drop reorder surfaces (package list `sort_order`, photo `display_order`).

The highest-risk technical trap is **RLS infinite recursion**: a policy on the `profiles` table that queries `profiles` to check `role = 'admin'` will recurse infinitely unless wrapped in a `SECURITY DEFINER` **plpgsql** function (a plain SQL function gets inlined by the query planner, silently losing the `SECURITY DEFINER` context and recursion returns). This specifically bites AUTH-02/03/04 (Admin managing other Admin/Staff accounts), not the package tables (querying `profiles` from a policy on a *different* table like `packages` is safe).

**Primary recommendation:** Create `proxy.ts` (not `middleware.ts`) calling `supabase.auth.getUser()` for token refresh + optimistic route redirect; enforce all real authorization (role/permission/`is_active`) in a server-only Data Access Layer (`lib/auth/dal.ts`) and in RLS policies via a `SECURITY DEFINER` plpgsql helper function — never in the proxy alone.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Login / credential verification | API / Backend (Supabase Auth) | Frontend Server (Server Action calling `signInWithPassword`) | Supabase Auth owns credential storage/hashing/rate-limiting (D-08); Next.js only orchestrates the form → action → redirect flow |
| Session token refresh & optimistic route redirect | Frontend Server (`proxy.ts`) | — | Proxy runs on every request before render; it's the only place that can read/refresh cookies before a Server Component renders (Next.js docs: Server Components can't write cookies) |
| Authoritative session/permission check (`is_active`, role, per-toggle permission) | API / Backend (Database — RLS) | Frontend Server (DAL `verifySession()`/`requirePermission()`) | RLS is the actual authorization boundary (same lesson as Phase 1's CR-01 fix); the DAL is a fast-fail convenience layer, not the source of truth — D-05 requires every request to re-validate, which only RLS + `getUser()` (not proxy-only) guarantees |
| Admin nav visibility (hide sections without permission) | Browser / Client (Frontend Server render) | — | D-13 is explicitly UI-only ("not shown-disabled"); has zero security value on its own, must never be treated as enforcement |
| Package/photo/itinerary/inclusion CRUD | API / Backend (Server Actions + RLS) | Database (Postgres tables) | Mutations happen in Server Actions per Next.js's data-security guide; RLS is the second enforcement layer so a bypassed/forgotten action-level check still fails safely |
| Package photo storage | Database / Storage (Supabase Storage) | Frontend Server (upload orchestration in Server Action) | Storage has its own RLS (`storage.objects`), separate from table RLS — must be extended independently, not implied by table policies |
| Drag-and-drop reorder interaction | Browser / Client (`@dnd-kit`) | API / Backend (Server Action persisting `sort_order`/`display_order`) | Reordering is a client-side interaction pattern; the resulting order must still be persisted and RLS-checked server-side, same as any other write |
| Public site reflecting admin changes (PKG-04 publish, PKG-05 feature, PKG-06 order) | Frontend Server (Next.js rendering, already built in Phase 1) | CDN / Static (cache revalidation) | Phase 1's public pages already read via `is_published`; Phase 2's Server Actions must call `revalidatePath`/`revalidateTag` on the relevant public routes after any mutation, or published changes won't appear without a redeploy |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | 0.12.3 (already installed) | Server/browser Supabase client factories, cookie-based session handling | Already scaffolded in `lib/supabase/{client,server}.ts` with comments explicitly anticipating this phase's real session wiring — no new client-factory work needed, only real cookie-write logic via `proxy.ts` |
| `@supabase/supabase-js` | 2.110.7 (already installed) | `auth.admin.createUser`, `auth.signInWithPassword`, `auth.resetPasswordForEmail`, table/storage queries | Peer of `@supabase/ssr`; `auth.admin.*` methods require the service-role key and must only run server-side (Server Actions), matching `scripts/seed.ts`'s existing service-role usage pattern |
| `react-hook-form` + `@hookform/resolvers` + `zod` | 7.82.0 / installed / ^4.4.3 (all already installed) | Admin CRUD forms (login, account create/edit, package create/edit) | Already the established pattern from Phase 1's `inquiry-form.tsx` — same `Form`/`FormField`/`FormControl`/`FormMessage` hand-authored wrapper in `components/ui/form.tsx` applies unchanged |
| `@dnd-kit/core` | 6.3.1 [VERIFIED: npm registry] | Drag context (`DndContext`) for package list and photo reorder | Purpose-built, accessible (keyboard support), actively maintained — see Package Legitimacy Audit |
| `@dnd-kit/sortable` | 10.0.0 [VERIFIED: npm registry] | `SortableContext`, `useSortable` hook, `arrayMove` helper | Standard companion to `@dnd-kit/core` specifically for reorderable lists (this phase's exact use case) |
| `@dnd-kit/utilities` | 3.2.2 [VERIFIED: npm registry] | CSS transform helpers for drag visuals | Required peer for `useSortable`'s `transform`/`transition` output |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `switch` | CLI-installed, not an npm dep | Publish/unpublish and featured inline toggles (D-16) | Not yet installed in this repo — must run `npx shadcn@latest add switch` before use |
| shadcn `table` | CLI-installed | Package list, user/account list | Composes with `@tanstack/react-table` if sorting/filtering grows later, but a plain `<Table>` is sufficient for Phase 2's list sizes |
| shadcn `select` | CLI-installed | Role dropdown (Admin/Staff) in account forms | Standard shadcn form control, pairs with the existing `Form`/`FormField` wrapper |
| shadcn `alert-dialog` | CLI-installed | Delete/deactivate confirmation dialogs | Prevents accidental destructive actions (soft-delete package, deactivate account) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `profiles` table + RLS subquery for role/permission checks | JWT `app_metadata` custom claims via Supabase Auth Hook | Avoids a DB lookup per RLS check, but adds Auth Hook registration/maintenance and token-refresh-subscription complexity — CLAUDE.md explicitly rules this out for 2 roles + 3 booleans |
| `@dnd-kit` | `react-beautiful-dnd` | `react-beautiful-dnd` is in maintenance mode (Atlassian archived it in 2025) and has known React 18+ StrictMode issues; `@dnd-kit` is the current community-standard replacement |
| Server Actions for CRUD | Route Handlers (`app/api/.../route.ts`) + client `fetch` | Route Handlers make sense for the Formspree webhook receiver (Phase 3) but add boilerplate (manual JSON parsing, manual error shaping) for form-driven CRUD that Server Actions handle natively via `useActionState`/direct invocation |

**Installation:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npx shadcn@latest add switch table select alert-dialog
```

**Version verification:** Verified directly against the npm registry on 2026-07-18:
- `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2` — all current, all last published within the active-maintenance window (dnd-kit's own GitHub repo, 19M+ weekly downloads combined).
- `react-hook-form@7.82.0`, `shadcn@4.13.1` — match versions already pinned in `package.json`, reconfirmed current via `npm view`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@dnd-kit/core` | npm | current version published 2024-12-05 (package itself much older) | ~19.2M/week | github.com/clauderic/dnd-kit | OK | Approved |
| `@dnd-kit/sortable` | npm | current version published 2024-12-04 | ~18.8M/week | github.com/clauderic/dnd-kit | OK | Approved |
| `@dnd-kit/utilities` | npm | current version published 2023-11-06 | ~19.1M/week | github.com/clauderic/dnd-kit | OK | Approved |

No `postinstall` scripts detected on any of the three packages.

**Packages removed due to `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌────────────────────────────┐
                         │  Browser (Admin/Staff)      │
                         │  - login form                │
                         │  - packages/users UI          │
                         │  - @dnd-kit drag interactions  │
                         └──────────────┬─────────────┘
                                        │ every request
                                        ▼
                         ┌────────────────────────────┐
                         │  proxy.ts (Next.js 16)      │
                         │  - supabase.auth.getUser()  │──refresh token, write cookies
                         │  - optimistic redirect:      │
                         │    unauth'd → /admin/login   │
                         └──────────────┬─────────────┘
                                        │ request continues
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Next.js App Router — app/(admin)/*                        │
        │                                                              │
        │  Server Components (read)        Server Actions (write)      │
        │  - call DAL verifySession()       - call DAL requirePermission│
        │  - render list/detail pages         ('manage_packages', etc) │
        │           │                                    │              │
        │           ▼                                    ▼              │
        │  ┌─────────────────────────────────────────────────────┐    │
        │  │  lib/auth/dal.ts  (server-only Data Access Layer)     │    │
        │  │  - verifySession(): re-validates via getUser()         │    │
        │  │  - requirePermission(perm): 403s if profile lacks it   │    │
        │  └─────────────────────────────────────────────────────┘    │
        └──────────────────────────┬───────────────────────────────────┘
                                    │ authenticated Postgres/Storage calls
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Supabase                                                     │
        │  - auth.users (Supabase-managed)                               │
        │       │ trigger: on_auth_user_created                          │
        │       ▼                                                        │
        │  - public.profiles (role, permissions, is_active)                │
        │       ▲ SECURITY DEFINER fn: is_admin(uid) — breaks recursion    │
        │  - public.packages / package_photos / itinerary_days /             │
        │    package_inclusions / faq_facts                                  │
        │       — RLS: public read (is_published), authenticated+permission  │
        │         write (new this phase)                                     │
        │  - storage.objects (package-photos bucket)                          │
        │       — RLS: public read (existing), authenticated+permission        │
        │         write (new this phase — separate from table RLS)             │
        └───────────────────────────────────────────────────────────┘
                                    │ revalidatePath/revalidateTag on write
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Public site — app/(public)/* (Phase 1, unchanged)           │
        │  reads is_published=true packages directly via RLS            │
        └───────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
proxy.ts                        # root-level, Next.js 16 convention — NOT middleware.ts
app/
├── (admin)/
│   ├── layout.tsx               # admin shell: sidebar (Packages, Users), calls DAL
│   ├── login/page.tsx           # public within (admin) group — proxy allow-lists this path
│   ├── forgot-password/page.tsx
│   ├── reset-password/page.tsx  # target of resetPasswordForEmail's redirectTo
│   ├── packages/
│   │   ├── page.tsx             # list: inline publish/feature switches, drag reorder
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx        # edit: itinerary/inclusions useFieldArray, photo manager
│   └── users/
│       └── page.tsx             # account list + create/edit/deactivate, permission toggles
├── (public)/                     # unchanged from Phase 1
lib/
├── supabase/
│   ├── client.ts                 # existing, unchanged
│   ├── server.ts                 # existing — proxy.ts now makes its cookie writes take effect
│   └── proxy.ts                  # updateSession() helper imported by root proxy.ts
├── auth/
│   └── dal.ts                    # server-only: verifySession(), requirePermission(), getProfile()
actions/
├── auth.ts                       # login, logout, requestPasswordReset, updatePassword
├── packages.ts                   # create/update/softDelete/publish/feature/reorder
├── package-photos.ts             # upload/delete/reorder
└── users.ts                      # createAccount, updateAccount, deactivate, updatePermissions
supabase/migrations/
└── <timestamp>_admin_access_package_management.sql  # profiles table, trigger, write RLS
```

### Pattern 1: `proxy.ts` optimistic session refresh (Next.js 16)
**What:** Root-level `proxy.ts` (not `middleware.ts`) refreshes the Supabase session cookie on every request and does a cheap redirect for obviously-unauthenticated requests to `/admin/*`.
**When to use:** Always, for any route under `(admin)` — this is the only place Server Components' otherwise-unwritable cookies get refreshed.
**Example:**
```ts
// Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md (bundled Next.js 16.2.10 docs)
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
}
```
```ts
// lib/supabase/proxy.ts — pattern per Supabase's server-side auth guide
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/admin') &&
      !request.nextUrl.pathname.startsWith('/admin/login')) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return response
}
```
**Note:** this is an *optimistic* check only (per Next.js's own authentication guide) — it must never be the sole authorization boundary. Real enforcement happens in the DAL + RLS.

### Pattern 2: Server-only Data Access Layer (DAL) for auth + permission checks
**What:** A `server-only` module that re-validates the session (`getUser()`, not `getSession()`) and checks the caller's `profiles` row (`is_active`, role, specific permission) before any Server Action or Server Component proceeds.
**When to use:** Every Server Action mutating package/account data (AUTH-05's server-side enforcement requirement), and every admin page/layout that needs the current user's profile.
**Example:**
```ts
// Source: node_modules/next/dist/docs/01-app/02-guides/authentication.md (bundled Next.js 16.2.10 docs) — DAL pattern
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const verifySession = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/admin/login')
  return user
})

export const getProfile = cache(async () => {
  const user = await verifySession()
  const supabase = await createClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, can_message_customers, can_manage_packages, can_edit_crm, is_active')
    .eq('id', user.id)
    .single()
  if (error || !profile || !profile.is_active) redirect('/admin/login')
  return profile
})

export async function requirePermission(perm: 'can_manage_packages' | 'can_message_customers' | 'can_edit_crm') {
  const profile = await getProfile()
  if (profile.role !== 'admin' && !profile[perm]) {
    throw new Error('Forbidden')
  }
  return profile
}
```

### Pattern 3: RLS write policy with `SECURITY DEFINER` helper (avoids recursion)
**What:** A plpgsql `SECURITY DEFINER` function checks the caller's profile without triggering `profiles`' own RLS recursively; used both by policies *on* `profiles` (self-referential, recursion-prone) and by policies on package tables (not recursion-prone, but reuses the same helper for consistency).
**When to use:** Any write policy gating on role/permission.
**Example:**
```sql
-- Source: cross-referenced Supabase community RLS recursion guidance (see Sources) — MUST be plpgsql, not sql, to preserve SECURITY DEFINER
create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  result boolean;
begin
  select
    is_active and (role = 'admin' or
      case perm
        when 'manage_packages' then can_manage_packages
        when 'message_customers' then can_message_customers
        when 'edit_crm' then can_edit_crm
        else false
      end)
  into result
  from public.profiles
  where id = uid;

  return coalesce(result, false);
end;
$$;

-- Safe on packages (different table than profiles — no recursion even without the helper,
-- but using it keeps the permission logic in one place):
create policy "manage_packages can insert" on packages
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'manage_packages'));

create policy "manage_packages can update" on packages
  for update to authenticated
  using (public.has_permission(auth.uid(), 'manage_packages'))
  with check (public.has_permission(auth.uid(), 'manage_packages'));

-- Self-referential on profiles itself — REQUIRES the SECURITY DEFINER function,
-- a naive `exists (select 1 from profiles where id = auth.uid() and role='admin')`
-- policy directly on profiles recurses infinitely:
create policy "admin can manage all profiles" on profiles
  for all to authenticated
  using (public.has_permission(auth.uid(), 'admin_only') or auth.uid() = id)
  with check (public.has_permission(auth.uid(), 'admin_only') or auth.uid() = id);
```

### Pattern 4: Auto-create `profiles` row on signup (D-02)
**What:** Trigger on `auth.users` insert creates the matching `profiles` row, defaulting to Staff/no-permissions.
**Example:**
```sql
-- Source: cross-referenced Supabase community "handle_new_user" pattern (see Sources)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, is_active, can_message_customers, can_manage_packages, can_edit_crm)
  values (new.id, 'staff', true, false, false, false);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### Pattern 5: `useFieldArray` for itinerary/inclusion rows (D-12)
**Example:**
```tsx
// Source: react-hook-form official docs (react-hook-form.com/docs/usefieldarray)
const { fields, append, remove } = useFieldArray({ control: form.control, name: 'itinerary' })

{fields.map((field, index) => (
  <div key={field.id}>
    <FormField
      control={form.control}
      name={`itinerary.${index}.title`}   // template literal, NOT bracket notation
      render={({ field }) => (/* ... */)}
    />
    <Button type="button" onClick={() => remove(index)}>Remove day</Button>
  </div>
))}
<Button type="button" onClick={() => append({ dayNumber: fields.length + 1, title: '', description: '' })}>
  Add day
</Button>
```

### Pattern 6: `@dnd-kit` sortable list persisting `sort_order` (D-10, D-11)
**Example:**
```tsx
// Source: dnd-kit official docs (dndkit.com/react/guides/sortable-state-management)
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function handleDragEnd(event: DragEndEvent, items: Package[], setItems: (p: Package[]) => void) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = items.findIndex((i) => i.id === active.id)
  const newIndex = items.findIndex((i) => i.id === over.id)
  const reordered = arrayMove(items, oldIndex, newIndex)
  setItems(reordered)
  reorderPackagesAction(reordered.map((p, idx) => ({ id: p.id, sort_order: idx }))) // Server Action, persists
}
```

### Anti-Patterns to Avoid
- **Relying on `proxy.ts` (or `middleware.ts` habits) as the authorization boundary:** Next.js's own docs warn Proxy is for "optimistic checks" only — a Server Function/Server Action moved to a route the matcher excludes silently loses proxy coverage. AUTH-05 requires server/data-layer enforcement (DAL + RLS), not proxy-only.
- **A plain SQL `SECURITY DEFINER` function for the RLS permission check:** Postgres inlines simple SQL functions during planning, which drops the `SECURITY DEFINER` context and reintroduces the recursion bug. Must be `language plpgsql`.
- **Treating D-13's hidden nav as security:** it is UI-only per the locked decision; every corresponding Server Action must independently call `requirePermission()`.
- **Forgetting `storage.objects` RLS is separate from table RLS:** the `package-photos` bucket currently has only a public-read policy (from Phase 1); package photo upload/delete/reorder needs its own `storage.objects` INSERT/UPDATE/DELETE policies scoped by the same `manage_packages` permission — extending `packages` table RLS alone does not cover Storage writes.
- **Not calling `revalidatePath`/`revalidateTag` after mutations:** Phase 1's public pages are already built and read `is_published` packages; without explicit revalidation after a publish/feature/reorder Server Action, changes won't be visible on the public site until the next deploy or cache expiry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing/storage, session token issuance/refresh, rate-limited login | Custom bcrypt + JWT session library | Supabase Auth (`signInWithPassword`, `getUser()`, built-in rate limiting per D-08) | Already the mandated stack; a hand-rolled auth system reintroduces exactly the risk classes (timing attacks, token replay, weak rate limiting) Supabase Auth already handles |
| Role/permission-aware JWT claims system | Custom Auth Hook writing `app_metadata` claims + token refresh subscription | `profiles` table + RLS (CLAUDE.md-mandated) | CLAUDE.md explicitly rules this out for 2 roles + 3 booleans — adds Auth Hook registration/maintenance complexity with no payoff at this scale |
| Drag-and-drop reordering | Custom `onDragStart`/`onDrop` HTML5 DnD handlers | `@dnd-kit` | HTML5 native DnD has notoriously inconsistent mobile/touch support and accessibility gaps; `@dnd-kit` handles pointer/touch/keyboard uniformly and is the current community standard (`react-beautiful-dnd`'s successor) |
| Dynamic repeatable form rows (itinerary days, inclusions) | Custom array-of-`useState` field management | `react-hook-form`'s `useFieldArray` | Already a dependency; hand-rolled array state re-renders the whole form on every keystroke and reinvents validation-error tracking per row |
| Forgot-password email + token flow | Custom token generation, email sending, expiry logic | `supabase.auth.resetPasswordForEmail()` + `updateUser({ password })` | Supabase Auth already handles token generation, expiry, and the PKCE/recovery-session flow; D-06 explicitly calls for this built-in flow |

**Key insight:** every "don't hand-roll" item in this phase overlaps with security-sensitive code (auth, permissions, password reset). The cost of a subtle bug in a hand-rolled version is disproportionate to the (small) convenience saved — this is exactly the domain where using the vetted library matters most.

## Common Pitfalls

### Pitfall 1: RLS infinite recursion on `profiles`' own policies
**What goes wrong:** A policy on `profiles` that does `exists (select 1 from profiles where id = auth.uid() and role = 'admin')` recurses — every row-check re-triggers the same policy.
**Why it happens:** RLS policies apply to every query against the table, including the subquery inside another policy on that same table.
**How to avoid:** Wrap the check in a `SECURITY DEFINER` **plpgsql** function (Pattern 3). This specifically matters for AUTH-02/03/04 (Admin managing other accounts), not for policies on `packages`/`package_photos`/etc. (querying `profiles` from a different table's policy is safe).
**Warning signs:** Postgres error `"infinite recursion detected in policy for relation \"profiles\""` on any query touching `profiles` as an authenticated user.

### Pitfall 2: `proxy.ts` refreshes the token but drops the cookie
**What goes wrong:** The proxy calls `getUser()` (which silently refreshes an expired access token) but the handler doesn't forward the newly-set cookies onto the outgoing response — the user appears logged out even though the refresh succeeded server-side.
**Why it happens:** `NextResponse.next({ request })` must be re-created *after* `cookies.setAll` runs so the new response includes the refreshed request; using a response created before the `setAll` callback captures stale cookies.
**How to avoid:** Follow Pattern 1 exactly — construct `response` inside the `setAll` callback, not before it.
**Warning signs:** Users get randomly logged out mid-session despite Supabase's dashboard showing an active/refreshed session.

### Pitfall 3: `is_active` deactivation not enforced until next login (violates D-05)
**What goes wrong:** A deactivated Staff account keeps working until their access token naturally expires, because only `signInWithPassword` was gated on `is_active`, not every subsequent request.
**Why it happens:** `getUser()` validates the *token* is valid, not that the *profile* is still active — those are separate checks.
**How to avoid:** Every DAL call (`getProfile()`) must re-check `is_active` from the `profiles` table on every request (Pattern 2), and the corresponding RLS `has_permission()` function must also check `is_active` (Pattern 3) so even a bypassed DAL check still fails at the database layer.
**Warning signs:** A deactivated Staff member can still submit Server Actions successfully until their token's natural expiry.

### Pitfall 4: Soft-deleted packages leaking through public RLS
**What goes wrong:** D-09 adds a `deleted_at`/`is_deleted` column, but Phase 1's public-read policy only filters on `is_published = true` — if a package is soft-deleted without also being unpublished, it's invisible to the *admin UI* (correct) but the migration must explicitly also exclude deleted rows from the public policy, or a soft-deleted-but-still-published row remains publicly visible.
**Why it happens:** Two independent boolean/timestamp flags (`is_published`, `deleted_at`) with overlapping visibility semantics are easy to under-specify.
**How to avoid:** Update the public-read policy to `using (is_published = true and deleted_at is null)` (or equivalent), and decide explicitly whether the soft-delete Server Action also force-sets `is_published = false` — flagged as an open question below for the planner to lock down.
**Warning signs:** A "deleted" package still appears on the public site.

### Pitfall 5: `next.config.ts`'s image remote pattern already covers admin uploads — don't add a second one
**What goes wrong:** Someone assumes admin-uploaded photos need a new `remotePatterns` entry and adds a broader/duplicate one, accidentally loosening the tight `pathname` scoping Phase 1's code review (CR-01-adjacent) already locked to `/storage/v1/object/public/package-photos/**`.
**Why it happens:** Not realizing admin uploads write to the *same* bucket/path shape the public site already reads from.
**How to avoid:** No `next.config.ts` change needed for Phase 2 — new admin-uploaded photos land in the same `package-photos` bucket at `{packageId}/photo-N.jpg`-shaped paths, already covered by the existing `remotePatterns` entry.
**Warning signs:** A new, broader `hostname`/`pathname` pattern appears in a PLAN.md task list without justification.

## Code Examples

See Architecture Patterns 1-6 above for the primary verified patterns (proxy session refresh, DAL, RLS `SECURITY DEFINER` helper, auto-profile trigger, `useFieldArray`, `@dnd-kit` reorder) — all sourced from the bundled Next.js 16.2.10 docs (`node_modules/next/dist/docs/`), react-hook-form's and dnd-kit's official documentation, and cross-referenced Supabase community RLS-recursion guidance.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` / `export function middleware()` | `proxy.ts` / `export function proxy()` | Next.js 16.0.0 | This project is already on 16.2.10 — must use the new convention from day one; a codemod (`npx @next/codemod@canary middleware-to-proxy .`) exists but is irrelevant here since no `middleware.ts` exists yet to migrate |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Supabase deprecated auth-helpers in favor of ssr (pre-dates this project) | Already correctly avoided — `package.json` has no `auth-helpers-nextjs` dependency |
| `getSession()` for authorization decisions | `getUser()` (revalidates against Auth server) | Supabase's own guidance, already encoded in this project's `.claude/CLAUDE.md` | Already a locked convention (`lib/supabase/server.ts` comments reference it); this research confirms it's still current Supabase best practice |

**Deprecated/outdated:**
- `middleware.ts` file convention: deprecated in Next.js 16.0.0, renamed to `proxy.ts`. Training data and most existing tutorials still say `middleware.ts` — treat any such reference as needing translation to `proxy.ts` for this codebase.
- `react-beautiful-dnd`: effectively unmaintained (Atlassian archived it); do not use even if it appears in older search results or training data.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact wording/behavior of Supabase's `resetPasswordForEmail` + `PASSWORD_RECOVERY` event flow (redirect URL must be allow-listed in Auth URL Configuration) | Pattern/Code Examples, Don't Hand-Roll | If the allow-list step is missed, the forgot-password flow (D-06) silently fails with a redirect rejection — low risk, easily caught in manual testing, but worth an explicit checkpoint in the plan |
| A2 | `auth.admin.createUser({ email_confirm: true })` fully skips the confirmation email under this project's default Auth settings | Code Examples / Don't Hand-Roll | If a project-level "confirm email" setting overrides this, newly-created Staff/Admin accounts (AUTH-02) might be unable to sign in until manually confirmed — should be spot-checked against the live Supabase project's Auth settings during planning/execution, not assumed |
| A3 | Storage `package-photos` bucket write RLS needs its own explicit `storage.objects` policies distinct from table RLS (no auto-inheritance) | Architecture Patterns / Pitfalls | If wrong in the other direction (i.e., some inheritance exists), this just means extra-but-harmless explicit policies; if right (as documented Supabase behavior generally confirms), skipping this step leaves photo upload/delete broken despite package table writes working |

**Note:** Most claims in this research were cross-checked against either the bundled Next.js 16.2.10 docs (`node_modules/next/dist/docs/`, HIGH confidence — first-party, version-matched) or multiple independent WebSearch results referencing official Supabase docs (MEDIUM confidence). No context7/MCP documentation tools were available in this session; all "docs" kind lookups fell back to WebSearch per the tool-strategy fallback rule.

## Open Questions

1. **Does soft-deleting a package (D-09) also force `is_published = false`, or are they fully independent flags?**
   - What we know: D-09 locks soft-delete as the mechanism (preserves the row for Phase 3's `package_id` FK); the existing public-read RLS policy only filters on `is_published`.
   - What's unclear: whether a soft-deleted-but-still-`is_published=true` package should be publicly visible (almost certainly not, per Pitfall 4).
   - Recommendation: the plan should either (a) make the delete Server Action set both `deleted_at` and `is_published = false` atomically, or (b) update the public-read RLS policy to also filter `deleted_at is null`. Doing both is safest (defense in depth, consistent with Phase 1's RLS-as-real-boundary lesson).

2. **Exact `profiles` table column set beyond role/permissions/is_active** (explicitly Claude's Discretion per CONTEXT.md)
   - What we know: needs `id` (FK to `auth.users.id`), `role` (admin/staff), 3 permission booleans, `is_active`, likely `name` for display in the admin nav/user list.
   - What's unclear: whether `created_at`/`updated_at` audit columns are wanted now or deferred (Phase 3's CRM explicitly wants a `CRM-07` audit trail on CRM records — worth considering a consistent pattern now vs. later).
   - Recommendation: include `created_at` at minimum (cheap, consistent with `packages.created_at` from Phase 1); defer a fuller audit trail unless the planner judges it trivial to add now.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js runtime, `tsx` scripts | ✓ | v20.19.4 | — |
| npm | Package installs | ✓ | 10.8.2 | — |
| Supabase CLI | Migrations (`supabase migration new`, `supabase db push`) | ✓ | 2.109.1 | — |
| Supabase project (linked, per `supabase/.temp/linked-project.json`) | All Auth/DB/Storage work this phase depends on | ✓ (already linked from Phase 1) | — | — |

No missing dependencies — this phase is additive to an already-working local/CI toolchain from Phase 1.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes | Supabase Auth `signInWithPassword` (bcrypt-backed credential storage, built-in login rate limiting per D-08 — no custom lockout logic) |
| V3 Session Management | Yes | Supabase Auth's default short-lived access token + automatic refresh (D-07 — no custom expiry); `getUser()` (not `getSession()`) for every authorization decision so session invalidation (D-05, account deactivation) takes effect immediately rather than only at next token refresh |
| V4 Access Control | Yes | `profiles` table + RLS (role + 3 permission booleans), enforced via a `SECURITY DEFINER` plpgsql helper function on every write-capable table and on `storage.objects`; server-side DAL (`requirePermission()`) as a fast-fail layer in front of RLS, never as the sole boundary (AUTH-05) |
| V5 Input Validation | Yes | `zod` schemas (already a dependency) for every admin form — package fields, account fields, itinerary/inclusion rows — mirroring `components/inquiry/inquiry-schema.ts`'s existing pattern; Server Actions must re-validate with the same schema server-side, not trust client-side `react-hook-form` validation alone (per Next.js data-security guide's "always validate input from client" guidance) |
| V6 Cryptography | Partial | Password hashing is entirely delegated to Supabase Auth (never hand-rolled, per Don't Hand-Roll); no custom cryptography is introduced by this phase — service-role key usage (for `auth.admin.createUser`) must stay server-only exactly as `scripts/seed.ts` already establishes, never exposed to a Client Component or bundled client code |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| RLS bypass via forgotten write policy on a newly-added table/column | Elevation of Privilege | Default-deny RLS (already the project convention from Phase 1) — every new writable table must get explicit, permission-scoped INSERT/UPDATE/DELETE policies before shipping; audit via the same anon-key HTTP-call verification technique Phase 1 used (01-02 decision log) |
| IDOR via Server Action trusting a client-supplied `package_id`/`profile_id` without ownership/permission re-check | Tampering / Elevation of Privilege | Every Server Action re-runs `requirePermission()` server-side (Pattern 2) regardless of what the UI already hid; RLS provides a second independent check even if a Server Action's own check is buggy |
| Service-role key leakage into client bundle | Information Disclosure | Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) only referenced from Server Actions/scripts, never from a `"use client"` file or any `NEXT_PUBLIC_`-prefixed env var — mirrors `scripts/seed.ts`'s existing safeguard comment |
| CSRF on Server Actions | Tampering | Next.js Server Actions are POST-only and same-origin-checked (Origin vs Host header comparison) by default — no additional CSRF token needed per the bundled Next.js 16.2.10 data-security guide, as long as `serverActions.allowedOrigins` isn't loosened |
| Stale/deactivated session still authorized | Elevation of Privilege | `is_active` re-checked in both the DAL (Pattern 2) and the RLS helper function (Pattern 3) on every request — satisfies D-05's "kills session immediately" requirement without needing a custom token-revocation mechanism |

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — bundled Next.js 16.2.10 docs, confirms `middleware.ts` → `proxy.ts` rename, matcher config, execution order, Node.js runtime default
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — bundled docs, Proxy overview and "not a full session management/authorization solution" guidance
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` — bundled docs, DAL pattern, optimistic-vs-secure authorization checks, Server Component/Server Action auth check patterns
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` — bundled docs, Server Action security (secure action IDs, CSRF via Origin/Host check, "always re-verify inside the action" guidance), DTO pattern
- Direct repo inspection: `lib/supabase/{client,server}.ts`, `supabase/migrations/*.sql`, `types/database.ts`, `scripts/seed.ts`, `components/inquiry/inquiry-form.tsx`, `components/ui/form.tsx`, `package.json`, `next.config.ts` — establishes exact existing conventions this phase must extend
- `npm view @dnd-kit/core version`, `@dnd-kit/sortable version`, `@dnd-kit/utilities version` — direct registry queries, confirms current versions
- `gsd-tools query package-legitimacy check` — confirms all 3 `@dnd-kit/*` packages OK (no SLOP/SUS signals)

### Secondary (MEDIUM confidence — WebSearch cross-referenced against official docs URLs)
- supabase.com/docs/guides/auth/server-side/{creating-a-client,nextjs} — SSR client + proxy session-refresh pattern
- supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac, supabase.com/docs/guides/database/postgres/row-level-security — RBAC/RLS approaches, USING vs WITH CHECK semantics
- supabase.com/docs/reference/javascript/auth-admin-createuser — `admin.createUser` / `email_confirm` behavior
- supabase.com/docs/reference/javascript/auth-resetpasswordforemail, supabase.com/ui/docs/nextjs/password-based-auth — forgot-password flow, `redirectTo` allow-list requirement
- github.com/orgs/supabase/discussions/1138 and dev.to RLS-recursion write-ups — `SECURITY DEFINER` plpgsql-vs-SQL-function recursion distinction (cross-referenced across 3+ independent community sources, consistent explanation)
- react-hook-form.com/docs/usefieldarray — `useFieldArray` API and template-literal field naming requirement
- dndkit.com/react/guides/sortable-state-management, dndkit.com/react/hooks/use-sortable — `useSortable`/`arrayMove` pattern

### Tertiary (LOW confidence — flagged for validation)
- None — all findings were either bundled-docs-verified or cross-referenced against ≥1 official Supabase/react-hook-form/dnd-kit documentation URL in the WebSearch results.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core libraries already installed and pinned in `package.json`; new `@dnd-kit` packages directly version-verified via `npm view` and passed the legitimacy gate
- Architecture (proxy.ts rename, DAL, RLS recursion pattern): HIGH for the proxy.ts finding (first-party bundled docs, unambiguous), MEDIUM for RLS recursion/DAL specifics (WebSearch cross-referenced against official docs but not directly fetched from context7/MCP tooling, which was unavailable this session)
- Pitfalls: MEDIUM-HIGH — RLS recursion and proxy cookie-propagation pitfalls are well-documented, consistently described across independent sources; the soft-delete/is_published interaction pitfall (Pitfall 4) is this research's own inference from the existing schema + locked decisions, not an externally-sourced claim, and is called out as Open Question 1 for the planner to explicitly resolve

**Research date:** 2026-07-18
**Valid until:** 2026-08-17 (30 days — Next.js/Supabase ecosystem moves fast enough that a re-check is warranted if planning is delayed; the `proxy.ts` finding in particular should be re-verified against `node_modules/next/dist/docs/` if the Next.js version changes before Phase 2 executes)
