---
phase: 06-public-site-content-sections-hero-carousel
plan: 06
subsystem: ui
tags: [react-hook-form, zod, shadcn, admin-crud, dialog, star-rating]

requires:
  - phase: 06-02
    provides: "actions/value-props.ts, actions/testimonials.ts, actions/partners.ts (CRUD), actions/site-content-uploads.ts (uploadSiteContentImage), lib/read-file-as-base64.ts (readFileAsBase64)"
provides:
  - "components/admin/content/value-prop-form-schema.ts -- valuePropFormSchema, ValuePropFormValues"
  - "components/admin/content/value-prop-form.tsx -- ValuePropForm({ mode, valueProp?, onSuccess }), ValuePropRecord"
  - "components/admin/content/value-props-list.tsx -- ValuePropsList({ initialItems })"
  - "components/admin/content/star-rating-input.tsx -- StarRatingInput({ value, onChange })"
  - "components/admin/content/testimonial-form-schema.ts -- testimonialFormSchema, TestimonialFormValues"
  - "components/admin/content/testimonial-form.tsx -- TestimonialForm({ mode, testimonial?, onSuccess }), TestimonialRecord"
  - "components/admin/content/testimonials-list.tsx -- TestimonialsList({ initialItems })"
  - "components/admin/content/partner-form-schema.ts -- partnerFormSchema, PartnerFormValues"
  - "components/admin/content/partner-form.tsx -- PartnerForm({ mode, partnerType, partner?, onSuccess }), PartnerRecord, PartnerType"
  - "components/admin/content/partners-list.tsx -- PartnersList({ initialBrandPartners, initialCorporateClients })"
affects: ["06-08 (mounts ValuePropsList/TestimonialsList/PartnersList inside /admin/content's remaining 3 tabs)"]

tech-stack:
  added: []
  patterns:
    - "Dual create/edit form dispatch (mirrors account-form.tsx / hero-slide-form.tsx exactly): *Form dispatcher -> Create*Form/Edit*Form -> shared *FormBody"
    - "Immediate pre-submit image upload on file-input onChange (readFileAsBase64 + uploadSiteContentImage), writing the result into form.setValue before the form's own submit runs"
    - "Dialog-wraps-Form-then-list CRUD composition (mirrors users-table.tsx exactly): add/edit via Dialog, delete via AlertDialog, responsive hidden md:block Table / md:hidden Card-list split"
    - "No drag-reorder for value props/testimonials/partners -- append-at-end sort_order computed server-side (06-02), per this phase's Claude's Discretion scope decision"
    - "Clickable star-rating widget: 5 button elements reusing the exact fill-primary/text-primary vs fill-transparent/text-muted-foreground className logic from the public StarRating display"
    - "partnerType is always a fixed prop on PartnerForm (never a form field) -- partner-form-schema.ts's zod schema structurally excludes it, enforced by a 0-count grep check"

key-files:
  created:
    - "components/admin/content/value-prop-form-schema.ts"
    - "components/admin/content/value-prop-form.tsx"
    - "components/admin/content/value-props-list.tsx"
    - "components/admin/content/star-rating-input.tsx"
    - "components/admin/content/testimonial-form-schema.ts"
    - "components/admin/content/testimonial-form.tsx"
    - "components/admin/content/testimonials-list.tsx"
    - "components/admin/content/partner-form-schema.ts"
    - "components/admin/content/partner-form.tsx"
    - "components/admin/content/partners-list.tsx"
  modified: []

decisions:
  - "[Phase 06-06]: value-props-list.tsx/testimonials-list.tsx use local setItems-based filtering on delete (not router.refresh()) but call router.refresh() via a shared handleMutationSuccess on create/edit, mirroring hero-slides-list.tsx's exact split between optimistic local-state deletes and server-refresh-driven create/edit -- consistent across all 3 tabs in this plan"
  - "[Phase 06-06]: partners-list.tsx's PartnerSubSection is a single parameterized component instantiated twice (brand_partner/corporate_client) with heading/addLabel/emptyHeading/emptyBody/removeBody/partnerType all passed as distinct props, rather than duplicating the JSX twice -- keeps the two sub-sections' state (items/dialog-open booleans) fully independent per-instance while avoiding literal code duplication"
  - "[Phase 06-06]: Removed an initial partnerType mention from partner-form-schema.ts's doc comment (rephrased to 'partner-type discriminator field') after the first verification pass caught a false-positive grep hit -- the acceptance criteria's 0-count check confirms partnerType is excluded from the actual schema/fields, not from prose describing why it's excluded"

metrics:
  duration: "8 min"
  completed: "2026-07-27"
status: complete
---

# Phase 6 Plan 6: Why Choose Us / Testimonials / Partners & Clients Admin Tabs Summary

Built the remaining 3 tabs of `/admin/content` -- Why Choose Us (value props), Testimonials, and Partners & Clients -- all using the identical Dialog-wraps-Form-then-list CRUD composition proven in `users-table.tsx`, with no drag-reorder for any of the three (new items append at the end via server-computed `sort_order`, per this phase's Claude's Discretion scope decision).

## What Was Built

