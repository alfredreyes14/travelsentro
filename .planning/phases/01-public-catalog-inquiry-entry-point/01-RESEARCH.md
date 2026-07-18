# Phase 1: Public Catalog & Inquiry Entry Point - Research

**Researched:** 2026-07-18
**Domain:** Next.js 16 public marketing/catalog site (package browse + detail) with external-service inquiry capture (WhatsApp deep link, Facebook link, Formspree form) on a Supabase-backed, greenfield project
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Package Data for Launch**
- **D-01:** Packages are populated via a repo-committed seed script (`seed.sql` or `seed.ts`), not manual Supabase dashboard entry and not hardcoded in-app data. Re-runnable during Phase 1 dev; disposable once Phase 2 admin CRUD exists.
- **D-02:** Real package content is not ready yet — use placeholder/dummy packages (itinerary, prices, inclusions, photos) for Phase 1. Real content gets swapped in later (business will supply it, likely around Phase 2 admin or pre-launch).

**WhatsApp / Facebook Contact Details**
- **D-03:** WhatsApp CTA number: **+639205351673**
- **D-04:** Facebook page URL: **https://web.facebook.com/profile.php?id=61567102791951**
- **D-05:** WhatsApp deep link pre-fills a message mentioning the specific package name (e.g. "Hi! I'm interested in [Package Name]"). Requires building the `wa.me` link per-package, not a single static link.

**Inquiry Form Integration**
- **D-06:** Rebuild the inquiry form UI natively in React (react-hook-form + zod), styled to match the new site, POSTing to the existing Formspree endpoint: **https://formspree.io/f/xojpkjbr**. Do not iframe/embed the old hosted form.
- **D-07:** Two form contexts: a per-package inquiry form on each package detail page (tagged/pre-filled with that package so the submission carries package context — feeds CRM-06 in Phase 3), plus one general "Contact Us" page/form for non-package questions.

**FAQ / Trip-Facts Structure**
- **D-08:** Best-time-to-go, what-to-bring, and group-size are fixed structured fields on every package (not freeform FAQ). Consistent display now, and maps cleanly to Phase 2's admin package-edit form later.
- **D-09:** Inclusions, exclusions, and what-to-bring all use the same shared list-item component/data structure (icon + text per line) across the site — one reusable checklist pattern instead of three bespoke ones.

### Claude's Discretion
- Package detail routing/URL structure (e.g. slug-based `/packages/[slug]`).
- Where placeholder photos are hosted for Phase 1 (Supabase Storage vs static bundled assets) — pick whichever sets Phase 2's photo-management work up more cleanly.
- Formspree form field validation rules and success/error UI states.
- Visual/brand fidelity (logo, colors, exact look) — explicitly deferred; per PROJECT.md, brand assets are gathered during the UI phase (`/gsd-ui-phase`), not this discussion. (Note: the UI phase already ran — see `01-UI-SPEC.md`, referenced throughout this research.)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Visual/brand fidelity was raised but is correctly scoped to the UI phase, not deferred as new scope.

**Additional canonical constraint:** Greenfield project — no code exists yet. Stack is pre-decided in `.claude/CLAUDE.md` (Next.js 16 App Router, React 19, TypeScript, Supabase incl. Storage, Tailwind v4, shadcn/ui) — treated as authoritative throughout this research, not re-litigated.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUBL-01 | Browse a list of tour packages, each showing photo, name, and starting "from ₱X" price | Project structure (`app/(public)/packages/page.tsx`), package data model, Supabase Storage photo pattern, shadcn `card`/`badge` |
| PUBL-02 | Package detail page with day-by-day itinerary and duration | `app/(public)/packages/[slug]/page.tsx` routing, `accordion` component pattern, itinerary data model (JSON or child table) |
| PUBL-03 | Price and inclusions/exclusions listed explicitly (line-item, not prose) on detail page | Shared checklist component pattern (D-09), package_inclusions/exclusions data shape |
| PUBL-04 | Photo gallery on each package detail page | Supabase Storage public bucket + `carousel`+`dialog` lightbox pattern, `next/image` remotePatterns config |
| PUBL-05 | WhatsApp deep-link CTA on each package | `wa.me` link construction (D-03, D-05), URL encoding |
| PUBL-06 | Facebook page link CTA on each package | Static external link (D-04), no API integration needed |
| PUBL-07 | Submit an inquiry via the existing Formspree form | Verified Formspree AJAX POST contract (headers, body, response shape), react-hook-form + zod pattern (D-06, D-07) |
| PUBL-08 | FAQ / trip-facts section per package (best time to go, what to bring, group size) | Fixed structured fields data model (D-08), `accordion` pattern |
| PUBL-09 | Site is mobile-responsive across list, detail, and inquiry flows | Tailwind v4 responsive utilities, 44px touch-target rule from UI-SPEC |
</phase_requirements>

## Summary

Phase 1 is a greenfield build with almost every technology choice already locked by `.claude/CLAUDE.md` and `01-UI-SPEC.md`: Next.js 16 App Router + React 19 + TypeScript + Supabase (Postgres + Storage) + Tailwind v4 + shadcn/ui. The genuinely open implementation questions this research resolves are: (1) how to reliably POST the inquiry form to Formspree from a hand-built React form without page navigation, (2) whether placeholder package photos should live in Supabase Storage or bundled static assets, (3) how to structure package detail routing and data fetching, and (4) the exact `wa.me` deep-link contract. All four are now answered with verified sources.

The Formspree submission contract was pulled directly from Formspree's own official open-source client library (`formspree-js`, `packages/formspree-core/src/core.ts` on GitHub) rather than inferred from blog posts: POST JSON to `https://formspree.io/f/{formId}` with `Accept: application/json` and (for a JSON body) `Content-Type: application/json`, `mode: 'cors'`. A successful response body contains a `next` field; a failed one contains an `errors` array of `{field, message, code}` objects or a top-level `error` string. This is a stable, documented client-server contract — building against it directly with `fetch` (no `@formspree/react` dependency needed) fully satisfies D-06's "rebuild natively, don't iframe" requirement and gives Phase 3 a controllable submit handler to extend later, as flagged in CONTEXT.md's Specific Ideas.

