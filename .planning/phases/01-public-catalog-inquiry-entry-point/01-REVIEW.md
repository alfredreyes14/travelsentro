---
phase: 01-public-catalog-inquiry-entry-point
reviewed: 2026-07-18T13:15:15Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - app/(public)/contact/page.tsx
  - app/(public)/layout.tsx
  - app/(public)/packages/[slug]/page.tsx
  - app/(public)/packages/page.tsx
  - app/(public)/page.tsx
  - app/globals.css
  - app/layout.tsx
  - components/inquiry/inquiry-form.tsx
  - components/inquiry/inquiry-schema.ts
  - components/packages/checklist.tsx
  - components/packages/facebook-cta.tsx
  - components/packages/itinerary-accordion.tsx
  - components/packages/package-card.tsx
  - components/packages/package-gallery.tsx
  - components/packages/trip-facts.tsx
  - components/packages/whatsapp-cta.tsx
  - components/ui/carousel.tsx
  - components/ui/form.tsx
  - lib/constants.ts
  - lib/formspree.ts
  - lib/supabase/client.ts
  - lib/supabase/server.ts
  - lib/whatsapp.ts
  - supabase/.gitignore
  - supabase/config.toml
  - supabase/migrations/20260718114727_create_package_schema.sql
  - types/database.ts
findings:
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-18T13:15:15Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Reviewed the Phase 1 public catalog + inquiry entry point: public route pages, the WhatsApp/Facebook/inquiry-form components, Supabase client factories, and the Phase 1 database migration.

The single largest problem is a real authorization gap in the database migration: every RLS "public read" policy grants unconditional `select` access (`using (true)`) with no `is_published` check, so the app's own `.eq("is_published", true)` filter is the *only* thing hiding draft/unpublished packages — anyone calling the Supabase REST API directly with the anon key can read every unpublished package (and its photos/itinerary/inclusions/FAQ facts) regardless of publish state. This must be fixed before shipping, since Supabase's anon key is designed to be public and RLS is meant to be the actual authorization boundary, not the application query layer.

Beyond that, the implementation is solid: forms are properly validated with zod, honeypot spam protection is wired correctly, outbound WhatsApp/Facebook links are built safely, and the public pages degrade gracefully (empty states, `notFound()` handling). The warnings below are mostly missing observability/robustness (silently-swallowed errors, missing timeout, missing per-page SEO metadata) plus two pre-existing correctness nits in the generated shadcn `carousel.tsx`/`form.tsx` primitives that are worth knowing about even though they weren't authored fresh in this phase.

## Critical Issues

### CR-01: RLS policies allow public read of unpublished packages and all child data

**File:** `supabase/migrations/20260718114727_create_package_schema.sql:27-28,43-44,59-60,75-76,90-91`
**Issue:** Every table's `"public read"` RLS policy is `using (true)` — unconditional. The app enforces "only published packages are visible" exclusively in application code (`.eq("is_published", true)` in `app/(public)/packages/page.tsx` and `app/(public)/packages/[slug]/page.tsx`), but RLS is the actual authorization boundary for anyone holding the anon key (which is designed to be publicly embeddable — see `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `lib/supabase/client.ts`/`server.ts`). Any client can call the Supabase REST API directly (e.g. `GET {project_url}/rest/v1/packages?select=*` or `.../itinerary_days`, `.../package_inclusions`, `.../faq_facts`) and read every unpublished/draft package's name, pricing, itinerary text, inclusions, and FAQ facts — content that's explicitly meant to be hidden until published. The child tables (`package_photos`, `itinerary_days`, `package_inclusions`, `faq_facts`) don't even reference their parent's `is_published` state at all.
**Fix:**
```sql
-- packages: filter directly
drop policy "public read" on packages;
create policy "public read" on packages
  for select using (is_published = true);

-- child tables: filter via parent's is_published
drop policy "public read" on package_photos;
create policy "public read" on package_photos
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_photos.package_id and p.is_published
    )
  );

drop policy "public read" on itinerary_days;
create policy "public read" on itinerary_days
  for select using (
    exists (
      select 1 from packages p
      where p.id = itinerary_days.package_id and p.is_published
    )
  );

drop policy "public read" on package_inclusions;
create policy "public read" on package_inclusions
  for select using (
    exists (
      select 1 from packages p
      where p.id = package_inclusions.package_id and p.is_published
    )
  );

drop policy "public read" on faq_facts;
create policy "public read" on faq_facts
  for select using (
    exists (
      select 1 from packages p
      where p.id = faq_facts.package_id and p.is_published
    )
  );
```

## Warnings

### WR-01: Package detail page swallows Supabase query errors with zero logging

**File:** `app/(public)/packages/[slug]/page.tsx:52`
**Issue:** `if (error || !data) notFound();` treats a real database/network error identically to a legitimate "no such slug", and — unlike the list page (`app/(public)/packages/page.tsx:29-33`, which does `console.error("Failed to load packages:", error.message)`) — it does not log the error at all. A transient Supabase outage or query failure on this route is completely invisible server-side and just looks like a 404 to users and to monitoring.
**Fix:**
```ts
if (error) {
  console.error("Failed to load package detail:", error.message);
}
if (error || !data) notFound();
```

### WR-02: Package detail page has no per-page SEO metadata

