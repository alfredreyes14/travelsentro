---
phase: 06-public-site-content-sections-hero-carousel
plan: 02
subsystem: service-layer-server-actions
tags: [server-actions, supabase, storage, crud, permission-gate]
dependency-graph:
  requires:
    - "06-01: hero_slides/value_props/testimonials/partners tables + types/database.ts + site-content Storage bucket"
  provides:
    - "actions/hero-slides.ts -- createSlide, updateSlide, deleteSlide, reorderSlides"
    - "actions/value-props.ts -- createValueProp, updateValueProp, deleteValueProp"
    - "actions/testimonials.ts -- createTestimonial, updateTestimonial, deleteTestimonial"
    - "actions/partners.ts -- createPartner, updatePartner, deletePartner"
    - "actions/site-content-uploads.ts -- uploadSiteContentImage(folder, file), deleteSiteContentImage(storagePath)"
    - "lib/read-file-as-base64.ts -- readFileAsBase64(file)"
  affects:
    - "components/admin/content/*-form.tsx (06-05/06-06) -- imports these Server Actions directly"
    - "components/admin/content/hero-slides-list.tsx (06-05) -- imports reorderSlides"
tech-stack:
  added: []
  patterns:
    - "requirePermission('can_manage_packages') first statement in every exported Server Action, mirroring actions/packages.ts"
    - "revalidatePath('/') + revalidatePath('/admin/content') on every mutation -- deliberate deviation from the packages.ts analog's '/packages' targets"
    - "per-partner_type scoped sort_order count (independent Brand Partners / Corporate Clients ordering)"
    - "single-file-per-entity Storage upload with random-suffix path (no running-max race, unlike package-photos.ts's multi-photo gallery)"
key-files:
  created:
    - "actions/hero-slides.ts"
    - "actions/value-props.ts"
    - "actions/testimonials.ts"
    - "actions/partners.ts"
    - "actions/site-content-uploads.ts"
    - "lib/read-file-as-base64.ts"
  modified: []
decisions:
  - "[Phase 06-02]: uploadSiteContentImage does not call revalidatePath -- the uploaded image isn't attached to any visible entity until the owning createSlide/createTestimonial/createPartner/updateSlide call runs afterward and revalidates"
  - "[Phase 06-02]: deleteSiteContentImage is a standalone Storage-only utility (no DB row deletion, not chained from deleteSlide/deleteTestimonial/deletePartner) -- accepted orphaned-object scope limit per plan's explicit call-out, not a silent gap"
  - "[Phase 06-02]: partners.ts scopes its sort_order count query with .eq('partner_type', values.partnerType) so Brand Partners and Corporate Clients maintain fully independent ordering, never a shared global count"
metrics:
  duration: "8 min"
  completed: "2026-07-27"
status: complete
---

# Phase 6 Plan 2: Homepage Content Server Actions Summary

Built the write-path service layer for all four new homepage content types (hero slides, value props, testimonials, partners) plus a shared single-image Storage-upload action, mirroring `actions/packages.ts`'s exact `requirePermission` + `ActionResult` + `revalidatePath` shape and `actions/package-photos.ts`'s base64-decode-then-upload shape -- with every mutation deliberately revalidating `/` (never `/packages`) so the homepage never goes stale after an admin edit.

## What Was Built