For placeholder photos, **Supabase Storage is the clear right choice**, not bundled static assets: Phase 2 (PKG-01) requires admin/staff to upload and manage package photos through the admin panel, which only makes sense against a real Storage bucket with a public-read/authenticated-write RLS policy pattern already in place. Building that bucket structure now — even filled with placeholder images — means Phase 2 extends existing infrastructure instead of migrating off static assets. Because Storage uploads require the JS client (not raw SQL), the seed mechanism should be a Node script (`seed.ts` using `@supabase/supabase-js` with the service-role key), not a pure `seed.sql` file, satisfying D-01's "seed.sql or seed.ts" allowance.

**Primary recommendation:** Scaffold with `create-next-app` (pinning TypeScript to the 5.x line explicitly — TypeScript 7.0 GA'd only ~10 days before this research and ecosystem tooling compatibility is unverified), initialize shadcn/ui immediately after, model packages/photos/itinerary/inclusions as normalized Supabase tables seeded via a single re-runnable `seed.ts`, fetch package data directly in React Server Components with public-read RLS (no `generateStaticParams`/ISR complexity needed at this phase's traffic scale), build the inquiry form with `react-hook-form` + `zod` + a raw `fetch` POST matching Formspree's verified contract, and construct `wa.me` links server-side per package using `encodeURIComponent`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Package list & detail rendering | Frontend Server (RSC) | Database / Storage | React Server Components query Supabase Postgres directly per request (anon key, public-read RLS) — no separate API layer needed for a read-only public catalog |
| Package/photo data | Database / Storage | — | Supabase Postgres (structured fields) + Supabase Storage (photo binaries), seeded via `seed.ts` |
| Photo gallery interaction (lightbox) | Browser / Client | Frontend Server | Thumbnail grid is server-rendered; the Dialog+Carousel lightbox is a Client Component for open/close and slide-navigation state |
| WhatsApp CTA link | Frontend Server (RSC) | Browser / Client | The `wa.me` URL string (with pre-filled, encoded package name) is computed server-side at render time; the actual navigation happens in the browser on click — no client JS required to build the link |
| Facebook CTA link | Frontend Server (RSC) | Browser / Client | Static external URL (D-04), rendered as a plain anchor tag — same split as WhatsApp but with zero per-package templating |
| Inquiry form (validation + submission) | Browser / Client | External (Formspree) | `react-hook-form`+`zod` validation and the `fetch` POST both run client-side in the browser; Formspree is the external system of record for this phase (no server-side proxy/CRM write until Phase 3) |
| Mobile-responsive layout | Browser / Client | Frontend Server | Tailwind responsive utility classes are static CSS shipped with server-rendered markup; no client-side breakpoint JS needed |
| Package data seeding (dev-time) | Database / Storage | — | Out-of-request-path tooling (`seed.ts` run via `npm run seed`), not a runtime tier — included for completeness since it's a Phase 1 deliverable |

## Standard Stack

### Core
*(Already locked by `.claude/CLAUDE.md` — listed here for completeness and version-verification, not re-litigated.)*

| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.10 [VERIFIED: npm registry] | Full-stack framework, App Router | Public catalog pages + future admin/API routes in one deploy target |
| `react` / `react-dom` | 19.2.7 [VERIFIED: npm registry] | UI library | Required Next.js 16 peer |
| `typescript` | **5.9.3** [VERIFIED: npm registry] — see Pitfall below, do NOT install `@latest` | Type safety | Pairs with Supabase generated types; see State of the Art note on TS7 |
| `@supabase/supabase-js` | 2.110.7 [VERIFIED: npm registry] | Postgres/Storage client | Core Supabase SDK |
| `@supabase/ssr` | 0.12.3 [VERIFIED: npm registry] | SSR-safe Supabase client creation | Current (non-deprecated) path for Server Component data fetching; used in Phase 1 even without auth, so Phase 2's session-aware client swaps in cleanly |
| `tailwindcss` | 4.3.3 [VERIFIED: npm registry] | Styling | CSS-first config (no `tailwind.config.js`) per UI-SPEC |
| `shadcn` (CLI) | latest | Component scaffolding | Copies Radix-based components into the repo; not an npm runtime dependency itself |