**File:** `app/(public)/packages/[slug]/page.tsx`
**Issue:** `packages/page.tsx` and `contact/page.tsx` both export a static `metadata` object with a page-specific title/description, but `packages/[slug]/page.tsx` (arguably the most important marketing page — the one shared/linked for a specific tour) has no `generateMetadata`, so every package detail page falls back to the generic root title "TravelSentro" / generic description from `app/layout.tsx`. Search results and social shares for individual packages won't reflect the package name.
**Fix:**
```ts
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("name, duration_label, duration_days")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!data) return {};
  return {
    title: `${data.name} | TravelSentro`,
    description: `${data.duration_label ?? `${data.duration_days} days`} tour package — browse the itinerary and reach out on WhatsApp or Facebook.`,
  };
}
```

### WR-03: `submitToFormspree` has no request timeout

**File:** `lib/formspree.ts:30-37`
**Issue:** The `fetch` call has no `AbortController`/timeout. If the network hangs (flaky connection, Formspree outage without a fast failure), `InquiryForm`'s `isSubmitting` state stays `true` indefinitely — the "Sending..." button stays disabled with no way for the user to recover short of reloading the page.
**Fix:**
```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);
try {
  const res = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: controller.signal,
  });
  // ...
} finally {
  clearTimeout(timeout);
}
```

### WR-04: `Carousel` leaks its Embla `"reInit"` listener on cleanup

**File:** `components/ui/carousel.tsx:96-106`
**Issue:** The effect registers both `api.on("reInit", onSelect)` and `api.on("select", onSelect)`, but the cleanup function only calls `api?.off("select", onSelect)` — the `"reInit"` listener is never removed. Across carousel remounts (this project explicitly remounts the carousel via `key={selectedIndex}` in `components/packages/package-gallery.tsx:58`), each mount's listener is never torn down, so stale `onSelect` callbacks accumulate and can fire against unmounted state.
**Fix:**
```ts
return () => {
  api?.off("select", onSelect)
  api?.off("reInit", onSelect)
}
```

### WR-05: `useFormField`'s "used outside `<FormField>`" guard is unreachable

**File:** `components/ui/form.tsx:41-52`
**Issue:** `fieldContext.name` is dereferenced (via `useFormState({ name: fieldContext.name })`) before the `if (!fieldContext) throw ...` check even runs, and the check itself can never be true: `FormFieldContext`'s default value is `{} as FormFieldContextValue` (a truthy empty object), not `null`/`undefined`, so `!fieldContext` is always `false`. Calling `useFormField` (indirectly via `FormLabel`/`FormControl`/`FormMessage`) outside a `<FormField>` silently produces a confusing downstream error (e.g. `getFieldState(undefined, ...)`) instead of the clear, intended error message.
**Fix:**
```ts
const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)
// ...
function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)
  // ...
}
```

### WR-06: Supabase env vars are non-null-asserted with no validation

**File:** `lib/supabase/client.ts:12-15`, `lib/supabase/server.ts:16-18`
**Issue:** Both client factories use `process.env.NEXT_PUBLIC_SUPABASE_URL!` / `NEXT_PUBLIC_SUPABASE_ANON_KEY!`. If either env var is missing at runtime (misconfigured deploy, missing `.env.local` locally), the `!` assertion silences TypeScript but the actual failure surfaces as an opaque error deep inside `@supabase/ssr`/`supabase-js` rather than a clear, actionable startup error pointing at the missing env var.
**Fix:**
```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}
```

## Info

### IN-01: Phone field accepts any 7+ character string

**File:** `components/inquiry/inquiry-schema.ts:6`
**Issue:** `phone: z.string().min(7, "Enter a valid phone number")` only checks length, not format — a value like `"abcdefg"` passes validation despite the error message implying phone-number-shaped validation.
**Fix:** Add a light regex, e.g. `z.string().min(7).regex(/^[\d\s()+-]+$/, "Enter a valid phone number")`, tuned for PH mobile formats (`09XX XXX XXXX`) without being overly strict.

### IN-02: `Checklist` list items keyed by array index

**File:** `components/packages/checklist.tsx:37`
**Issue:** `<li key={index}>` uses the array index as the React key. Harmless today since inclusions/exclusions/bring-items are static per render, but it's a fragile pattern if this component is ever reused against reorderable/editable data (e.g. an admin-panel preview in a later phase).
**Fix:** Key by `item.label` (or a stable id if one becomes available) instead of `index`.

### IN-03: `lib/supabase/client.ts` is unused in Phase 1

**File:** `lib/supabase/client.ts`
**Issue:** `createClient()` here has no call sites anywhere in the reviewed file set — it's explicitly scaffolded ahead of need for Phase 2 client-side usage, per its own comment. Flagging for visibility since unused exports are otherwise a code-quality smell; no action needed if the Phase 2 plan is confirmed.
**Fix:** None required now — revisit if Phase 2 doesn't end up using it.

### IN-04: `package_inclusions.kind` typed as loose `string`, not a literal union

**File:** `types/database.ts:81,88,95`
**Issue:** The DB enforces `kind in ('included', 'excluded', 'bring')` via a CHECK constraint (`supabase/migrations/20260718114727_create_package_schema.sql:68`), but the generated `Row`/`Insert`/`Update` types declare `kind: string`, so TypeScript won't catch a typo'd kind value anywhere it's constructed or compared (e.g. `components/packages/checklist.tsx`'s `ChecklistKind` union has to be manually kept in sync).
**Fix:** This is an auto-generated file (`supabase gen types typescript`), so the real fix is a Postgres enum type for `kind` rather than hand-editing the generated file — regenerate types after migrating `kind` to an enum if tightening this is worth it.

---

_Reviewed: 2026-07-18T13:15:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
