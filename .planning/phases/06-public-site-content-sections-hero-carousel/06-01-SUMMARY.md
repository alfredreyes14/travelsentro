---
phase: 06-public-site-content-sections-hero-carousel
plan: 01
subsystem: database-and-dependencies
tags: [supabase, rls, storage, migration, embla-carousel, shadcn]
dependency-graph:
  requires: []
  provides:
    - "hero_slides, value_props, testimonials, partners tables (live on remote Supabase project)"
    - "site-content Storage bucket with public-read / can_manage_packages-write RLS"
    - "types/database.ts Row/Insert/Update types for all 4 new tables"
    - "embla-carousel-autoplay@8.6.0 installed"
    - "components/ui/avatar.tsx (Avatar/AvatarImage/AvatarFallback)"
  affects:
    - "actions/*.ts (06-02) -- Server Actions writing to the 4 new tables"
    - "components/homepage/hero-carousel.tsx (06-03) -- consumes embla-carousel-autoplay"
    - "components/homepage/testimonials-section.tsx (06-04) -- consumes components/ui/avatar.tsx"
tech-stack:
  added:
    - "embla-carousel-autoplay@8.6.0"
    - "shadcn avatar component (components/ui/avatar.tsx)"
  patterns:
    - "public-read (using (true)) / can_manage_packages-scoped authenticated write RLS, mirroring packages' existing AUTH-05 double-enforcement shape"
    - "single table + text CHECK-constrained discriminator column (partners.partner_type), matching package_inclusions.kind / messages.channel precedent"
key-files:
  created:
    - "supabase/migrations/20260727075208_create_homepage_content_schema.sql"
    - "components/ui/avatar.tsx"
  modified:
    - "types/database.ts"
    - "package.json"
    - "package-lock.json"
decisions:
  - "Used shadcn CLI's current default preset (base-nova, @base-ui/react primitives) for avatar.tsx -- same precedent already established in Phase 01 (multi-line `export { Avatar, AvatarImage, AvatarFallback, ... }` block instead of a single-line `export function`), so the plan's literal single-line grep verification command reports 0 matches even though the component correctly exports Avatar/AvatarImage/AvatarFallback (confirmed via `npm run build` type-checking successfully and a corrected multi-line-aware grep)"
metrics:
  duration: "5 min"
  completed: "2026-07-27"
status: complete
---

# Phase 6 Plan 1: Homepage Content Schema & Dependencies Summary

Authored and pushed the four-table + Storage-bucket database foundation (`hero_slides`, `value_props`, `testimonials`, `partners`, `site-content` bucket) that every later Phase 6 plan depends on, and installed the phase's two new dependencies (`embla-carousel-autoplay@8.6.0`, shadcn's `avatar` component) — all RLS-enforced and live-verified against the remote Supabase project via direct anon-key PostgREST calls.

## What Was Built

- **`supabase/migrations/20260727075208_create_homepage_content_schema.sql`** — four new tables, each with `enable row level security` + the exact 5-policy shape already established for `packages` (`"public read"` unconditional SELECT, plus `can_manage_packages`-scoped authenticated read-all/insert/update/delete via the existing `has_permission()` SECURITY DEFINER helper):
  - `hero_slides` — `slide_type` (`package`|`promo`), `package_id` (nullable FK to `packages`), `image_storage_path`, `headline`, `subheading`, `cta_label`, `external_link`, `sort_order`. `hero_slides_package_shape` CHECK constraint enforces `package_id` is populated iff `slide_type='package'` (database-layer enforcement, not just application logic).
  - `value_props` — `title`, `description`, `sort_order` (text-only, no icon column per RESEARCH.md Assumption A2).
  - `testimonials` — `customer_name`, `quote`, `rating` (CHECK 1-5), `photo_storage_path` (nullable), `sort_order`.
  - `partners` — `partner_type` (`brand_partner`|`corporate_client`), `logo_storage_path`, `link_url` (nullable), `sort_order` — shared table with a discriminator column per D-07, matching this codebase's `package_inclusions.kind`/`messages.channel` precedent.
  - `site-content` Storage bucket (public) + 4 `storage.objects` policies scoped to `bucket_id = 'site-content'` — entirely independent of the 4 tables' own RLS, mirroring `package-photos`' exact policy shape.
  - Zero `anon`/unauthenticated write path anywhere across all 4 tables and the bucket.

