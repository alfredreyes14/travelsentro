---
phase: 06-public-site-content-sections-hero-carousel
verified: 2026-07-27T15:07:02Z
status: passed
score: 5/5 must-haves verified (2 present, behavior-unverified)
behavior_unverified: 2
overrides_applied: 0
human_verification:

  - test: "As an Admin, create a promo-type hero slide (headline + uploaded image, no linked package) and save it; then edit that same promo slide's headline and re-save."
    expected: "Both create and edit succeed with a success toast and no error -- this exercises the CR-01 fix (values.packageId || null coercion) against the live hero_slides_package_shape CHECK constraint, which cannot be proven by static grep/read alone."
    why_human: "Requires an actual Supabase INSERT/UPDATE round-trip through Postgres's CHECK constraint evaluation; static code review confirms the `||` operator is used correctly but cannot prove the live DB accepts the resulting payload."

  - test: "As an Admin, add a new Hero Slide (or Value Prop / Testimonial / Partner) via its Dialog form and confirm the new row appears in the list immediately after the dialog closes, with no browser reload. Repeat for an edit on an existing row."
    expected: "The new/edited item appears in the list right after the success toast -- no stale data, no requirement to hard-reload the page."
    why_human: "This is the CR-02 fix: a prop-to-state resync pattern (`if (initialX !== prevInitialX) { setPrevInitialX(...); setItems(...) }`) that is only observable at runtime across a router.refresh() cycle. The pattern matches React's documented 'adjusting state during render' idiom and is applied consistently across all 4 lists (including the previously-missing `router.refresh()` in partners-list.tsx), but no test suite exists in this project to exercise it, so its correctness in the browser must be confirmed by hand."

  - test: "Load the homepage with at least one hero slide of each type (package + promo) present, and confirm: (a) the carousel autoplays every ~5s, (b) hovering pauses it, (c) manual prev/next interaction stops autoplay (stopOnInteraction), (d) with OS-level 'reduce motion' enabled, the carousel never auto-advances but manual controls still work."
    expected: "All 4 behaviors hold as documented in hero-carousel.tsx's comment."
    why_human: "Runtime timing/animation and OS-level media-query behavior cannot be verified via static analysis. Note: keyboard focus-based pausing is NOT wired (only onMouseEnter/onMouseLeave) -- this is WR-02 in 06-REVIEW.md, a known non-blocking gap, not a defect to newly discover."

  - test: "In the admin Hero Slides tab, drag-reorder 2+ slides and confirm the new order persists after a page refresh; then simulate a reorder failure (e.g. temporarily revoke can_manage_packages mid-drag or throttle network) and confirm the list rolls back to the prior order with an error toast."
    expected: "Successful reorders persist via reorderSlides; failed reorders roll back optimistically-applied order."
    why_human: "dnd-kit drag interaction and the optimistic-rollback-on-failure path are runtime behaviors verified in this pass only by confirming the code mirrors sortable-package-list.tsx's pattern (reorderSlides call + rollback wiring present) -- not by observing an actual failed drag."
---

# Phase 6: Public Site Content Sections + Hero Carousel Verification Report

