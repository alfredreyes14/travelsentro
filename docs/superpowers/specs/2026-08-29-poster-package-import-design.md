# Package Import from Poster — Design Spec

**Date:** 2026-08-29
**Status:** Approved by user, pending implementation plan.

## Summary

Tour packages are today typed into the admin form field by field, even though the business already has a finished marketing poster for each one carrying nearly all the same information. This adds an **Import from Poster** action to the package add flow: the admin uploads the poster image, Claude reads it, and the form is pre-filled with everything the poster actually says. A banner above the form lists every field the poster did *not* supply — so the admin knows exactly what still needs filling in rather than discovering it at submit time.

Nothing is written to the database by the import. The extraction fills the in-memory form; the admin reviews it and presses **Save Changes** exactly as before. The existing `updatePackage` write path and `packageFormSchema` validation are untouched, so an imported package is subject to precisely the same rules as a hand-typed one.

**In scope:** single raster poster (PNG/JPEG/WebP) → `PackageFormValues`, plus the unmapped-field banner.

**Out of scope:** PDF posters, multi-poster batch import, saving the poster into the package photo gallery, and click-a-banner-row-to-jump-to-that-tab. The poster is an import source only — it is sent to the API, used, and discarded, never uploaded to R2.

## Add vs. Edit

The user's requirement is that this appear during *add* and not during *edit*. There is no separate add screen: `createDraftPackage` (`actions/packages.ts`) inserts a minimal row and redirects to the shared edit page, so both states render `app/admin/(dashboard)/packages/[id]/page.tsx`.

The signal that separates them already exists and needs no migration:

- `createDraftPackage` inserts with `destination_id` unset (null).
- `updatePackage` validates against `packageFormSchema`, whose `destinationId` is `z.string().min(1)`, and always writes `destination_id`.

Therefore **`destination_id IS NULL` ⟺ the package has never been successfully saved through the form** — an exact definition of "still adding." The page computes `isUnsavedDraft = pkg.destination_id === null` and renders the button only then. After the first Save Changes the button is permanently gone.

Rejected alternatives: a `?new=1` redirect param (lingers in the URL after saving, and is lost on refresh), and a new `updated_at`/`is_seeded` column (a migration for something already derivable).

## Architecture

```
PosterImportButton (client, in PageHeader)
  └─ file picker → readFileAsBase64() → extractPackageFromPoster()
                                              │  server action
                                              ├─ requirePermission("can_manage_packages")
                                              ├─ validate MIME + decoded size
                                              ├─ load active destinations (id, name)
                                              ├─ client.messages.parse()  ← poster image
                                              └─ mapPosterToFormValues()  ← pure, testable
                                                     ↓
                                        { values, unmapped }
                                              ↓  via PosterImportContext
              ┌───────────────────────────────┴───────────────┐
        PosterImportBanner                              PackageForm
        (lists unmapped fields)                    (form.reset(values))
```

The button sits in the `PageHeader` and the form sits below it — opposite sides of the page's component tree. A minimal client context (`PosterImportContext`, one `useState`) bridges them, with the Server Component page wrapping both children in the provider. This keeps `package-form.tsx` (721 lines) untouched apart from one `useEffect` and one banner render — no lifting of its `useForm` instance, no restructuring.

## Extraction Contract

The model is given the poster image, the list of real destination names, and a system prompt whose central rule is **never infer, never guess — return null for anything not printed on the poster**. The banner's trustworthiness depends entirely on this: it reports absence the model observed, not absence we inferred.

Structured output via `client.messages.parse()` with `zodOutputFormat()` from `@anthropic-ai/sdk/helpers/zod`. Every scalar is nullable:

```ts
const PosterExtractionSchema = z.object({
  name: z.string().nullable(),
  destinationName: z.string().nullable(),
  pricePerPax: z.number().nullable(),
  originalPricePerPax: z.number().nullable(),
  durationLabel: z.string().nullable(),
  remarks: z.string().nullable(),
  travelDates: z.array(z.object({
    dateFrom: z.string().nullable(),      // strict YYYY-MM-DD
    dateTo: z.string().nullable(),
    additionalFee: z.number().nullable(),
  })),
  itinerary: z.array(z.object({ title: z.string(), description: z.string() })),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()),
  bringItems: z.array(z.string()),
});
```

### Pricing — the one rule that must not invert

The public site renders `price_per_pax - discount_amount` with `price_per_pax` struck through (`components/packages/package-card.tsx:102`, `app/(public)/packages/[slug]/page.tsx:76`, `lib/pdf/package-pdf.tsx:223`). So `pricePerPax` is the **pre-discount** price, not the price the customer pays.