- **`types/database.ts`** — regenerated via `supabase gen types typescript`; now includes `hero_slides`, `value_props`, `testimonials`, `partners` Row/Insert/Update shapes for downstream Server Actions and components.

- **`embla-carousel-autoplay@8.6.0`** — installed, version-matched to the already-installed `embla-carousel-react@^8.6.0`; unblocks 06-03's hero carousel autoplay wiring.

- **`components/ui/avatar.tsx`** — scaffolded via `npx shadcn@latest add avatar`; exports `Avatar`, `AvatarImage`, `AvatarFallback` (plus `AvatarGroup`, `AvatarGroupCount`, `AvatarBadge` from this shadcn version's expanded registry item) for 06-04's testimonial photos.

## Verification Performed

- Migration acceptance-criteria greps (Task 1): all exact-match counts confirmed — 4 `create table` statements, 1 `hero_slides_package_shape`, 1 `check (rating between 1 and 5)`, 1 `check (partner_type in`, 4 `"public read"` policies, 24 `has_permission(auth.uid(), 'can_manage_packages')` occurrences (20 table-level + 4 storage.objects), 1 `insert into storage.buckets`, 5 `bucket_id = 'site-content'` occurrences, 0 `for insert/update/delete to anon`.
- `supabase db push` succeeded; `supabase migration list` confirms `20260727075208_create_homepage_content_schema` applied on remote (Local == Remote for all 9 migrations).
- `types/database.ts` regenerated; grep confirms `hero_slides`, `value_props`, `testimonials`, `partners` all present as generated table names.
- Direct anon-key PostgREST `GET` against all 4 tables: `HTTP 200`, `[]` (empty array, no rows yet, public read confirmed working).
- Direct anon-key PostgREST `POST` (INSERT) against all 4 tables: `HTTP 401`, `"new row violates row-level security policy"` for every table — confirms zero anon write path.
- `site-content` Storage bucket confirmed live via service-role `GET /storage/v1/bucket/site-content` → `{"id":"site-content","public":true,...}`.
- `npm run build` completed successfully (Next.js 16.2.10, Turbopack) with no new TypeScript errors — both new dependencies (`embla-carousel-autoplay`, `components/ui/avatar.tsx`) import cleanly.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues were encountered.

### Notable (non-deviation) observations

**1. shadcn avatar.tsx export style doesn't match the plan's literal grep pattern**
- **Found during:** Task 3
- **Detail:** The plan's `<verify>` command uses `grep -c 'export.*Avatar' components/ui/avatar.tsx`, which expects a single-line export statement. This project's current shadcn CLI default (base-nova preset, `@base-ui/react` primitives) generates a multi-line `export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }` block instead — an established precedent already documented in Phase 01's SUMMARY/STATE decisions ("file inventory and API surface still match... despite the different CLI preset"). The component correctly exports `Avatar`, `AvatarImage`, and `AvatarFallback` as required; this was confirmed via a corrected multi-line-aware grep (`grep -c '^  Avatar'` → 6 matches) and via `npm run build`'s successful TypeScript compilation. No code change was needed — this is a verification-command mismatch, not a functional gap.
- **Files affected:** `components/ui/avatar.tsx` (no changes made beyond the CLI-generated file)
- **Commit:** 74daf86

Auth gates: None encountered — Supabase CLI was already authenticated/linked from prior phases, `supabase db push --yes` completed non-interactively.

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260727075208_create_homepage_content_schema.sql`
- FOUND: `components/ui/avatar.tsx`
- FOUND: commit `f46094d` (Task 1 — migration authored)
- FOUND: commit `2887629` (Task 2 — pushed + types regenerated)
- FOUND: commit `74daf86` (Task 3 — dependencies installed)
- FOUND: `hero_slides`, `value_props`, `testimonials`, `partners` all present in `types/database.ts`
- FOUND: `20260727075208` shown as applied on remote via `supabase migration list`
