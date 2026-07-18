---
phase: 01-public-catalog-inquiry-entry-point
plan: 01
subsystem: infra
tags: [nextjs, react, typescript, tailwindcss, shadcn, base-ui, supabase, supabase-ssr]

# Dependency graph
requires: []
provides:
  - Next.js 16 App Router project scaffold (TypeScript 5.9.3 pinned, Tailwind v4, ESLint)
  - shadcn/ui component inventory (button, card, badge, input, textarea, label, form, accordion, carousel, dialog, separator, sonner)
  - Root layout with Plus Jakarta Sans (--font-heading) + Inter (--font-body) and a global <Toaster/>
  - `(public)` route group shell (header nav, footer) with UI-SPEC.md brand color tokens
  - Homepage stub at `/` linking to `/packages`
  - `lib/supabase/server.ts` and `lib/supabase/client.ts` Supabase client factories (@supabase/ssr, anon key only)
  - `next.config.ts` pre-configured for Supabase Storage package-photo images
  - `.env.local.example` documenting the 4 required Supabase env vars
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07]

# Tech tracking
tech-stack:
  added:
    - next@16.2.10
    - react@19.2.4 / react-dom@19.2.4
    - typescript@5.9.3 (pinned, not the 7.x line)
    - tailwindcss@4.x (CSS-first config)
    - shadcn CLI 4.13.1 (base-nova preset, @base-ui/react primitives — not Radix)
    - "@supabase/supabase-js@2.110.7"
    - "@supabase/ssr@0.12.3"
    - react-hook-form@7.82.0
    - zod@4.4.3
    - "@hookform/resolvers@5.4.0"
    - lucide-react@1.25.0
    - tsx (dev, for future scripts/seed.ts)
  patterns:
    - "(public) route group as the sole handler for public marketing/catalog routes"
    - "Server Component Supabase client (lib/supabase/server.ts) as the default data-fetching path; browser client scaffolded for later phases"
    - "Brand palette applied by overriding shadcn's existing --background/--primary/--secondary/--destructive CSS variables rather than adding parallel one-off tokens"
    - "next/font/google variables exposed directly as --font-heading / --font-body, consumed via Tailwind's font-heading/font-sans utilities"

key-files:
  created:
    - app/(public)/layout.tsx
    - app/(public)/page.tsx
    - lib/supabase/server.ts
    - lib/supabase/client.ts
    - next.config.ts
    - .env.local.example
    - components/ui/form.tsx (hand-authored)
  modified:
    - app/layout.tsx
    - app/globals.css
    - components/ui/carousel.tsx
    - .gitignore
    - package.json

key-decisions:
  - "Used shadcn CLI's current default preset (base-nova / @base-ui/react) instead of the classic style=default/base-color=neutral/Radix flow RESEARCH.md described — the installed CLI (4.13.1) no longer supports those flags; component file inventory and exported API surface match UI-SPEC.md's Registry Safety table exactly."
  - "Hand-authored components/ui/form.tsx since this shadcn CLI version's registry `form` item is an empty stub (superseded by the Field primitive) — implemented the standard react-hook-form Form/FormField/FormControl/FormMessage wrapper directly against react-hook-form's public API, using cloneElement instead of Radix Slot since no Radix packages are installed."
  - "Mapped UI-SPEC.md's 60/30/10 color roles onto shadcn's existing semantic tokens: Dominant -> --background, Secondary -> --secondary/--secondary-foreground (header/nav/footer chrome), Accent -> --primary/--primary-foreground (matches Button's default variant, used for the Send Inquiry CTA in a later plan)."

requirements-completed: [PUBL-01, PUBL-09]

coverage:
  - id: D1
    description: "npm run dev serves the app locally with no build/runtime errors"
    requirement: "PUBL-01"
    verification:
      - kind: other
        ref: "npm run build (clean exit, static prerender of / and /_not-found)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Visiting / renders a homepage inside the (public) route group shell (header nav + footer)"
    requirement: "PUBL-01"
    verification: []
    human_judgment: true
    rationale: "Visual/layout correctness (brand colors, responsive nav wrap, hero rendering) requires a human or UI-review agent looking at the rendered page — not proven by a build-only check."
  - id: D3
    description: "TypeScript pinned to the 5.9.x line, not the 7.x line"
    requirement: "PUBL-09"
    verification:
      - kind: other
        ref: "npx tsc --version -> Version 5.9.3; package.json devDependencies.typescript"
        status: pass
    human_judgment: false
  - id: D4
    description: "Supabase client factories exist for both server (RSC) and browser contexts"
    requirement: "PUBL-09"
    verification:
      - kind: other
        ref: "lib/supabase/server.ts exports async createClient(); lib/supabase/client.ts exports createClient(); npm run build type-checks both"
        status: pass
    human_judgment: false

