# Public Site Loading States, Error States & Motion — Design Spec

**Date:** 2026-08-11
**Status:** Approved by user, pending implementation plan.

## Summary

Add loading states, error states, and animation/transition polish across the public-facing site (`app/(public)/`: homepage, `/packages`, `/packages/[slug]`, `/contact`). Today this route group has zero `loading.tsx`/`error.tsx` boundaries and almost no motion — visitors see a frozen tab during server-side data fetches, an invalid package slug hits Next's bare default 404, and section entrances/image loads/hover states are either abrupt or (in one case) not actually wired up. Admin panel is untouched — this is public-site only.

## Feasibility Notes (from investigation)

- All four public pages are async Server Components querying Supabase directly in `page.tsx` — no client-side fetching, no existing Suspense boundaries. `loading.js` auto-wraps `page.js` (and any nested layout/page without its own `loading.js`) in a Suspense boundary, so adding skeletons requires zero changes to existing page code.
- `/contact` has no data fetching (`ContactPage` is a plain sync component) — a `loading.tsx` there would never trigger, so it's skipped.
- Per-section Supabase query failures on the homepage/packages pages already degrade gracefully today (log server-side via `console.error`, render an empty/fallback state) — this is existing, working behavior and is not touched. `error.tsx` is a safety net for genuine render-time crashes only, not a replacement for that pattern.
- Next.js 16.2's `error.js` convention now passes `unstable_retry()` (in addition to the older `reset()`) — re-fetches and re-renders the boundary's children rather than a hard reload. Confirmed via `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
- Next.js 16 has a first-class mechanism for route transitions and Suspense-reveal handoffs: React's `<ViewTransition>` component + `experimental.viewTransition` in `next.config.ts`, confirmed via `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`. It degrades to a no-op in browsers without View Transitions API support (Safari has partial support) — safe to enable, no hard dependency.
- `tw-animate-css` is already imported globally in `app/globals.css` and provides `animate-in`/`fade-in`/`slide-in-from-*` utilities (used today only for Accordion/Sheet/Dialog data-state transitions via base-ui). These same utilities can be reused for scroll-reveal without adding a new dependency.
- Existing bug found: `components/packages/package-card.tsx`'s `<Card>` wrapper has no `group` class, but its `<Image>` uses `group-hover/card:scale-105` — a named-group variant with no ancestor declaring `group/card`. The photo zoom-on-hover has never actually fired. Fixing this is in scope as part of "ensure everything is smooth."
- `components/ui/skeleton.tsx` (`animate-pulse rounded-md bg-muted`) and the existing skeleton-card pattern in `components/homepage/featured-packages-grid.tsx`'s empty state are the established skeleton primitives — reused as-is for the new `loading.tsx` files rather than inventing a new skeleton style.

## Architecture

### 1. Loading states (route-level skeletons)

- `app/(public)/loading.tsx` — homepage skeleton: hero band placeholder, then stacked skeleton blocks mirroring `WhyChooseUs` (4-up), `FeaturedPackagesGrid` (3-up cards, reusing its existing skeleton-card shape), `DestinationsSection`, `TestimonialsSection` rhythms.
- `app/(public)/packages/loading.tsx` — heading skeleton + 6 skeleton cards in the same 1/2/3-col responsive grid as the real grid.
- `app/(public)/packages/[slug]/loading.tsx` — back-link, title/price row, gallery grid, CTA card, and the repeated `SECTION_CARD` blocks, all as skeletons matching the real page's layout rhythm so there's no visible reflow when content swaps in.
- No `app/(public)/contact/loading.tsx` (no data fetching on that page).

### 2. Error states

- `app/(public)/error.tsx` (Client Component, required by convention) — on-brand card: heading, brief copy, **Try again** button wired to `unstable_retry()`, plus WhatsApp/Facebook CTA and a link home as an escape hatch if retry doesn't help. Logs the error via `console.error` in a `useEffect`. Does not replace or alter any existing per-section try/catch-and-degrade logic in `page.tsx` files.
- `app/(public)/not-found.tsx` — on-brand 404 (replaces Next's bare default for `notFound()` calls, currently only used by the package detail page for invalid/unpublished slugs), styled consistently with `error.tsx`, linking to `/packages` and home.

### 3. Animations & transitions

- **Route transitions + Suspense reveal**: enable `experimental.viewTransition` in `next.config.ts`. Wrap each public page's returned root element in React's `<ViewTransition>` (imported from `react`) for a simple crossfade on navigation — no shared-element photo morphing, no `nav-forward`/`nav-back` directional tagging (explicit non-goal, see below). Pair each new `loading.tsx` skeleton and its corresponding real content with the documented Suspense-reveal pattern (`exit="slide-down"` on the fallback, `enter="slide-up" default="none"` on the content) so the handoff has deliberate motion instead of an instant pop. New keyframes (`fade`, `slide-y`, ~150–210ms, asymmetric exit-then-enter timing per Next's own reference implementation) added to `app/globals.css`.
- **Scroll-reveal**: new `components/motion/reveal.tsx` — small client component, `IntersectionObserver`-based (fires once per mount, unobserves after first intersection), applies `tw-animate-css`'s `animate-in fade-in slide-in-from-bottom-6` classes when in view. Renders children statically visible (no observer, no animation classes) when `prefers-reduced-motion: reduce` is set. Applied as a wrapper around: `WhyChooseUs`, `FeaturedPackagesGrid`, `DestinationsSection`, `TestimonialsSection`, `BrandPartners`, `CorporateClients` on the homepage, and each `SECTION_CARD` section on the package detail page.
- **Image fade-in on load**: small reusable pattern — an `onLoad` handler toggling a `opacity-0` → `opacity-100 transition-opacity duration-300` class — applied to below-the-fold images only: `PackageCard` photos, `PackageGallery` grid thumbnails and lightbox images, testimonial photos, destination tiles, brand partner/corporate client logos. The hero carousel's `priority` slide image is explicitly excluded (it's the page's LCP image; fading it in would hurt perceived load speed).
- **Micro-interactions**:
  - Fix `PackageCard`: add the missing `group/card` class to the `<Card>` wrapper so the existing (currently dead) `group-hover/card:scale-105` image-zoom actually fires.
  - Add `active:scale-[0.98] transition-transform` press-state to `WhatsAppCta`, `FacebookCta`, and the `InquiryForm` submit button, consistent with `buttonVariants`'s existing `active:not-aria-[haspopup]:translate-y-px` pattern.
  - Sheet (mobile nav), Accordion (itinerary), Dialog (gallery lightbox), and Carousel (hero + gallery) already animate smoothly via base-ui's `data-starting-style`/`data-ending-style` and Embla's native drag — left unchanged.
- **Reduced motion**: sitewide `@media (prefers-reduced-motion: reduce)` block in `app/globals.css` zeroing `animate-in`/`animate-out` durations and view-transition animation durations (per Next's own reference CSS), so every animation added above degrades gracefully by default. The hero carousel's existing per-component reduced-motion check (autoplay) is unaffected and stays as-is.

## Components Touched

- New: `app/(public)/loading.tsx`, `app/(public)/packages/loading.tsx`, `app/(public)/packages/[slug]/loading.tsx`, `app/(public)/error.tsx`, `app/(public)/not-found.tsx`, `components/motion/reveal.tsx`
- Edited: `next.config.ts` (enable `experimental.viewTransition`), `app/globals.css` (keyframes + reduced-motion overrides), `app/(public)/page.tsx`, `app/(public)/packages/page.tsx`, `app/(public)/packages/[slug]/page.tsx` (wrap in `<ViewTransition>`, wrap sections in `<Reveal>`), `components/packages/package-card.tsx` (group fix + image fade-in + press-state via CTAs), `components/packages/package-gallery.tsx` (image fade-in), `components/homepage/why-choose-us.tsx`, `components/homepage/destinations-section.tsx`, `components/homepage/testimonials-section.tsx`, `components/homepage/brand-partners.tsx`, `components/homepage/corporate-clients.tsx` (Reveal wrapper + image fade-in where applicable), `components/packages/whatsapp-cta.tsx`, `components/packages/facebook-cta.tsx`, `components/inquiry/inquiry-form.tsx` (press-state)

## Error Handling

- `error.tsx`'s own render path can't fail into another boundary within the same segment (it wraps `loading.js`/`not-found.js`/`page.js`/nested `layout.js`, not itself) — kept intentionally simple (no data fetching, no client state beyond the retry button) to minimize its own failure surface.
- View transitions are purely progressive enhancement — if `experimental.viewTransition` has no effect in an unsupported browser, navigation behaves exactly as it does today (instant swap), so no fallback branch is needed.
- `Reveal`'s `IntersectionObserver` usage is guarded for `prefers-reduced-motion` and only runs client-side (`"use client"`); no SSR mismatch since it renders children unconditionally and only toggles a class after mount.

## Testing

Manual UAT covering:
- Throttled network (Chrome DevTools "Slow 4G") on `/`, `/packages`, `/packages/[slug]` to confirm skeletons render and match the real layout's proportions (no reflow/jump on swap).
- Forcing a render error (temporary `throw` in a page) to confirm `error.tsx` renders and **Try again** recovers.
- Visiting an invalid/unpublished package slug to confirm the new `not-found.tsx` renders instead of Next's default.
- Navigating between all four public routes to confirm the crossfade plays and the header doesn't jitter.
- Scrolling each homepage/detail-page section into view to confirm reveal timing feels consistent, not staggered/janky.
- Hovering a package card to confirm the photo now actually zooms (bug fix verification).
- Toggling OS-level "reduce motion" and re-checking all of the above collapses to instant/no animation.
- Confirm PDF export routes (`app/(public)/packages/[slug]/pdf/route.ts`) and the `unsubscribe` route are unaffected (outside the touched route group).

## Explicit Non-Goals

- Admin panel (`app/admin/`) — entirely out of scope.
- Shared-element view-transition morphing (e.g. `PackageCard` photo → `PackageGallery` hero photo) — a natural follow-on, not built now.
- Directional (`nav-forward`/`nav-back`) route transitions — requires tagging every internal `<Link>` by navigation hierarchy; deferred.
- Per-section inline "couldn't load this part" error UI — explicitly declined in favor of keeping today's silent-degrade-per-section behavior plus a route-level safety net.
- No new dependencies — `tw-animate-css` (already present) covers scroll-reveal; no motion library (e.g. framer-motion) is added.