- **`actions/hero-slides.ts`** -- `createSlide`, `updateSlide`, `deleteSlide`, `reorderSlides`. `createSlide` appends via a row-count-based `sort_order` (no `deleted_at` filter, since `hero_slides` has no soft-delete column). `deleteSlide` is a hard delete. `reorderSlides` copies `reorderPackages`' exact `Promise.all`-per-item shape.
- **`actions/value-props.ts`** -- `createValueProp`, `updateValueProp`, `deleteValueProp`. Simple append-at-end `sort_order` on create, no drag-reorder (per RESEARCH.md's discretion note -- not required this phase).
- **`actions/testimonials.ts`** -- `createTestimonial`, `updateTestimonial`, `deleteTestimonial`. No server-side rating-range re-validation beyond client zod -- the `testimonials.rating` `check (between 1 and 5)` constraint from 06-01's migration is the backstop, matching the project's existing accepted WR-01 pattern.
- **`actions/partners.ts`** -- `createPartner`, `updatePartner`, `deletePartner`. `createPartner`'s `sort_order` count query is scoped with `.eq("partner_type", values.partnerType)` so Brand Partners and Corporate Clients each maintain their own independent order (D-07). `updatePartner` never touches `partner_type`.
- **`actions/site-content-uploads.ts`** -- `uploadSiteContentImage(folder, file)` uploads a single file to the `site-content` bucket under `${folder}/${timestamp}-${randomSuffix}.${ext}` and returns `{ ok: true, storagePath }`; no `revalidatePath` call since the owning entity's own create/update call handles that afterward. `deleteSiteContentImage(storagePath)` is a standalone Storage-only remove, deliberately not chained from any entity's delete action (accepted orphaned-object scope limit, documented in the plan).
- **`lib/read-file-as-base64.ts`** -- extracted `readFileAsBase64(file: File): Promise<string>` verbatim from `photo-manager.tsx`'s inline implementation, as a plain client-safe module (no directive) for 06-05/06-06's upload forms to share instead of duplicating.

All 14 exported functions across the 5 action files call `await requirePermission("can_manage_packages")` as their first statement -- no new permission toggle introduced, matching PROJECT.md's locked fixed-3-toggle decision.

## Verification Performed

- Task 1 (`hero-slides.ts` + `value-props.ts`): grep counts confirmed exactly 4 `requirePermission` calls in hero-slides.ts (1 per function), exactly 1 `reorderSlides` export, 0 `revalidatePath("/packages")`, 4 `revalidatePath("/")`; value-props.ts confirmed 3 `requirePermission` calls, 0 `/packages`, 3 `revalidatePath("/")`.
- Task 2 (`testimonials.ts` + `partners.ts`): grep counts confirmed 3 `requirePermission` calls and 3 `revalidatePath("/")` in testimonials.ts (0 `/packages`); partners.ts confirmed 3 `requirePermission` calls, 1 occurrence of the scoped `partner_type", values.partnerType` count filter, 0 `/packages`, 3 `revalidatePath("/")`.
- Task 3 (`site-content-uploads.ts` + `read-file-as-base64.ts`): grep counts confirmed exactly 1 `uploadSiteContentImage` export, 1 `deleteSiteContentImage` export, 2 `requirePermission` calls, 2 `"site-content"` occurrences, 0 `"package-photos"` occurrences; `read-file-as-base64.ts` confirmed exactly 1 `readFileAsBase64` export and 0 `"use server"` occurrences.
- `npm run build` (Next.js 16.2.10, Turbopack) completed successfully -- compiled in 4.3s, TypeScript finished in 5.3s, all 17 routes generated with no new TypeScript errors.

## Deviations from Plan

None -- plan executed exactly as written. All acceptance criteria grep counts matched on the first attempt; no auto-fixes, missing functionality, or blocking issues encountered.

Auth gates: None encountered -- no CLI login/auth steps required for this pure service-layer plan (no Supabase CLI push, no live HTTP verification needed since this plan adds zero new schema).

## Self-Check: PASSED

- FOUND: `actions/hero-slides.ts`
- FOUND: `actions/value-props.ts`
- FOUND: `actions/testimonials.ts`
- FOUND: `actions/partners.ts`
- FOUND: `actions/site-content-uploads.ts`
- FOUND: `lib/read-file-as-base64.ts`
- FOUND: commit `d74b2ee` (Task 1 -- hero-slides.ts + value-props.ts)
- FOUND: commit `d460097` (Task 2 -- testimonials.ts + partners.ts)
- FOUND: commit `87d9c23` (Task 3 -- site-content-uploads.ts + read-file-as-base64.ts)
