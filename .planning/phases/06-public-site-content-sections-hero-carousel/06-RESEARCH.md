# Phase 6: Public Site Content Sections & Hero Carousel - Research

**Researched:** 2026-07-27
**Domain:** Next.js 16 App Router homepage content — admin-editable CMS-lite sections (hero carousel, value props, featured grid, testimonials, inquiry form, partner logos) on top of an existing Supabase-backed admin panel
**Confidence:** HIGH (all findings grounded in this repo's own Phase 1-5 code and migrations; the one new dependency is verified against the npm registry and official docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Carousel content is a MIX of rotating featured packages (photo, name, CTA into that package — reuses the existing `is_featured` flag from Phase 2's `featurePackage()`) and general brand/promotional imagery (not tied to a specific package). Admin controls which slides exist and their mix.
- **D-02:** Fully admin-editable: add/edit/delete/reorder slides via the admin panel — matches this project's established "admin-managed, no code deploy needed" pattern (packages, CRM, users).
- **D-03:** In scope beyond the hero carousel: "why choose us" / value props, featured packages grid, customer testimonials, an embedded general inquiry form, Brand Partners (conditional), Corporate Clients (conditional). All homepage-only — no other public pages get new sections, no sitewide footer placement.
- **D-04:** Featured packages grid (HOME-03) reuses the EXISTING `is_featured` flag/toggle from Phase 2 (`actions/packages.ts` `featurePackage()`) — no new curation mechanism, no separate "homepage-featured" flag distinct from the packages-list "featured" badge.
- **D-05:** The homepage inquiry form (HOME-07) is the SAME component/pipeline as `/contact` and per-package inquiries — `components/inquiry/inquiry-form.tsx`, Formspree + CRM-backed (Phase 1/3), general inquiry with no `package_id`. Not a new form or a new pipeline.
- **D-06:** Testimonials (HOME-04) each have: quote text, customer name, customer photo/avatar, and a star rating. No "which package" reference field. Admin-entered (no review-collection system exists) — add/edit/delete via admin panel.
- **D-07:** Brand Partners (HOME-05) and Corporate Clients (HOME-06) are each: a logo image + an optional click-through link. No name/description fields beyond what's visible in the logo itself. Both sections render ONLY when at least one entry exists for that specific section — fully hidden (not an empty state) otherwise.

### Claude's Discretion