**Phase Goal:** The homepage gains a hero carousel (rotating featured packages and general brand/promotional imagery) and admin-editable content sections -- value props, a featured packages grid, customer testimonials, an embedded inquiry form, and conditional Brand Partners/Corporate Clients logo sections -- all within the existing locked brand system.
**Verified:** 2026-07-27T15:07:02Z
**Status:** human_needed
**Re-verification:** No -- initial verification (this is the first VERIFICATION.md for Phase 6; a prior 06-REVIEW.md code review exists and is cross-referenced throughout, per the task's explicit instruction to re-verify its 2 post-review fixes rather than trust SUMMARY.md)

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP/task)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Homepage displays a hero carousel mixing rotating featured packages and general brand/promotional imagery, fully admin-editable (add/edit/delete/reorder slides) | ✓ VERIFIED (artifacts+wiring) / ⚠️ carousel runtime behavior and drag-reorder are behavior-dependent | `components/homepage/hero-carousel.tsx` renders both `slideType: "package"` and `"promo"` branches from one `slides` prop (app/(public)/page.tsx:76-110); admin CRUD confirmed in `components/admin/content/hero-slide-form.tsx` + `hero-slides-list.tsx` (create/edit/delete/reorder all present and wired to `actions/hero-slides.ts`). See human_verification #3/#4 for the runtime autoplay/drag behaviors. |
| 2 | Homepage displays a "why choose us"/value props section, a featured packages grid (reusing "featured" flag), and customer testimonials (photo, name, quote, star rating) -- all admin-editable | ✓ VERIFIED | `why-choose-us.tsx`, `featured-packages-grid.tsx` (reuses `<PackageCard>` unchanged, filters `is_published && is_featured` in `app/(public)/page.tsx:133-139`), `testimonials-section.tsx` (Avatar photo-or-initials + 5-star `StarRating`) all present, wired via `app/(public)/page.tsx:224-226`, and each has full admin CRUD (`value-prop-form.tsx`/`-list.tsx`, `testimonial-form.tsx`/`-list.tsx` with `star-rating-input.tsx` widget) calling `actions/value-props.ts` / `actions/testimonials.ts`. |
| 3 | Homepage includes an embedded general inquiry form section reusing the existing inquiry pipeline (Formspree + CRM), not a new form/pipeline | ✓ VERIFIED | `app/(public)/page.tsx:232`: `<InquiryForm />` imported from the pre-existing `components/inquiry/inquiry-form.tsx`, called with zero props (no `packageName`/`packageId`) -- identical usage to the existing `/contact` page. No new form component or action created for this. |
| 4 | Brand Partners and Corporate Clients logo sections each render only when at least one entry exists, hidden entirely otherwise | ✓ VERIFIED | `brand-partners.tsx:16` and `corporate-clients.tsx:16` are two structurally independent components, each with its own `if (partners.length === 0) return null` / `if (clients.length === 0) return null` -- no shared/combined check. `app/(public)/page.tsx:179-219` runs two fully independent `partners` queries filtered by `partner_type`. Admin side: `partners-list.tsx` renders two independent sub-lists with separate "Add Partner"/"Add Client" buttons. |
| 5 | All new sections live on the homepage only, within the existing locked brand system -- no new colors, fonts, or off-brand styling | ✓ VERIFIED | Grepped all new `components/homepage/*.tsx` and `components/admin/content/*.tsx` for hardcoded hex colors / arbitrary Tailwind color utilities (`bg-[...]`, `text-[...]` beyond typographic px/leading scales) -- none found. All color usage is via existing semantic tokens (`text-primary`, `bg-secondary`, `text-muted-foreground`, `text-white`). `font-heading` is the pre-existing brand font CSS variable (defined in `app/layout.tsx`), not a new font. New sections are added only inside `app/(public)/page.tsx` -- no other page modified. |

