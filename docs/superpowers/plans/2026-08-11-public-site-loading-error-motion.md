# Public Site Loading States, Error States & Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route-level loading skeletons, on-brand error/404 pages, and foundational motion (view transitions, scroll reveal, image fade-in, press-states) across the public site (`app/(public)/`), per `docs/superpowers/specs/2026-08-11-public-site-loading-error-motion-design.md`.

**Architecture:** Next.js 16's `loading.js` file convention (zero page-code changes needed) supplies route-level Suspense fallbacks for the three data-fetching public pages. React's `<ViewTransition>` (enabled via `experimental.viewTransition` in `next.config.ts`) wraps each page's root content with `enter="slide-up" default="none"`, and each `loading.tsx`'s skeleton with `exit="slide-down"` — since Next.js route navigations are themselves transitions, this single wrapping mechanism produces both the loading→content reveal *and* the page-to-page crossfade, without needing two separate systems. A new `Reveal` client component (`IntersectionObserver`-based) wraps section-level content for scroll-triggered fade-up, and a new `FadeImage`/`FadeImg` pair wraps `next/image`/plain `<img>` for load-triggered fade-in. Both new primitives are the only new "use client" boundaries this plan introduces — every page/section they wrap can stay a Server Component, since children are passed through as the `children` prop.

**Tech Stack:** Next.js 16.2 App Router (`loading.js`/`error.js`/`not-found.js` file conventions, `experimental.viewTransition`), React 19's `<ViewTransition>` (imported from `"react"`), `tw-animate-css` (already installed, powers `Reveal`'s `animate-in` classes), Tailwind v4, `@base-ui/react` (existing `Avatar`/`Button` primitives).

## Global Constraints