- **Section order on the page** — recommended default: Hero Carousel → Why Choose Us → Featured Packages Grid → Testimonials → Contact Form → Brand Partners / Corporate Clients (near the bottom, closer to a trust-signal footer position). Not discussed with the user; planner may adjust if a more natural flow emerges during UI design.
- **Data model for Partners vs. Clients** — likely a single `partners` table with a `type` enum (`brand_partner` | `corporate_client`) rather than two separate tables/actions, since both have identical fields (logo + optional link) per D-07. Not a hard requirement — planner/researcher should confirm this is the cleanest shape.
- **Carousel autoplay behavior** — shadcn's `components/ui/carousel.tsx` (already installed, Embla-based, already used in `package-gallery.tsx`'s lightbox) does NOT include autoplay out of the box; an `embla-carousel-autoplay` plugin would be a new dependency if autoplay-with-manual-override is wanted for the hero. Flagged for research — not decided with the user.
- **New admin nav / permission gating** — recommended: reuse the existing `can_manage_packages` permission toggle for gating this new content-management surface (hero slides, sections, testimonials, partners/clients), consistent with this project's explicit "fixed 3-toggle, no new configurability" bias (PROJECT.md Key Decisions). A new admin nav section (e.g. "Content" or "Homepage") under the same pattern as Packages/CRM/Users. Not discussed with the user — flagged as the most consistent choice with existing project conventions, not a locked decision.
- **Image storage** — reuse the same Supabase Storage bucket/upload pattern as package photos (`actions/package-photos.ts`) for hero slide images, testimonial photos, and partner/client logos, rather than inventing a new storage convention.
- **Exact DB schema** (table names, column shapes, RLS policy scoping) — left to planner/researcher, following the established `can_manage_packages`-gated write / universal-authenticated-read pattern already used for `packages`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within the scope defined during this session (the phase itself was newly scoped here, but nothing raised during discussion was pushed to a future phase).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-01 | Hero carousel mixing rotating featured packages and general brand/promotional imagery, admin-editable (add/edit/delete/reorder slides) | `hero_slides` schema below (Standard Stack §Data Model), `embla-carousel-autoplay` wiring (Code Examples §1), dnd-kit reorder pattern (reuse `sortable-package-list.tsx`/`photo-manager.tsx`) |
| HOME-02 | "Why choose us" / value props section, admin-editable | `value_props` schema below, simple CRUD dialog pattern (reuse `account-form.tsx`/`users-table.tsx`) |
| HOME-03 | Featured packages grid, reusing existing `is_featured` flag (PKG-05) | Reuse `PackageCard` + `is_featured = true` query filter (Code Examples §2), zero new curation mechanism |
| HOME-04 | Customer testimonials (photo, name, quote, star rating), admin-editable | `testimonials` schema below, `lucide-react` `StarIcon` for rating display (Don't Hand-Roll) |
| HOME-05 | Brand Partners section (logo + optional link), admin-editable, hidden unless ≥1 entry | `partners` table with `partner_type='brand_partner'`, conditional-render pattern (Code Examples §3) |
| HOME-06 | Corporate Clients section (logo + optional link), admin-editable, hidden unless ≥1 entry | Same `partners` table, `partner_type='corporate_client'`, independently queried/counted |
| HOME-07 | Embedded general inquiry form reusing existing pipeline | `<InquiryForm />` with no props, exact pattern already used on `/contact` (Code Examples §4) — zero new code beyond the import |

</phase_requirements>

## Summary

This phase adds no new architectural layer — it is four more admin-editable content types layered onto a stack that has now built this exact pattern five times (packages, staff accounts, CRM contacts, messages, package photos). The correct approach is maximum reuse of already-proven primitives: shadcn's `Carousel` (Embla-based, already installed and used in `package-gallery.tsx`), `@dnd-kit` for reorder (already used in `sortable-package-list.tsx` and `photo-manager.tsx`), react-hook-form + zod dialogs (already used in `account-form.tsx`), the `can_manage_packages`-gated Server Action + RLS pattern (identical on every write path since Phase 2), and the existing `package-photos.ts` base64-upload-then-insert-row Storage pattern. The only genuinely new piece of the stack is `embla-carousel-autoplay` (verified on npm, same publisher/monorepo as the already-installed `embla-carousel-react`, exact version-matched at 8.6.0) — it plugs into the existing `<Carousel plugins={[...]}>` prop with zero changes to `components/ui/carousel.tsx`.

Four new tables are needed: `hero_slides` (mixed package-linked/promo, `slide_type` discriminator), `value_props`, `testimonials`, and `partners` (shared table, `partner_type` discriminator for Brand Partner vs. Corporate Client — this exact "one table + text CHECK-constrained discriminator column" shape is already established twice in this codebase: `package_inclusions.kind` and `messages.channel`). All four get the identical RLS shape already used for `packages`: unconditional public SELECT (`using (true)` — no draft/publish workflow requested by REQUIREMENTS.md, so none should be added), and `can_manage_packages`-scoped authenticated INSERT/UPDATE/DELETE via the existing `has_permission()` SECURITY DEFINER helper. A new Supabase Storage bucket (`site-content`) with the standard bucket-scoped `storage.objects` RLS policies covers hero/testimonial/partner images, following the exact shape of the `package-photos` bucket policies from `20260718114727_create_package_schema.sql` and `20260718150801_admin_rbac_and_package_write_policies.sql`.

**Primary recommendation:** Build all four content types as one new `/admin/content` route with a shadcn `Tabs`-based page (mirroring `package-form.tsx`'s Details/Itinerary/Inclusions tab pattern) gated by `can_manage_packages`, each tab reusing the exact dialog-CRUD (`account-form.tsx`) or drag-reorder (`sortable-package-list.tsx`) pattern already proven in this codebase — do not invent new UI patterns, new state-management approaches, or new permission concepts.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hero carousel autoplay/swipe/keyboard nav | Browser / Client | — | `embla-carousel-react` + `embla-carousel-autoplay` are client-side motion/gesture libraries; `Carousel` is already a `"use client"` component |
| Hero slide + featured-package + testimonial + value-prop + partner data fetch | Frontend Server (SSR) | Database / Storage | `app/(public)/page.tsx` is a Server Component; all reads happen server-side via `createClient()` before render, matching every existing public page |
| Hero/testimonial/value-prop/partner CRUD (admin) | API / Backend | Database / Storage | New Server Actions in `actions/*.ts`, `requirePermission("can_manage_packages")`-gated, mirroring `actions/packages.ts` exactly |
| Conditional Brand Partners / Corporate Clients visibility | Frontend Server (SSR) | — | A `count > 0` check per `partner_type`, evaluated server-side before render — no client-side flicker/hide |
| Image upload (hero/testimonial/partner logo) | API / Backend | Database / Storage | Base64-over-Server-Action-then-Storage-upload, identical to `actions/package-photos.ts`'s `uploadPhotos()` |
| Drag-reorder (hero slides; optionally testimonials/partners) | Browser / Client | API / Backend | `@dnd-kit` computes order client-side (optimistic `useState`); the real boundary is the permission-gated `reorderX()` Server Action, exactly like `reorderPackages()`/`reorderPhotos()` |
| General inquiry form (HOME-07) | Browser / Client | API / Backend | Zero new code — `<InquiryForm />` (existing client component) posts to the existing `/api/inquiries` Route Handler → `record_inquiry()` RPC → CRM, unchanged from Phase 1/3 |
| Featured packages grid | Frontend Server (SSR) | — | Plain `packages` query filtered `is_featured = true`, rendered via the existing `PackageCard` (no new component) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `embla-carousel-react` | `^8.6.0` (already installed) | Hero carousel engine | Already the project's carousel primitive (`components/ui/carousel.tsx`, used in `package-gallery.tsx`) — reused, not replaced |
| `embla-carousel-autoplay` | `8.6.0` | Autoplay plugin for the hero carousel | Official plugin from the same author/monorepo as `embla-carousel-react` (davidjerleke/embla-carousel), version-matched exactly to the already-installed core package `[VERIFIED: npm registry]` |
| `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` | already installed (`^6.3.1` / `^10.0.0` / `^3.2.2`) | Drag-to-reorder hero slides (and optionally testimonials/partners) | Already used identically for package list reorder (`sortable-package-list.tsx`) and photo reorder (`photo-manager.tsx`) — same `DndContext`/`SortableContext`/`arrayMove` pattern |
| `react-hook-form` + `zod` + `@hookform/resolvers` | already installed | Admin CRUD forms for all 4 new content types | Standard project pairing (`account-form.tsx`, `package-form.tsx`, `contact-edit-form.tsx`) — no new form library |
| `lucide-react` | already installed (`^1.25.0`) | Star-rating display icon (`StarIcon`) for testimonials | `StarIcon`/`StarHalf`/`StarOff` confirmed present in the installed package `[VERIFIED: node_modules/lucide-react]` — no new rating-widget dependency needed for a read-only 1-5 display |
| `@supabase/ssr` + `supabase-js` | already installed | New table reads/writes, Storage bucket | Identical `createClient()` server/browser pattern already used everywhere |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `Tabs` | already installed (used in `package-form.tsx`) | Group the 4 new admin content-management surfaces (Hero Slides / Why Choose Us / Testimonials / Partners & Clients) under one `/admin/content` page | Avoids 4 new sidebar nav items; mirrors `package-form.tsx`'s existing Details/Itinerary/Inclusions & FAQ tab structure |
| shadcn `Dialog` + `AlertDialog` | already installed (used in `users-table.tsx`) | Add/Edit dialogs + delete confirmation for value props, testimonials, partners (simpler entities than packages — no full-page form needed) | Reuse `users-table.tsx`'s exact Dialog-wraps-Form-then-`onSuccess`-closes pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `embla-carousel-autoplay` | Hand-rolled `setInterval` slide advance | Rejected — reinvents pause-on-hover/focus, `stopOnInteraction`, and cleanup-on-unmount that the plugin already solves; also a much larger accessibility footgun (see Pitfall 7) |
| Single `partners` table with `partner_type` discriminator | Two separate tables (`brand_partners`, `corporate_clients`) | Both are valid. Single table is recommended: identical columns (logo + optional link), and this codebase already has 2 precedents for exactly this shape (`package_inclusions.kind`, `messages.channel`) — but two tables is equally simple here given how small the entity is; either is acceptable, this is Claude's Discretion per CONTEXT.md, not a hard requirement |
| Single `site-content` Storage bucket (path-prefixed) | 3 separate buckets (`hero-images`, `testimonial-photos`, `partner-logos`) | Single bucket recommended to minimize migration/RLS-policy duplication (one set of 3 `storage.objects` policies instead of three sets of 3); 3 buckets is the safer choice only if stronger blast-radius isolation between content types is desired — not needed at this project's scale |
| A read-only 1-5 `StarIcon` loop for testimonial ratings | A star-rating npm package (e.g. `react-rating-stars-component`) | Rejected — this is a static display of an admin-entered integer 1-5, not an interactive rating input; a loop over `lucide-react`'s already-installed `StarIcon`/`Star` (filled vs. muted via `fill-primary` / `text-muted-foreground` classes) needs zero new dependencies |

**Installation:**
```bash
npm install embla-carousel-autoplay@8.6.0
```

**Version verification:** `npm view embla-carousel-autoplay version` → `8.6.0` (published 2025-04-04, ~2.7M weekly downloads, repo `github.com/davidjerleke/embla-carousel`, no `postinstall` script) `[VERIFIED: npm registry]`. This exactly matches the already-installed `embla-carousel-react@^8.6.0` — no version-skew risk between the core carousel and the autoplay plugin.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `embla-carousel-autoplay` | npm | ~1 yr 3 mo (published 2025-04-04) | ~2.7M/week | `github.com/davidjerleke/embla-carousel` | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

`embla-carousel-autoplay` is the only new dependency this phase requires. It is maintained in the same monorepo as `embla-carousel-react` (already a direct dependency of this project since Phase 1), published by the same author, and its `[latest]` dist-tag (8.6.0) is version-identical to the installed core package — this is the strongest possible legitimacy signal (first-party plugin, not a third-party wrapper).

## Architecture Patterns

### System Architecture Diagram

```
Public Homepage Request (GET /)
        │
        ▼
app/(public)/page.tsx  (Server Component)
        │
        ├─▶ supabase.from("hero_slides").select("*, packages(...)")   ──▶ Postgres (RLS: public read)
        │      │  package-type rows LEFT-JOIN packages; rows whose
        │      │  joined package is null (unpublished/deleted) are
        │      │  filtered out before render (Pitfall 1)
        │      ▼
        ├─▶ supabase.from("value_props").select("*").order("sort_order") ──▶ Postgres
        │
        ├─▶ supabase.from("packages").select("*").eq("is_featured", true) ──▶ Postgres
        │      │  (existing PKG-05 flag — zero new curation code)
        │
        ├─▶ supabase.from("testimonials").select("*").order("sort_order") ──▶ Postgres
        │
        ├─▶ supabase.from("partners").select("*").eq("partner_type", "brand_partner")   ──▶ Postgres
        ├─▶ supabase.from("partners").select("*").eq("partner_type", "corporate_client") ──▶ Postgres
        │      │  (2 independent queries/counts — D-07's independent-visibility rule)
        │
        ▼
  Renders: <HeroCarousel> (client, Embla+Autoplay)
           <WhyChooseUs> (server)
           <FeaturedPackagesGrid> (server, reuses <PackageCard>)
           <Testimonials> (server)
           <InquiryForm /> (client, EXISTING component — unchanged)
                  │
                  ▼  POST /api/inquiries (EXISTING Route Handler, unchanged)
                  ▼  record_inquiry() RPC (EXISTING, unchanged)
                  ▼  CRM contacts/inquiries (EXISTING, unchanged)
           <BrandPartners> (server, hidden if count=0)
           <CorporateClients> (server, hidden if count=0)


Admin Content Management (/admin/content, can_manage_packages-gated)
        │
        ├─▶ Tabs: Hero Slides | Why Choose Us | Testimonials | Partners & Clients
        │
        ├─▶ actions/hero-slides.ts   createSlide/updateSlide/deleteSlide/reorderSlides
        ├─▶ actions/value-props.ts   createValueProp/updateValueProp/deleteValueProp
        ├─▶ actions/testimonials.ts  createTestimonial/updateTestimonial/deleteTestimonial
        ├─▶ actions/partners.ts      createPartner/updatePartner/deletePartner
        │      │  every action: requirePermission("can_manage_packages") FIRST
        │      ▼
        ├─▶ Supabase Storage bucket "site-content"  (hero images, testimonial photos, logos)
        │      │  storage.objects RLS: can_manage_packages-scoped write, public read
        │      ▼
        └─▶ revalidatePath("/")   ◀── homepage is the ONLY public route affected (D-03)
```

### Recommended Project Structure
```
actions/
├── hero-slides.ts        # createSlide/updateSlide/deleteSlide/reorderSlides — mirrors actions/packages.ts
├── value-props.ts        # createValueProp/updateValueProp/deleteValueProp
├── testimonials.ts       # createTestimonial/updateTestimonial/deleteTestimonial
├── partners.ts           # createPartner/updatePartner/deletePartner (partnerType param)
└── site-content-uploads.ts  # uploadSiteContentImage/deleteSiteContentImage — mirrors actions/package-photos.ts

components/
├── homepage/
│   ├── hero-carousel.tsx           # "use client" — Embla + Autoplay plugin
│   ├── why-choose-us.tsx
│   ├── featured-packages-grid.tsx  # reuses <PackageCard>
│   ├── testimonials-section.tsx
│   ├── brand-partners.tsx
│   └── corporate-clients.tsx
└── admin/
    ├── content/
    │   ├── hero-slide-form.tsx + hero-slide-form-schema.ts
    │   ├── hero-slides-list.tsx        # dnd-kit reorder, mirrors sortable-package-list.tsx
    │   ├── value-prop-form.tsx + -schema.ts
    │   ├── testimonial-form.tsx + -schema.ts
    │   └── partner-form.tsx + -schema.ts   # includes a partnerType select

app/
├── (public)/page.tsx           # MODIFIED — composes all new homepage sections
└── admin/(dashboard)/content/
    └── page.tsx                 # NEW — Tabs page, can_manage_packages-gated

supabase/migrations/
└── <timestamp>_create_homepage_content_schema.sql   # hero_slides, value_props, testimonials, partners + site-content bucket
```

### Pattern 1: Autoplay plugin wired into the existing Carousel primitive
**What:** `components/ui/carousel.tsx`'s `Carousel` already forwards an optional `plugins` prop straight into `useEmblaCarousel(opts, plugins)` — no edits needed to that file.
**When to use:** The hero carousel client component only.
**Example:**
```typescript
// Source: embla-carousel.com docs + shadcn carousel plugin example (verified via WebSearch 2026-07-27)
"use client";
import { useRef } from "react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext,
} from "@/components/ui/carousel";

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Constructing with playOnInit tied to the media query means the plugin
  // never starts moving for reduced-motion users, while manual prev/next
  // via CarouselPrevious/CarouselNext (already keyboard-accessible) still
  // works either way (Pitfall 7 / WCAG 2.2.2).
  const plugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: true, playOnInit: !prefersReducedMotion })
  );

  return (
    <Carousel
      plugins={[plugin.current]}
      opts={{ loop: true }}
      onMouseEnter={plugin.current.stop}
      onMouseLeave={plugin.current.reset}
      className="w-full"
    >
      <CarouselContent>
        {slides.map((slide) => (
          <CarouselItem key={slide.id}>{/* slide content */}</CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
```

### Pattern 2: Mixed package-linked / promo hero slide public query with orphan-skip
**What:** Since `hero_slides` has unconditional public-read RLS but `packages` does not (its RLS still filters `is_published = true and deleted_at is null` for anon), a package-type slide whose linked package became unpublished must be silently skipped, not rendered broken.
**When to use:** `app/(public)/page.tsx`'s hero slide fetch.
**Example:**
```typescript
// Pattern derived from this repo's existing app/(public)/packages/page.tsx query shape
const { data: rawSlides } = await supabase
  .from("hero_slides")
  .select("*, packages(id, slug, name, is_published, deleted_at, package_photos(storage_path, display_order))")
  .order("sort_order", { ascending: true });

const slides = (rawSlides ?? []).filter((slide) => {
  if (slide.slide_type === "promo") return true;
  // package-type slide: packages(...) comes back null under RLS if the
  // linked package is unpublished or soft-deleted — skip it (Pitfall 1).
  return slide.packages !== null;
});
```

### Pattern 3: Independent conditional visibility for Brand Partners vs. Corporate Clients
**What:** D-07 requires each section to be independently hidden — never combine into one "any partner exists" check.
**When to use:** Homepage render, Brand Partners / Corporate Clients sections.
**Example:**
```typescript
const { data: brandPartners } = await supabase
  .from("partners").select("*").eq("partner_type", "brand_partner").order("sort_order");
const { data: corporateClients } = await supabase
  .from("partners").select("*").eq("partner_type", "corporate_client").order("sort_order");

// In JSX: two fully independent conditionals, not a shared flag.
{brandPartners && brandPartners.length > 0 && <BrandPartners partners={brandPartners} />}
{corporateClients && corporateClients.length > 0 && <CorporateClients clients={corporateClients} />}
```

### Pattern 4: Homepage inquiry form — zero new code
**What:** HOME-07 is satisfied by importing the existing component with no props, exactly as `/contact` already does.
**Example:**
```typescript
// Source: app/(public)/contact/page.tsx (existing, unchanged)
import { InquiryForm } from "@/components/inquiry/inquiry-form";
// ...
<InquiryForm />  {/* general inquiry, packageName/packageId both undefined */}
```

### Anti-Patterns to Avoid
- **A second inquiry form/pipeline for the homepage:** D-05 explicitly forbids this — reuse `<InquiryForm />` and the existing `/api/inquiries` route verbatim.
- **A new "homepage featured" boolean:** D-04 explicitly forbids this — the featured packages grid must filter on the existing `packages.is_featured` column.
- **Combining Brand Partners + Corporate Clients visibility into one check:** violates D-07's "each independently conditional" requirement.
- **Hand-rolled `setInterval` carousel rotation:** loses focus/hover pause, keyboard nav, and unmount cleanup that `embla-carousel-autoplay` already provides.
- **A new permission toggle for content management:** violates PROJECT.md's fixed-3-toggle/no-new-configurability decision — gate on the existing `can_manage_packages`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Carousel motion, swipe, keyboard nav, autoplay pause-on-interaction | Custom `setInterval` + touch-event carousel | `embla-carousel-react` (installed) + `embla-carousel-autoplay` | Already the project's carousel engine; the autoplay plugin solves pause-on-hover/focus, `stopOnInteraction`, and unmount cleanup that a hand-rolled interval would need to reimplement from scratch |
| Drag-to-reorder hero slides | Custom HTML5 drag events + manual index math | `@dnd-kit/core` + `@dnd-kit/sortable` (installed) | Identical pattern already proven twice in this codebase (`sortable-package-list.tsx`, `photo-manager.tsx`) — includes keyboard-sensor accessibility for free |
| Star-rating display | New rating-widget npm package | Loop over `lucide-react`'s `StarIcon`, filled/muted by index vs. `rating` | Read-only 1-5 display of an admin-entered integer; no interactive input needed, no new dependency justified |
| Base64 image upload + Storage insert | New upload library / direct `<form>` multipart submission | Reuse `readFileAsBase64()` + Server Action `upload*()` pattern from `photo-manager.tsx` / `package-photos.ts` | Already handles the FileReader→base64→Server-Action→`storage.upload()`→row-insert sequence correctly, including sequential (non-`Promise.all`) uploads to avoid `display_order`/`sort_order` race conditions |
| Admin CRUD dialogs (value props, testimonials, partners) | New modal/form-state library | shadcn `Dialog` + `react-hook-form` + `zod`, mirroring `account-form.tsx`/`users-table.tsx` | Identical create/edit/delete dialog shape already proven for staff accounts |
| Permission gating for the new `/admin/content` surface | New "can_manage_content" permission column | Existing `can_manage_packages` boolean via `requirePermission()`/`requirePermissionOrRedirect()` | PROJECT.md's Key Decisions table explicitly locks the 3-toggle model — adding a 4th toggle is out of scope |

**Key insight:** every mechanical building block this phase needs (carousel, drag-reorder, image upload, permission-gated Server Actions, RLS shape, admin CRUD dialogs) already exists in this codebase from Phases 1-5. The actual work is applying these proven patterns to 4 new small tables and composing 6 new homepage sections — not inventing new infrastructure.

## Common Pitfalls

### Pitfall 1: Trusting `hero_slides.package_id` without checking the RLS-filtered join
**What goes wrong:** `hero_slides` has unconditional public-read RLS (`using (true)`), but `packages` does not — a package-type slide referencing a since-unpublished or soft-deleted package will still return from `hero_slides`, but its joined `packages` row will come back `null` for an anon caller. Rendering `slide.packages.name`/`slide.packages.package_photos` without a null-check throws or renders a broken slide.
**Why it happens:** Different RLS scoping between a parent (`hero_slides`, always public) and a joined child (`packages`, conditionally public) is easy to overlook when writing the public query.
**How to avoid:** Filter package-type slides whose joined `packages` came back `null` before render (Code Examples Pattern 2).
**Warning signs:** A hero slide renders with a missing image and a broken "View Package" link, or a `Cannot read property 'name' of null` render error.

### Pitfall 2: Over-constraining hero slides to `is_featured = true` at the database layer
**What goes wrong:** D-01 says package-type hero slides "reuse the existing `is_featured` flag" — the correct reading is that the admin's **package picker** (when adding a package-type slide) should be scoped to already-featured, published packages. It does NOT mean `hero_slides` needs a live FK/CHECK constraint or trigger re-validating `is_featured = true` on every read. If a package is later un-featured after being added as a hero slide, a hard DB constraint would silently break the homepage carousel the next time anyone toggles Featured off.
**How to avoid:** Filter the *admin add-slide UI's* package selector query to `is_featured = true and is_published = true and deleted_at is null`. Do not add a database-level dependency between `hero_slides.package_id` and `packages.is_featured`.

### Pitfall 3: One combined "any partner exists" check instead of two independent counts
**What goes wrong:** D-07 requires Brand Partners and Corporate Clients to be independently hidden. A single `select count(*) from partners` check would show/hide both sections together, which is wrong if only one `partner_type` has entries.
**How to avoid:** Two separate queries/counts, one per `partner_type` (Code Examples Pattern 3).

### Pitfall 4: Reusing `revalidatePath("/packages")` instead of `revalidatePath("/")`
**What goes wrong:** Every existing Server Action (`createPackage`, `uploadPhotos`, etc.) revalidates `/packages` and `/packages/[slug]` because that's where packages render. This phase's new content lives ONLY on the homepage (D-03) — copy-pasting the existing revalidate calls without updating the path leaves the homepage stale after an admin edit.
**How to avoid:** Every new Server Action (`createSlide`, `updateTestimonial`, `createPartner`, etc.) must call `revalidatePath("/")`, not `/packages`.

### Pitfall 5: New Storage bucket without its own `storage.objects` RLS policies
**What goes wrong:** Table-level RLS never extends to Supabase Storage — this project's own `20260718150801_admin_rbac_and_package_write_policies.sql` had to add 3 separate `storage.objects` policies scoped to `bucket_id = 'package-photos'` on top of the table RLS. A new `site-content` bucket needs its own bucket-scoped policies (public read + `can_manage_packages`-gated write) — the `packages`/`hero_slides` table RLS does nothing for Storage.
**How to avoid:** Migration must include both the bucket row (`insert into storage.buckets ...`) AND 3 `storage.objects` policies scoped to `bucket_id = 'site-content'`, mirroring the existing `package-photos` bucket's policies exactly.

### Pitfall 6: `embla-carousel-autoplay` does not respect `prefers-reduced-motion` automatically
**What goes wrong:** Unlike CSS animations gated by the media query, the Autoplay plugin will auto-advance regardless of the user's OS-level reduced-motion preference unless the app explicitly checks for it.
**Why it happens:** The plugin is a generic timer-based slide advancer with no built-in accessibility media-query awareness (confirmed via the plugin's own docs/GitHub discussions).
**How to avoid:** Check `window.matchMedia("(prefers-reduced-motion: reduce)")` and pass `playOnInit: false` (or skip constructing the plugin entirely) when true (Code Examples Pattern 1). Also always pair autoplay with `stopOnInteraction: true` and hover/focus pause (WCAG 2.2.2 Pause/Stop/Hide) — the `CarouselPrevious`/`CarouselNext` buttons already give keyboard users manual control.
**Warning signs:** A carousel that keeps moving under a screen reader or for a user who has reduced-motion enabled at the OS level.

### Pitfall 7: Sequential vs. parallel image uploads racing on `sort_order`/`display_order`
**What goes wrong:** `uploadPhotos()` in `actions/package-photos.ts` computes `display_order` from the current max at call time — the existing `photo-manager.tsx` deliberately awaits uploads one file at a time (never `Promise.all`) to avoid two concurrent calls reading the same stale max and colliding. Any new upload flow (hero slide image, testimonial photo, partner logo) that copies this pattern must preserve the sequential-await, not "optimize" it into a `Promise.all`.
**How to avoid:** Copy `photo-manager.tsx`'s `for (const file of files) { await uploadX(...) }` loop verbatim, don't parallelize.

## Code Examples

### 1. Hero carousel with autoplay (full pattern)
See Architecture Patterns → Pattern 1 above.

### 2. Featured packages grid — zero new curation code
```typescript
// Source: app/(public)/packages/page.tsx's existing query shape, filtered to is_featured
const { data: featured } = await supabase
  .from("packages")
  .select("*, package_photos(storage_path, display_order)")
  .eq("is_published", true)
  .eq("is_featured", true)   // <-- the only addition; reuses PKG-05's existing flag
  .order("sort_order", { ascending: true })
  .limit(6);
// Render each row with the existing <PackageCard pkg={pkg} photoUrl={photoUrl} />
```

### 3. Independent Brand Partners / Corporate Clients visibility
See Architecture Patterns → Pattern 3 above.

### 4. Star rating display (no new dependency)
```typescript
// Source: lucide-react StarIcon (confirmed installed — VERIFIED via node_modules)
import { StarIcon } from "lucide-react";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon
          key={i}
          className={i < rating ? "fill-primary text-primary" : "fill-transparent text-muted-foreground"}
        />
      ))}
    </div>
  );
}
```

### 5. Migration shape (RLS mirrors `packages`' exact pattern)
```sql
-- Source: mirrors supabase/migrations/20260718114727_create_package_schema.sql's
-- "public read using (true)" + 20260718150801's can_manage_packages write policies.

create table hero_slides (
  id uuid primary key default gen_random_uuid(),
  slide_type text not null check (slide_type in ('package', 'promo')),
  package_id uuid references packages(id) on delete cascade,
  image_storage_path text,       -- required for slide_type='promo', null for 'package' (photo comes from the linked package)
  headline text,                  -- promo slides only; package slides use packages.name
  subheading text,
  cta_label text,
  external_link text,             -- promo slides only, optional
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint hero_slides_package_shape check (
    (slide_type = 'package' and package_id is not null) or
    (slide_type = 'promo' and package_id is null)
  )
);
alter table hero_slides enable row level security;
create policy "public read" on hero_slides for select using (true);
create policy "manage_packages can read all hero_slides" on hero_slides
  for select to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));
create policy "manage_packages can insert hero_slides" on hero_slides
  for insert to authenticated with check (public.has_permission(auth.uid(), 'can_manage_packages'));
create policy "manage_packages can update hero_slides" on hero_slides
  for update to authenticated
  using (public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (public.has_permission(auth.uid(), 'can_manage_packages'));
create policy "manage_packages can delete hero_slides" on hero_slides
  for delete to authenticated using (public.has_permission(auth.uid(), 'can_manage_packages'));

-- value_props, testimonials, partners follow the identical enable-RLS +
-- 5-policy (public read / manage_packages read-all / insert / update / delete) shape.

create table partners (
  id uuid primary key default gen_random_uuid(),
  partner_type text not null check (partner_type in ('brand_partner', 'corporate_client')),
  logo_storage_path text not null,
  link_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
-- (same 5-policy RLS block as hero_slides above, table name swapped)

insert into storage.buckets (id, name, public)
values ('site-content', 'site-content', true)
on conflict (id) do nothing;

create policy "Public read access for site content" on storage.objects
  for select using (bucket_id = 'site-content');
create policy "manage_packages can upload site content" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'));
create policy "manage_packages can update site content" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'))
  with check (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'));
create policy "manage_packages can delete site content" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-content' and public.has_permission(auth.uid(), 'can_manage_packages'));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| N/A | N/A | — | This is a same-stack extension of an already-current codebase (Next.js 16.2, React 19.2, embla-carousel 8.6, Supabase — all already latest as of the Phase 1-5 research); no version drift to reconcile |

**Deprecated/outdated:** none relevant — no library in this phase's scope has a newer major version pending or a deprecated alternative in play.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Testimonial `photo_storage_path` should be nullable (optional) at the DB layer even though D-06 lists "customer photo/avatar" as one of the four fields, with the UI falling back to an initials avatar when absent | Standard Stack / Architecture | If the user actually wants photo to be a hard-required field, the planner should add a `not null` constraint and a required-file-input in the form instead of an optional upload — low risk either way, easy to flip before/after migration since no data exists yet |
| A2 | "Why choose us" value props (HOME-02) need only `title` + `description` text fields, no icon field | Architecture Patterns / Project Structure | If the desired visual design wants a per-value-prop icon, the planner should add an `icon_name` text column (a lucide icon name string) and a small fixed icon picker in the admin form — this is a minor additive schema change, not a breaking one |
| A3 | A single `site-content` Storage bucket (path-prefixed) is preferred over 3 separate buckets for hero/testimonial/partner images | Standard Stack (Alternatives Considered) | If stronger storage isolation between content types is desired, splitting into 3 buckets is a straightforward alternative — CONTEXT.md explicitly left this to the planner/researcher (Claude's Discretion), so either shape is acceptable |
| A4 | Recommended UI grouping is one `/admin/content` page with 4 Tabs rather than 4 separate `/admin/*` routes/nav items | Recommended Project Structure | If a future phase wants a dedicated nav item per content type, splitting the Tabs page into 4 routes later is a low-cost refactor (each tab's component is already self-contained) |

**If this table is empty:** N/A — see entries above; none are HIGH risk, all are easily reversible before or shortly after the migration ships (no production data exists for these new tables yet).

## Open Questions

1. **Should hero slide images for package-type slides ever be overridden with a dedicated hero-specific image, or always pull the package's own first photo?**
   - What we know: D-01 says package slides show "photo, name, CTA into that package" — reusing the package's existing photo is the simplest reading and avoids a second image-upload flow for package-type slides.
   - What's unclear: Whether the business wants a wider/differently-cropped hero-specific image distinct from the package gallery's square/4:3 thumbnails (hero carousels are typically wide/16:9).
   - Recommendation: Default to reusing the package's first `package_photos` row (zero extra upload UI for package-type slides); flag to the user during UAT that a dedicated hero-crop upload can be added later if the reused photo looks poorly cropped at hero-banner aspect ratio.

2. **Does `value_props` need any admin-configurable icon, or is title+description text sufficient?**
   - What we know: HOME-02's only stated requirement is "value props section, admin-editable" — no icon field mentioned in REQUIREMENTS.md or CONTEXT.md.
   - What's unclear: The eventual UI design (deferred to a UI-SPEC pass) may want a small icon per value prop for visual scannability.
   - Recommendation: Ship without an icon field (title + description only) for this phase; treat icon support as an easy additive follow-up if the UI design calls for it (see Assumption A2).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Supabase CLI | New migration authoring + `supabase db push` | ✓ | 2.100.1 | — |
| Node.js | Dev/build | ✓ | 20.19.4 | — |
| npm | Installing `embla-carousel-autoplay` | ✓ | 10.8.2 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — this phase has no external service dependency beyond the already-provisioned Supabase project and Storage.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No (new tables) | Unchanged — reuses existing Supabase Auth session (`getUser()`-based `verifySession()`/`getProfile()` from `lib/auth/dal.ts`) |
| V3 Session Management | No | Unchanged — no new session surface |
| V4 Access Control | Yes | `requirePermission("can_manage_packages")` at the top of every new Server Action (mirrors `actions/packages.ts`), PLUS RLS as the independent second layer (`has_permission(auth.uid(), 'can_manage_packages')`) — this project's established double-enforcement pattern (AUTH-05) |
| V5 Input Validation | Yes | `zod` schemas for every new admin form (hero slide, value prop, testimonial, partner) mirroring `package-form-schema.ts`'s pattern — client-side `zodResolver` only; note existing codebase gap (WR-01 from `03-REVIEW.md`): Server Actions in this project do not currently re-validate with zod server-side, relying on client-zod + DB `check` constraints (e.g. `rating between 1 and 5`, `slide_type in (...)`) as the actual server-side guardrail. New actions should follow the same DB-CHECK-constraint-as-backstop pattern given here, at minimum, for anything with a bounded domain (rating 1-5, slide_type, partner_type) |
| V6 Cryptography | No | No new secrets/crypto surface in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Anon/unauthenticated write to new public-read tables via direct PostgREST call | Tampering / Elevation of Privilege | RLS `for insert/update/delete to authenticated ... using (has_permission(...))` on every new table — no `to public`/anon write policy anywhere, exactly like `packages` |
| Storage bucket write bypass (uploading directly to `site-content` bypassing the Server Action) | Tampering | `storage.objects` RLS policies scoped to `bucket_id = 'site-content' and has_permission(...)` — table RLS does not cover Storage, this must be a separate explicit policy set (Pitfall 5) |
| Stale/broken hero slide referencing an unpublished package leaking implied existence of unpublished content | Information Disclosure (minor) | The orphan-skip pattern (Pitfall 1 / Code Examples Pattern 2) also closes this — an anon caller reading `hero_slides` gets `packages: null` for any slide referencing a non-public package, revealing nothing about that package beyond an opaque `package_id` UUID already present in the (public-read) `hero_slides` row itself |
| Out-of-range `rating`/`slide_type`/`partner_type` values reaching the DB from a compromised/buggy client bypassing client-zod | Tampering | Postgres `CHECK` constraints (`rating between 1 and 5`, `slide_type in (...)`, `partner_type in (...)`) as the server-side backstop, matching this project's existing pattern for `package_inclusions.kind` and `messages.channel` |

## Sources

### Primary (HIGH confidence)
- This repository's own code, read directly: `components/ui/carousel.tsx`, `components/packages/package-gallery.tsx`, `actions/packages.ts`, `actions/package-photos.ts`, `components/inquiry/inquiry-form.tsx`, `app/admin/(dashboard)/layout.tsx`, `app/(public)/page.tsx`, `app/(public)/packages/page.tsx`, `app/(public)/contact/page.tsx`, `lib/auth/dal.ts`, `lib/action-result.ts`, `components/admin/{photo-manager,sortable-package-list,users-table,account-form,package-form-schema}.tsx`, `supabase/migrations/{20260718114727_create_package_schema,20260718140000_fix_public_read_rls_is_published,20260718150801_admin_rbac_and_package_write_policies,20260724100635_add_messaging_schema}.sql`, `package.json`, `app/globals.css`
- `npm view embla-carousel-autoplay version` / registry metadata (direct registry query, 2026-07-27) — HIGH confidence
- `node_modules/lucide-react` grep confirming `StarIcon`/`StarHalf`/`StarOff` export — HIGH confidence

### Secondary (MEDIUM confidence)
- WebSearch: "embla-carousel-autoplay shadcn carousel plugin usage React example" (2026-07-27) — confirms the `plugins={[Autoplay({...})]}` wiring pattern against shadcn's own documented example
- WebSearch: "embla-carousel.com autoplay plugin options stopOnInteraction stopOnMouseEnter prefers-reduced-motion" (2026-07-27) — confirms plugin option surface and the "does not auto-respect prefers-reduced-motion" finding (Pitfall 6)

### Tertiary (LOW confidence)
- None — every claim in this document is either grounded directly in this repository's own code/migrations, verified against the npm registry, or cross-checked via WebSearch against official/documented sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — the only new package is verified on the npm registry and version-matched to an already-installed peer; every other tool is already installed and proven in this codebase
- Architecture: HIGH — directly derived from 5 phases of this project's own established Server Action / RLS / Storage / dnd-kit / react-hook-form patterns, not external inference
- Pitfalls: HIGH — 5 of 7 pitfalls are grounded in explicit precedent/comments already present in this codebase's migrations and components (e.g. `03-REVIEW.md`'s WR-01 gap, `photo-manager.tsx`'s sequential-upload comment); 2 (reduced-motion, orphan-skip) are new to this phase but grounded in verified plugin documentation and this project's own existing RLS asymmetry

**Research date:** 2026-07-27
**Valid until:** 2026-08-26 (30 days — stable stack, no fast-moving dependencies in scope)