- **`value-prop-form-schema.ts` / `value-prop-form.tsx` / `value-props-list.tsx`** -- Simplest of the three: 2 flat fields (title, description). `ValuePropForm` mirrors `account-form.tsx`'s exact dual create/edit dispatch (`CreateValuePropForm`/`EditValuePropForm` delegating to a shared `ValuePropFormBody`). `ValuePropsList` is the Dialog-wraps-Form + AlertDialog-delete + responsive Table/Card-list composition, wired to `createValueProp`/`updateValueProp`/`deleteValueProp`.
- **`star-rating-input.tsx`** -- `StarRatingInput({ value, onChange })`: 5 `<button type="button">` elements in a `flex gap-1`, each rendering a `StarIcon` with the identical fill/muted className logic as the public `StarRating` display, `onClick={() => onChange(index + 1)}` and an `aria-label` per star.
- **`testimonial-form-schema.ts` / `testimonial-form.tsx` / `testimonials-list.tsx`** -- 4 fields (customerName, quote, rating via `StarRatingInput`, optional photoStoragePath). `TestimonialForm` combines the dual-mode dispatch pattern with `hero-slide-form.tsx`'s exact immediate pre-submit image-upload flow (`readFileAsBase64` + `uploadSiteContentImage("testimonials", ...)`, written into `form.setValue("photoStoragePath", ...)`). `TestimonialsList` mirrors `ValuePropsList`'s exact structure.
- **`partner-form-schema.ts` / `partner-form.tsx` / `partners-list.tsx`** -- `partnerType` is deliberately excluded from the zod schema and never a form field; it's always a fixed prop passed in by the caller (which button, "Add Partner" or "Add Client", opened the dialog). `PartnerForm`'s submit label derives from the fixed `partnerType` prop. `PartnersList` renders two fully independent sub-sections (Brand Partners, Corporate Clients) via a shared parameterized `PartnerSubSection` component instantiated twice with distinct props -- each sub-section keeps its own `items`/dialog-open state, no shared array anywhere in the component.

All 10 files wired directly to 06-02's Server Actions (`actions/value-props.ts`, `actions/testimonials.ts`, `actions/partners.ts`, `actions/site-content-uploads.ts`) and `lib/read-file-as-base64.ts`, matching UI-SPEC's exact copy for CTAs, empty states, and delete/remove confirmations.

## Verification Performed

- Task 1 (value props): all 8 grep acceptance criteria matched (schema export, 2 error-copy strings, action import, CTA copy, empty-state copy, delete-confirmation copy, 2 `deleteValueProp` occurrences); `npm run build` passed with 0 new TypeScript errors.
- Task 2 (testimonials): all 7 grep acceptance criteria matched (`StarRatingInput` export, 2 rating-error-copy strings, testimonials/site-content-uploads imports, 1 `<StarRatingInput` usage, empty-state/delete-confirmation copy); `npm run build` passed with 0 new TypeScript errors.
- Task 3 (partners): all 11 grep acceptance criteria matched, including the critical `partnerType` == 0 count in `partner-form-schema.ts` (confirming the discriminator is structurally excluded from the form schema) and both `partnerType="brand_partner"`/`partnerType="corporate_client"` literal invocations in `partners-list.tsx`; `npm run build` passed with 0 new TypeScript errors.
- Final full-suite re-run of all 26 grep checks across all 3 tasks plus `npm run build` confirmed a clean, consistent end state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a false-positive `partnerType` grep hit from partner-form-schema.ts's doc comment**
- **Found during:** Task 3 verification (`grep -c 'partnerType' components/admin/content/partner-form-schema.ts` returned 1, expected 0)
- **Issue:** The doc comment explaining why `partnerType` is excluded from the schema itself contained the literal string "partnerType" twice, tripping the acceptance criteria's 0-count check meant to confirm structural exclusion from the actual zod fields.
- **Fix:** Reworded the comment to say "partner-type discriminator field" instead of "partnerType", preserving the same explanation without the literal substring match.
- **Files modified:** `components/admin/content/partner-form-schema.ts`
- **Commit:** `af0863d`

No other deviations -- plan executed exactly as written otherwise. No auth gates encountered (pure client-component plan, no CLI/service credentials involved).

## Self-Check: PASSED

- FOUND: `components/admin/content/value-prop-form-schema.ts`
- FOUND: `components/admin/content/value-prop-form.tsx`
- FOUND: `components/admin/content/value-props-list.tsx`
- FOUND: `components/admin/content/star-rating-input.tsx`
- FOUND: `components/admin/content/testimonial-form-schema.ts`
- FOUND: `components/admin/content/testimonial-form.tsx`
- FOUND: `components/admin/content/testimonials-list.tsx`
- FOUND: `components/admin/content/partner-form-schema.ts`
- FOUND: `components/admin/content/partner-form.tsx`
- FOUND: `components/admin/content/partners-list.tsx`
- FOUND: commit `1694119` (Task 1 -- value props tab)
- FOUND: commit `5846348` (Task 2 -- testimonials tab)
- FOUND: commit `af0863d` (Task 3 -- partners & clients tab)