# Metrics
duration: 55min
completed: 2026-07-18
status: complete
---

# Phase 1 Plan 1: Next.js Scaffold & Public Shell Summary

**Next.js 16 App Router project scaffolded from zero with TypeScript pinned to 5.9.3, shadcn/ui (base-nova/@base-ui/react preset), Tailwind v4 brand tokens, a branded `(public)` route shell, and `@supabase/ssr` client factories ready for data-fetching plans.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-18T10:47:35Z
- **Completed:** 2026-07-18T11:42:33Z
- **Tasks:** 2
- **Files modified:** 37 (across both task commits)

## Accomplishments
- Scaffolded a fresh Next.js 16 App Router project (Turbopack, Tailwind v4, ESLint, TypeScript) with every dependency pinned to the exact versions RESEARCH.md verified, including the critical `typescript@5.9.3` pin to avoid the TS 7.x line
- Installed the exact shadcn/ui component inventory UI-SPEC.md's Registry Safety table requires (button, card, badge, input, textarea, label, form, accordion, carousel, dialog, separator, sonner)
- Built the root layout (dual next/font/google fonts, global Toaster) and the `(public)` route group shell (header nav, footer) with UI-SPEC.md's brand color palette applied via shadcn's CSS variable system
- Stood up a thin homepage linking to `/packages`, and both Supabase client factories (`lib/supabase/server.ts`, `lib/supabase/client.ts`) using the current (non-deprecated) `@supabase/ssr` `getAll`/`setAll` cookie API
- Pre-configured `next.config.ts` `images.remotePatterns` scoped to the future Supabase Storage `package-photos` bucket, and documented all 4 required env vars in `.env.local.example`

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js 16 project and install pinned dependencies** - `45dd885` (feat)
2. **Task 2: Root layout, public shell, brand tokens, Supabase clients, image config** - `4ed9dc7` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/layout.tsx` - Root layout: Plus Jakarta Sans + Inter via next/font/google, global `<Toaster/>`
- `app/globals.css` - Tailwind v4 theme; brand palette overrides for `--background`/`--primary`/`--secondary`/`--destructive`
- `app/(public)/layout.tsx` - Public site shell: header nav (Home/Packages/Contact Us), footer, deep-teal chrome
- `app/(public)/page.tsx` - Homepage: Display-size hero, placeholder copy, primary CTA to `/packages`
- `next.config.ts` - `images.remotePatterns` scoped to `*.supabase.co/storage/v1/object/public/package-photos/**`
- `lib/supabase/server.ts` - Async `createClient()`, `createServerClient` + Next `cookies()`, `getAll`/`setAll`
- `lib/supabase/client.ts` - `createClient()`, `createBrowserClient`
- `.env.local.example` - Documents `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `components/ui/form.tsx` - Hand-authored react-hook-form Form/FormField/FormControl/FormMessage wrapper
- `components/ui/carousel.tsx` - shadcn-generated; one `eslint-disable-next-line` for embla's documented initial-sync pattern
- `.gitignore` - Narrowed default `.env*` blanket ignore with `!.env*.example`
- `package.json` / `package-lock.json` - Pinned dependency versions per RESEARCH.md

## Decisions Made
- Accepted the shadcn CLI's current default preset (`base-nova`, `@base-ui/react` primitives) instead of the classic Radix-based `style=default`/`base-color=neutral` flow RESEARCH.md/UI-SPEC.md described from an earlier CLI version — the component *file* inventory and exported API surface still match UI-SPEC.md's Registry Safety table exactly, so no plan-level rework was needed, only adapting init flags to what the installed CLI actually supports.
- Mapped UI-SPEC.md's Dominant/Secondary/Accent color roles onto shadcn's existing `--background`/`--secondary`/`--primary` tokens (rather than inventing parallel brand-specific variable names) so every shadcn primitive (Button, Badge, etc.) automatically renders on-brand without per-component overrides in later plans.
- `Button`'s Base UI primitive uses a `render` prop (not Radix's `asChild`) for polymorphic rendering — used `<Button render={<Link .../>} nativeButton={false}>` on the homepage CTA, which will be the pattern for all future button-as-link usages in this codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] shadcn CLI's `add form` registry item is an empty stub in the installed version**
- **Found during:** Task 1 (shadcn component install)
- **Issue:** `npx shadcn@latest add form` (and `add @shadcn/form`) completed with exit 0 but created no file. `shadcn view @shadcn/form` confirmed the registry entry has no `files` array — the classic Form component was superseded by a `Field` primitive in this CLI/registry version, which uses a different, non-react-hook-form-native API.
- **Fix:** Hand-authored `components/ui/form.tsx` implementing the standard, stable `FormProvider`/`Controller`-based Form/FormField/FormItem/FormLabel/FormControl/FormDescription/FormMessage API against the installed `react-hook-form@7.82.0`, matching D-06's react-hook-form + zod decision exactly. `FormControl` uses `React.cloneElement` instead of Radix `Slot` since no `@radix-ui/*` packages are installed in this preset.
- **Files modified:** `components/ui/form.tsx` (new)
- **Verification:** `npm run build` type-checks the file with no errors; exports match what later inquiry-form plans expect (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`).
- **Committed in:** `45dd885` (Task 1 commit)

**2. [Rule 1 - Bug] Default `.gitignore` would have blocked committing `.env.local.example`**
- **Found during:** Task 1 (post-scaffold `.gitignore` review)
- **Issue:** create-next-app's generated `.gitignore` uses a blanket `.env*` pattern, which also matches `.env.local.example` — the template file Task 2's acceptance criteria requires to be committed.
- **Fix:** Added `!.env*.example` immediately below the `.env*` rule.
- **Files modified:** `.gitignore`
- **Verification:** `git add -n .env.local.example` confirms it is no longer ignored.
- **Committed in:** `45dd885` (Task 1 commit)

**3. [Rule 1 - Bug] `npm run lint` failed on shadcn-generated `carousel.tsx`**
- **Found during:** Task 2 (`npm run lint` verification step)
- **Issue:** The newly-generated `components/ui/carousel.tsx` (from Task 1's `shadcn add carousel`) calls `onSelect(api)` synchronously inside a `useEffect` to sync the initial prev/next-disabled state — embla-carousel-react's documented integration pattern — which trips the `react-hooks/set-state-in-effect` rule enabled in this eslint-config-next version, failing `npm run lint` with 1 error.
- **Fix:** Added a scoped `eslint-disable-next-line` with a comment explaining the embla pattern, rather than restructuring third-party-sourced subscription logic.
- **Files modified:** `components/ui/carousel.tsx`
- **Verification:** `npm run lint` now exits clean with zero errors; `npm run build` still succeeds.
- **Committed in:** `4ed9dc7` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 - bug/tooling-drift fixes)
**Impact on plan:** All three are adaptations to the installed shadcn CLI/eslint-config-next versions being newer than what RESEARCH.md assumed at research time (same day, tooling moves fast) — no scope creep, no architectural changes, and every plan acceptance criterion (exact file inventory, exact exports, clean build/lint) is still met.

## Issues Encountered
- `npm install` printed `EBADENGINE` warnings for the `@supabase/*` packages (they declare `engines.node >= 22.0.0`; the active local Node is v20.19.4). Installation and `npm run build`/`npm run dev` succeeded despite the warning — Node 22 is already available via `nvm` on this machine if it becomes a real problem, but no `.nvmrc` was added since nothing in this plan actually required Node 22 features. Flagging for awareness in later phases if a genuine Node-22-only API is needed.
- One `next build` run hit a transient Google Fonts module-resolution error during Turbopack's font fetch (sandboxed network hiccup); a clean re-run succeeded with no errors. Not expected to recur on Vercel's build infrastructure, which has reliable outbound network access.

## User Setup Required

None - no external service configuration required for this plan (Supabase project provisioning happens in a later Wave 1 plan; `.env.local.example` documents the vars ahead of that).

## Next Phase Readiness
- The `(public)` route shell, brand tokens, shadcn component set, and Supabase client factories are all in place — later Wave 1+ plans (packages list/detail, Supabase schema + seed, inquiry form, Contact Us page) can build directly on top without further stack decisions.
- `next.config.ts`'s `images.remotePatterns` hostname (`*.supabase.co`) is a wildcard pending the concrete Supabase project ref, which the Supabase-provisioning plan should narrow if desired (not required — pathname scoping already closes the SSRF-adjacent risk per the threat model).
- No blockers for the next plan in this wave.

---
*Phase: 01-public-catalog-inquiry-entry-point*
*Completed: 2026-07-18*