### Supporting
*(Phase 1-specific additions, verified this session.)*

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hook-form` | 7.82.0 [VERIFIED: npm registry] | Inquiry form state/validation | Both per-package and Contact Us forms (D-06, D-07) |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Form schema validation | Paired with react-hook-form via `@hookform/resolvers`; use `z.email()` not the deprecated `.string().email()` chain (Zod 4 syntax) |
| `@hookform/resolvers` | 5.4.0 [VERIFIED: npm registry] | Zod↔RHF bridge | `zodResolver(schema)`; peer dep is `react-hook-form ^7.55.0`, satisfied by 7.82.0 |
| `embla-carousel-react` | 8.6.0 [VERIFIED: npm registry] | Underlying carousel engine | Auto-installed by `npx shadcn@latest add carousel` — not installed directly, but shows in `package.json` after that command |
| `sonner` | 2.0.7 [VERIFIED: npm registry] | Toast notifications | Installed by `npx shadcn@latest add sonner`; used for form submission success/error toasts per UI-SPEC |
| `lucide-react` | 1.25.0 [VERIFIED: npm registry] | Icon set | shadcn default icon library; used for WhatsApp/Facebook CTA icons, checklist icons (D-09) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | 0.7.1 / 2.1.1 / 3.6.0 [VERIFIED: npm registry] | shadcn component utility helpers | Auto-installed by `shadcn init` — not chosen independently |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Storage for placeholder photos | Static bundled assets (`public/images/...`) | Faster to set up right now, but Phase 2's admin photo-upload feature (PKG-01) would then need to migrate off static assets — costs more total effort across phases. Rejected per CONTEXT.md discretion guidance to pick "whichever sets Phase 2 up more cleanly." |
| `seed.ts` (Node script) | Pure `seed.sql` | `seed.sql` alone cannot upload binary image files to Supabase Storage (Storage requires the JS/HTTP API, not raw SQL inserts into `storage.objects`); a hybrid (SQL for rows, manual pre-upload for photos) is more fragile and less re-runnable than one script doing both. D-01 explicitly permits either — `seed.ts` is the correct choice given the Storage requirement. |
| Dynamic Server Component fetch per request | `generateStaticParams` + ISR for package detail pages | Static generation is a valid future optimization but adds cache-invalidation complexity (Phase 2 admin edits would need `revalidatePath`/`revalidateTag` wiring) that isn't justified at this phase's traffic scale. Revisit if/when Phase 2 ships and real traffic patterns are known. |
| Raw `fetch` to Formspree | `@formspree/react` (`useForm` hook) | The official React library is fine but adds a dependency and a different form-state model than `react-hook-form`; D-06 explicitly calls for `react-hook-form` + `zod`, and the raw `fetch` contract (verified from `formspree-js` source) is simple enough to hand-roll in ~15 lines, giving full control matching CONTEXT.md's "controllable submit handler" rationale for Phase 3 extension. |
| `wa.me` deep link | WhatsApp Business API / Twilio WhatsApp integration | Out of scope — D-05 only requires a pre-filled click-to-chat link, not programmatic messaging. Business API would be needed only for automated/two-way messaging, not relevant to Phase 1. |

**Installation (Phase 1 additions on top of the already-decided core):**
```bash
npx create-next-app@latest . --typescript --tailwind --app --turbopack
npm install typescript@5.9.3 --save-dev   # pin explicitly — see TypeScript 7 pitfall below
npm install @supabase/supabase-js @supabase/ssr
npx shadcn@latest init -d
npx shadcn@latest add button card badge input textarea label form accordion carousel dialog separator sonner
npm install react-hook-form zod @hookform/resolvers
npm install -D tsx   # for running seed.ts via `tsx scripts/seed.ts`
```

**Version verification:** All versions above were confirmed via `npm view <package> version` against the live npm registry on 2026-07-18 (see Sources). `typescript` latest-on-registry is 7.0.2 (GA'd 2026-07-08) — deliberately NOT recommended for this phase; see Common Pitfalls.

## Package Legitimacy Audit

| Package | Registry | Published (latest) | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|-------------------|--------------|---------|-------------|
| `next` | npm | 2026-07-01 | 42.8M | github.com/vercel/next.js | SUS (`too-new`) | **Approved** — mandated by CLAUDE.md; official Vercel org repo, 42.8M weekly downloads. "too-new" reflects a recent version *publish date*, not package age (Next.js has shipped since 2016) — heuristic false positive, not a legitimacy concern. |
| `react` / `react-dom` | npm | 2026-06-01 | 145.6M / 137.5M | github.com/facebook/react | OK | Approved |
| `typescript` | npm | 2026-07-08 | 218.1M | github.com/microsoft/TypeScript | SUS (`too-new`) | **Approved with a version pin caveat** — Microsoft official repo, 218M weekly downloads. The "too-new" flag correctly reflects that v7.0 (a genuinely new major, native-code compiler) GA'd 10 days before this research — see Pitfall below: pin to `5.9.3`, do not install `@latest`. |
| `tailwindcss` | npm | 2026-07-16 | 113.7M | github.com/tailwindlabs/tailwindcss | SUS (`too-new`) | **Approved** — official Tailwind Labs repo, mandated by CLAUDE.md, 113.7M weekly downloads. Recent-publish false positive. |
| `@supabase/supabase-js` | npm | 2026-07-16 | 19.1M | github.com/supabase/supabase-js | SUS (`too-new`) | **Approved** — official Supabase org repo, mandated by CLAUDE.md (explicit user choice of Supabase). Recent-publish false positive. |
| `@supabase/ssr` | npm | 2026-07-14 | 5.1M | github.com/supabase/ssr | SUS (`too-new`) | **Approved** — official Supabase org repo. Recent-publish false positive. |
| `react-hook-form` | npm | 2026-07-18 | 52.9M | github.com/react-hook-form/react-hook-form | SUS (`too-new`) | **Approved** — official org repo, mandated by CLAUDE.md, 52.9M weekly downloads. Recent-publish false positive. |
| `lucide-react` | npm | 2026-07-17 | 85.4M | github.com/lucide-icons/lucide | SUS (`too-new`) | **Approved** — official Lucide org repo, shadcn's default icon library per UI-SPEC. Recent-publish false positive. |
| `zod` | npm | 2026-05-04 | 212.7M | github.com/colinhacks/zod | OK | Approved |
| `@hookform/resolvers` | npm | 2026-05-21 | 44.6M | github.com/react-hook-form/resolvers | OK | Approved |
| `embla-carousel-react` | npm | 2025-04-04 | 32.0M | github.com/davidjerleke/embla-carousel | OK | Approved (installed transitively by `shadcn add carousel`) |
| `sonner` | npm | 2025-08-02 | 44.1M | github.com/emilkowalski/sonner | OK | Approved (installed by `shadcn add sonner`) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `next`, `typescript`, `tailwindcss`, `@supabase/supabase-js`, `@supabase/ssr`, `react-hook-form`, `lucide-react` — all seven are flagged solely by the automated `package-legitimacy` gate's `too-new` heuristic (recent version publish date), not by low download counts or missing/unofficial repos. Every one of the seven has tens-to-hundreds of millions of weekly downloads and resolves to the package's official GitHub organization. **No `checkpoint:human-verify` task is warranted for these seven** — they are pre-decided, locked stack choices from `.claude/CLAUDE.md`/`01-UI-SPEC.md`, not discretionary picks introduced by this research, and the evidence overwhelmingly supports legitimacy. The one genuine action item is the `typescript` version **pin** (5.9.3, not `@latest`) documented in Common Pitfalls — that is a compatibility/maturity concern, not a legitimacy concern.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Browser                                  │
│                                                                        │
│  Package list page          Package detail page       Contact Us page │
│  (from ₱X cards)             (gallery, itinerary,       (general form)│
│                               inclusions, FAQ, form)                  │
└───────┬───────────────────────────┬───────────────────────┬──────────┘
        │ GET /packages              │ GET /packages/[slug]  │ GET /contact
        ▼                            ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Next.js 16 App Router — (public) route group             │
│  Server Components query Supabase directly per request (anon key,     │
│  public-read RLS) — no API layer needed for read-only catalog data    │
└───────┬─────────────────────────────────────────────────────────────┘
        │ SELECT packages, package_photos,
        │ itinerary_days, inclusions, faq_facts
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Supabase (Postgres + Storage)                   │
│  packages / package_photos / itinerary_days / inclusions / faq_facts  │
│  tables (public-read RLS) ── photo binaries in a public Storage bucket│
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │ one-time / re-runnable
┌───────┴─────────────────────────────────────────────────────────────┐
│         scripts/seed.ts  (dev-time, service-role key, Node)           │
│  Uploads placeholder images to Storage bucket, inserts package rows   │
└─────────────────────────────────────────────────────────────────────┘

Client-side interaction paths (no server round-trip through our app):

┌─────────────┐   click wa.me link (built server-side, package name    ┌──────────┐
│  Browser     │   pre-filled + URL-encoded)                    ──────▶│ WhatsApp │
│  (package    │──────────────────────────────────────────────────────▶│ web/app  │
│   card /     │   click Facebook page link (static URL)         ──────▶ Facebook │
│   detail)    │──────────────────────────────────────────────────────▶│ page     │
│              │   submit inquiry form → fetch() POST                  └──────────┘
│              │   Accept: application/json, mode: cors           ──────▶┌──────────┐
└──────────────┘                                                        │ Formspree│
                     JSON response: {next} on success,                  │ (external│
                     {errors:[{field,message,code}]} on failure ◀───────│  service)│
                                                                         └──────────┘
```

