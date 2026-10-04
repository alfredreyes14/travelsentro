# Quotation Generator — Design Spec

**Date:** 2026-10-04
**Status:** Approved by user in conversation, pending written-spec review.

## Summary

Staff send customers tailored itineraries that aren't (and shouldn't become) published packages — a custom date, a tweaked price, a private group tour. Today there's no way to produce one except creating a package. This adds a **Quotes** section to the admin panel: an admin builds a quote by hand, from an uploaded flyer, or by copying an existing package, then downloads it as a PDF.

The quote PDF is **identical in layout to the existing "Download Full Itinerary" PDF** (`lib/pdf/package-pdf.tsx`): logo header, title, duration, per-pax price with optional struck-through original, Itinerary, What's Included, What's Not Included, What to Bring, Travel Dates (with per-range surcharges), Remarks, navy/orange contact footer. Both PDFs render through one shared template.

Quotes are an independent module, not a mode of packages: they are private, customer-specific, and frozen at the moment they're made. Editing a package never changes a quote built from it.

**In scope:**
- `quotes` table, `TSQ-000001` quote numbers, `can_manage_quotes` permission
- `/admin/quotes` list, `/admin/quotes/new`, `/admin/quotes/[id]` edit, `/admin/quotes/[id]/pdf` download
- Three entry paths: blank, from flyer, from package
- Shared PDF template and shared form sections with packages

**Out of scope:**
- Printing quote number / customer name on the PDF (admin-only metadata; quote number appears in the download filename only)
- Status workflow (draft/sent/accepted), expiry/valid-until, line-item pricing
- Emailing or otherwise sending the quote — PDF download only
- Converting a quote into a package
- Photos on quotes (the itinerary PDF has none)

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Merge with packages or separate? | Separate `quotes` module | Packages are a public catalog with publish/RLS/slug semantics; quotes are private one-offs that must not change after the fact. |
| Permission | New `can_manage_quotes` toggle | User decision. Wired identically to `can_manage_vouchers`. |
| CRM contact | Optional | User decision. Free-text `customer_name` plus optional `contact_id` link. |
| Output | PDF download only | User decision. |
| PDF layout | 100% the itinerary PDF | User decision ("use what we have in download itinerary"). |
| Pricing | Same model as packages: `price_per_pax` + optional `discount_amount` (struck-through original) + per-travel-date-range `additional_fee` | Follows from the identical-PDF decision. |
| Itinerary content storage | `jsonb` columns on `quotes` | A quote is a frozen document written as one row in one statement — no child tables, no `write_package_children`-style RPC needed. Shape is enforced by zod on every write. |
| Where unsaved quotes live | In memory on `/admin/quotes/new` until first save | Avoids orphan draft rows (packages need a draft row only because of photo uploads; quotes have no photos). |
| Delete | Hard delete with confirm | Quotes carry no history other records depend on. |

## Data Model

Migration: `supabase/migrations/20261004120000_create_quotes_schema.sql`

```sql
create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique not null default '',  -- overwritten by trigger, TSQ-000001
  title text not null,
  customer_name text,
  contact_id uuid references contacts(id) on delete set null,
  source text not null check (source in ('manual', 'flyer', 'package')),
  source_package_id uuid references packages(id) on delete set null,
  price_per_pax integer not null check (price_per_pax > 0),
  discount_amount numeric check (discount_amount is null or discount_amount > 0),
  duration_label text not null,
  remarks text,
  travel_dates jsonb not null default '[]',  -- [{dateFrom, dateTo, additionalFee?}]
  itinerary jsonb not null default '[]',     -- [{title, description}]  (day_number = index + 1)
  inclusions jsonb not null default '[]',    -- [{label}]
  exclusions jsonb not null default '[]',    -- [{label}]
  bring_items jsonb not null default '[]',   -- [{label}]
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- `quote_code_seq` sequence + `generate_quote_no()` BEFORE INSERT trigger, copying `generate_package_code()` from `20260807180000_package_fields_rework.sql` (client-supplied `quote_no` is always overwritten; grant `usage, select` on the sequence to `authenticated`).
- `updated_at` maintained by the server action on update (no trigger needed).
- jsonb keys use the form's camelCase shape (`dateFrom`, `additionalFee`, …) so values round-trip into the form without remapping.
- RLS: select / insert / update / delete all `to authenticated` using `public.has_permission(auth.uid(), 'can_manage_quotes')`. No public access.
- Permission wiring in the same migration, following `20260928120000_create_vouchers_schema.sql`:
  - `alter table profiles add column can_manage_quotes boolean not null default false;`
  - `create or replace function public.has_permission` — add the `can_manage_quotes` case branch, keeping every existing branch.
  - `create or replace function public.handle_new_user` — include `can_manage_quotes = false`.
- Regenerate `types/database.ts` after applying.

## Architecture

```
/admin/quotes/new ───────────────────────────────────────────────┐
  ├─ Copy from a package picker → getPackageQuoteValues()          │
  ├─ Import from Flyer button   → extractQuoteFromPoster()         │  QuoteForm
  └─ blank                        (both via PosterImportProvider)  │  (in-memory)
                                                                   ▼
                                        createQuote() → insert → redirect /admin/quotes/[id]