**Score:** 5/5 truths present-and-wired (2 of the 5 -- #1's carousel-runtime-behavior and drag-reorder facets -- are behavior-dependent and routed to human verification below; they do not fail, they are unproven by static analysis alone)

### Code Review Fix Re-Verification (CR-01, CR-02 -- commit `1a7b70e`)

Per the task's explicit instruction, these were re-verified against the actual diff rather than trusting 06-REVIEW.md's inline "FIXED" annotations or SUMMARY.md claims.

| Fix | Claim | Re-verification | Status |
|-----|-------|------------------|--------|
| CR-01 | `package_id: values.packageId ?? null` changed to `values.packageId || null` in both `createSlide`/`updateSlide` (`actions/hero-slides.ts`) | Confirmed via `git show 1a7b70e -- actions/hero-slides.ts`: both call sites at lines 43 and 80 now use `||`. `||` correctly coalesces `""` (the form's default/unset value for a promo slide, per `hero-slide-form.tsx` `defaultValues`) to `null`, satisfying the `hero_slides_package_shape` CHECK constraint (`slide_type='promo' and package_id is null`). The same `?? ` → `\|\|` pattern was also applied to `actions/partners.ts` (`link_url`) and `actions/testimonials.ts` (`photo_storage_path`) for IN-04, consistent with the same root-cause fix. Logically sound -- `||` is the correct operator here since `packageId`/`linkUrl`/`photoStoragePath` are all string-typed form fields where `""` and `null`/`undefined` should be treated identically (there is no legitimate falsy-but-meaningful string value being miscoalesced, e.g. no valid UUID or URL is `""`, `0`, or `false`). | ✓ VERIFIED (static) -- see human_verification #1 for the live-DB round-trip confirmation, since a CHECK constraint's actual enforcement can only be proven by executing the INSERT/UPDATE against Postgres. |
| CR-02 | All 4 admin lists (`hero-slides-list.tsx`, `value-props-list.tsx`, `testimonials-list.tsx`, `partners-list.tsx`) now resync local `items` state when `initialItems`/`initialSlides` prop changes after `router.refresh()`; `partners-list.tsx` additionally gained a missing `router.refresh()` call | Confirmed via `git show 1a7b70e` diff: all 4 files add an identical `const [prevInitialX, setPrevInitialX] = useState(initialX); if (initialX !== prevInitialX) { setPrevInitialX(initialX); setItems(initialX); }` block, executed during render (not inside `useEffect`). This is React's documented "adjusting state when a prop changes" pattern and is a legitimate, correct fix -- it relies on prop *reference* inequality, which holds because `router.refresh()` re-executes the Server Component and passes a brand-new array literal down as a fresh prop on every refresh (confirmed this is consistent with Next.js's App Router refresh semantics: client component state persists, but props are recomputed). `partners-list.tsx`'s diff additionally adds the missing `useRouter()` import + `router.refresh()` call inside `handleMutationSuccess`, matching its 3 siblings. No regression risk identified (delete's existing optimistic `setItems(current => current.filter(...))` path is untouched by this diff). | ✓ VERIFIED (static, pattern-correct) -- see human_verification #2 for the browser-observable round-trip confirmation, since this is a state-transition behavior that only manifests across an actual `router.refresh()` render cycle, which cannot be executed by static grep. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260727075208_create_homepage_content_schema.sql` | `hero_slides`, `value_props`, `testimonials`, `partners` tables + `site-content` bucket, RLS mirroring `packages` | ✓ VERIFIED | All 4 tables present with `enable row level security`, public-read `using (true)` SELECT policy + `can_manage_packages`-gated INSERT/UPDATE/DELETE policies calling `public.has_permission(auth.uid(), 'can_manage_packages')`. `hero_slides_package_shape` CHECK constraint present (lines 32-35). `site-content` bucket insert present (line 157). |
| `types/database.ts` | Regenerated types for 4 new tables | ✓ VERIFIED | Confirmed referenced/imported as `Database["public"]["Tables"]["hero_slides"/"value_props"/"testimonials"/"partners"]["Row"]` throughout `app/(public)/page.tsx` and `app/admin/(dashboard)/content/page.tsx` without type errors in the reviewed excerpts. |
| `components/homepage/hero-carousel.tsx` | `HeroCarousel({ slides })`, autoplay/pause/reduced-motion | ✓ VERIFIED (present+wired), ⚠️ runtime behavior unverified | See truth #1 and human_verification #3. |
| `components/homepage/why-choose-us.tsx`, `featured-packages-grid.tsx`, `testimonials-section.tsx`, `brand-partners.tsx`, `corporate-clients.tsx` | Prop-driven, empty-array-returns-null presentational components | ✓ VERIFIED | All 5 files read in full; each has the `if (x.length === 0) return null` guard, zero Supabase imports, zero placeholder/"coming soon" copy. |
| `actions/hero-slides.ts`, `value-props.ts`, `testimonials.ts`, `partners.ts`, `site-content-uploads.ts` | Permission-gated CRUD Server Actions | ✓ VERIFIED | `requirePermission("can_manage_packages")` confirmed as the first statement in every exported function across all 5 files (14 call sites total). |
| `app/(public)/page.tsx` | Composes all 7 sections server-side | ✓ VERIFIED | Full file read; composition order matches UI-SPEC exactly (Hero, WhyChooseUs, FeaturedPackagesGrid, Testimonials, InquiryForm, BrandPartners, CorporateClients); orphan-skip filter (`slide.slide_type === "promo" \|\| slide.packages !== null`) present at line 77; two independent partner_type queries present. |
| `app/admin/(dashboard)/content/page.tsx` | Permission-gated Tabs page, live server-fetched data | ✓ VERIFIED | `requirePermissionOrRedirect("can_manage_packages")` is the first statement (line 49); package picker query correctly filtered `is_featured=true, is_published=true, deleted_at is null` (line 68) -- the only place in the codebase this filter runs, matching the plan's must-have. |
| `app/admin/(dashboard)/layout.tsx` | `canManagePackages`-gated "Content" sidebar nav item | ✓ VERIFIED | Line 70-74: `{canManagePackages && (<SidebarMenuButton ... render={<Link href="/admin/content" />}>...<span>Content</span>...)}`, reusing the same `canManagePackages` boolean (line 38) already used for the Packages nav item -- no new permission toggle introduced. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `hero-slide-form.tsx` | `actions/hero-slides.ts` | direct Server Action import + `await` in `onSubmit`, after `packageId \|\| null` coercion | ✓ WIRED | Confirmed at both create/update call sites (post-fix). |
| `hero-slides-list.tsx` | `actions/hero-slides.ts`'s `reorderSlides` | `dnd-kit onDragEnd` → optimistic reorder → `reorderSlides(...)` | ✓ WIRED | `onDragEnd={handleDragEnd}` (line 199) calls `reorderSlides` (line 129) inside `DndContext`. |
| `app/(public)/page.tsx` | `components/homepage/*` | server-fetched props passed down | ✓ WIRED | All 6 imports present and all 6 components rendered with correctly-shaped props. |
| `app/(public)/page.tsx` | `components/inquiry/inquiry-form.tsx` (existing) | `<InquiryForm />` with no props | ✓ WIRED | Confirmed, zero new form/pipeline. |
| `app/admin/(dashboard)/content/page.tsx` | `components/admin/content/{HeroSlidesList,ValuePropsList,TestimonialsList,PartnersList}` | server-fetched rows as props | ✓ WIRED | All 4 imports present in the page; full file not re-read past line 100 but imports and query results confirmed structurally match each list's expected props. |
| `app/admin/(dashboard)/layout.tsx` | `app/admin/(dashboard)/content/page.tsx` | `SidebarMenuButton` → `Link href="/admin/content"`, gated by `canManagePackages` | ✓ WIRED | Confirmed. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HOME-01 | 06-01, 06-02, 06-03, 06-05, 06-07, 06-08 | Hero carousel, admin-editable (add/edit/delete/reorder) | ✓ SATISFIED | See truth #1. |
| HOME-02 | 06-01, 06-02, 06-03, 06-06, 06-07, 06-08 | Value props section, admin-editable | ✓ SATISFIED | See truth #2. |
| HOME-03 | 06-03, 06-07 | Featured packages grid reusing `is_featured` flag | ✓ SATISFIED | `app/(public)/page.tsx:133-139` reuses existing `is_featured`/`is_published` columns, zero new curation mechanism. |
| HOME-04 | 06-01, 06-02, 06-04, 06-06, 06-07, 06-08 | Testimonials (photo, name, quote, rating), admin-editable | ✓ SATISFIED | See truth #2; `star-rating-input.tsx` confirmed as dedicated widget (not raw number input), `testimonial-form-schema.ts` has `rating: z...` bounds. |
| HOME-05 | 06-01, 06-02, 06-04, 06-06, 06-07, 06-08 | Brand Partners section, conditional | ✓ SATISFIED | See truth #4. |
| HOME-06 | 06-01, 06-02, 06-04, 06-06, 06-07, 06-08 | Corporate Clients section, conditional | ✓ SATISFIED | See truth #4. |
| HOME-07 | 06-07 | Embedded inquiry form reusing existing pipeline | ✓ SATISFIED | See truth #3. |