### Recommended Project Structure
```
app/
├── (public)/
│   ├── layout.tsx              # header/footer/brand shell, mobile nav
│   ├── page.tsx                 # homepage
│   ├── packages/
│   │   ├── page.tsx              # PUBL-01: package list, cards w/ "from ₱X"
│   │   └── [slug]/
│   │       └── page.tsx          # PUBL-02..08: detail, itinerary, gallery, FAQ, inquiry form
│   └── contact/
│       └── page.tsx              # D-07: general Contact Us form
├── globals.css                   # Tailwind v4 CSS-first config, brand tokens
components/
├── ui/                            # shadcn-generated primitives (button, card, accordion, carousel, dialog, form, sonner...)
├── packages/
│   ├── package-card.tsx           # list card: photo, name, from-₱X badge, featured badge
│   ├── package-gallery.tsx        # Client Component: thumbnail grid + dialog/carousel lightbox
│   ├── itinerary-accordion.tsx    # day-by-day expand/collapse
│   ├── checklist.tsx              # D-09: shared inclusions/exclusions/what-to-bring component
│   └── whatsapp-cta.tsx           # builds wa.me link server-side from package name + phone constant
├── inquiry/
│   ├── inquiry-form.tsx           # Client Component: shared form used by both contexts (D-06, D-07)
│   └── inquiry-schema.ts          # zod schema, shared between package + contact forms
lib/
├── supabase/
│   ├── client.ts                  # browser client (anon key)
│   └── server.ts                  # RSC/server client (anon key; @supabase/ssr pattern, no auth cookie logic yet)
├── whatsapp.ts                    # buildWhatsAppLink(phone, packageName) helper
└── formspree.ts                   # submitToFormspree(data) — fetch wrapper matching verified contract
scripts/
└── seed.ts                        # D-01: re-runnable, uploads placeholder photos + inserts rows
supabase/
└── migrations/                    # packages, package_photos, itinerary_days, inclusions, faq_facts tables + RLS
```

### Structure Rationale

- **`(public)` route group only for Phase 1:** no `(admin)` group yet — Phase 2 adds it. Keeps this phase's surface area minimal while still matching the eventual project-wide structure documented in `.planning/research/ARCHITECTURE.md`.
- **`lib/whatsapp.ts` and `lib/formspree.ts` as isolated helpers:** both are pure, testable functions with a single responsibility (URL construction; HTTP contract), matching the "Don't Hand-Roll" guidance below by centralizing logic that would otherwise be duplicated between the per-package form and Contact Us form.
- **`inquiry-schema.ts` shared between both form contexts:** D-07 requires two form *contexts* (per-package vs. general), not two different data shapes — one zod schema with an optional `packageName`/`packageSlug` field (populated for the per-package context, omitted for Contact Us) avoids duplicating validation logic.
- **`scripts/seed.ts` outside `app/`:** it's dev-tooling, not a runtime route — keeping it out of `app/` avoids any chance of it being bundled or exposed, and makes the service-role key usage obviously server-only/CLI-only.

### Pattern 1: Server Component direct-fetch for public catalog data (no API layer, no static generation)

**What:** `app/(public)/packages/page.tsx` and `.../[slug]/page.tsx` are `async` Server Components that call `supabase.from('packages').select(...)` directly using the anon-key client, relying on public-read RLS policies rather than routing through a `/api/packages` Route Handler.
**When to use:** Any read-only public data display where the client fetching the data doesn't need elevated privileges and there's no cross-origin caller — matches this phase exactly (no admin panel exists yet to call an API).
**Example:**
```tsx
// app/(public)/packages/[slug]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: pkg, error } = await supabase
    .from('packages')
    .select(`
      *,
      package_photos ( storage_path, display_order, alt_text ),
      itinerary_days ( day_number, title, description ),
      package_inclusions ( kind, label )
    `)
    .eq('slug', slug)
    .eq('is_published', true)  // future-proofs for Phase 2's PKG-04 publish/unpublish
    .single()

  if (error || !pkg) notFound()

  return /* render detail page */
}
```
*Source basis: pattern combines Next.js's documented Server Component data-fetching model [CITED: nextjs.org/docs] with Supabase's documented direct-query-with-RLS pattern [CITED: supabase.com/docs] — no `generateStaticParams` needed at this scale (see Alternatives Considered).*

### Pattern 2: `wa.me` deep link construction (D-05)

**What:** Build the pre-filled WhatsApp click-to-chat URL server-side, once per package, using `encodeURIComponent` on the message text.
**When to use:** Every package card (icon-only per UI-SPEC) and every package detail page (icon+label per UI-SPEC).
**Example:**
```typescript
// lib/whatsapp.ts
const WHATSAPP_NUMBER = '639205351673' // D-03, no leading + per wa.me format

export function buildWhatsAppLink(packageName: string): string {
  const message = `Hi! I'm interested in ${packageName}`
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
```
*Source: [VERIFIED: web search cross-checked against wa.me link-generator vendor docs] — number in international format with no `+`/spaces/dashes, message appended via `?text=` and standard percent-encoding.*

### Pattern 3: Formspree AJAX submission from a custom `react-hook-form` handler (D-06)

**What:** `onSubmit` calls a shared `submitToFormspree` helper that POSTs JSON with the exact headers/body Formspree's own client library uses internally — verified directly from Formspree's open-source `formspree-js` repository, not inferred.
**When to use:** Both the per-package inquiry form and the Contact Us form (D-07); the helper is shared, only the payload's `package` field differs.
**Example:**
```typescript
// lib/formspree.ts
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xojpkjbr' // D-06

