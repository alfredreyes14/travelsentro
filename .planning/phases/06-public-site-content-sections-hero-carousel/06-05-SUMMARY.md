---
phase: 06-public-site-content-sections-hero-carousel
plan: 05
subsystem: ui
tags: [react-hook-form, zod, dnd-kit, shadcn, discriminated-union, admin-crud]

requires:
  - phase: 06-02
    provides: "actions/hero-slides.ts (createSlide/updateSlide/deleteSlide/reorderSlides), actions/site-content-uploads.ts (uploadSiteContentImage), lib/read-file-as-base64.ts (readFileAsBase64)"
provides:
  - "components/admin/content/hero-slide-form-schema.ts -- heroSlideFormSchema (discriminated union on slideType), HeroSlideFormValues"
  - "components/admin/content/hero-slide-form.tsx -- HeroSlideForm({ mode, slide?, packages, onSuccess }), HeroSlidePackageOption, HeroSlideRecord"
  - "components/admin/content/hero-slides-list.tsx -- HeroSlidesList({ initialSlides, packages }), HeroSlideListItem"
affects: ["06-08 (mounts HeroSlidesList inside /admin/content's Hero Slides tab)"]

tech-stack:
  added: []
  patterns:
    - "Discriminated-union zod schema (z.discriminatedUnion('slideType', [...])) with both branches declaring the identical field set (differing only in requiredness) so a single useForm<HeroSlideFormValues>() call type-checks without a separately-typed internal shape"
    - "Dual create/edit form dispatch (mirrors account-form.tsx exactly): HeroSlideForm dispatcher -> CreateHeroSlideForm/EditHeroSlideForm -> shared HeroSlideFormBody"
    - "Immediate pre-submit image upload on file-input onChange (readFileAsBase64 + uploadSiteContentImage), writing the result into form.setValue('imageStoragePath', ...) before the form's own submit runs"
    - "dnd-kit optimistic drag-reorder with rollback, mirroring sortable-package-list.tsx's exact handleDragEnd shape against reorderSlides"

key-files:
  created:
    - "components/admin/content/hero-slide-form-schema.ts"
    - "components/admin/content/hero-slide-form.tsx"
    - "components/admin/content/hero-slides-list.tsx"
  modified: []

key-decisions:
  - "Used plain <img> (not next/image) for the hero-slide-row thumbnail since next.config.ts's Image Optimizer remotePatterns is scoped only to the package-photos bucket -- extending it for site-content is out of this plan's file scope and a raw <img> needs no such allowlisting"
  - "Cast EditHeroSlideForm's defaultValues to HeroSlideFormValues since slide.slideType is a widened 'package' | 'promo' (not a literal), which TypeScript can't statically narrow into a single discriminated-union member even though it always matches one at runtime"
  - "Defined HeroSlideListItem = HeroSlideRecord & { packageName, imageUrl } in hero-slides-list.tsx -- the list needs two display-only fields the form doesn't, and this shape stays assignable to HeroSlideRecord for the Edit dialog's slide prop"

requirements-completed: [HOME-01]

coverage:
  - id: D1
    description: "hero-slide-form-schema.ts's discriminated union enforces packageId (package slides) or headline+image (promo slides), with UI-SPEC's exact error copy"
    requirement: "HOME-01"
    verification:
      - kind: unit
        ref: "grep acceptance criteria (Task 1) -- discriminatedUnion('slideType', field-error copy strings, HeroSlideFormValues export) all matched"
        status: pass
    human_judgment: false
  - id: D2
    description: "HeroSlideForm supports create/edit dual mode with an immediate pre-submit image upload and a caller-filtered package picker (no re-filtering inside the component)"
    requirement: "HOME-01"
    verification:
      - kind: unit
        ref: "grep acceptance criteria (Task 2) -- imports, submit button copy, slideType branching all matched; npm run build passed with 0 TypeScript errors"
        status: pass
    human_judgment: true
    rationale: "Visual/interaction correctness of the dual-mode form (slide-type toggle, upload flow, package picker) needs a human to actually exercise it in the browser once 06-08 mounts this component -- static grep + type-check can't confirm the runtime UX."
  - id: D3
    description: "HeroSlidesList combines optimistic drag-reorder, add/edit dialogs, and a delete confirmation, all wired to 06-02's Server Actions"
    requirement: "HOME-01"
    verification:
      - kind: unit
        ref: "grep acceptance criteria (Task 3) -- imports, DndContext, empty-state/delete-confirmation copy, exactly 2 <HeroSlideForm usages all matched; npm run build passed with 0 TypeScript errors"
        status: pass
    human_judgment: true
    rationale: "Drag-reorder UX and the rollback-on-failure path are only meaningfully verifiable by dragging real rows in a browser once 06-08 supplies live hero_slides data -- out of reach for a headless grep/build check."

duration: 12min
completed: "2026-07-27"
status: complete
---