- No automated test suite exists in this project — verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual dev-server checks, matching this codebase's established convention (see `docs/superpowers/plans/2026-08-10-hero-search-bar.md`).
- No new npm dependencies — `tw-animate-css` (already installed) covers scroll-reveal utility classes; View Transitions is a native React/Next.js API, not a package.
- No hardcoded hex colors in any new UI (existing WhatsApp/Facebook brand-color hex values in `whatsapp-cta.tsx`/`facebook-cta.tsx` are a pre-existing, accepted exception — not touched beyond adding a transition/press-state class).
- Every new client-side animation (Reveal, view transitions) must degrade gracefully under `prefers-reduced-motion: reduce` — either by skipping the observer/animation entirely (`Reveal`) or via the sitewide CSS override added in Task 1.
- `Reveal`-wrapped content must never be permanently invisible if JavaScript fails to run or `IntersectionObserver` fires unexpectedly late — Task 2 includes a `<noscript>` safety net for this.
- `FadeImage`/`FadeImg` must never be stuck at `opacity-0` for an image that finished loading (from cache or a fast connection) before React hydrates and attaches the `onLoad` handler — Task 3 checks `.complete` on mount via a ref callback to cover this race.
- Any Tailwind class list combining an opacity transition with a transform transition (fade-in + hover-scale) must use a single combined `transition-[opacity,transform]` utility, never two separate `transition-opacity`/`transition-transform` classes — `tailwind-merge` (via this codebase's `cn()` helper) treats `transition-*` utilities as mutually exclusive within the same class list and silently drops all but the last one, which would silently break whichever transition lost.

## Deviations From The Design Spec (found during planning)

- **`PackageCard`'s image zoom-on-hover is not actually broken.** The design spec (written during brainstorming, before `components/ui/card.tsx` was inspected line-by-line) claimed the `<Card>` wrapper was missing a `group/card` class, making the existing `group-hover/card:scale-105` on its photo dead code. Re-reading `components/ui/card.tsx:15` during planning shows `Card`'s own base classes already include `"group/card ..."` unconditionally — the zoom-on-hover already works today. **No fix task for this exists in this plan.**
- **`InquiryForm`'s submit button already has a press-state.** The spec called for adding `active:scale-[0.98]` to it "consistent with `buttonVariants`'s existing `active:not-aria-[haspopup]:translate-y-px` pattern" — but the submit button already **is** a `<Button>` (`components/ui/button.tsx`), so it already inherits that exact `active:translate-y-px` class from `buttonVariants`'s base styles. Only `WhatsAppCta`/`FacebookCta` (hand-rolled `<a>` tags, not `<Button>`) actually lack a press-state. **No change to `inquiry-form.tsx` exists in this plan.**
- **The "route crossfade" and "Suspense reveal" mechanisms are the same mechanism, not two.** The spec described them as paired-but-separate. Since every data-fetching public route navigation passes through that route's `loading.tsx` Suspense fallback, wrapping `loading.tsx`'s skeleton in `<ViewTransition exit="slide-down">` and each page's content in `<ViewTransition enter="slide-up" default="none">` produces both effects from one wrapping. `/contact` (no data fetching, no `loading.tsx`) still gets the `enter="slide-up"` wrap on its own content for a consistent arrival animation, just without a paired skeleton exit.
- **No dedicated `TestimonialAvatar` component is needed.** The spec anticipated a bespoke fade-in wrapper for testimonial photos. Inspecting `@base-ui/react/avatar`'s `AvatarImage` internals during planning (`node_modules/@base-ui/react/avatar/image/AvatarImage.js`) shows it already tracks image-loading status itself and only mounts the `<img>` once loaded, exposing a `data-starting-style` attribute during its own enter transition — the exact same convention this codebase already uses on `SheetOverlay`/`SheetContent`/`ComboboxPopup`. A one-line `className` addition on the existing `<AvatarImage>` (Task 16) is sufficient; no new component, no client-boundary conversion of `TestimonialsSection`.
- **`Reveal`'s reduced-motion check was a lint error, found and fixed during Task 2's execution.** The original plan text called `setIsVisible(true)` synchronously inside `useEffect`'s body for the reduced-motion branch, which trips this codebase's `react-hooks/set-state-in-effect` lint rule (`npm run lint` — a real error, not a warning, surfaced by Task 2's implementer). Fixed by moving the `prefers-reduced-motion` check into `useState`'s lazy initializer instead, so the reduced-motion branch never needs a `setState` call at all; the effect now only runs the `IntersectionObserver` path when `!isVisible`. Task 2's own text below already reflects the corrected version.

---

### Task 1: Enable View Transitions + add view-transition/reduced-motion CSS

**Files:**
- Modify: `next.config.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: `experimental.viewTransition: true` (enables React's `<ViewTransition>`, imported from `"react"`, used starting Task 5). CSS classes `.slide-down`/`.slide-up` targetable via `<ViewTransition exit="slide-down">`/`<ViewTransition enter="slide-up">`. A sitewide `prefers-reduced-motion: reduce` override zeroing all view-transition animation durations.

- [ ] **Step 1: Enable the experimental flag**

Find (current `next.config.ts`, full `experimental` block):

```ts
  experimental: {
    serverActions: {
      // Default 1MB is too small for realistic phone/DSLR photos once
      // base64-encoded (~33% overhead); raised to a bounded value rather
      // than left unlimited (02-REVIEW.md CR-01, T-02-38). Paired with
      // photo-manager.tsx sending one file per Server Action call so a
      // single request never carries more than one photo's payload.
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["@react-pdf/renderer"],
```

Replace with:

```ts
  experimental: {
    serverActions: {
      // Default 1MB is too small for realistic phone/DSLR photos once
      // base64-encoded (~33% overhead); raised to a bounded value rather
      // than left unlimited (02-REVIEW.md CR-01, T-02-38). Paired with
      // photo-manager.tsx sending one file per Server Action call so a
      // single request never carries more than one photo's payload.
      bodySizeLimit: "10mb",
    },
    // Enables React's <ViewTransition> (imported from "react") for the
    // loading-skeleton -> content handoff and page-to-page crossfade -- see
    // docs/superpowers/specs/2026-08-11-public-site-loading-error-motion-design.md.
    // Progressive enhancement: browsers without View Transitions API
    // support simply skip the animation, navigation still works normally.
    viewTransition: true,
  },
  serverExternalPackages: ["@react-pdf/renderer"],
```

- [ ] **Step 2: Add view-transition keyframes and the reduced-motion override**

Find (current `app/globals.css`, final lines):

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

Replace with:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}

/* View Transitions (next.config.ts's experimental.viewTransition) -- the
   string passed to <ViewTransition exit="..."/enter="..."> (React, imported
   from "react") becomes a CSS class on the browser's
   ::view-transition-old()/::view-transition-new() pseudo-elements. Used for
   the loading.tsx skeleton -> real page content handoff, and (since Next.js
   route navigations are themselves transitions) as the site's page-to-page
   crossfade. See
   docs/superpowers/specs/2026-08-11-public-site-loading-error-motion-design.md. */
:root {
  --vt-duration-exit: 150ms;
  --vt-duration-enter: 210ms;
}

::view-transition-old(.slide-down) {
  animation:
    var(--vt-duration-exit) ease-out both vt-fade reverse,
    var(--vt-duration-exit) ease-out both vt-slide-y reverse;
}
::view-transition-new(.slide-up) {
  animation:
    var(--vt-duration-enter) ease-in var(--vt-duration-exit) both vt-fade,
    400ms ease-in-out both vt-slide-y;
}

@keyframes vt-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes vt-slide-y {
  from {
    transform: translateY(10px);
  }
  to {
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npm run dev`, visit `/`.
Expected: site loads and behaves exactly as before this task (the flag/CSS aren't used by any component yet).

- [ ] **Step 4: Commit**

```bash
git add next.config.ts app/globals.css
git commit -m "feat: enable Next.js View Transitions and add transition CSS"
```

---

### Task 2: `Reveal` scroll-reveal component + no-JS safety net

**Files:**
- Create: `components/motion/reveal.tsx`
- Modify: `app/(public)/layout.tsx`

**Interfaces:**
- Consumes: `cn` (existing `@/lib/utils`).
- Produces: `Reveal({ children, className? }: { children: React.ReactNode; className?: string })` — `"use client"` component. Renders `children` inside a `<div>` that fades + slides up into view the first time it enters the viewport (fires once), or renders immediately visible if `prefers-reduced-motion: reduce` is set. Always carries a stable `reveal` class name for the `<noscript>` override below.

- [ ] **Step 1: Write `components/motion/reveal.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Fades + slides children up into view the first time they scroll into the
 * viewport (fires once, then stops observing). Renders children immediately
 * visible -- no observer, no animation classes -- when the visitor has
 * `prefers-reduced-motion: reduce` set.
 *
 * The stable `reveal` class name is a hook for the no-JS safety net in
 * app/(public)/layout.tsx's <noscript> block, which forces full visibility
 * when scripting is disabled -- this component's hidden-until-observed
 * state is otherwise baked into the server-rendered HTML (it reflects
 * useState's initial value before any effect runs), so a visitor without
 * JavaScript would otherwise never see the content revealed.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Reduced-motion is read as useState's lazy initializer, not via a
  // setState call inside the effect below -- doing it there would run
  // synchronously during the effect body, which both triggers an avoidable
  // extra render and trips this codebase's react-hooks/set-state-in-effect
  // lint rule (see Deviations section: this was a bug in the plan's
  // original example code, caught by `npm run lint` during Task 2).
  const [isVisible, setIsVisible] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <div
      ref={ref}
      className={cn(
        "reveal",
        isVisible
          ? "animate-in fade-in slide-in-from-bottom-6 fill-mode-both duration-700 ease-out"
          : "opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Add the no-JS safety net to the public layout**

Find (current `app/(public)/layout.tsx`, full file):

```tsx
import { SiteHeader } from "@/components/layout/site-header";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to main content
      </a>

      <SiteHeader />
```

Replace with:

```tsx
import { SiteHeader } from "@/components/layout/site-header";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* Reveal (components/motion/reveal.tsx) starts content at
          opacity-0 until an IntersectionObserver confirms it's in view --
          that initial hidden state is baked into the server-rendered HTML,
          so a visitor without JavaScript would otherwise never see it
          revealed. This forces it visible whenever scripting is off. */}
      <noscript>
        <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
      </noscript>

      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to main content
      </a>

      <SiteHeader />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors (`Reveal` isn't imported anywhere yet, but must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add components/motion/reveal.tsx "app/(public)/layout.tsx"
git commit -m "feat(motion): add scroll-reveal component with no-JS safety net"
```

---

### Task 3: `FadeImage`/`FadeImg` load-fade-in components

**Files:**
- Create: `components/motion/fade-image.tsx`

**Interfaces:**
- Consumes: `cn` (existing `@/lib/utils`), `ImageProps` (existing `next/image` type export).
- Produces: `FadeImage(props: ImageProps)` — `"use client"` drop-in replacement for `next/image`'s `<Image>` that fades in on load. `FadeImg(props: ComponentProps<"img">)` — same behavior for a plain `<img>`. Both apply `transition-[opacity,transform] duration-300` as their base transition class (a single combined `transition-property` list, not separate `transition-opacity`/`transition-transform` classes — see Global Constraints) — callers that want a hover-scale effect should add only the scale-trigger class (e.g. `group-hover:scale-105`), not their own `transition-transform`.

- [ ] **Step 1: Write `components/motion/fade-image.tsx`**

```tsx
"use client";

import { useCallback, useState, type ComponentProps } from "react";
import Image, { type ImageProps } from "next/image";

import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for next/image's <Image> that fades in on load
 * instead of popping in abruptly. The base transition-property list covers
 * both opacity and transform (rather than just transition-opacity) because
 * tailwind-merge (via cn()) treats transition-property utilities as
 * mutually exclusive within one class list -- a caller adding its own
 * `transition-transform` (e.g. for a hover-scale effect) would otherwise
 * silently strip this component's fade transition. Callers that want a
 * hover-scale effect should add only the scale-trigger class (e.g.
 * `group-hover:scale-105`), not their own `transition-transform`/`duration-*`
 * -- this component already covers both.
 *
 * Reserved for below-the-fold images -- do not use for priority/LCP images
 * (e.g. the hero carousel), where an opacity delay would hurt perceived
 * load speed.
 */
export function FadeImage({ className, onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  // A server-rendered <img> can finish loading (from browser cache, or a
  // fast connection) before React hydrates and attaches the onLoad handler
  // below -- the browser's "load" event doesn't retroactively fire for a
  // handler attached after the fact, which would otherwise leave the image
  // stuck at opacity-0 forever. Checking `.complete` in this ref callback
  // catches that race on mount.
  const checkAlreadyLoaded = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoaded(true);
  }, []);

  return (
    <Image
      {...props}
      ref={checkAlreadyLoaded}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        "transition-[opacity,transform] duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}

/**
 * Same fade-in-on-load behavior as FadeImage, for the one call site
 * (components/homepage/destinations-section.tsx) that intentionally
 * renders a plain <img> instead of next/image.
 */
export function FadeImg({
  className,
  onLoad,
  ...props
}: ComponentProps<"img">) {
  const [loaded, setLoaded] = useState(false);

  const checkAlreadyLoaded = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoaded(true);
  }, []);

  return (
    <img
      {...props}
      ref={checkAlreadyLoaded}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        "transition-[opacity,transform] duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/motion/fade-image.tsx
git commit -m "feat(motion): add FadeImage/FadeImg load-fade-in components"
```

---

### Task 4: On-brand `error.tsx` + `not-found.tsx` for the public site

**Files:**
- Create: `app/(public)/error.tsx`
- Create: `app/(public)/not-found.tsx`

**Interfaces:**
- Consumes: `Button` (existing `@/components/ui/button`), `WhatsAppCta`/`FacebookCta` (existing `@/components/packages/whatsapp-cta`, `@/components/packages/facebook-cta`).
- Produces: nothing consumed by later tasks — these are route-level file-convention components, wired in automatically by Next.js for the whole `(public)` segment tree.

- [ ] **Step 1: Write `app/(public)/error.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

export default function PublicError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center sm:px-8">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[24px] leading-[1.2] font-semibold">
          Something went wrong
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          We hit a snag loading this page. Try again, or reach out to us
          directly and we&apos;ll help you out.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Button
          render={<Link href="/" />}
          nativeButton={false}
          variant="outline"
          size="lg"
        >
          Back to Home
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <WhatsAppCta variant="icon-label" />
        <FacebookCta variant="icon-label" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(public)/not-found.tsx`**

```tsx
import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function PublicNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center sm:px-8">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Compass className="size-7" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[24px] leading-[1.2] font-semibold">
          Page not found
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have
          moved.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          render={<Link href="/packages" />}
          nativeButton={false}
          size="lg"
        >
          Browse Packages
        </Button>
        <Button
          render={<Link href="/" />}
          nativeButton={false}
          variant="outline"
          size="lg"
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`. Temporarily edit `app/(public)/packages/[slug]/page.tsx` to visit a nonexistent slug (e.g. `/packages/does-not-exist`) — confirm the new on-brand 404 renders instead of Next's bare default.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/error.tsx" "app/(public)/not-found.tsx"
git commit -m "feat(public): add on-brand error and not-found pages"
```

---

### Task 5: Homepage `loading.tsx`

**Files:**
- Create: `app/(public)/loading.tsx`

**Interfaces:**
- Consumes: `ViewTransition` (React, `Task 1`'s config enables it), `Skeleton` (existing `@/components/ui/skeleton`), `Card` (existing `@/components/ui/card`).

- [ ] **Step 1: Write `app/(public)/loading.tsx`**

```tsx
import { ViewTransition } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div>
        <Skeleton className="h-72 w-full rounded-none sm:h-96 lg:h-112" />

        <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 sm:px-8">
          <div className="flex flex-col gap-2 sm:max-w-2xl">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="size-12 rounded-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i} className="gap-0 overflow-hidden p-0">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="gap-0 overflow-hidden p-0">
                <Skeleton className="aspect-square w-full rounded-none" />
                <Skeleton className="m-2 h-4 w-2/3" />
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:px-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i} className="flex flex-col items-start gap-3 p-4">
                <Skeleton className="size-12 rounded-full" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </Card>
            ))}
          </div>
        </section>
      </div>
    </ViewTransition>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, throttle the network (Chrome DevTools → Network → "Slow 4G"), hard-reload `/`.
Expected: the skeleton renders briefly and roughly matches the real homepage's proportions (hero band, 4-up value props, 3-up cards, 4-up destinations, 3-up testimonials) before the real content swaps in.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/loading.tsx"
git commit -m "feat(public): add homepage loading skeleton"
```

---

### Task 6: `/packages` `loading.tsx`

**Files:**
- Create: `app/(public)/packages/loading.tsx`

**Interfaces:**
- Consumes: `ViewTransition` (React), `Card`, `Skeleton` (existing).

- [ ] **Step 1: Write `app/(public)/packages/loading.tsx`**

```tsx
import { ViewTransition } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PackagesLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="aspect-[4/5] gap-0 overflow-hidden p-0">
              <Skeleton className="size-full rounded-none" />
            </Card>
          ))}
        </div>
      </div>
    </ViewTransition>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, throttle the network, hard-reload `/packages`.
Expected: heading skeleton + a 1/2/3-column grid of card skeletons matching the real grid's breakpoints, before real packages swap in.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/packages/loading.tsx"
git commit -m "feat(public): add packages list loading skeleton"
```

---

### Task 7: `/packages/[slug]` `loading.tsx`

**Files:**
- Create: `app/(public)/packages/[slug]/loading.tsx`

**Interfaces:**
- Consumes: `ViewTransition` (React), `Skeleton` (existing).

- [ ] **Step 1: Write `app/(public)/packages/[slug]/loading.tsx`**

```tsx
import { ViewTransition } from "react";

import { Skeleton } from "@/components/ui/skeleton";

const SECTION_SKELETON =
  "flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-6 shadow-sm";

export default function PackageDetailLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pt-8 pb-28 sm:px-8 sm:pb-12 lg:pt-12 lg:pb-16">
        <Skeleton className="h-5 w-32" />

        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-3/4" />
          <div className="flex items-center justify-between gap-2.5">
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Skeleton className="col-span-2 row-span-2 aspect-[4/3] rounded-lg" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>

        <Skeleton className="h-40 w-full rounded-xl" />

        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={SECTION_SKELETON}>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ))}
      </div>
    </ViewTransition>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, throttle the network, hard-reload a real `/packages/<slug>` URL.
Expected: back-link, title/price, gallery grid (2x2 hero + 4), CTA card, and 4 section skeletons, matching the real page's rhythm, before real content swaps in.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/packages/[slug]/loading.tsx"
git commit -m "feat(public): add package detail loading skeleton"
```

---

### Task 8: Wire `ViewTransition` + `Reveal` into the homepage

**Files:**
- Modify: `app/(public)/page.tsx`

**Interfaces:**
- Consumes: `ViewTransition` (React), `Reveal` (Task 2).

- [ ] **Step 1: Add imports**

Find (current first import line):

```tsx
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
```

Replace with:

```tsx
import type { Metadata } from "next";
import { ViewTransition } from "react";

import { createClient } from "@/lib/supabase/server";
```

Find:

```tsx
import { CorporateClients } from "@/components/homepage/corporate-clients";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
```

Replace with:

```tsx
import { CorporateClients } from "@/components/homepage/corporate-clients";
import { Reveal } from "@/components/motion/reveal";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
```

- [ ] **Step 2: Wrap the returned JSX in `ViewTransition`, wrap sections in `Reveal`**

Find (current final return block):

```tsx
  return (
    <>
      <div className="relative">
        <HeroCarousel slides={slides} />
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4 sm:px-8">
          <div className="pointer-events-auto w-full max-w-4xl">
            <HeroSearchBar
              local={localDestinations}
              international={internationalDestinations}
            />
          </div>
        </div>
      </div>
      <WhyChooseUs />
      <FeaturedPackagesGrid items={featuredItems} />
      <DestinationsSection
        local={localDestinations}
        international={internationalDestinations}
      />
      <TestimonialsSection testimonials={testimonials} />

      <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 sm:px-8">
        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
            We&apos;d Love to Hear From You
          </span>
          <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
            Get in Touch
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Message us directly for a fast reply, or send the details below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <WhatsAppCta variant="icon-label" />
          <FacebookCta variant="icon-label" />
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or send us a message
          <div className="h-px flex-1 bg-border" />
        </div>

        <InquiryForm />
      </section>

      <BrandPartners partners={brandPartners} />
      <CorporateClients clients={corporateClients} />
    </>
  );
}
```

Replace with:

```tsx
  return (
    <ViewTransition enter="slide-up" default="none">
      <div>
        <div className="relative">
          <HeroCarousel slides={slides} />
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4 sm:px-8">
            <div className="pointer-events-auto w-full max-w-4xl">
              <HeroSearchBar
                local={localDestinations}
                international={internationalDestinations}
              />
            </div>
          </div>
        </div>
        <Reveal>
          <WhyChooseUs />
        </Reveal>
        <Reveal>
          <FeaturedPackagesGrid items={featuredItems} />
        </Reveal>
        <Reveal>
          <DestinationsSection
            local={localDestinations}
            international={internationalDestinations}
          />
        </Reveal>
        <Reveal>
          <TestimonialsSection testimonials={testimonials} />
        </Reveal>

        <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 sm:px-8">
          <div className="flex flex-col gap-2">
            <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
              We&apos;d Love to Hear From You
            </span>
            <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
              Get in Touch
            </h2>
            <p className="text-base leading-[1.5] text-muted-foreground">
              Message us directly for a fast reply, or send the details
              below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <WhatsAppCta variant="icon-label" />
            <FacebookCta variant="icon-label" />
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or send us a message
            <div className="h-px flex-1 bg-border" />
          </div>

          <InquiryForm />
        </section>

        <Reveal>
          <BrandPartners partners={brandPartners} />
        </Reveal>
        <Reveal>
          <CorporateClients clients={corporateClients} />
        </Reveal>
      </div>
    </ViewTransition>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, visit `/`.
Expected: page renders unchanged visually at first paint (sections start at `opacity-0` then fade+slide up as you scroll to them — confirm this happens once per section, not repeatedly). Confirm the hero/search bar are unaffected (not wrapped in `Reveal`).

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/page.tsx"
git commit -m "feat(homepage): add view transition and scroll-reveal sections"
```

---

### Task 9: Wire `ViewTransition` into `/packages`

**Files:**
- Modify: `app/(public)/packages/page.tsx`

**Interfaces:**
- Consumes: `ViewTransition` (React). No `Reveal` here — the design spec's scroll-reveal list does not include the packages grid.

- [ ] **Step 1: Add the import**

Find (current first two lines):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
```

Replace with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
```

- [ ] **Step 2: Wrap the opening of the returned JSX**

Find:

```tsx
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
```

Replace with:

```tsx
  return (
    <ViewTransition enter="slide-up" default="none">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-2">
```

- [ ] **Step 3: Wrap the closing of the returned JSX**

Find (the function's final three lines):

```
    </div>
  );
}
```

Replace with:

```
      </div>
    </ViewTransition>
  );
}
```

Note: everything between the opening `<div className="flex flex-col gap-2">` (Step 2) and the closing `</div>` (Step 3) — the filter heading, the empty-state block, and the results grid — is unchanged by this task; only its indentation technically shifts by two spaces since it's now one level deeper. Leaving that inner content's existing indentation as-is is fine (cosmetic only, not a compile or lint error) — do not spend time re-indenting the whole 100+ line middle section by hand.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, visit `/packages`.
Expected: unchanged visually, page still renders correctly (filters, empty state, grid all still work).

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/packages/page.tsx"
git commit -m "feat(public): add view transition to packages list page"
```

---

### Task 10: Wire `ViewTransition` into `/contact`

**Files:**
- Modify: `app/(public)/contact/page.tsx`

**Interfaces:**
- Consumes: `ViewTransition` (React).

- [ ] **Step 1: Add the import and wrap the return**

Find (current full file):

```tsx
import type { Metadata } from "next";

import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

export const metadata: Metadata = {
  title: "Contact Us | TravelSentro",
  description:
    "Get in touch with TravelSentro — ask a question, plan a trip, or say hello.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Contact Us
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Have a question that isn&apos;t about a specific package? Send us a
          message and we&apos;ll get back to you soon — or reach out directly
          on WhatsApp or Facebook.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <WhatsAppCta variant="icon-label" />
        <FacebookCta variant="icon-label" />
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or send us a message
        <div className="h-px flex-1 bg-border" />
      </div>

      <InquiryForm />
    </div>
  );
}
```

Replace with:

```tsx
import type { Metadata } from "next";
import { ViewTransition } from "react";

import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

export const metadata: Metadata = {
  title: "Contact Us | TravelSentro",
  description:
    "Get in touch with TravelSentro — ask a question, plan a trip, or say hello.",
};

export default function ContactPage() {
  return (
    <ViewTransition enter="slide-up" default="none">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
            Contact Us
          </h1>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Have a question that isn&apos;t about a specific package? Send us
            a message and we&apos;ll get back to you soon — or reach out
            directly on WhatsApp or Facebook.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <WhatsAppCta variant="icon-label" />
          <FacebookCta variant="icon-label" />
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or send us a message
          <div className="h-px flex-1 bg-border" />
        </div>

        <InquiryForm />
      </div>
    </ViewTransition>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, navigate to `/contact` from the site header.
Expected: unchanged visually; content arrives with a subtle slide-up-and-fade instead of an instant pop (no loading.tsx pairs with this route, so there's no skeleton exit — that's expected).

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/contact/page.tsx"
git commit -m "feat(public): add view transition to contact page"
```

---

### Task 11: Wire `ViewTransition` + `Reveal` into `/packages/[slug]`

**Files:**
- Modify: `app/(public)/packages/[slug]/page.tsx`

**Interfaces:**
- Consumes: `ViewTransition` (React), `Reveal` (Task 2).

- [ ] **Step 1: Add imports**

Find:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
```

Replace with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ViewTransition } from "react";
```

Find:

```tsx
import { StickyCtaBar } from "@/components/packages/sticky-cta-bar";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
```

Replace with:

```tsx
import { StickyCtaBar } from "@/components/packages/sticky-cta-bar";
import { Reveal } from "@/components/motion/reveal";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
```

- [ ] **Step 2: Wrap the opening of the returned JSX**

Find:

```tsx
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pt-8 pb-28 sm:px-8 sm:pb-12 lg:pt-12 lg:pb-16">
      <Link
```

Replace with:

```tsx
  return (
    <ViewTransition enter="slide-up" default="none">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pt-8 pb-28 sm:px-8 sm:pb-12 lg:pt-12 lg:pb-16">
        <Link
```

- [ ] **Step 3: Wrap the "What's Included" section in `Reveal`**

Find:

```tsx
      <section className={SECTION_CARD}>
        <SectionHeading icon={ListChecks}>What&apos;s Included</SectionHeading>
        <Checklist items={inclusions} kind="included" />
      </section>
```

Replace with:

```tsx
        <Reveal>
          <section className={SECTION_CARD}>
            <SectionHeading icon={ListChecks}>
              What&apos;s Included
            </SectionHeading>
            <Checklist items={inclusions} kind="included" />
          </section>
        </Reveal>
```

- [ ] **Step 4: Wrap the "What's Not Included" section in `Reveal`**

Find:

```tsx
      <section className={SECTION_CARD}>
        <SectionHeading icon={ListX} tone="destructive">
          What&apos;s Not Included
        </SectionHeading>
        <Checklist items={exclusions} kind="excluded" />
      </section>
```

Replace with:

```tsx
        <Reveal>
          <section className={SECTION_CARD}>
            <SectionHeading icon={ListX} tone="destructive">
              What&apos;s Not Included
            </SectionHeading>
            <Checklist items={exclusions} kind="excluded" />
          </section>
        </Reveal>
```

- [ ] **Step 5: Wrap the "Itinerary" section in `Reveal`**

Find:

```tsx
      <section className={SECTION_CARD}>
        <SectionHeading icon={Route}>Itinerary</SectionHeading>
        <ItineraryAccordion days={pkg.itinerary_days} />
      </section>
```

Replace with:

```tsx
        <Reveal>
          <section className={SECTION_CARD}>
            <SectionHeading icon={Route}>Itinerary</SectionHeading>
            <ItineraryAccordion days={pkg.itinerary_days} />
          </section>
        </Reveal>
```

- [ ] **Step 6: Wrap the "What to Bring" section in `Reveal`**

Find:

```tsx
      <section className={SECTION_CARD}>
        <SectionHeading icon={Backpack}>What to Bring</SectionHeading>
        <Checklist items={bringItems} kind="bring" />
      </section>
```

Replace with:

```tsx
        <Reveal>
          <section className={SECTION_CARD}>
            <SectionHeading icon={Backpack}>What to Bring</SectionHeading>
            <Checklist items={bringItems} kind="bring" />
          </section>
        </Reveal>
```

- [ ] **Step 7: Wrap the conditional "Travel Dates" section in `Reveal`**

Find:

```tsx
      {travelDates.length > 0 ? (
        <section className={SECTION_CARD}>
          <SectionHeading icon={CalendarDays}>Travel Dates</SectionHeading>
          <ul className="flex flex-col gap-2">
            {travelDates.map((date) => {
              const formatDate = (value: string) =>
                new Date(value).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                });
              const label =
                date.travel_date_from === date.travel_date_to
                  ? formatDate(date.travel_date_from)
                  : `${formatDate(date.travel_date_from)} – ${formatDate(date.travel_date_to)}`;

              return (
                <li
                  key={`${date.travel_date_from}-${date.travel_date_to}`}
                  className="flex items-center justify-between gap-2 text-[14px] leading-[1.4] text-foreground"
                >
                  <span>{label}</span>
                  {date.additional_fee ? (
                    <Badge variant="outline">
                      +&#8369;{date.additional_fee.toLocaleString("en-PH")}
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
```

Replace with:

```tsx
      {travelDates.length > 0 ? (
        <Reveal>
          <section className={SECTION_CARD}>
            <SectionHeading icon={CalendarDays}>Travel Dates</SectionHeading>
            <ul className="flex flex-col gap-2">
              {travelDates.map((date) => {
                const formatDate = (value: string) =>
                  new Date(value).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  });
                const label =
                  date.travel_date_from === date.travel_date_to
                    ? formatDate(date.travel_date_from)
                    : `${formatDate(date.travel_date_from)} – ${formatDate(date.travel_date_to)}`;

                return (
                  <li
                    key={`${date.travel_date_from}-${date.travel_date_to}`}
                    className="flex items-center justify-between gap-2 text-[14px] leading-[1.4] text-foreground"
                  >
                    <span>{label}</span>
                    {date.additional_fee ? (
                      <Badge variant="outline">
                        +&#8369;{date.additional_fee.toLocaleString("en-PH")}
                      </Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </Reveal>
      ) : null}
```

- [ ] **Step 8: Wrap the conditional "Remarks" section in `Reveal`**

Find:

```tsx
      {pkg.remarks ? (
        <section className={SECTION_CARD}>
          <SectionHeading icon={Info}>Remarks</SectionHeading>
          <p className="whitespace-pre-line text-base leading-[1.5] text-muted-foreground">
            {pkg.remarks}
          </p>
        </section>
      ) : null}
```

Replace with:

```tsx
      {pkg.remarks ? (
        <Reveal>
          <section className={SECTION_CARD}>
            <SectionHeading icon={Info}>Remarks</SectionHeading>
            <p className="whitespace-pre-line text-base leading-[1.5] text-muted-foreground">
              {pkg.remarks}
            </p>
          </section>
        </Reveal>
      ) : null}
```

- [ ] **Step 9: Wrap the closing of the returned JSX**

Find (the function's final lines):

```tsx
      <StickyCtaBar packageName={pkg.name} />
    </div>
  );
}
```

Replace with:

```tsx
        <StickyCtaBar packageName={pkg.name} />
      </div>
    </ViewTransition>
  );
}
```

Note: as in Task 9, the "Ready to Book This Trip?" CTA section, the "Inquire About {pkg.name}" form section, and everything else between the steps above is unchanged by this task — only its indentation technically shifts by two spaces since it's now one level deeper under `<ViewTransition>`. Leaving the existing indentation of those unchanged blocks as-is is fine; do not hand re-indent the whole file.

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, visit a real `/packages/<slug>` page.
Expected: page renders correctly (gallery, CTA card, all six section-card blocks including conditional Travel Dates/Remarks when present), and each section-card fades+slides up once as you scroll to it.

- [ ] **Step 11: Commit**

```bash
git add "app/(public)/packages/[slug]/page.tsx"
git commit -m "feat(public): add view transition and scroll-reveal sections to package detail"
```

---

### Task 12: Package card image fade-in + CTA press-states

**Files:**
- Modify: `components/packages/package-card.tsx`
- Modify: `components/packages/whatsapp-cta.tsx`
- Modify: `components/packages/facebook-cta.tsx`

**Interfaces:**
- Consumes: `FadeImage` (Task 3).

- [ ] **Step 1: Swap `Image` for `FadeImage` in `PackageCard`**

Find (current imports):

```tsx
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import type { Database } from "@/types/database";
```

Replace with:

```tsx
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FadeImage } from "@/components/motion/fade-image";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import type { Database } from "@/types/database";
```

Find:

```tsx
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt={pkg.name}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="col-start-1 row-start-1 object-cover transition-transform duration-300 ease-out motion-reduce:transition-none group-hover/card:scale-105"
        />
      ) : (
```

Replace with:

```tsx
      {photoUrl ? (
        <FadeImage
          src={photoUrl}
          alt={pkg.name}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="col-start-1 row-start-1 object-cover ease-out motion-reduce:transition-none group-hover/card:scale-105"
        />
      ) : (
```

(`transition-transform duration-300` is dropped here — `FadeImage`'s own base class already applies `transition-[opacity,transform] duration-300`, which covers both the new fade-in and the existing hover-scale. See `components/motion/fade-image.tsx`'s doc comment.)

- [ ] **Step 2: Add a press-state to `WhatsAppCta`**

Find:

```tsx
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-[#25D366]/50 focus-visible:outline-none",
        className
      )}
```

Replace with:

```tsx
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-2.5 text-sm font-medium text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-[#25D366]/50 focus-visible:outline-none",
        className
      )}
```

- [ ] **Step 3: Add a press-state to `FacebookCta`**

Find:

```tsx
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-[#1877F2]/50 focus-visible:outline-none",
        className
      )}
```

Replace with:

```tsx
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-2.5 text-sm font-medium text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-[#1877F2]/50 focus-visible:outline-none",
        className
      )}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, visit `/packages`.
Expected: package card photos fade in as they load; hovering a card still lifts it (`hover:-translate-y-0.5`) and now visibly zooms its photo (`group-hover/card:scale-105` — confirm this actually fires, since the design spec initially misdiagnosed this as broken). Click-and-hold (or tap on mobile) a WhatsApp/Facebook button — confirm a subtle scale-down press feedback.

- [ ] **Step 5: Commit**

```bash
git add components/packages/package-card.tsx components/packages/whatsapp-cta.tsx components/packages/facebook-cta.tsx
git commit -m "feat(packages): fade in package card photos, add CTA press-states"
```

---

### Task 13: `PackageGallery` image fade-in

**Files:**
- Modify: `components/packages/package-gallery.tsx`

**Interfaces:**
- Consumes: `FadeImage` (Task 3).

- [ ] **Step 1: Swap `Image` for `FadeImage`**

Find (current imports):

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
```

Replace with:

```tsx
"use client";

import { useState } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FadeImage } from "@/components/motion/fade-image";
import { cn } from "@/lib/utils";
```

Find (thumbnail grid image):

```tsx
              <Image
                src={photo.url}
                alt={photo.alt ?? "Package photo"}
                fill
                sizes={
                  hasHeroTile && index === 0
                    ? "(min-width: 768px) 50vw, 100vw"
                    : hasHeroTile
                      ? "(min-width: 768px) 25vw, 50vw"
                      : isSinglePhoto
                        ? "100vw"
                        : "50vw"
                }
                preload={index === 0}
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
```

Replace with:

```tsx
              <FadeImage
                src={photo.url}
                alt={photo.alt ?? "Package photo"}
                fill
                sizes={
                  hasHeroTile && index === 0
                    ? "(min-width: 768px) 50vw, 100vw"
                    : hasHeroTile
                      ? "(min-width: 768px) 25vw, 50vw"
                      : isSinglePhoto
                        ? "100vw"
                        : "50vw"
                }
                preload={index === 0}
                className="object-cover group-hover:scale-105"
              />
```

Find (lightbox image):

```tsx
                    <Image
                      src={photo.url}
                      alt={photo.alt ?? `Photo ${index + 1}`}
                      fill
                      sizes="(min-width: 768px) 640px, 100vw"
                      className="object-cover"
                    />
```

Replace with:

```tsx
                    <FadeImage
                      src={photo.url}
                      alt={photo.alt ?? `Photo ${index + 1}`}
                      fill
                      sizes="(min-width: 768px) 640px, 100vw"
                      className="object-cover"
                    />
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, visit a `/packages/<slug>` page with 3+ photos.
Expected: gallery thumbnails fade in on load; hover-zoom on thumbnails still works; opening the lightbox and paging through photos still works, each fading in.

- [ ] **Step 3: Commit**

```bash
git add components/packages/package-gallery.tsx
git commit -m "feat(packages): fade in gallery thumbnails and lightbox photos"
```

---

### Task 14: `BrandPartners` + `CorporateClients` image fade-in

**Files:**
- Modify: `components/homepage/brand-partners.tsx`
- Modify: `components/homepage/corporate-clients.tsx`

**Interfaces:**
- Consumes: `FadeImage` (Task 3).

- [ ] **Step 1: Swap `Image` for `FadeImage` in `brand-partners.tsx`**

Find:

```tsx
import Image from "next/image";

export type PartnerDisplay = {
```

Replace with:

```tsx
import { FadeImage } from "@/components/motion/fade-image";

export type PartnerDisplay = {
```

Find:

```tsx
          {partners.map((partner) =>
            partner.linkUrl ? (
              <a
                key={partner.id}
                href={partner.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src={partner.logoUrl}
                  alt=""
                  width={120}
                  height={60}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <Image
                key={partner.id}
                src={partner.logoUrl}
                alt=""
                width={120}
                height={60}
                className="h-12 w-auto object-contain"
              />
            )
          )}
```

Replace with:

```tsx
          {partners.map((partner) =>
            partner.linkUrl ? (
              <a
                key={partner.id}
                href={partner.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FadeImage
                  src={partner.logoUrl}
                  alt=""
                  width={120}
                  height={60}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <FadeImage
                key={partner.id}
                src={partner.logoUrl}
                alt=""
                width={120}
                height={60}
                className="h-12 w-auto object-contain"
              />
            )
          )}
```

- [ ] **Step 2: Swap `Image` for `FadeImage` in `corporate-clients.tsx`**

Find:

```tsx
import Image from "next/image";

export type ClientDisplay = {
```

Replace with:

```tsx
import { FadeImage } from "@/components/motion/fade-image";

export type ClientDisplay = {
```

Find:

```tsx
          {clients.map((client) =>
            client.linkUrl ? (
              <a
                key={client.id}
                href={client.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src={client.logoUrl}
                  alt=""
                  width={120}
                  height={60}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <Image
                key={client.id}
                src={client.logoUrl}
                alt=""
                width={120}
                height={60}
                className="h-12 w-auto object-contain"
              />
            )
          )}
```

Replace with:

```tsx
          {clients.map((client) =>
            client.linkUrl ? (
              <a
                key={client.id}
                href={client.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FadeImage
                  src={client.logoUrl}
                  alt=""
                  width={120}
                  height={60}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <FadeImage
                key={client.id}
                src={client.logoUrl}
                alt=""
                width={120}
                height={60}
                className="h-12 w-auto object-contain"
              />
            )
          )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, scroll to the "Our Partners"/"Trusted By" bands on `/`.
Expected: logos fade in as they load (or appear immediately if already cached); linked vs unlinked logos both still render/link correctly.

- [ ] **Step 4: Commit**

```bash
git add components/homepage/brand-partners.tsx components/homepage/corporate-clients.tsx
git commit -m "feat(homepage): fade in partner and client logos"
```

---

### Task 15: `DestinationsSection` image fade-in

**Files:**
- Modify: `components/homepage/destinations-section.tsx`

**Interfaces:**
- Consumes: `FadeImg` (Task 3).

- [ ] **Step 1: Swap the plain `<img>` for `FadeImg`**

Find:

```tsx
import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
```

Replace with:

```tsx
import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeImg } from "@/components/motion/fade-image";
```

Find:

```tsx
          // Plain <img>, not next/image -- R2's hostname is allow-listed in
          // next.config.ts's remotePatterns now, but this thumbnail doesn't
          // need next/image's optimization/lazy-loading; kept as a plain
          // <img> intentionally, not a leftover constraint.
          <img
            src={destination.photoUrl}
            alt={destination.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
```

Replace with:

```tsx
          // Plain <img>, not next/image -- R2's hostname is allow-listed in
          // next.config.ts's remotePatterns now, but this thumbnail doesn't
          // need next/image's optimization/lazy-loading; kept as a plain
          // <img> intentionally, not a leftover constraint. FadeImg
          // (components/motion/fade-image.tsx) mirrors that same
          // plain-<img> choice while adding a load-fade-in.
          <FadeImg
            src={destination.photoUrl}
            alt={destination.name}
            className="size-full object-cover group-hover:scale-105"
          />
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, scroll to "Explore Destinations" on `/`.
Expected: destination tile photos fade in on load; hover-zoom still works; the `MapPin` placeholder (for destinations with no photo) is unaffected.

- [ ] **Step 3: Commit**

```bash
git add components/homepage/destinations-section.tsx
git commit -m "feat(homepage): fade in destination tile photos"
```

---

### Task 16: `TestimonialsSection` avatar fade-in

**Files:**
- Modify: `components/homepage/testimonials-section.tsx`

**Interfaces:**
- Consumes: nothing new — uses `AvatarImage`'s existing `data-starting-style` attribute (`@base-ui/react/avatar`, already used elsewhere in this codebase, e.g. `components/ui/sheet.tsx`).

- [ ] **Step 1: Add a fade-in class to `AvatarImage`**

Find:

```tsx
              {testimonial.photoUrl ? (
                <AvatarImage
                  src={testimonial.photoUrl}
                  alt={testimonial.customerName}
                />
              ) : (
```

Replace with:

```tsx
              {testimonial.photoUrl ? (
                <AvatarImage
                  src={testimonial.photoUrl}
                  alt={testimonial.customerName}
                  className="transition-opacity duration-300 data-starting-style:opacity-0"
                />
              ) : (
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, scroll to "What Our Customers Say" on `/`.
Expected: testimonial avatar photos fade in as they mount (base-ui's `Avatar.Image` doesn't render the `<img>` at all until it's loaded, so this animates that already-loaded image's entrance); avatars with no photo still show the initials fallback unaffected.

- [ ] **Step 3: Commit**

```bash
git add components/homepage/testimonials-section.tsx
git commit -m "feat(homepage): fade in testimonial avatar photos"
```

---

### Task 17: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type check, lint, build**

Run: `npx tsc --noEmit` — expect zero errors.
Run: `npm run lint` — expect zero errors (pre-existing unrelated warnings, e.g. `destinations-section.tsx`'s `no-img-element` warning on `FadeImg`, are fine).
Run: `npm run build` — expect success.

- [ ] **Step 2: Manual end-to-end walkthrough**

Run: `npm run dev`.

1. Throttle the network (Chrome DevTools → Network → "Slow 4G") and hard-reload `/`, `/packages`, and a real `/packages/<slug>` — confirm each route's skeleton renders, roughly matches the real layout's proportions, and swaps to real content without a visible reflow/jump.
2. With the network back to normal, navigate `/` → `/packages` → a package detail → `/contact` → `/` using the header nav — confirm a consistent slide-up-and-fade on arrival for each, and that the header never jitters or disappears mid-transition.
3. Scroll down `/` and a package detail page — confirm each `Reveal`-wrapped section fades+slides up once as it enters the viewport (not repeatedly on every scroll), and that hero/search-bar/CTA-card/inquiry-form sections (not wrapped in `Reveal`) are visible immediately without a delay.
4. Hover a package card on `/packages` — confirm the card lifts, its photo now visibly zooms, and the WhatsApp/Facebook icon buttons show a press-effect on click-and-hold.
5. Open a package's photo gallery lightbox and page through photos — confirm fade-in and existing carousel/keyboard/touch navigation all still work.
6. Visit an invalid package slug (e.g. `/packages/does-not-exist`) — confirm the on-brand 404 renders.
7. Temporarily add `throw new Error("test")` at the top of `HomePage` in `app/(public)/page.tsx`, reload `/` — confirm the on-brand error page renders with a working **Try again** button — then remove the temporary throw.
8. In your OS or browser settings, enable "reduce motion", then repeat steps 2–3 — confirm view transitions and scroll-reveal both collapse to instant/no animation (content is still immediately visible, nothing stays hidden).
9. In Chrome DevTools, disable JavaScript entirely and reload `/` — confirm all `Reveal`-wrapped sections are still visible (the `<noscript>` safety net from Task 2 is working), even though none of the motion/interactivity works.
10. Confirm `/packages/[slug]/pdf` (PDF export) and `/unsubscribe` are unaffected — outside this plan's touched route group.

- [ ] **Step 3: No commit** — this task is verification-only; if any check fails, fix it within the task that owns the affected file and re-run this task.