export type InquiryPayload = {
  name: string
  email: string
  phone: string
  message: string
  package?: string   // present for per-package context (D-07), omitted for Contact Us
  _gotcha?: string    // honeypot — must stay empty; see Common Pitfalls
}

export async function submitToFormspree(data: InquiryPayload) {
  const res = await fetch(FORMSPREE_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const body = await res.json()

  if (res.ok && 'next' in body) {
    return { ok: true as const }
  }

  // Formspree error shape: { error: string } or { errors: [{field, message, code}] }
  const errors = Array.isArray(body.errors)
    ? body.errors
    : [{ field: undefined, message: body.error ?? 'Submission failed' }]
  return { ok: false as const, errors }
}
```
*Source: [VERIFIED: github.com/formspree/formspree-js — packages/formspree-core/src/core.ts and submission.ts, fetched directly this session]. This is the exact contract Formspree's own `@formspree/core`/`@formspree/react` libraries use internally — hand-rolling against it is equivalent to using the official library, satisfying D-06's "rebuild natively" requirement without adding the dependency.*

### Pattern 4: Shared checklist component for inclusions/exclusions/what-to-bring (D-09)

**What:** One `<Checklist items={...} />` component (icon + text per line, using `lucide-react` icons e.g. `Check`/`X`/`Backpack`) driven by a `kind` discriminator (`'included' | 'excluded' | 'bring'`) rather than three separate components.
**When to use:** Package detail page, rendered three times with different `items` + `kind`.
**Data shape:**
```typescript
type ChecklistItem = { kind: 'included' | 'excluded' | 'bring'; label: string; sortOrder: number }
```

### Anti-Patterns to Avoid

- **Building a `/api/packages` Route Handler "just in case":** Phase 1 has no cross-origin caller and no elevated-privilege need — a proxy API layer adds a hop and a place for the anon key vs. RLS boundary to be misunderstood, with zero benefit at this phase. Add it later only if a genuine external consumer appears.
- **Using `@formspree/react`'s `useForm` hook alongside `react-hook-form`:** two form-state libraries fighting over the same `<form>` is exactly the kind of thing D-06 is steering away from — use the raw `fetch` contract (Pattern 3) instead.
- **Storing the WhatsApp/Facebook numbers/URLs inline in JSX at each call site:** D-03/D-04 are single constants used across every package card and detail page — centralize in `lib/whatsapp.ts` and a shared constants file so a future number/page change is a one-line edit, not a search-and-replace across components.
- **Seeding photos as plain `<img src="https://picsum.photos/...">` external URLs instead of real Storage uploads:** technically satisfies "placeholder photos" but does not exercise the Storage bucket/RLS/public-URL pattern Phase 2's admin upload feature will depend on — defeats the purpose of the discretion call made above.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Formspree request/response parsing | Custom guesswork at the JSON shape (field names, error format) | The verified contract in Pattern 3 (headers, body, `next`/`errors` shape) | Formspree's error shape has specific field names (`field`, `message`, `code`) that a hand-guessed parser will get wrong on the first real validation error — verified directly from their source, not worth re-deriving |
| Image lightbox/gallery interaction (keyboard nav, focus trap, touch swipe) | A custom modal + manual touch-event carousel | shadcn `dialog` + `carousel` (Embla-backed) | Embla handles touch/keyboard/accessibility; Radix Dialog handles focus trap/ESC-to-close — reimplementing either is a well-known source of subtle a11y bugs |
| Form validation error display, field-level state, submit-pending state | Manual `useState` juggling per field | `react-hook-form` + shadcn `form` (`FormField`/`FormMessage`) + `zod` resolver | Already the locked D-06 decision; re-affirmed here because a common mistake is to "simplify" by dropping RHF for a package-context form and only using it for Contact Us — keep both forms on the same stack |
| WhatsApp number formatting/validation | A phone-number parsing library for the static business number | A single hardcoded constant (D-03 is fixed, not user input) | The WhatsApp CTA number is a business constant, not user-entered data — no validation library needed; only *inquiry form* phone fields (user input) need `zod` validation |

**Key insight:** Every "don't hand-roll" item above already has a locked, verified answer from either CONTEXT.md decisions or an official source fetched this session — the risk in this phase isn't picking the wrong library, it's *quietly reintroducing* a hand-rolled alternative mid-implementation (e.g., falling back to a plain `<img>` external URL for "just one" placeholder photo, or adding `@formspree/react` "for convenience"). Plans should treat the Standard Stack table as exhaustive for Phase 1.

## Common Pitfalls

### Pitfall 1: Installing `typescript@latest` pulls in TypeScript 7.0, which GA'd 10 days before this research

**What goes wrong:** TypeScript 7.0 (a full native Go-port rewrite, "10x faster compiler") reached general availability on 2026-07-08 — ten days before this research session. `npm view typescript version` currently returns `7.0.2`. If the project scaffold or any later `npm install typescript@latest` pulls this in, the project is on a major version that: (a) does not yet ship the classic Language Service API that many editor/lint integrations depend on (TypeScript 7.1, not 7.0, is expected to restore it), and (b) has unverified compatibility with `eslint-config-next`/`typescript-eslint` and other Next.js 16 tooling this soon after release.
**Why it happens:** `create-next-app` and most `npm install -D typescript` invocations default to `@latest` unless explicitly pinned, and CLAUDE.md's "TypeScript 5.x" instruction predates TS7's GA — easy to silently drift onto 7.x without anyone deciding to.
**How to avoid:** Explicitly pin `typescript@5.9.3` (the last stable 5.x release, confirmed via `npm view typescript versions`) in `package.json`, and verify after `create-next-app` scaffolding that `typescript` in `devDependencies` reads `5.x`, not `7.x`, before running `npm install`.
**Warning signs:** `package.json` shows `"typescript": "^7.0.0"` or `"typescript": "latest"`; `tsc --version` reports `7.x`; unexplained ESLint/editor type-checking failures with no corresponding code change.

### Pitfall 2: `zod` v4 + `zodResolver` type-inference friction

**What goes wrong:** Community reports (react-hook-form and zod GitHub issue trackers) describe TypeScript type-compatibility errors between Zod v4's inferred types and `zodResolver`'s expected `Resolver` type (`Type 'Resolver<input<T>, ...>' is not assignable to type 'Resolver<output<T>, ...>'`), and in some setups a thrown `ZodError` instead of populated `formState.errors`.
**Why it happens:** Zod v4 changed its internal type-inference model (`input`/`output` split); `@hookform/resolvers` has been iterating to track it.
**How to avoid:** Use `@hookform/resolvers@5.4.0` or later (verified current), use Zod v4's newer validator syntax (`z.email()` instead of the deprecated `.string().email()` chain), and if a type error surfaces on `useForm`, explicitly type it as `useForm<z.input<typeof schema>, any, z.output<typeof schema>>({ resolver: zodResolver(schema) })` rather than fighting inference.
**Warning signs:** TypeScript errors mentioning `Resolver<...>` type mismatches on `useForm`; validation errors appearing as uncaught exceptions in the browser console instead of inline field messages.

### Pitfall 3: Forgetting `next/image` `remotePatterns` for Supabase Storage URLs

**What goes wrong:** `next/image` throws a build/runtime error ("un-configured host") for any Supabase Storage photo URL until the hostname is explicitly allow-listed. `images.domains` (the old shorthand) is deprecated since Next.js 14 — must use `images.remotePatterns`.
**Why it happens:** The Supabase project hostname (`<project-ref>.supabase.co`) isn't known until the project is provisioned, so it's easy to scaffold the app, add `next/image` calls, and only discover the missing config when the first real Storage-backed image renders.
**How to avoid:** Add to `next.config.ts` immediately after provisioning Supabase:
```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '<project-ref>.supabase.co', pathname: '/storage/v1/object/public/**' },
  ],
}
```
**Warning signs:** Console error `Invalid src prop ... hostname "..." is not configured under images in your next.config.js`.

### Pitfall 4: Vercel's free-tier Image Optimization cap (5K transformations/month on Hobby)

**What goes wrong:** Every unique combination of source image + rendered size + format counts toward Vercel's Image Optimization quota (5,000 transformations/month on Hobby, cached after first hit). A package catalog with several packages × multiple gallery photos × multiple responsive breakpoints can multiply quickly.
**Why it happens:** `next/image`'s automatic responsive `srcset` generation creates several optimized variants per source image by default.
**How to avoid:** Not a blocker for Phase 1's placeholder-content, low-traffic launch — 5K/month comfortably covers dev + early public traffic. Flag as a scaling watch-point for later: if it becomes tight, either reduce the number of `sizes` breakpoints per image or rely on Supabase Storage's own CDN (`unoptimized` prop) for less-critical images.
**Warning signs:** Vercel dashboard usage-limit warning emails; this is explicitly monitored by Vercel and surfaced proactively, not a silent failure.

### Pitfall 5: Formspree's `Accept: application/json` header is required, `mode: 'no-cors'` must NOT be used

**What goes wrong:** Omitting `Accept: application/json` causes Formspree to respond with an HTML redirect page instead of JSON (breaking the "no page reload, inline success/error state" requirement from D-06/UI-SPEC). Setting `mode: 'no-cors'` (a common copy-pasted "fix" for CORS confusion) makes the response opaque — the JSON body becomes unreadable, so success/error state can never be determined.
**Why it happens:** Formspree's endpoint sets permissive CORS headers so both a raw HTML form POST (top-level navigation, not subject to CORS) and a `fetch` POST work — but only the `fetch` path needs the `Accept` header, and only the `fetch` path breaks if `no-cors` is mistakenly applied.
**How to avoid:** Use exactly the headers in Pattern 3 (`Accept: application/json`, `Content-Type: application/json`, `mode: 'cors'` or omit `mode` entirely since `'cors'` is the fetch default for cross-origin requests).
**Warning signs:** Response body is an HTML string instead of JSON; `res.json()` throws a parse error; `TypeError: Failed to fetch` combined with an unreadable/opaque response in devtools Network tab.

### Pitfall 6: No spam mitigation on the rebuilt form

**What goes wrong:** The original Formspree-hosted form likely benefited from Formspree's default spam heuristics tied to their hosted form UI. A hand-built form POSTing raw JSON has no built-in protection unless explicitly added.
**Why it happens:** D-06 asks for a hand-rebuilt form; spam protection isn't automatic just because the endpoint is still Formspree.
**How to avoid:** Add Formspree's documented honeypot field to the payload: an input named `_gotcha`, hidden from real users (CSS, not `display:none` per Formspree's own recommendation — some bots skip hidden fields), left empty by humans; Formspree silently discards submissions where it's filled. [CITED: help.formspree.io honeypot article].
**Warning signs:** Sudden volume of junk inquiries with no message content or gibberish messages once the site is public.

## Code Examples

### Formspree submission with honeypot + package context (combines Patterns 3 + 6)
```typescript
// components/inquiry/inquiry-form.tsx (Client Component)
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitToFormspree } from '@/lib/formspree'
import { toast } from 'sonner'