# Phase 6 Plan 5: Hero Slides Admin Tab Summary

**Discriminated-union zod schema + dual create/edit react-hook-form + dnd-kit reorder for the `/admin/content` Hero Slides tab, wired to 06-02's Server Actions**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-07-27
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- `heroSlideFormSchema` discriminates on `slideType`: package-type slides require `packageId`, promo-type slides require `headline` and an uploaded `imageStoragePath`, each with UI-SPEC's exact field-error copy
- `HeroSlideForm` renders a dual create/edit form (mirroring `account-form.tsx`'s exact mode-dispatch shape) where a `slideType` Select conditionally shows either a caller-filtered package picker or headline/subheading/CTA/link fields plus an immediate pre-submit image upload
- `HeroSlidesList` combines dnd-kit optimistic drag-reorder (byte-identical control flow to `sortable-package-list.tsx`), a Dialog-wrapped Add/Edit form, and an AlertDialog delete confirmation with UI-SPEC's exact copy

## Task Commits

Each task was committed atomically:

1. **Task 1: hero-slide-form-schema.ts (discriminated union)** - `1a5bb50` (feat)
2. **Task 2: hero-slide-form.tsx (dual mode, slide-type branching, image upload)** - `8103863` (feat)
3. **Task 3: hero-slides-list.tsx (dnd-kit reorder + dialog CRUD)** - `fa34785` (feat)

_No TDD tasks this plan -- all `type="auto"`._

## Files Created/Modified

- `components/admin/content/hero-slide-form-schema.ts` - `heroSlideFormSchema` discriminated union on `slideType`, `HeroSlideFormValues` type
- `components/admin/content/hero-slide-form.tsx` - `HeroSlideForm({ mode, slide?, packages, onSuccess })` dual-mode form, `HeroSlidePackageOption`/`HeroSlideRecord` types
- `components/admin/content/hero-slides-list.tsx` - `HeroSlidesList({ initialSlides, packages })` drag-reorder + CRUD list, `HeroSlideListItem` type

## Decisions Made

- Both discriminated-union branches (`package`/`promo`) declare the identical 7-field set, differing only in which fields are required -- this let a single `useForm<HeroSlideFormValues>()` call type-check cleanly against the union without needing a separately-typed internal "flattened" form shape or an `as unknown as Resolver<...>` cast
- Used a plain `<img>` (not `next/image`) for the hero-slide-row thumbnail, since `next.config.ts`'s Image Optimizer `remotePatterns` only allowlists the `package-photos` bucket pathname -- extending it for `site-content` is out of this plan's file scope, and a raw `<img>` needs no such allowlisting for this admin-only list row
- `EditHeroSlideForm`'s `defaultValues` object is cast `as HeroSlideFormValues` since `slide.slideType` is typed as the widened `"package" | "promo"` (not a literal) on the incoming prop, which TypeScript can't statically narrow into a single union member even though it always matches one at runtime
- `HeroSlideListItem` is defined as `HeroSlideRecord & { packageName, imageUrl }` in `hero-slides-list.tsx` (not `hero-slide-form.tsx`) since those two fields are display-only, needed by the list but not the form; the type stays structurally assignable to `HeroSlideRecord` for the Edit dialog's `slide` prop

## Deviations from Plan

None - plan executed exactly as written. One micro-fix during Task 2's `npm run build` verification: the initial `handleImageChange` branch (`if (result.ok && result.storagePath) {...} else { toast.error(result.error) }`) didn't type-narrow cleanly since `ActionResult`'s `error` field only exists on the `{ ok: false }` variant -- restructured to `if (!result.ok) {...} else if (result.storagePath) {...} else {...}` so TypeScript's discriminated-union narrowing on `result.ok` applies correctly before accessing `.error`. This is a Rule 1 (bug/blocking type error) auto-fix within the same task, not a separate deviation from the plan's intent.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan adds zero new Server Actions, schema, or dependencies; it consumes 06-02's already-shipped Server Actions as-is.

## Next Phase Readiness

- All 3 files ready for 06-08 to mount `<HeroSlidesList initialSlides={...} packages={...} />` inside `/admin/content`'s Hero Slides tab
- 06-08 will need to: (1) query `hero_slides` + resolve each row's display `imageUrl` (package-linked slides pull the package's own first photo per RESEARCH.md Open Question 1; promo slides resolve `imageStoragePath` via the `site-content` bucket's public URL) and `packageName`, assembling `HeroSlideListItem[]`; (2) query packages filtered to `is_featured=true, is_published=true, deleted_at is null` for the `packages` prop (RESEARCH.md Pitfall 2 -- this component intentionally does not re-filter)
- No blockers -- `npm run build` passes cleanly with all 3 new files in place, no new TypeScript errors

---
*Phase: 06-public-site-content-sections-hero-carousel*
*Completed: 2026-07-27*