The model therefore reports two plain observations rather than the form's derived shape — `pricePerPax` (the price to pay now) and `originalPricePerPax` (a struck-through/"was" price, else null) — and the mapper derives the form fields:

| Poster shows | pricePerPax | discountAmount |
|---|---|---|
| `₱5,999` | 5999 | never auto-filled |
| ~~`₱6,999`~~ `₱5,999` | 6999 | never auto-filled — flagged with "enter 1000" |

**Discounts are always entered by hand** (user decision, 2026-08-31). The extraction still reads the markdown, but only to seed `pricePerPax` with the pre-discount figure and to tell the admin, in the banner, exactly what to type. The alternative — auto-filling the discount and seeding the marked-down price — is the one combination that silently undercharges, because an admin who then typed the discount would be discounting an already-discounted price.

Getting this backwards would misprice a package on the live public site, so it is stated explicitly in the prompt, encoded in the mapper, and covered by the verification script.

## Mapping Rules

`lib/packages/poster-mapping.ts` exports one **pure** function — no I/O, no SDK, no Supabase — which is what makes the whole feature testable without spending API calls:

```ts
export function mapPosterToFormValues(
  raw: PosterExtraction,
  destinations: { id: string; name: string }[],
): { values: Partial<PackageFormValues>; unmapped: UnmappedField[] }
```

```ts
export type UnmappedField = {
  field: keyof PackageFormValues;
  label: string;   // "Travel Dates"       — banner heading
  tab: string;     // "travel-dates"       — which tab to look in
  reason: string;  // one line explaining what happened
};
```

Each rule below encodes a constraint `packageFormSchema` already enforces, so the imported form can never be pre-filled into a state that fails validation:

- **Destination** — normalize (lowercase, trim, collapse whitespace) both sides, then: exact match → substring match (poster "Coron, Palawan" contains the row "Coron"). No match, or 2+ ambiguous matches, leaves `destinationId` unset and flags the field, carrying the raw poster text in `reason` (e.g. *poster says "Coron, Palawan" — no matching destination; pick one or add it under Packages → Destinations*). An earlier draft added a third "first comma-segment" tier; it was removed as unreachable — a first segment is always a substring of the whole string, so the substring tier already matches anything it could.
- **Price per pax** — `Math.round()`, must be `> 0` (schema requires `.int().positive()`). Absent, zero, or negative → flagged.
- **Discount** — never written to the form. When the poster shows a valid markdown (`originalPricePerPax - pricePerPax > 0`), `pricePerPax` takes the pre-discount figure and the banner names the exact amount to enter. An inverted or equal pair of prices leaves `pricePerPax` at the printed price and flags that no discount could be worked out.
- **Travel dates** — a row survives only with both `dateFrom` and `dateTo` as valid `YYYY-MM-DD` and `dateTo >= dateFrom` (the schema's `.refine()`). Flagged whenever **any** row is dropped, not only when all of them are: a poster listing three departures that quietly imports two is exactly the loss the banner exists to prevent.
- **Name / Duration** — trimmed; empty or null → flagged.
- **Remarks** — trimmed; optional in the schema and **never flagged**, since most posters have no remarks-equivalent and flagging it would be noise in every single import.
- **Itinerary** — days missing a title or description are dropped; flagged whenever any day is dropped or none survive, for the same reason as travel dates.
- **Inclusions / Exclusions / Bring items** — blank strings dropped; resulting empty array → flagged.

### Missing year on travel dates

Posters frequently print "MARCH 14–16" with no year. The model returns null for such a row rather than guessing, the row is dropped, and Travel Dates is flagged.

This is a deliberate choice of a visible gap over a silent wrong answer: a guessed year on dates customers book against is worse than an admin typing two dates. If it proves annoying against real posters, the alternative — infer the next future occurrence and flag it as assumed — is a contained change to this one function.

## Components Touched

- **`lib/packages/poster-mapping.ts`** (new) — the pure mapper above, plus `UnmappedField`. No dependencies on the SDK or Supabase.
- **`lib/packages/poster-prompt.ts`** (new) — the system prompt and `PosterExtractionSchema`, kept separate so prompt edits don't touch action code.
- **`lib/packages/poster-upload-limits.ts`** (new) — `MAX_POSTER_BYTES`, the accepted MIME list, and their user-facing rejection messages. Separate from the action because a `"use server"` module may only export async functions, and the client button needs these same values to reject a file before uploading it.
- **`actions/package-poster.ts`** (new) — `extractPackageFromPoster({ base64, mimeType })`. Permission gate, MIME/size validation, destination fetch, `messages.parse()`, mapper call. Returns `ActionResult & { values?, unmapped? }`, matching the repo's existing `ActionResult` convention (`lib/action-result.ts`).
- **`components/admin/poster-import-context.tsx`** (new, client) — provider + `usePosterImport()`. One `useState<PosterExtraction | null>`.
- **`components/admin/poster-import-button.tsx`** (new, client) — hidden `<input type="file">`, client-side size guard, pending state ("Reading poster…"), `toast` on success/failure. Reuses `lib/read-file-as-base64.ts`.
- **`components/admin/poster-import-banner.tsx`** (new, client) — renders when an extraction exists and `unmapped.length > 0`; lists each field's `label` + `reason` + which tab it's on; dismissible. Styled as a warning, consistent with existing admin surfaces.
- **`app/admin/(dashboard)/packages/[id]/page.tsx`** — computes `isUnsavedDraft`, wraps header + banner + form in the provider, renders the button before "Download Full Itinerary" when `isUnsavedDraft`.
- **`components/admin/package-form.tsx`** — one `useEffect` reacting to a new extraction: `form.reset({ ...EMPTY_DEFAULTS, ...values })` and switch to the Details tab. If `form.formState.isDirty`, first confirm via the `AlertDialog` already present in the file (reusing the `pendingRemoval` pattern) so a second import can't silently discard typed edits.

## Configuration

- New dependency: `@anthropic-ai/sdk`.
- New env vars: `ANTHROPIC_API_KEY`, and `POSTER_EXTRACTION_MODEL` defaulting to `claude-opus-5`. The model is env-switchable so it can be dropped to `claude-haiku-4-5` (~5x cheaper) once real accuracy and real bills are known, without a code change.
- The `Anthropic` client is constructed **per call inside the action**, mirroring the deliberate lazy pattern in `lib/storage/r2-client.ts`, so a missing key throws at request time rather than at build/import time.
- Cost at the default model is roughly $0.08 (~₱4.50) per poster; ~₱90/month at 20 posters. This is the project's first paid AI dependency and was approved with the env-switch escape hatch in place.

## Error Handling

Every failure returns a `{ ok: false, error }` the button surfaces via `toast.error` — no partial form fills, no thrown errors reaching the user.

- Typed SDK catch chain, most specific first: `AuthenticationError` → "AI extraction isn't configured. Contact your administrator."; `RateLimitError` → "The extraction service is busy. Try again in a moment."; `APIError` → generic. Never string-match error messages.
- `response.parsed_output === null` (schema parse failed) → "Couldn't read this poster. Try a clearer image, or fill the form in manually."
- Rejected MIME type or an oversized file → rejected client-side before the upload, and again server-side. The cap is **3.5 MB on the raw file**, not 5 MB: base64 inflates payloads by ~33%, and the API's limit is 5 MB on the *encoded* image, so a 5 MB file would arrive as ~6.7 MB and be rejected by the API. The error names the limit and suggests resizing.
- A successful call that yields nothing usable (every field null) is **not** an error: the form is left untouched and the banner reports that nothing could be read.

## Testing

No test framework exists in this repo; the convention is standalone `scripts/verify-*.ts` run through `tsx`. Because `mapPosterToFormValues` is pure, the important logic is verifiable with **zero API spend**:

`scripts/verify-poster-extraction.ts` (npm script `verify:poster-extraction`) asserts, against hand-written `PosterExtraction` fixtures:

1. Struck-through pricing → `pricePerPax: 6999`, discount unset and flagged with the exact figure to type (the inversion guard).
2. Single price → `pricePerPax` as printed, discount unset.
3. `discountAmount` is never auto-filled, across every pricing fixture.
4. Zero/negative/null price → flagged.
5. Destination exact and substring matches resolve to the right id; no-match and ambiguous-match flag with the raw text preserved.
6. A travel-date row with no year → dropped, Travel Dates flagged; `dateTo < dateFrom` → dropped.
7. Empty/whitespace list entries dropped; fully empty list → flagged.
8. **Every `values` object produced by the fixtures either passes `packageFormSchema` or has each failing field present in `unmapped`** — the invariant that ties the banner to real validation.

A separate live smoke test behind a flag (`--live`) runs one real poster end-to-end to confirm SDK wiring, prompt shape, and `zodOutputFormat` compatibility with the project's Zod 4.

Manual verification: add a package, import a real TravelSentro poster, confirm the pre-fill is correct, the banner names exactly the gaps, and Save Changes persists normally.