const inquirySchema = z.object({
  name: z.string().min(1, 'Please enter your name'),
  email: z.email('Enter a valid email address'),
  phone: z.string().min(7, 'Enter a valid phone number'),
  message: z.string().min(1, 'Please add a short message'),
  _gotcha: z.string().max(0).optional(), // honeypot — must stay empty
})

export function InquiryForm({ packageName }: { packageName?: string }) {
  const form = useForm<z.infer<typeof inquirySchema>>({
    resolver: zodResolver(inquirySchema),
    defaultValues: { name: '', email: '', phone: '', message: '', _gotcha: '' },
  })

  async function onSubmit(values: z.infer<typeof inquirySchema>) {
    const result = await submitToFormspree({ ...values, package: packageName })
    if (result.ok) {
      toast.success('Inquiry sent! We\'ll get back to you soon.')
      form.reset()
    } else {
      toast.error('Something went wrong sending your inquiry. Please try again, or reach us directly on WhatsApp or Facebook.')
    }
  }

  return /* shadcn <Form> + <FormField> per field, submit button labeled "Send Inquiry" per UI-SPEC */
}
```

### Package seed script sketch (D-01, using Supabase Storage — Pattern discretion resolution)
```typescript
// scripts/seed.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only, never committed
)

async function seed() {
  const { data: pkg } = await supabase.from('packages').insert({
    slug: 'palawan-island-hopping',
    name: 'Palawan Island Hopping',
    from_price: 8500,
    duration_days: 3,
    is_published: true,
  }).select().single()

  const image = readFileSync('./supabase/seed-assets/palawan-1.jpg')
  const path = `${pkg.id}/photo-1.jpg`
  await supabase.storage.from('package-photos').upload(path, image, { contentType: 'image/jpeg' })
  await supabase.from('package_photos').insert({ package_id: pkg.id, storage_path: path, display_order: 1 })
}