/admin/quotes/[id]  → QuoteForm (edit) → updateQuote()
                    → Download PDF → /admin/quotes/[id]/pdf
                                          └─ quoteToPdfData() → ItineraryPdfDocument
/admin/packages/[id]/pdf, /packages/[slug]/pdf
                                          └─ packageToPdfData() → ItineraryPdfDocument
```

### 1. Shared PDF template

`lib/pdf/package-pdf.tsx` is split:

- `lib/pdf/itinerary-pdf.tsx` — `ItineraryPdfData`, `ItineraryPdfDocument`, `renderItineraryPdf(data, logoSrc)`. This is today's `PackagePdfDocument` JSX and styles, moved verbatim, reading from `ItineraryPdfData` instead of the package row.
- `lib/pdf/package-pdf.tsx` — keeps `fetchPackageForPdf`, `LOCAL_LOGO_PATH`, adds `packageToPdfData(pkg)`; `renderPackagePdf` becomes `renderItineraryPdf(packageToPdfData(pkg), logoSrc)`.
- `lib/pdf/quote-pdf.ts` — `fetchQuoteForPdf(supabase, id)` and `quoteToPdfData(quote)`.

```ts
// The PDF input IS the shared form content shape -- one less mapping layer.
type ItineraryPdfData = { title: string; content: ItineraryContentValues };
```

- `lib/packages/package-content.ts` — `packageRowToContentValues(pkg)`: package row + child rows → `ItineraryContentValues` in display order (days by `day_number`, inclusions by `sort_order`, dates by from/to). Used by the package PDF, the package edit page's form defaults, and "copy from package".
- `lib/quotes/quote-row.ts` — `quoteValuesToRow` / `quoteRowToFormValues` (jsonb re-validated with zod on read; malformed data throws).
- Day numbers print as array index + 1; travel dates are sorted inside the template so quotes print chronologically like packages.

**Regression requirement:** package PDFs must render identically after the split. `scripts/verify-package-pdf.ts`, `verify-admin-package-pdf.ts` and `verify-public-package-pdf.ts` must pass unchanged.

### 2. PDF route

`app/admin/(dashboard)/quotes/[id]/pdf/route.ts` — same shape as `app/admin/(dashboard)/packages/[id]/pdf/route.ts`: `requirePermissionOrRedirect("can_manage_quotes")`, fetch, 404 if missing, logo URL built from `request.url`, 500 on render failure, `Content-Disposition: attachment; filename="<quote_no>.pdf"`.

### 3. Shared form sections

`components/admin/package-form.tsx` (805 lines) has its Travel Dates, Itinerary and Inclusions tab bodies extracted into:

- `components/admin/itinerary-fields/travel-dates-fields.tsx`
- `components/admin/itinerary-fields/itinerary-days-fields.tsx`
- `components/admin/itinerary-fields/inclusion-lists-fields.tsx` (inclusions, exclusions, bring items)

Each reads the form through `useFormContext<ItineraryContentValues>()` and owns its own `useFieldArray`. Price/discount/duration/remarks move to `itinerary-fields/pricing-fields.tsx`; the remove-row confirmation becomes `useRemoveConfirmation(noun)`; PackageForm's poster-import apply/confirm logic becomes `components/admin/use-form-import.tsx`, shared by both forms. The shared zod pieces move to `components/admin/itinerary-content-schema.ts`:

```ts
export const itineraryContentSchema = z.object({
  pricePerPax, discountAmount, durationLabel, remarks,
  travelDates: z.array(travelDateSchema).min(1, "Add at least one travel date"),
  itinerary, inclusions, exclusions, bringItems,
});
```

`packageFormSchema = itineraryContentSchema.extend({ name, destinationId })` — validation messages and rules unchanged.
`quoteFormSchema = itineraryContentSchema.extend({ title, customerName: optional, contactId: optional })`.

`PackageForm` renders the extracted components in place of its inline tab bodies; its behavior (remove confirmations, tab-error jumping in `onInvalid`, poster import reset) must be unchanged.

`components/admin/quote-form.tsx` — tabs: **Details** (title, customer name, contact picker, price per pax, discount, duration, remarks), **Travel Dates**, **Itinerary**, **Inclusions**. Uses `FormActionBar` like `PackageForm`. Like packages, there is no unsaved-changes navigation prompt (the layout's `NavigationGuard` only guards an in-flight flyer read).

Contact picker: a combobox over `contacts` (name + email), readable by all authenticated staff under existing RLS. Picking a contact fills `customerName` if empty; the name stays editable.

### 4. Pages and actions

- `app/admin/(dashboard)/quotes/page.tsx` — `requirePermissionOrRedirect("can_manage_quotes")`; table of quote no., title, customer, updated date, Download PDF, Delete. **New Quote** button → `/admin/quotes/new`.
- `app/admin/(dashboard)/quotes/new/page.tsx` — Server Component. Header holds the two import controls: a **Copy from a package** combobox (published, non-deleted packages) and **Import from Flyer**. Both feed `QuoteForm` through `PosterImportProvider`, so the "Replace what you've entered?" confirmation applies to either, and each sets the quote's `source` / `source_package_id`. Starting blank is just typing into the form. (Replaces an earlier `?package=` / `?flyer=1` URL design: one import channel instead of two, and no file-picker-without-a-click problem.)
- `app/admin/(dashboard)/quotes/[id]/page.tsx` — loads the quote, renders `QuoteForm` in edit mode plus a Download PDF link.
- `actions/quotes.ts` — `createQuote`, `updateQuote`, `deleteQuote`, `getPackageQuoteValues` (a published package's content as quote values, via `packageRowToContentValues`), each `requirePermission("can_manage_quotes")`, parse with `quoteFormSchema` server-side, return `ActionResult`, `revalidatePath("/admin/quotes")`.
- Sidebar: Quotes entry in `app/admin/(dashboard)/layout.tsx` / `admin-nav.tsx`, shown when `role === "admin" || can_manage_quotes`.
- Users: `can_manage_quotes` toggle in `account-form.tsx` / `account-form-schema.ts`, badge in `users-table.tsx`, persisted in `actions/users.ts`. Add `"can_manage_quotes"` to the permission union in `lib/auth/dal.ts`.

### 5. Flyer extraction reuse

`actions/package-poster.ts` currently validates, calls Claude and maps in one action. Split:

- `lib/packages/extract-poster.ts` (`server-only`) — `extractPosterData({ base64, mimeType, destinationNames }): Promise<{ ok: true; data: PosterExtraction } | { ok: false; error: string }>`: MIME/size validation, API-key check, `client.messages.parse()` with `zodOutputFormat(PosterExtractionSchema)`, error mapping via `describePosterExtractionError`. Moved verbatim from the current action.
- `actions/package-poster.ts` — `extractPackageFromPoster`: `requirePermission("can_manage_packages")`, load destinations, `extractPosterData`, `mapPosterToFormValues`. External behavior unchanged.
- `actions/quote-poster.ts` — `extractQuoteFromPoster`: `requirePermission("can_manage_quotes")`, `extractPosterData` with an empty destination list, then `mapPosterToQuoteValues` (`lib/quotes/poster-mapping.ts`), which calls `mapPosterToFormValues` and drops `destinationId` from `values` and from `unmapped`, and renames `name` → `title`.

Prompt change in `lib/packages/poster-prompt.ts`: "these values are published to a public website customers book against" → "these values are shown to customers who book against them". The transcribe-never-infer rule is untouched.

The quote page reuses `PosterImportBanner` and the `PosterImportContext` pattern; the button component is generalized to accept the extraction action as a prop rather than duplicated.

## Error Handling

- Flyer import: existing `poster-error.ts` messages (unsupported file, too large, empty file, missing API key, exhausted credits, generic) are shared unchanged.
- Server actions: zod failure → `{ ok: false, error }` shown via the form's existing toast pattern; DB error → logged, generic message.
- Copy from a package where the package is no longer published / readable → toast "That package isn't available anymore."; form untouched.
- Malformed stored quote jsonb → opening the quote hits the admin error boundary; the PDF route returns a logged 500.
- PDF route: 404 for missing quote, 500 with logged error on render failure.
- Permission denial: `requirePermissionOrRedirect` on pages/route → forbidden page; `requirePermission` in actions; RLS as the backstop.

## Testing

Following the repo's `scripts/verify-*.ts` convention (add npm scripts for each):

- `verify-package-pdf.ts`, `verify-admin-package-pdf.ts`, `verify-public-package-pdf.ts` — existing; must still pass (template-split regression guard).
- `verify-quote-pdf.ts` — inserts a fixture quote (service-role client, cleaned up afterward), fetches it with `fetchQuoteForPdf`, renders via `quoteToPdfData` → `renderItineraryPdf`, and asserts a `%PDF-` signature and a non-trivial size — the same checks `verify-package-pdf.ts` uses. Also asserts `quoteToPdfData` and `packageToPdfData` produce deep-equal `ItineraryPdfData` for equivalent fixture content (the "identical layout" guarantee, checked at the data boundary).
- `verify-quote-rls.ts` — a staff user without `can_manage_quotes` cannot select/insert/update/delete quotes; with it, can; admin always can; `quote_no` is trigger-assigned even if supplied.
- `verify-poster-extraction.ts` — extend with `mapPosterToQuoteValues` cases (destination fields dropped, `name` → `title`).
- `verify-quote-values.ts` (offline) — package content ordering/null handling, quote row round trip, package→quote content equality (full and sparse fixtures), malformed jsonb throws, offline PDF render.
- `npm run lint` and `npm run build` clean.
- Manual: create one quote via each entry path, edit it, download the PDF, compare side-by-side with the source package's itinerary PDF.

## Components Touched

**New:** quotes migration; `lib/pdf/itinerary-pdf.tsx`, `lib/pdf/quote-pdf.ts`; `lib/packages/extract-poster.ts`, `lib/packages/package-content.ts`; `lib/quotes/quote-row.ts`, `lib/quotes/poster-mapping.ts`; `actions/quotes.ts`, `actions/quote-poster.ts`; `components/admin/itinerary-content-schema.ts`, `components/admin/itinerary-fields/*`, `components/admin/use-form-import.tsx`, `components/admin/quote-form.tsx`, `components/admin/quote-form-schema.ts`, `components/admin/quote-table.tsx`, `components/admin/quote-package-picker.tsx`; `app/admin/(dashboard)/quotes/{page,loading}.tsx`, `quotes/new/page.tsx`, `quotes/[id]/page.tsx`, `quotes/[id]/pdf/route.ts`; verify scripts above.

**Modified:** `lib/pdf/package-pdf.tsx`; `actions/package-poster.ts`; `lib/packages/poster-prompt.ts`, `lib/packages/poster-mapping.ts` (`UnmappedField.field` widened to string); `components/admin/package-form.tsx`, `package-form-schema.ts`, `poster-import-button.tsx`, `poster-import-context.tsx`; `app/admin/(dashboard)/packages/[id]/page.tsx`; `lib/auth/dal.ts`; `app/admin/(dashboard)/layout.tsx`, `components/admin/admin-nav.tsx`; `components/admin/account-form.tsx`, `account-form-schema.ts`, `users-table.tsx`; `actions/users.ts`; `types/database.ts`; `package.json` scripts.