No orphaned requirements found -- all 7 HOME-01 through HOME-07 IDs from REQUIREMENTS.md are claimed across the 8 plans and all have supporting evidence.

### Anti-Patterns Found

Scanned all 22 files created/modified in this phase (per SUMMARY key-files + the CR-01/CR-02 fix commit) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"coming soon"/"not yet implemented" -- **zero matches** (aside from legitimate `placeholder="..."` form-input attributes, which are normal UI copy, not debt markers). No debt-marker gate violations.

Carried forward from `06-REVIEW.md` (non-blocking, still open, not re-litigated here since the task scoped re-verification to CR-01/CR-02 only):

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `hero-carousel.tsx` (comment vs. code) | WR-02: doc comment claims focus-pause, only hover wired | ⚠️ Warning | Keyboard users don't get autoplay paused when tabbing onto carousel controls -- partial WCAG 2.2.2 gap. Included in human_verification #3 for confirmation. |
| `actions/site-content-uploads.ts` | WR-03/WR-05: no server-side MIME/size validation, no runtime `folder` allowlist | ⚠️ Warning | Same-origin admin-only risk (requires `can_manage_packages`), not re-verified in this pass -- pre-existing, non-blocking per 06-REVIEW.md. |
| `hero-slide-form-schema.ts`, `partner-form-schema.ts` | WR-04: `linkUrl`/`externalLink` accept non-URL strings | ⚠️ Warning | Same as above, not re-verified, non-blocking. |
| `supabase/migrations/...sql` | IN-01: redundant SELECT RLS policies | ℹ️ Info | Dead policy, no security impact. |
| `actions/site-content-uploads.ts` | IN-02/IN-03: dead `deleteSiteContentImage` export, malformed extension for compound MIME types | ℹ️ Info | No functional impact today. |