seed()
```
*Run via `npm run seed` → `tsx scripts/seed.ts`. Re-runnable per D-01 by wrapping inserts in `upsert` on `slug`, or truncating first.*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `next/image` `images.domains` array | `images.remotePatterns` (protocol/hostname/pathname objects) | Deprecated since Next.js 14 | Must use `remotePatterns` for Supabase Storage hostname allow-listing — `domains` still works but is deprecated and less precise |
| `middleware.ts` | `proxy.ts` (same logic, renamed export) | Next.js 16 | Not required for Phase 1 (no auth/session gating yet — Phase 2 introduces it), but scaffolding conventions should use the new name from the start to avoid a rename later |
| TypeScript 5.x (classic tsc, JS-based compiler) | TypeScript 7.0 (native Go-port compiler, GA 2026-07-08) | 10 days before this research | Do NOT adopt yet for this project — pin to 5.9.3 (see Pitfall 1); ecosystem tooling compatibility (ESLint, editor Language Service features) is unverified this soon after a from-scratch compiler rewrite |
| `.string().email()` (Zod v3 style) | `z.email()` (Zod v4 top-level string-format validators) | Zod v4 | Use the v4 syntax throughout the inquiry schema; the old chained style still parses in some v4 versions but is the deprecated form |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: superseded by `@supabase/ssr` — not relevant to Phase 1 (no auth yet) but worth noting so Phase 2 doesn't reach for the old package.
- Formspree's vanilla `@formspree/ajax` library: explicitly documented by Formspree as "not recommended for React" — irrelevant here since D-06 already specifies a hand-built `fetch` approach (Pattern 3), not any Formspree JS library.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `wa.me` link format (`https://wa.me/<digits>?text=<encoded>`) is stable and works without a leading `+` | Pattern 2, Code Examples | LOW — this format has been stable and documented across every WhatsApp click-to-chat vendor guide found; if WhatsApp changed it, the CTA button would simply fail to open a chat, easily caught in manual testing |
| A2 | shadcn `carousel` + `dialog` composition (thumbnail grid → lightbox) is the right gallery pattern, vs. a dedicated lightbox library (e.g. `yet-another-react-lightbox`) | Architecture Patterns, UI-SPEC Registry Safety | LOW — UI-SPEC already locked `carousel`+`dialog` as the registry blocks to use; this research confirms the pattern is a known, common composition, not a novel risk |
| A3 | Dynamic per-request Server Component fetching (no `generateStaticParams`) is sufficient for Phase 1's traffic scale, deferring static generation | Alternatives Considered, Pattern 1 | LOW-MEDIUM — if Phase 1 traffic is much higher than assumed (unlikely for a pre-launch small PH travel business), Supabase read load or Vercel function invocation count could be worth optimizing sooner; easy to add `generateStaticParams` later without a rewrite |
| A4 | TypeScript 7.0's Language Service API immaturity (this soon after GA) would cause real friction with Next.js 16 tooling if adopted now | Pitfall 1, State of the Art | MEDIUM — this is inferred from TypeScript's own migration-guide messaging ("7.1 will ship a new API") plus general caution around a from-scratch compiler rewrite 10 days post-GA, not a directly observed Next.js+TS7 failure this session — worth re-checking closer to execution time in case compatibility has stabilized |

**If this table is empty:** N/A — see entries above; overall risk is LOW-MEDIUM and none of these block planning.

## Open Questions

1. **Should `seed.ts` be re-run destructively (truncate + reinsert) or use `upsert` on `slug`?**
   - What we know: D-01 requires it to be "re-runnable" during Phase 1 dev.
   - What's unclear: whether repeated runs should accumulate duplicate rows or safely reset to a known placeholder state.
   - Recommendation: use `upsert` keyed on `packages.slug` (unique constraint) for package rows, and delete+reinsert `package_photos`/`itinerary_days`/`package_inclusions` for the affected `package_id` on each run — simplest way to stay idempotent without a full destructive reset. Leave final call to the planner/executor; low-stakes since this is disposable dev tooling per D-01.

2. **Exact package data model granularity for itinerary/inclusions (child tables vs. JSONB columns)?**
   - What we know: PUBL-02/03/08 require day-by-day itinerary, line-item inclusions/exclusions, and fixed FAQ fields to be queryable and renderable in order.
   - What's unclear: whether Phase 2's admin package-edit form (PKG-01/02) will need to reorder/add/remove individual itinerary days and checklist items via UI controls, which favors normalized child tables (`itinerary_days`, `package_inclusions` with a `sort_order` column) over a single JSONB blob per package.
   - Recommendation: normalized child tables (as sketched in Recommended Project Structure and the seed example) — easier for Phase 2 CRUD to target individual rows, and RLS/ordering is simpler with real columns than JSONB path queries. This is a planning-level schema decision, not fully locked by CONTEXT.md — flag for the planner to confirm before writing migrations.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 16 runtime (requires ≥20.9) | ✓ | v20.19.4 | — |
| npm | Package management | ✓ | 10.8.2 | — |
| Supabase CLI | Local dev DB, migrations, `db reset` seeding | ✓ | 2.100.1 | — |
| Docker | Backs `supabase start` (local Postgres via containers) | ✓ | 28.3.0 | — |
| git | Version control, migrations-as-code | ✓ | 2.50.1 | — |

**Missing dependencies with no fallback:** none — all required local tooling is present.
**Missing dependencies with fallback:** none.

## Security Domain

