---
phase: 06-public-site-content-sections-hero-carousel
plan: 04
subsystem: homepage-presentational-components
tags: [avatar, star-rating, conditional-sections, presentational-components]
dependency-graph:
  requires:
    - "06-01: components/ui/avatar.tsx (Avatar/AvatarImage/AvatarFallback), hero_slides/value_props/testimonials/partners schema"
  provides:
    - "components/homepage/testimonials-section.tsx -- TestimonialDisplay type, TestimonialsSection({ testimonials }) (includes local StarRating)"
    - "components/homepage/brand-partners.tsx -- PartnerDisplay type, BrandPartners({ partners })"
    - "components/homepage/corporate-clients.tsx -- ClientDisplay type, CorporateClients({ clients })"
  affects:
    - "app/(public)/page.tsx (06-07) -- imports and composes all 3 components with two independently-counted prop arrays for partners/clients"
tech-stack:
  added: []
  patterns:
    - "Avatar photo-or-initials-fallback: AvatarImage rendered only when photoUrl is set, AvatarFallback (derived initials) rendered only when it's null -- never both"
    - "5-star rating row via local, non-exported StarRating using lucide-react's StarIcon, byte-identical to RESEARCH.md Code Example 4"
    - "two structurally independent conditional logo-band components (never a shared parameterized component or combined visibility check), per D-07 and RESEARCH.md Pitfall 3"
    - "per-logo optional anchor-wrap: <a target=\"_blank\" rel=\"noopener noreferrer\"> only when linkUrl is present, bare <Image> otherwise"
key-files:
  created:
    - "components/homepage/testimonials-section.tsx"
    - "components/homepage/brand-partners.tsx"
    - "components/homepage/corporate-clients.tsx"
  modified: []
decisions:
  - "[Phase 06-04]: Followed why-choose-us.tsx's precedent of exporting a named *Display prop type (TestimonialDisplay/PartnerDisplay/ClientDisplay) rather than an inline object-literal prop type, for consistency with 06-03's sibling components even though the plan's action text described the prop shape inline"
  - "[Phase 06-04]: Logo <Image> alt text left empty (decorative) since partners/clients table schema (06-01) has no name/description field beyond the logo artwork itself -- no accessible name exists to derive one from"
metrics:
  duration: "8 min"
  completed: "2026-07-27"
status: complete
---

# Phase 6 Plan 4: Testimonials, Brand Partners & Corporate Clients Summary

Built the remaining 3 presentational homepage components (customer testimonials with Avatar-and-star-rating, and two independently-conditional logo band sections) that 06-07's homepage composition will import — all pure prop-driven Server Components with zero direct Supabase calls, following UI-SPEC's Section Layout, Color, and Copywriting contracts exactly.

## What Was Built

- **`components/homepage/testimonials-section.tsx`** — Server Component. Exports `TestimonialDisplay` type (`{ id, customerName, quote, rating, photoUrl }`) and `TestimonialsSection({ testimonials })`. Includes a local, non-exported `StarRating({ rating })` component (byte-identical to RESEARCH.md Code Example 4) rendering 5 `StarIcon`s in a `flex gap-0.5` with `role="img" aria-label` — filled (`fill-primary text-primary`) for indices below `rating`, empty (`fill-transparent text-muted-foreground`) otherwise. Renders a Display-size "What Our Customers Say" heading and a `grid grid-cols-1 gap-8 md:grid-cols-3` of `<Card>` items, each with an `<Avatar size="lg">` showing `AvatarImage` (photo) when `photoUrl` is set or `AvatarFallback` (derived 2-character initials from `customerName`) when it's null, a Heading-size customer name, the star rating row, and a Body-size quote wrapped in curly quotation marks. Returns `null` when `testimonials.length === 0`.

- **`components/homepage/brand-partners.tsx`** — Server Component. Exports `PartnerDisplay` type and `BrandPartners({ partners })`. Renders a `bg-secondary py-16` (3xl/64px) band with a small white/muted "Our Partners" eyebrow and a `flex flex-wrap items-center justify-center gap-8` logo row — each logo anchor-wrapped (`target="_blank" rel="noopener noreferrer"`) only when `linkUrl` is present, a bare `<Image>` otherwise, with no accent tinting applied to any third-party artwork. Returns `null` when `partners.length === 0`.

- **`components/homepage/corporate-clients.tsx`** — structurally identical to `brand-partners.tsx` but a fully separate component/export: `ClientDisplay` type, `CorporateClients({ clients })`, "Trusted By" eyebrow, guarded on `clients.length === 0`. Deliberately NOT extracted into a shared parameterized component — D-07 requires each section's visibility to be independently determined at the call site in 06-07, and two nearly-identical-but-separate files makes that independence structurally obvious rather than relying on a caller to pass two correct boolean flags into one shared component.

All 3 components have zero Supabase/database awareness — 06-07's homepage composition (Server Component) will do every query (two fully independent count queries for partners vs. clients) and pass already-shaped, already-URL-resolved props down.

## Verification Performed

- Task 1 (`testimonials-section.tsx`): grep counts confirmed — 1 `testimonials.length === 0`, 1 `from "lucide-react"` (imports `StarIcon`), 1 `fill-primary text-primary`, 1 `from "@/components/ui/avatar"`, 3 `AvatarFallback` occurrences (import + JSX usage + closing tag), 1 `What Our Customers Say`.
- Task 2 (`brand-partners.tsx` + `corporate-clients.tsx`): grep counts confirmed — 1 `partners.length === 0`, 1 `bg-secondary` (brand-partners), 1 `Our Partners`, 1 `clients.length === 0`, 1 `bg-secondary` (corporate-clients), 1 `Trusted By`, 1 `export function BrandPartners`, 1 `export function CorporateClients`.
- `npm run build` (Next.js 16.2.10, Turbopack) completed successfully after each task — compiled cleanly, all 17 existing routes generated, no new TypeScript errors introduced by any of the 3 new components.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria greps and `npm run build` passed on the first attempt for both tasks.

Auth gates: None encountered — this plan is pure presentational-component work with no CLI/auth steps.

## Self-Check: PASSED

- FOUND: `components/homepage/testimonials-section.tsx`
- FOUND: `components/homepage/brand-partners.tsx`
- FOUND: `components/homepage/corporate-clients.tsx`
- FOUND: commit `90b0d42` (Task 1 — testimonials-section.tsx)
- FOUND: commit `b917edf` (Task 2 — brand-partners.tsx + corporate-clients.tsx)
