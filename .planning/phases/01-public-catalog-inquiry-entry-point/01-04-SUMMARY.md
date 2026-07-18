---
phase: 01-public-catalog-inquiry-entry-point
plan: 04
subsystem: ui
tags: [react-hook-form, zod, formspree, sonner, nextjs, shadcn]

requires:
  - phase: 01-01
    provides: Next.js scaffold, brand tokens, shadcn components (button, input, textarea, label, form, sonner Toaster mounted in root layout)
provides:
  - "lib/formspree.ts — submitToFormspree() wrapper verified against formspree-js's own AJAX contract"
  - "components/inquiry/inquiry-schema.ts — shared inquirySchema (Zod) + InquiryFormValues type"
  - "components/inquiry/inquiry-form.tsx — shared InquiryForm({ packageName? }) client component"
  - "app/(public)/contact/page.tsx — live Contact Us page (D-07 general, non-package context)"
affects: [01-06]

tech-stack:
  added: []
  patterns:
    - "Shared InquiryForm component takes an optional packageName prop so both Contact Us (this plan) and the future package detail page (01-06) reuse one form instead of forking it"
    - "submitToFormspree() centralizes the Formspree AJAX contract (Accept: application/json, no mode: 'no-cors', next/errors response parsing) so no call site hand-rolls fetch headers"

key-files:
  created:
    - lib/formspree.ts
    - components/inquiry/inquiry-schema.ts
    - components/inquiry/inquiry-form.tsx
    - "app/(public)/contact/page.tsx"
  modified: []

key-decisions:
  - "Used the project's existing --primary token (already mapped to #F5793A accent in globals.css from 01-01) for the Send Inquiry button instead of adding a new accent-specific class — the default Button variant already satisfies UI-SPEC's accent-color requirement"
  - "Honeypot field uses Tailwind's sr-only utility (absolute-positioned, clipped) rather than display:none, matching Formspree's own anti-bot recommendation cited in 01-RESEARCH.md Pitfall 6"

requirements-completed: [PUBL-07]

coverage:
  - id: D1
    description: "submitToFormspree() POSTs JSON to the real Formspree endpoint with Accept: application/json (no mode: 'no-cors'), parses next/errors response shape per the verified formspree-js contract"
    requirement: PUBL-07
    verification:
      - kind: unit
        ref: "grep verification — Accept: \"application/json\" present, no-cors absent, submitToFormspree/InquiryPayload exported (lib/formspree.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared InquiryForm component (React Hook Form + Zod) renders name/email/phone/message fields, a hidden _gotcha honeypot, and a 'Send Inquiry' submit button; shows success toast + resets on success, generic error toast on failure"
    requirement: PUBL-07
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (0 errors); npx eslint components/inquiry/inquiry-form.tsx (0 issues)"
        status: pass
    human_judgment: true
    rationale: "Toast copy, validation error copy, and actual end-to-end submission against the live Formspree endpoint need a human to visually confirm in the browser — static checks only prove the code compiles and matches the contract shape, not runtime UX correctness"
  - id: D3
    description: "/contact page renders <InquiryForm /> with no packageName prop in a Display-heading layout matching UI-SPEC typography/spacing"
    requirement: PUBL-07
    verification:
      - kind: integration
        ref: "npm run build (contact page prerendered as static ○); curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/contact -> 200"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-18
status: complete
---

# Phase 01 Plan 04: Formspree Inquiry Form + Contact Us Page Summary

**Shared React Hook Form + Zod InquiryForm component (natively rebuilt per D-06, verified against formspree-js's own AJAX contract) plus a live /contact page for TravelSentro's general, non-package inquiries**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-18T12:26:41Z
- **Completed:** 2026-07-18T12:29:35Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments
- `lib/formspree.ts` — `submitToFormspree()` wrapper that POSTs JSON directly to `https://formspree.io/f/xojpkjbr`, matching Formspree's own client library contract exactly (verified headers, no `no-cors`, `next`/`errors` response normalization)
- `components/inquiry/inquiry-schema.ts` — shared Zod schema with UI-SPEC-exact field-validation copy and a `_gotcha` honeypot field
- `components/inquiry/inquiry-form.tsx` — shared `InquiryForm({ packageName? })` client component using `react-hook-form` + `zodResolver`, shadcn `Form`/`FormField`/`FormMessage` primitives, visually-hidden (not `display:none`) honeypot, pending/disabled submit state, and toast-integrated success/error handling
- `app/(public)/contact/page.tsx` — live Contact Us page rendering `<InquiryForm />` with no `packageName` (D-07's general, non-package context)

## Task Commits

Each task was committed atomically:

1. **Task 1: Formspree client + shared Zod schema + InquiryForm component** - `fa1ce5f` (feat)
2. **Task 2: Contact Us page** - `d0e736e` (feat)

**Plan metadata:** (pending — recorded below in final commit)

## Files Created/Modified
- `lib/formspree.ts` - Formspree AJAX contract wrapper (`submitToFormspree`, `InquiryPayload` type)
- `components/inquiry/inquiry-schema.ts` - Shared Zod validation schema (`inquirySchema`, `InquiryFormValues`)
- `components/inquiry/inquiry-form.tsx` - Shared `InquiryForm` client component, reusable via optional `packageName` prop
- `app/(public)/contact/page.tsx` - General Contact Us page (Server Component, renders `InquiryForm` with no package context)

## Decisions Made
- Reused the existing `--primary` CSS token (already the UI-SPEC accent color `#F5793A`, set up in plan 01-01) for the default `Button` variant rather than introducing a separate "accent" button variant — no new styling surface needed.
- Implemented the honeypot field's hidden styling with Tailwind's `sr-only` utility (absolute positioning + clip, not `display:none`), matching Formspree's own documented anti-bot guidance cited in the phase research.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. The Formspree endpoint (`https://formspree.io/f/xojpkjbr`) is the business's existing, already-configured form; no new account setup, environment variables, or dashboard changes needed.

## Next Phase Readiness
- The shared `InquiryForm` component is ready for plan `01-06` (package detail page) to reuse with a `packageName` prop — no fork needed, satisfying the plan's "built once, used twice" objective.
- `/contact` is live and submits real inquiries to the existing Formspree endpoint today.
- No blockers for downstream plans in this phase.

---
*Phase: 01-public-catalog-inquiry-entry-point*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`fa1ce5f`, `d0e736e`) verified present in git log.