`security_enforcement` is enabled (ASVS Level 1) per `.planning/config.json`. Phase 1 has a narrow attack surface — no authentication, no server-side write endpoints of our own (the only "write" path is a client-side POST to the external Formspree service), and all Supabase access is anon-key + public-read only. ASVS categories are scoped accordingly.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V1 Architecture | Yes | Public-read RLS enforced at the Postgres layer for `packages`/`package_photos`/etc., not just "the UI doesn't show admin data" — no admin data model exists yet in Phase 1, so this is mostly a forward-looking discipline (write policies default-deny until Phase 2 adds authenticated write policies) |
| V2 Authentication | No | Phase 1 has no user accounts (public site only) — deferred to Phase 2 |
| V3 Session Management | No | No sessions in Phase 1 |
| V4 Access Control | Partial | Supabase RLS: every table Phase 1 creates must have RLS **enabled** with an explicit public-`SELECT`-only policy (no `INSERT`/`UPDATE`/`DELETE` policy exists yet for anon/public role — default-deny covers this automatically as long as RLS is turned on) |
| V5 Input Validation | Yes | `zod` schema validation client-side on the inquiry form (name/email/phone/message shape and required-ness) before the Formspree POST; note this is client-side only in Phase 1 (see Known Threat Patterns) since there is no server-side proxy for the form in this phase |
| V6 Cryptography | No | No secrets handled client-side in Phase 1 beyond the public Supabase anon key (by design, not a secret) — service-role key stays server/CLI-only (`scripts/seed.ts`), never bundled |
| V7 Error Handling & Logging | Partial | Form submission failures show a generic user-facing message (per UI-SPEC Copywriting Contract) without leaking Formspree's raw error internals to the UI |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Automated bot spam submissions to the public inquiry form | Denial of Service / data pollution | Formspree `_gotcha` honeypot field (Pitfall 6); Formspree's own server-side spam heuristics still apply regardless of client rebuild since the endpoint is unchanged |
| Client-side-only form validation bypass (attacker POSTs directly to Formspree, bypassing the React form/zod schema) | Tampering | Acceptable risk in Phase 1: Formspree performs its own field validation server-side per the configured form's field rules (not something this app controls); there is no downstream write to *our* database in Phase 1 for a bypassed submission to corrupt — this becomes a materially different risk in Phase 3 once the webhook writes directly to the CRM, at which point server-side payload validation with `zod` before any Supabase write becomes mandatory (already flagged in `.planning/research/PITFALLS.md` Pitfall 4/Anti-Pattern 4) |
| Missing/misconfigured RLS on a newly created public table | Elevation of Privilege / information disclosure | Every migration in `supabase/migrations/` must enable RLS and add an explicit public-`SELECT`-only policy — enable RLS by default checklist item for `packages`, `package_photos`, `itinerary_days`, `package_inclusions`, `faq_facts` |
| Service-role key leakage via `scripts/seed.ts` | Information Disclosure | Keep the service-role key in `.env.local`/CI secrets only, never `NEXT_PUBLIC_*`-prefixed, never imported by any file under `app/` or `components/` — `scripts/seed.ts` is Node-CLI-only and outside the Next.js bundle graph, but this must be verified (the script should not accidentally get imported by app code) |
| `next/image` unconfigured-host / SSRF-adjacent misconfiguration | Tampering | `remotePatterns` scoped tightly to the exact Supabase Storage `pathname` prefix (`/storage/v1/object/public/**`), not a wildcard hostname, limiting what the Next.js Image Optimization proxy will fetch on the app's behalf |

## Sources

### Primary (HIGH confidence)
- github.com/formspree/formspree-js — `packages/formspree-core/src/core.ts` and `submission.ts`, fetched directly via `curl` this session — exact request/response contract for Formspree AJAX submission
- nextjs.org/docs/app/api-reference/functions/generate-static-params — official Next.js 16.2 docs, fetched directly
- supabase.com/docs/guides/storage/security/access-control — official Supabase docs, fetched directly (public vs. RLS-gated buckets, example policies)
- supabase.com/docs/guides/storage/serving/downloads — official Supabase docs, fetched directly (public URL construction)
- supabase.com/docs/guides/local-development/seeding-your-database — official Supabase docs, fetched directly (`seed.sql` conventions, `config.toml` multi-file seeding)
- npm registry (`npm view <pkg> version`) — all package versions listed in Standard Stack, checked live 2026-07-18
- nextjs.org/docs/messages/middleware-to-proxy — official Next.js 16 `proxy.ts` rename confirmation
- help.formspree.io honeypot article (via web search summary matching official article title/content) — `_gotcha` field name and behavior

### Secondary (MEDIUM confidence)
- WebSearch: wa.me click-to-chat link format (cross-checked across Qualimero, Chatfuel, WhatsApp's own FAQ summary)
- WebSearch: `next/image` `remotePatterns` for Supabase Storage (cross-checked across Medium, Sentry, dev.to guides, consistent with official docs pattern)
- WebSearch: shadcn `carousel`+`dialog` gallery composition pattern (cross-checked across shadcn.io, GitHub discussions)
- WebSearch: Vercel Hobby Image Optimization limits (vercel.com/docs/image-optimization/limits-and-pricing referenced in search summary)
- devblogs.microsoft.com/typescript "Announcing TypeScript 7.0" (via web search summary) — GA date and API-availability caveat for TS7.0 vs 7.1
- GitHub issue trackers (react-hook-form/react-hook-form #12816/#12829, colinhacks/zod #4992) — Zod v4 + zodResolver type-friction reports

### Tertiary (LOW confidence)
- None used without cross-reference — all findings above were either fetched directly from an official/primary source or cross-checked across 2+ independent secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified against live npm registry this session; core choices already locked by CLAUDE.md/UI-SPEC
- Architecture: HIGH — Server Component + RLS pattern confirmed against official Next.js and Supabase docs; consistent with project-wide `.planning/research/ARCHITECTURE.md`
- Pitfalls: HIGH for Formspree/Storage/image-config items (fetched from primary sources); MEDIUM for the TypeScript 7 compatibility risk (inferred from release messaging, not directly observed against this exact stack)

**Research date:** 2026-07-18
**Valid until:** 2026-08-17 (30 days) — re-verify the TypeScript 5.x-vs-7.x pin decision specifically if execution starts near or after that date, since TS7.1 (expected to restore the Language Service API) may ship in the interim and change the recommendation

---
*Phase 1 research for: TravelSentro — Public Catalog & Inquiry Entry Point*
*Researched: 2026-07-18*