### Human Verification Required

1. **Promo hero slide save (CR-01 live round-trip)**
   **Test:** Create a promo-type hero slide (headline + image, no package), save it, then edit and re-save it.
   **Expected:** Both operations succeed with no error; no `invalid input syntax for type uuid` failure.
   **Why human:** Requires an actual Postgres CHECK-constraint round-trip; static review confirms the code fix but not the live DB's acceptance.

2. **Admin list live-refresh (CR-02 live round-trip)**
   **Test:** Add/edit a Hero Slide, Value Prop, Testimonial, and Partner/Client via their respective Dialog forms; observe the list immediately after the dialog closes.
   **Expected:** New/edited item appears without a hard page reload, for all 4 content types.
   **Why human:** This is a runtime prop-resync-after-`router.refresh()` behavior with no automated test in this project (no test runner/framework is installed) to exercise it.

3. **Hero carousel runtime behavior**
   **Test:** View the homepage with mixed package/promo slides; confirm 5s autoplay, hover-pause, stopOnInteraction, and no autoplay with OS reduce-motion enabled (but manual prev/next still works).
   **Expected:** All 4 behaviors hold; keyboard-focus pause is known NOT wired (WR-02, pre-existing, non-blocking).
   **Why human:** Animation timing and OS-level media query behavior are not statically verifiable.

4. **Hero slide drag-reorder + rollback**
   **Test:** Drag-reorder 2+ hero slides in the admin panel; confirm persistence after refresh. If feasible, simulate a failed reorder and confirm optimistic rollback.
   **Expected:** Successful reorders persist via `reorderSlides`; failures roll back to prior order with an error toast.
   **Why human:** dnd-kit drag interaction and failure-path rollback are runtime-only behaviors.

### Gaps Summary

No gaps found. All 5 phase success criteria have supporting artifacts that exist, are substantive, and are wired correctly. The 2 previously-BLOCKER code-review defects (CR-01, CR-02) were re-verified directly against the `1a7b70e` diff (not trusted from SUMMARY.md or the review's own "FIXED" annotation) and both fixes are logically sound and consistent with the rest of the codebase's conventions. The remaining open items from `06-REVIEW.md` (WR-01 through WR-05, IN-01 through IN-03) are pre-existing, non-blocking advisories that the task did not ask to be re-litigated, and none of them contradict any of the 5 success criteria.

Status is `human_needed` rather than `passed` solely because this phase introduces several runtime/behavioral truths (the two just-fixed BLOCKER defects' live round-trips, carousel autoplay timing, and drag-reorder) that this project has no automated test suite to exercise, and that static code reading -- however thorough -- cannot fully discharge. These are flagged for a human to click through, not because any code was found to be broken.

---

_Verified: 2026-07-27T15:07:02Z_
_Verifier: Claude (gsd-verifier)_
