# Package Import from Poster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin upload a tour-package poster on the add-package screen and have Claude pre-fill the package form from it, with a banner naming every field the poster didn't supply.

**Architecture:** A pure mapping function converts a nullable "what the poster literally says" extraction into `Partial<PackageFormValues>` plus a list of unmapped fields — this holds all the business rules and is verified with zero API spend. A Server Action wraps it with a permission gate, file validation, and one `client.messages.parse()` vision call. A one-`useState` React context carries the result from the header button down to the form, which resets itself from it.

**Tech Stack:** Next.js 16 App Router (Server Actions), React 19, TypeScript, Zod 4, react-hook-form, `@anthropic-ai/sdk` 0.122.x, Supabase, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-29-poster-package-import-design.md`

## Global Constraints

- **Never invent data.** The model returns `null` for anything not printed on the poster. Every mapping rule prefers a flagged gap over a plausible guess.
- **Nothing is dropped silently.** When a list row is discarded (a travel date with no year, an itinerary day missing its description), that field is flagged even if other rows survived. A partial import that looks complete is the feature's worst failure mode.
- **Pricing direction is load-bearing.** The public site renders `price_per_pax - discount_amount` with `price_per_pax` struck through. A poster showing ~~₱6,999~~ ₱5,999 maps to `pricePerPax: 6999, discountAmount: 1000`. Inverting this misprices a live package.
- **Nothing is written to the database by the import.** It fills the in-memory form only; `updatePackage` remains the sole write path.
- **Add-only gate:** the button renders only when `pkg.destination_id === null` (never successfully saved). No migration, no new column, no URL param.
- **Model is env-switchable:** `POSTER_EXTRACTION_MODEL`, defaulting to `claude-opus-5`. Do **not** pass `thinking` or `output_config.effort` — both are unsupported on `claude-haiku-4-5`, which must remain a drop-in switch.
- **Poster size cap: 3.5 MB raw** (`MAX_POSTER_BYTES`). Base64 inflates ~33% and the API's cap is 5 MB *encoded*.
- **No test framework in this repo.** Verification is a standalone `scripts/verify-*.ts` run through `tsx`, following `scripts/verify-unsubscribe-token-secret.ts` (a `CheckResult` array, a PASS/FAIL summary, `process.exit(1)` on any failure).
- **Node 20** (`v20.19.x`). `--env-file=.env.local` is available; `--env-file-if-exists` is **not** (Node 22.9+). Only async functions may be exported from a `"use server"` module — shared constants belong in a plain `lib/` module.
- **Zod is v4** (`zod@^4.4.3`); `@anthropic-ai/sdk` peer-accepts `^3.25.0 || ^4.0.0`, and its `helpers/zod` imports `zod/v4`. Import `z` from `"zod"` as the rest of the repo does.

---

### Task 1: Extraction schema and the pure mapper

The heart of the feature. Everything here is pure — no SDK, no Supabase, no React — so it is fully verifiable offline.

**Files:**
- Create: `lib/packages/poster-prompt.ts`
- Create: `lib/packages/poster-mapping.ts`
- Create: `scripts/verify-poster-extraction.ts`
- Modify: `package.json` (add the `verify:poster-extraction` script)

**Interfaces:**
- Consumes: `PackageFormValues` from `components/admin/package-form-schema.ts`.
- Produces:
  - `PosterExtractionSchema` (Zod) and `type PosterExtraction` from `lib/packages/poster-prompt.ts`
  - `buildPosterSystemPrompt(destinationNames: string[]): string`
  - `mapPosterToFormValues(raw: PosterExtraction, destinations: { id: string; name: string }[]): PosterMappingResult`
  - `type UnmappedField = { field: keyof PackageFormValues; label: string; tab: string; reason: string }`
  - `type PosterMappingResult = { values: Partial<PackageFormValues>; unmapped: UnmappedField[] }`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-poster-extraction.ts`:

```ts
/**
 * Offline proof for lib/packages/poster-mapping.ts. Mirrors
 * scripts/verify-unsubscribe-token-secret.ts's structure (CheckResult type,
 * structured PASS/FAIL summary, process.exit(1) on any failure) but needs no
 * Supabase client, no network, and no ANTHROPIC_API_KEY -- every check runs
 * the pure mapper against a hand-written PosterExtraction fixture.
 *
 * Run via `npm run verify:poster-extraction`.
 */
import { packageFormSchema } from "../components/admin/package-form-schema";
import type { PosterExtraction } from "../lib/packages/poster-prompt";
import { mapPosterToFormValues } from "../lib/packages/poster-mapping";

type CheckResult = { name: string; pass: boolean; detail: string };

const DESTINATIONS = [
  { id: "dest-coron", name: "Coron" },
  { id: "dest-elnido", name: "El Nido" },
  { id: "dest-baguio", name: "Baguio" },
];

/** A poster where every single field is absent -- the "flag everything" base. */
function emptyPoster(): PosterExtraction {
  return {
    name: null,
    destinationName: null,
    pricePerPax: null,
    originalPricePerPax: null,
    durationLabel: null,
    remarks: null,
    travelDates: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    bringItems: [],
  };
}

function poster(overrides: Partial<PosterExtraction>): PosterExtraction {
  return { ...emptyPoster(), ...overrides };
}

function flaggedFields(unmapped: { field: string }[]): string[] {
  return unmapped.map((entry) => entry.field);
}

const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
}

// --- 1. Struck-through pricing (the inversion guard) ---------------------
function checkStruckThroughPricing(): void {
  const { values } = mapPosterToFormValues(
    poster({ pricePerPax: 5999, originalPricePerPax: 6999 }),
    DESTINATIONS
  );
  const pass = values.pricePerPax === 6999 && values.discountAmount === 1000;
  record(
    "Struck-through price maps to pre-discount pricePerPax + discountAmount",
    pass,
    pass
      ? "6999 / 1000 (renders as struck 6999, pay 5999)"
      : `expected 6999/1000, got ${values.pricePerPax}/${values.discountAmount}`
  );
}

// --- 2. Single price leaves discount unset -------------------------------
function checkSinglePrice(): void {
  const { values } = mapPosterToFormValues(
    poster({ pricePerPax: 5999 }),
    DESTINATIONS
  );
  const pass = values.pricePerPax === 5999 && values.discountAmount === undefined;
  record(
    "Single printed price leaves discountAmount unset",
    pass,
    pass ? "5999 / undefined" : `got ${values.pricePerPax}/${values.discountAmount}`
  );
}

// --- 3. Non-positive discount is dropped and flagged ---------------------
function checkInvertedDiscount(): void {
  const { values, unmapped } = mapPosterToFormValues(
    poster({ pricePerPax: 6999, originalPricePerPax: 5999 }),
    DESTINATIONS
  );
  const pass =
    values.discountAmount === undefined &&
    values.pricePerPax === 6999 &&
    flaggedFields(unmapped).includes("discountAmount");
  record(
    "A 'was' price lower than the current price is dropped and flagged",
    pass,
    pass
      ? "discountAmount undefined and flagged"
      : `got ${values.discountAmount}, flags: ${flaggedFields(unmapped).join(",")}`
  );
}

// --- 4. Unusable prices are flagged --------------------------------------
function checkUnusablePrice(): void {
  for (const [label, value] of [
    ["null", null],
    ["zero", 0],
    ["negative", -100],
  ] as const) {
    const { values, unmapped } = mapPosterToFormValues(
      poster({ pricePerPax: value }),
      DESTINATIONS
    );
    const pass =
      values.pricePerPax === undefined &&
      flaggedFields(unmapped).includes("pricePerPax");
    record(
      `A ${label} price is left unset and flagged`,
      pass,
      pass ? "flagged" : `got ${values.pricePerPax}, flags: ${flaggedFields(unmapped).join(",")}`
    );
  }
}

// --- 5. Destination matching ---------------------------------------------
function checkDestinationMatching(): void {
  const cases: { poster: string; expectId: string | null; label: string }[] = [
    { poster: "Coron", expectId: "dest-coron", label: "exact match" },
    { poster: "  el nido  ", expectId: "dest-elnido", label: "case/whitespace-insensitive match" },
    { poster: "Coron, Palawan", expectId: "dest-coron", label: "substring match" },
    { poster: "Siargao", expectId: null, label: "no match" },
  ];

  for (const testCase of cases) {
    const { values, unmapped } = mapPosterToFormValues(
      poster({ destinationName: testCase.poster }),
      DESTINATIONS
    );
    const flagged = flaggedFields(unmapped).includes("destinationId");
    const pass =
      testCase.expectId === null
        ? values.destinationId === undefined && flagged
        : values.destinationId === testCase.expectId && !flagged;
    record(
      `Destination ${testCase.label}: "${testCase.poster}"`,
      pass,
      pass ? `-> ${values.destinationId ?? "flagged"}` : `got ${values.destinationId}, flagged=${flagged}`
    );
  }

  // An unmatched destination must surface the raw poster text for the admin.
  const { unmapped } = mapPosterToFormValues(
    poster({ destinationName: "Siargao" }),
    DESTINATIONS
  );
  const reason = unmapped.find((entry) => entry.field === "destinationId")?.reason ?? "";
  const pass = reason.includes("Siargao");
  record(
    "An unmatched destination quotes the raw poster text in its reason",
    pass,
    pass ? `reason: "${reason}"` : `reason did not mention the poster text: "${reason}"`
  );

  // Ambiguity must flag rather than silently pick one.
  const ambiguous = mapPosterToFormValues(
    poster({ destinationName: "Coron Island and El Nido Hopping" }),
    DESTINATIONS
  );
  const ambiguousPass =
    ambiguous.values.destinationId === undefined &&
    flaggedFields(ambiguous.unmapped).includes("destinationId");
  record(
    "A poster naming two known destinations is flagged, not silently resolved",
    ambiguousPass,
    ambiguousPass ? "flagged" : `got ${ambiguous.values.destinationId}`
  );
}

// --- 6. Travel dates ------------------------------------------------------
function checkTravelDates(): void {
  const valid = mapPosterToFormValues(
    poster({
      travelDates: [{ dateFrom: "2026-03-14", dateTo: "2026-03-16", additionalFee: 500 }],
    }),
    DESTINATIONS
  );
  const validPass =
    valid.values.travelDates?.length === 1 &&
    valid.values.travelDates[0].dateFrom === "2026-03-14" &&
    valid.values.travelDates[0].additionalFee === 500;
  record(
    "A complete date range with a surcharge is kept",
    validPass,
    validPass ? "kept" : JSON.stringify(valid.values.travelDates)
  );

  const missingYear = mapPosterToFormValues(
    poster({ travelDates: [{ dateFrom: null, dateTo: null, additionalFee: null }] }),
    DESTINATIONS
  );
  const missingYearPass =
    missingYear.values.travelDates === undefined &&
    flaggedFields(missingYear.unmapped).includes("travelDates");
  record(
    "A date row with no year is dropped and Travel Dates is flagged",
    missingYearPass,
    missingYearPass ? "dropped + flagged" : JSON.stringify(missingYear.values.travelDates)
  );

  const reversed = mapPosterToFormValues(
    poster({
      travelDates: [{ dateFrom: "2026-03-16", dateTo: "2026-03-14", additionalFee: null }],
    }),
    DESTINATIONS
  );
  const reversedPass =
    reversed.values.travelDates === undefined &&
    flaggedFields(reversed.unmapped).includes("travelDates");
  record(
    "A range whose end precedes its start is dropped and flagged",
    reversedPass,
    reversedPass ? "dropped + flagged" : JSON.stringify(reversed.values.travelDates)
  );

  const garbage = mapPosterToFormValues(
    poster({
      travelDates: [{ dateFrom: "March 14", dateTo: "2026-02-30", additionalFee: null }],
    }),
    DESTINATIONS
  );
  const garbagePass = garbage.values.travelDates === undefined;
  record(
    "Non-ISO and calendar-invalid dates are dropped",
    garbagePass,
    garbagePass ? "dropped" : JSON.stringify(garbage.values.travelDates)
  );
}

// --- 7. List cleaning -----------------------------------------------------
function checkLists(): void {
  const { values, unmapped } = mapPosterToFormValues(
    poster({
      inclusions: ["  Hotel  ", "", "   ", "Van transfers"],
      exclusions: [],
      bringItems: ["Sunblock"],
      itinerary: [
        { title: " Arrival ", description: " Check in " },
        { title: "", description: "orphan" },
        { title: "Departure", description: "" },
      ],
    }),
    DESTINATIONS
  );

  const inclusionsPass =
    values.inclusions?.length === 2 &&
    values.inclusions[0].label === "Hotel" &&
    values.inclusions[1].label === "Van transfers";
  record(
    "Blank and whitespace-only list entries are dropped, values trimmed",
    inclusionsPass,
    inclusionsPass ? "2 clean rows" : JSON.stringify(values.inclusions)
  );

  const itineraryPass =
    values.itinerary?.length === 1 && values.itinerary[0].title === "Arrival";
  record(
    "Itinerary days missing a title or description are dropped",
    itineraryPass,
    itineraryPass ? "1 complete day" : JSON.stringify(values.itinerary)
  );

  const emptyListPass = flaggedFields(unmapped).includes("exclusions");
  record(
    "An empty list is flagged",
    emptyListPass,
    emptyListPass ? "exclusions flagged" : flaggedFields(unmapped).join(",")
  );
}

// --- 8. Remarks is optional and never flagged -----------------------------
function checkRemarksNeverFlagged(): void {
  const { unmapped } = mapPosterToFormValues(emptyPoster(), DESTINATIONS);
  const pass = !flaggedFields(unmapped).includes("remarks");
  record(
    "Remarks is never flagged (optional in the schema, absent from most posters)",
    pass,
    pass ? "not flagged" : "remarks was flagged"
  );
}

// --- 9. The invariant tying the banner to real validation -----------------
function checkSchemaInvariant(): void {
  const fixtures: { label: string; value: PosterExtraction }[] = [
    { label: "wholly empty poster", value: emptyPoster() },
    {
      label: "partial poster",
      value: poster({ name: "Coron Escape", pricePerPax: 5999, destinationName: "Siargao" }),
    },
    {
      label: "complete poster",
      value: poster({
        name: "Coron Island Escape",
        destinationName: "Coron",
        pricePerPax: 5999,
        originalPricePerPax: 6999,
        durationLabel: "3 days, 2 nights",
        travelDates: [{ dateFrom: "2026-03-14", dateTo: "2026-03-16", additionalFee: null }],
        itinerary: [{ title: "Arrival", description: "Check in and rest" }],
        inclusions: ["Hotel"],
        exclusions: ["Airfare"],
        bringItems: ["Sunblock"],
      }),
    },
  ];

  const EMPTY_FORM = {
    name: "",
    pricePerPax: 0,
    discountAmount: undefined,
    durationLabel: "",
    destinationId: "",
    remarks: "",
    travelDates: [],
    itinerary: [],
    inclusions: [],
    exclusions: [],
    bringItems: [],
  };

  for (const fixture of fixtures) {
    const { values, unmapped } = mapPosterToFormValues(fixture.value, DESTINATIONS);
    const parsed = packageFormSchema.safeParse({ ...EMPTY_FORM, ...values });
    const failingFields = parsed.success
      ? []
      : [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    const flagged = flaggedFields(unmapped);
    const unexplained = failingFields.filter((field) => !flagged.includes(field));
    const pass = unexplained.length === 0;
    record(
      `Every schema failure is flagged in the banner (${fixture.label})`,
      pass,
      pass
        ? parsed.success
          ? "form is fully valid, nothing to explain"
          : `all ${failingFields.length} invalid field(s) flagged`
        : `unflagged invalid fields: ${unexplained.join(", ")}`
    );
  }
}

function main(): void {
  checkStruckThroughPricing();
  checkSinglePrice();
  checkInvertedDiscount();
  checkUnusablePrice();
  checkDestinationMatching();
  checkTravelDates();
  checkLists();
  checkRemarksNeverFlagged();
  checkSchemaInvariant();

  console.log("\nPoster extraction mapping checks\n");
  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.name}\n      ${result.detail}`);
  }

  const failed = results.filter((result) => !result.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
  if (failed > 0) process.exit(1);
}

main();
```

- [ ] **Step 2: Register the npm script**

In `package.json`, add to `scripts` (after `verify:bulk-email-status`):

```json
"verify:poster-extraction": "tsx scripts/verify-poster-extraction.ts",
```

No `--env-file` — these checks are pure and need no secrets.

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run verify:poster-extraction`
Expected: FAIL — module resolution error, `Cannot find module '../lib/packages/poster-mapping'`. This is the red state; the mapper doesn't exist yet.

- [ ] **Step 4: Write the extraction schema and prompt**

Create `lib/packages/poster-prompt.ts`:

```ts
import { z } from "zod";

/**
 * What Claude is asked to report from a poster image: a literal
 * transcription, not the form's shape. Every scalar is `.nullable()` rather
 * than `.optional()` -- structured outputs require every property to be
 * present, and an explicit null is the signal the banner is built on
 * ("the poster doesn't say"). Deriving form fields from these raw
 * observations is poster-mapping.ts's job, not the model's.
 */
export const PosterExtractionSchema = z.object({
  name: z.string().nullable(),
  destinationName: z.string().nullable(),
  pricePerPax: z.number().nullable(),
  originalPricePerPax: z.number().nullable(),
  durationLabel: z.string().nullable(),
  remarks: z.string().nullable(),
  travelDates: z.array(
    z.object({
      dateFrom: z.string().nullable(),
      dateTo: z.string().nullable(),
      additionalFee: z.number().nullable(),
    })
  ),
  itinerary: z.array(
    z.object({ title: z.string(), description: z.string() })
  ),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()),
  bringItems: z.array(z.string()),
});

export type PosterExtraction = z.infer<typeof PosterExtractionSchema>;

/**
 * The destination list is supplied for context only -- the model still
 * reports whatever the poster prints, and poster-mapping.ts does the
 * matching. Letting the model pick an id would hide near-misses that the
 * admin needs to see and correct.
 */
export function buildPosterSystemPrompt(destinationNames: string[]): string {
  const known =
    destinationNames.length > 0
      ? destinationNames.map((name) => `- ${name}`).join("\n")
      : "- (none configured yet)";

  return `You read Philippine tour-package marketing posters and transcribe what is printed on them into structured data for a travel agency's admin system.

THE ONE RULE THAT MATTERS: TRANSCRIBE, NEVER INFER. If a value is not printed on the poster, return null (or an empty array). Do not guess it, do not compute a plausible value, and do not fill it in from general knowledge about the destination. A null is useful -- it tells the admin exactly what they still need to type. A guess is harmful -- these values are published to a public website customers book against.

Fields:

- name: the package or tour title exactly as printed.
- destinationName: the place as printed. Do not normalize, expand, or correct it.
- pricePerPax: the per-person price a customer pays today, as a plain number with no currency symbol or thousands separators (a poster reading "PHP 5,999" gives 5999). If several per-person tiers are shown, use the lowest. Ignore prices that are not per-person (per-group rates, optional add-ons).
- originalPricePerPax: fill this ONLY when the poster shows a higher "was", "regular", or struck-through per-person price next to the current one. Otherwise null. Never derive it from a percentage.
- durationLabel: as printed, e.g. "3 days, 2 nights" or "4D3N".
- remarks: fine print, disclaimers, or booking conditions. Otherwise null.
- travelDates: one entry per departure date range printed. dateFrom and dateTo must be full ISO "YYYY-MM-DD" dates. IF THE POSTER DOES NOT PRINT A YEAR FOR A DATE, RETURN NULL FOR THAT DATE -- do not assume the current year, the next year, or anything else. additionalFee is a surcharge printed for that specific range (e.g. a peak-season upcharge), otherwise null.
- itinerary: one entry per day. For "Day 1 - Arrival & City Tour", title is "Arrival & City Tour" and description is the activities listed under it. Empty array if the poster has no day-by-day breakdown.
- inclusions: what the price covers ("Inclusions", "Package includes").
- exclusions: what it does not cover ("Exclusions", "Not included").
- bringItems: what the traveler should bring ("What to bring", "Reminders").

Each list entry is one short line of plain text as printed, with bullet characters and leading dashes removed.

Destinations already configured in this system, for your reference only. Still report destinationName exactly as the poster prints it, even when it is not on this list:
${known}`;
}
```

- [ ] **Step 5: Write the pure mapper**

Create `lib/packages/poster-mapping.ts`:

```ts
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import type { PosterExtraction } from "./poster-prompt";

/**
 * One field the poster couldn't fill in. `tab` names the PackageForm tab the
 * admin needs to visit; `reason` is shown verbatim in the import banner, so
 * it is written as a complete sentence addressed to the admin.
 */
export type UnmappedField = {
  field: keyof PackageFormValues;
  label: string;
  tab: string;
  reason: string;
};

export type PosterMappingResult = {
  values: Partial<PackageFormValues>;
  unmapped: UnmappedField[];
};

type Destination = { id: string; name: string };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Rejects both non-ISO shapes ("March 14") and calendar-invalid ISO strings
 * ("2026-02-30", which Date happily rolls forward to March 2nd) -- the
 * round-trip comparison catches the rollover.
 */
function isValidIsoDate(value: string | null): value is string {
  if (value === null || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function toLabelRows(entries: string[]): { label: string }[] {
  return entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((label) => ({ label }));
}

/**
 * Resolves the poster's destination text against the real destination rows,
 * widening from strictest to loosest. Anything ambiguous is deliberately
 * reported as unmatched: silently picking one of two plausible destinations
 * is the kind of error an admin would never think to check for.
 */
function matchDestination(
  rawName: string | null,
  destinations: Destination[]
): { id: string } | { reason: string } {
  const text = cleanText(rawName);
  if (text === null) {
    return {
      reason:
        "The poster doesn't name a destination. Pick one on the Details tab.",
    };
  }

  const needle = normalize(text);

  const exact = destinations.filter((d) => normalize(d.name) === needle);
  if (exact.length === 1) return { id: exact[0].id };

  // "Coron, Palawan" contains the configured destination "Coron".
  const contained = destinations.filter((d) => needle.includes(normalize(d.name)));
  if (contained.length === 1) return { id: contained[0].id };

  if (contained.length > 1) {
    const names = contained.map((d) => d.name).join(", ");
    return {
      reason: `The poster says "${text}", which matches more than one destination (${names}). Pick the right one on the Details tab.`,
    };
  }

  return {
    reason: `The poster says "${text}", which doesn't match any destination. Pick one on the Details tab, or add it under Packages -> Destinations.`,
  };
}

/**
 * Converts a literal poster transcription into form values, dropping
 * anything packageFormSchema would reject and recording why. Pure: no I/O,
 * no SDK, no Supabase -- which is what lets scripts/verify-poster-extraction.ts
 * cover every rule without spending an API call.
 */
export function mapPosterToFormValues(
  raw: PosterExtraction,
  destinations: Destination[]
): PosterMappingResult {
  const values: Partial<PackageFormValues> = {};
  const unmapped: UnmappedField[] = [];

  const flag = (
    field: keyof PackageFormValues,
    label: string,
    tab: string,
    reason: string
  ): void => {
    unmapped.push({ field, label, tab, reason });
  };

  const name = cleanText(raw.name);
  if (name !== null) {
    values.name = name;
  } else {
    flag(
      "name",
      "Package name",
      "details",
      "The poster doesn't show a package title. Type one on the Details tab."
    );
  }

  const destination = matchDestination(raw.destinationName, destinations);
  if ("id" in destination) {
    values.destinationId = destination.id;
  } else {
    flag("destinationId", "Destination", "details", destination.reason);
  }

  // Pricing. pricePerPax on the form is the PRE-discount price: the public
  // site renders `price_per_pax - discount_amount` with price_per_pax struck
  // through. So a poster showing "was 6999, now 5999" becomes
  // pricePerPax 6999 + discountAmount 1000, NOT pricePerPax 5999.
  const current =
    raw.pricePerPax !== null ? Math.round(raw.pricePerPax) : null;
  const original =
    raw.originalPricePerPax !== null
      ? Math.round(raw.originalPricePerPax)
      : null;

  if (current === null || current <= 0) {
    flag(
      "pricePerPax",
      "Price per pax",
      "details",
      "The poster doesn't show a usable per-person price. Enter it on the Details tab."
    );
  } else if (original === null) {
    values.pricePerPax = current;
  } else {
    const discount = original - current;
    if (discount > 0 && discount < original) {
      values.pricePerPax = original;
      values.discountAmount = discount;
    } else {
      values.pricePerPax = current;
      flag(
        "discountAmount",
        "Discount",
        "details",
        `The poster's "was" price (${original}) isn't higher than its current price (${current}), so no discount was applied. Check the Details tab.`
      );
    }
  }

  const durationLabel = cleanText(raw.durationLabel);
  if (durationLabel !== null) {
    values.durationLabel = durationLabel;
  } else {
    flag(
      "durationLabel",
      "Duration",
      "details",
      "The poster doesn't state how long the tour runs. Enter it on the Details tab."
    );
  }

  // Remarks is optional in packageFormSchema and absent from most posters --
  // flagging it would put a line in the banner on every single import.
  const remarks = cleanText(raw.remarks);
  if (remarks !== null) values.remarks = remarks;

  const travelDates: PackageFormValues["travelDates"] = [];
  let droppedDateRows = 0;
  for (const row of raw.travelDates) {
    const from = row.dateFrom;
    const to = row.dateTo;
    if (!isValidIsoDate(from) || !isValidIsoDate(to) || to < from) {
      droppedDateRows += 1;
      continue;
    }
    const fee = row.additionalFee !== null ? Math.round(row.additionalFee) : null;
    travelDates.push({
      dateFrom: from,
      dateTo: to,
      additionalFee: fee !== null && fee > 0 ? fee : undefined,
    });
  }
  if (travelDates.length > 0) {
    values.travelDates = travelDates;
    // A partial drop is the case the banner exists for: some dates imported,
    // others vanished. Staying silent here loses a departure the poster
    // actually printed.
    if (droppedDateRows > 0) {
      flag(
        "travelDates",
        "Travel dates",
        "travel-dates",
        `${droppedDateRows} of ${raw.travelDates.length} date ranges on the poster couldn't be used (most often a missing year) and ${droppedDateRows === 1 ? "was" : "were"} dropped. Check the Travel Dates tab.`
      );
    }
  } else {
    flag(
      "travelDates",
      "Travel dates",
      "travel-dates",
      raw.travelDates.length > 0
        ? "The poster's dates are missing a year, so they couldn't be used. Add them on the Travel Dates tab."
        : "The poster doesn't show departure dates. Add at least one on the Travel Dates tab."
    );
  }

  const itinerary = raw.itinerary
    .map((day) => ({
      title: day.title.trim(),
      description: day.description.trim(),
    }))
    .filter((day) => day.title.length > 0 && day.description.length > 0);
  if (itinerary.length > 0) {
    values.itinerary = itinerary;
    const droppedDays = raw.itinerary.length - itinerary.length;
    // Same partial-drop reasoning as travel dates: an itinerary day missing
    // its title or description silently vanishing is worse than a visible
    // flag the admin can act on.
    if (droppedDays > 0) {
      flag(
        "itinerary",
        "Itinerary",
        "itinerary",
        `${droppedDays} day${droppedDays === 1 ? "" : "s"} on the poster ${droppedDays === 1 ? "was" : "were"} missing a title or description and ${droppedDays === 1 ? "was" : "were"} dropped. Check the Itinerary tab.`
      );
    }
  } else {
    flag(
      "itinerary",
      "Itinerary",
      "itinerary",
      "The poster doesn't show a day-by-day itinerary. Add days on the Itinerary tab."
    );
  }

  const listFields: {
    field: "inclusions" | "exclusions" | "bringItems";
    label: string;
    source: string[];
    reason: string;
  }[] = [
    {
      field: "inclusions",
      label: "Inclusions",
      source: raw.inclusions,
      reason:
        "The poster doesn't list what's included. Add items on the Inclusions tab.",
    },
    {
      field: "exclusions",
      label: "Exclusions",
      source: raw.exclusions,
      reason:
        "The poster doesn't list what's excluded. Add items on the Inclusions tab.",
    },
    {
      field: "bringItems",
      label: "What to bring",
      source: raw.bringItems,
      reason:
        "The poster doesn't list what travelers should bring. Add items on the Inclusions tab.",
    },
  ];

  for (const list of listFields) {
    const rows = toLabelRows(list.source);
    if (rows.length > 0) {
      values[list.field] = rows;
    } else {
      flag(list.field, list.label, "inclusions", list.reason);
    }
  }

  return { values, unmapped };
}
```

- [ ] **Step 6: Run the verification script and confirm every check passes**

Run: `npm run verify:poster-extraction`
Expected: PASS on all checks, `process.exit(0)`, ending with `N/N checks passed.`

If the schema-invariant check fails, an unflagged field is being left invalid — fix the mapper, not the check. That check is the whole point.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add lib/packages/poster-prompt.ts lib/packages/poster-mapping.ts scripts/verify-poster-extraction.ts package.json
git commit -m "feat: add poster extraction schema and pure form mapper"
```

---

### Task 2: The extraction Server Action

**Files:**
- Create: `lib/packages/poster-upload-limits.ts`
- Create: `actions/package-poster.ts`
- Modify: `package.json` (install `@anthropic-ai/sdk`)
- Modify: `.env.local` (add the two new vars, locally only — never committed)

**Interfaces:**
- Consumes: `PosterExtractionSchema` / `buildPosterSystemPrompt` (Task 1), `mapPosterToFormValues` / `PosterMappingResult` / `UnmappedField` (Task 1), `requirePermission` from `lib/auth/dal`, `createClient` from `lib/supabase/server`, `ActionResult` from `lib/action-result`.
- Produces:
  - `extractPackageFromPoster(input: { base64: string; mimeType: string }): Promise<PosterExtractionResult>` from `actions/package-poster.ts`
  - `type PosterExtractionResult = ActionResult & { values?: Partial<PackageFormValues>; unmapped?: UnmappedField[] }` from `actions/package-poster.ts`
  - `MAX_POSTER_BYTES`, `ACCEPTED_POSTER_MIME_TYPES`, `isAcceptedMimeType(value: string): value is AcceptedMimeType`, `type AcceptedMimeType` — all from `lib/packages/poster-upload-limits.ts`, **not** from the action (see Step 3)

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

Verify it resolved to 0.122.x or later: `npm ls @anthropic-ai/sdk`

- [ ] **Step 2: Add the environment variables**

Append to `.env.local` (this file is gitignored — do not commit it):

```
# Poster -> package extraction (Claude vision)
ANTHROPIC_API_KEY=<your key>
POSTER_EXTRACTION_MODEL=claude-opus-5
```

`POSTER_EXTRACTION_MODEL` is optional; the code defaults to `claude-opus-5`. Switch it to `claude-haiku-4-5` to cut per-poster cost ~5x once real accuracy is known.

- [ ] **Step 3: Write the upload limits module**

These constants are shared by the Server Action and by the client button in
Task 3, so they cannot live in the action file: **a `"use server"` module may
only export async functions.** Exporting a const from one is a build error in
Next.js. (Type-only exports are erased at compile time and remain fine.)

Create `lib/packages/poster-upload-limits.ts`:

```ts
/**
 * Shared between the poster Server Action and the client-side upload button.
 * Deliberately NOT in actions/package-poster.ts: a "use server" module may
 * only export async functions, so a const exported from there fails the
 * build.
 */

/**
 * The API's cap is 5 MB on the BASE64-ENCODED image, and base64 inflates a
 * payload by roughly a third -- so the raw file has to stay under ~3.75 MB.
 * 3.5 MB leaves headroom for the rest of the request.
 */
export const MAX_POSTER_BYTES = 3.5 * 1024 * 1024;

export const ACCEPTED_POSTER_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_POSTER_MIME_TYPES)[number];

export function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return (ACCEPTED_POSTER_MIME_TYPES as readonly string[]).includes(value);
}

export const OVERSIZED_POSTER_MESSAGE =
  "That poster is larger than 3.5 MB. Please resize it and try again.";

export const UNSUPPORTED_POSTER_MESSAGE =
  "Please upload a PNG, JPG, or WebP image.";
```

- [ ] **Step 4: Write the Server Action**

Create `actions/package-poster.ts`:

```ts
"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import {
  PosterExtractionSchema,
  buildPosterSystemPrompt,
} from "@/lib/packages/poster-prompt";
import {
  mapPosterToFormValues,
  type UnmappedField,
} from "@/lib/packages/poster-mapping";
import {
  MAX_POSTER_BYTES,
  isAcceptedMimeType,
  OVERSIZED_POSTER_MESSAGE,
  UNSUPPORTED_POSTER_MESSAGE,
} from "@/lib/packages/poster-upload-limits";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

// Only async functions may be exported from a "use server" module. A type
// alias is erased at compile time, so this one is fine.
export type PosterExtractionResult = ActionResult & {
  values?: Partial<PackageFormValues>;
  unmapped?: UnmappedField[];
};

/**
 * Reads a marketing poster image and returns package form values plus the
 * fields the poster didn't supply. Writes nothing -- the caller fills the
 * in-memory form and the admin still saves through updatePackage.
 *
 * The Anthropic client is constructed per call rather than at module scope
 * (same reasoning as lib/storage/r2-client.ts): a missing ANTHROPIC_API_KEY
 * then surfaces as a handled request-time error instead of breaking the
 * build for every page that transitively imports this module.
 */
export async function extractPackageFromPoster(input: {
  base64: string;
  mimeType: string;
}): Promise<PosterExtractionResult> {
  // AUTH-05 — same gate as every other package write path.
  await requirePermission("can_manage_packages");

  const mimeType = input.mimeType;
  if (!isAcceptedMimeType(mimeType)) {
    return { ok: false, error: UNSUPPORTED_POSTER_MESSAGE };
  }

  // base64 length -> decoded byte count, without allocating the buffer.
  const padding = input.base64.endsWith("==")
    ? 2
    : input.base64.endsWith("=")
      ? 1
      : 0;
  const decodedBytes = Math.floor((input.base64.length * 3) / 4) - padding;

  if (decodedBytes <= 0) {
    return { ok: false, error: "That file looks empty. Please pick another." };
  }

  if (decodedBytes > MAX_POSTER_BYTES) {
    return { ok: false, error: OVERSIZED_POSTER_MESSAGE };
  }

  const supabase = await createClient();
  const { data: destinationRows, error: destinationsError } = await supabase
    .from("destinations")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const destinations = destinationRows ?? [];

  try {
    const client = new Anthropic();

    // No `thinking` and no `output_config.effort`: both are rejected by
    // claude-haiku-4-5, which POSTER_EXTRACTION_MODEL must stay able to
    // select. Opus 5 runs adaptive thinking by default when omitted.
    const response = await client.messages.parse({
      model: process.env.POSTER_EXTRACTION_MODEL || "claude-opus-5",
      max_tokens: 16000,
      system: buildPosterSystemPrompt(destinations.map((d) => d.name)),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: input.base64,
              },
            },
            {
              type: "text",
              text: "Transcribe this tour package poster into the required structure.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(PosterExtractionSchema) },
    });

    if (!response.parsed_output) {
      return {
        ok: false,
        error:
          "Couldn't read this poster. Try a clearer image, or fill the form in manually.",
      };
    }

    const { values, unmapped } = mapPosterToFormValues(
      response.parsed_output,
      destinations
    );

    return { ok: true, values, unmapped };
  } catch (error) {
    // Most specific first — never string-match SDK error messages.
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth failed for poster extraction");
      return {
        ok: false,
        error:
          "Poster import isn't configured yet. Please contact your administrator.",
      };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        error: "The extraction service is busy. Please try again in a moment.",
      };
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return { ok: false, error: GENERIC_ERROR_MESSAGE };
    }
    console.error("Poster extraction failed:", error);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

The `const mimeType = input.mimeType` assignment before the guard is what lets the `isAcceptedMimeType` type predicate narrow it to the SDK's literal union — narrowing a property access like `input.mimeType` directly does not persist to the later `media_type` use.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add lib/packages/poster-upload-limits.ts actions/package-poster.ts package.json package-lock.json
git commit -m "feat: add poster extraction server action"
```

---

### Task 3: Context bridge and the Import from Poster button

After this task the button appears on unsaved drafts, runs a real extraction, and reports the outcome by toast. The form does not fill yet — that's Task 4.

**Files:**
- Create: `components/admin/poster-import-context.tsx`
- Create: `components/admin/poster-import-button.tsx`
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx`

**Interfaces:**
- Consumes: `extractPackageFromPoster` from `actions/package-poster.ts`; `MAX_POSTER_BYTES` / `ACCEPTED_POSTER_MIME_TYPES` / `isAcceptedMimeType` / `OVERSIZED_POSTER_MESSAGE` / `UNSUPPORTED_POSTER_MESSAGE` from `lib/packages/poster-upload-limits.ts` (both Task 2); `PosterMappingResult` (Task 1); `readFileAsBase64` from `lib/read-file-as-base64`.
- Produces:
  - `<PosterImportProvider>` and `usePosterImport(): { extraction: PosterMappingResult | null; importSeq: number; isDismissed: boolean; applyExtraction(r: PosterMappingResult): void; dismiss(): void }`
  - `<PosterImportButton />`

- [ ] **Step 1: Write the context**

Create `components/admin/poster-import-context.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { PosterMappingResult } from "@/lib/packages/poster-mapping";

type PosterImportContextValue = {
  extraction: PosterMappingResult | null;
  /**
   * Increments on every successful import. PackageForm keys its reset effect
   * on this rather than on the extraction object, so importing a second
   * poster with identical results still re-fills the form.
   */
  importSeq: number;
  isDismissed: boolean;
  applyExtraction: (result: PosterMappingResult) => void;
  dismiss: () => void;
};

const PosterImportContext = createContext<PosterImportContextValue | null>(null);

/**
 * Bridges the Import from Poster button (rendered in the page header) and
 * PackageForm (rendered below it) -- they sit on opposite branches of the
 * page tree, so a shared parent holds the one piece of state between them.
 */
export function PosterImportProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{
    result: PosterMappingResult;
    seq: number;
  } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  const applyExtraction = useCallback((result: PosterMappingResult) => {
    setState((previous) => ({ result, seq: (previous?.seq ?? 0) + 1 }));
    setIsDismissed(false);
  }, []);

  const dismiss = useCallback(() => setIsDismissed(true), []);

  const value = useMemo<PosterImportContextValue>(
    () => ({
      extraction: state?.result ?? null,
      importSeq: state?.seq ?? 0,
      isDismissed,
      applyExtraction,
      dismiss,
    }),
    [state, isDismissed, applyExtraction, dismiss]
  );

  return (
    <PosterImportContext value={value}>{children}</PosterImportContext>
  );
}

export function usePosterImport(): PosterImportContextValue {
  const context = useContext(PosterImportContext);
  if (context === null) {
    throw new Error("usePosterImport must be used within a PosterImportProvider");
  }
  return context;
}
```

Note: React 19 allows `<Context>` directly as a provider — no `.Provider` needed. If ESLint or the React version in use objects, change `<PosterImportContext value={value}>` to `<PosterImportContext.Provider value={value}>` and close it to match.

- [ ] **Step 2: Write the button**

Create `components/admin/poster-import-button.tsx`:

```tsx
"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { extractPackageFromPoster } from "@/actions/package-poster";
import {
  ACCEPTED_POSTER_MIME_TYPES,
  MAX_POSTER_BYTES,
  isAcceptedMimeType,
  OVERSIZED_POSTER_MESSAGE,
  UNSUPPORTED_POSTER_MESSAGE,
} from "@/lib/packages/poster-upload-limits";
import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { Button } from "@/components/ui/button";
import { usePosterImport } from "./poster-import-context";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

/**
 * Rendered in the package page header, and only for a package that has never
 * been saved (see app/admin/(dashboard)/packages/[id]/page.tsx). Uploads a
 * poster, hands the extraction to PosterImportProvider, and reports the
 * outcome -- it never writes to the database itself.
 */
export function PosterImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const { applyExtraction } = usePosterImport();

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    event.target.value = "";
    if (!file) return;

    if (!isAcceptedMimeType(file.type)) {
      toast.error(UNSUPPORTED_POSTER_MESSAGE);
      return;
    }

    if (file.size > MAX_POSTER_BYTES) {
      toast.error(OVERSIZED_POSTER_MESSAGE);
      return;
    }

    setIsExtracting(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await extractPackageFromPoster({
        base64,
        mimeType: file.type,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      applyExtraction({
        values: result.values ?? {},
        unmapped: result.unmapped ?? [],
      });

      const filledCount = Object.keys(result.values ?? {}).length;
      const missingCount = result.unmapped?.length ?? 0;

      if (filledCount === 0) {
        toast.warning(
          "Nothing could be read from that poster. Try a clearer image, or fill the form in manually."
        );
      } else if (missingCount > 0) {
        toast.success(
          `Filled ${filledCount} field${filledCount === 1 ? "" : "s"} — ${missingCount} still need${missingCount === 1 ? "s" : ""} your attention.`
        );
      } else {
        toast.success(`Filled ${filledCount} fields from the poster.`);
      }
    } catch {
      toast.error(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsExtracting(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_POSTER_MIME_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="outline"
        size="lg"
        disabled={isExtracting}
        onClick={() => inputRef.current?.click()}
      >
        <SparklesIcon data-icon="inline-start" />
        {isExtracting ? "Reading poster..." : "Import from Poster"}
      </Button>
    </>
  );
}
```

- [ ] **Step 3: Wire it into the page**

In `app/admin/(dashboard)/packages/[id]/page.tsx`, add the imports:

```tsx
import { PosterImportProvider } from "@/components/admin/poster-import-context";
import { PosterImportButton } from "@/components/admin/poster-import-button";
```

Then replace the whole returned JSX block with:

```tsx
  // createDraftPackage inserts with destination_id unset, and updatePackage
  // can't succeed without one (packageFormSchema requires destinationId).
  // So a null destination means this package has never been saved -- i.e.
  // the admin is still adding it, which is the only time poster import is
  // offered.
  const isUnsavedDraft = pkg.destination_id === null;

  return (
    <PosterImportProvider>
      <div className="flex flex-col gap-6">
        <PageHeader title="Edit Package" description={`${pkg.name} · ${pkg.slug}`}>
          {isUnsavedDraft ? <PosterImportButton /> : null}
          <Button
            variant="outline"
            size="lg"
            render={<a href={`/admin/packages/${pkg.id}/pdf`} download />}
          >
            Download Full Itinerary
          </Button>
        </PageHeader>

        <PackageForm
          packageId={pkg.id}
          defaultValues={defaultValues}
          initialPhotos={photos}
          destinations={destinationOptions}
        />
      </div>
    </PosterImportProvider>
  );
```

Note the header's two buttons now need to sit together: `PageHeader` already lays its children out with `flex flex-wrap items-center justify-between gap-4`, and two sibling buttons will be spread apart. Wrap them so they stay grouped on the right:

```tsx
        <PageHeader title="Edit Package" description={`${pkg.name} · ${pkg.slug}`}>
          <div className="flex flex-wrap items-center gap-3">
            {isUnsavedDraft ? <PosterImportButton /> : null}
            <Button
              variant="outline"
              size="lg"
              render={<a href={`/admin/packages/${pkg.id}/pdf`} download />}
            >
              Download Full Itinerary
            </Button>
          </div>
        </PageHeader>
```

Use this wrapped version.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`

1. Go to `/admin/packages`, press **Add Package**. The edit page opens with **Import from Poster** to the left of **Download Full Itinerary**.
2. Upload a real poster. The button reads "Reading poster..." then a toast reports how many fields were filled and how many need attention. (The form itself stays empty — Task 4.)
3. Fill in the required fields by hand and press **Save Changes**, then reload. The **Import from Poster** button must be **gone**, because `destination_id` is now set.
4. Try a >3.5 MB image and a PDF: both are rejected by toast without a network call.

- [ ] **Step 6: Commit**

```bash
git add components/admin/poster-import-context.tsx components/admin/poster-import-button.tsx "app/admin/(dashboard)/packages/[id]/page.tsx"
git commit -m "feat: add Import from Poster button to unsaved package drafts"
```

---

### Task 4: The unmapped-fields banner and form pre-fill

**Files:**
- Create: `components/admin/poster-import-banner.tsx`
- Modify: `components/admin/package-form.tsx`
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx`

**Interfaces:**
- Consumes: `usePosterImport` (Task 3), `UnmappedField` (Task 1).
- Produces: `<PosterImportBanner />`.

- [ ] **Step 1: Write the banner**

Create `components/admin/poster-import-banner.tsx`:

```tsx
"use client";

import { TriangleAlertIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePosterImport } from "./poster-import-context";

const TAB_LABELS: Record<string, string> = {
  details: "Details",
  "travel-dates": "Travel Dates",
  itinerary: "Itinerary",
  inclusions: "Inclusions",
};

/**
 * Lists everything the poster couldn't supply after an import. Uses the
 * neutral card treatment (bg-card + ring-foreground/10) already used by the
 * packages empty state rather than the destructive palette -- an incomplete
 * import is a to-do list, not an error. The brand accent (--secondary) is
 * reserved for CTAs and badges, so it is deliberately not used here.
 *
 * The copy says "need your attention" rather than "couldn't be read":
 * an entry can also mean a field was PARTLY read (2 of 3 travel dates
 * imported), which "couldn't be read" would misdescribe.
 */
export function PosterImportBanner() {
  const { extraction, isDismissed, dismiss } = usePosterImport();

  if (extraction === null || isDismissed) return null;
  if (extraction.unmapped.length === 0) return null;

  const count = extraction.unmapped.length;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base leading-[1.3] font-semibold">
              {count} item{count === 1 ? "" : "s"} need{count === 1 ? "s" : ""} your
              attention
            </h2>
            <p className="text-sm leading-[1.5] text-muted-foreground">
              Everything the poster did supply has been filled in below. Review
              it, then handle the items listed here before saving.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <XIcon />
        </Button>
      </div>

      <ul className="flex flex-col gap-2 pl-6.5">
        {extraction.unmapped.map((entry) => (
          <li key={entry.field} className="text-sm leading-[1.5]">
            <span className="font-medium">{entry.label}</span>
            <span className="text-muted-foreground">
              {" "}
              ({TAB_LABELS[entry.tab] ?? entry.tab} tab) — {entry.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Render the banner on the page**

In `app/admin/(dashboard)/packages/[id]/page.tsx`, add the import:

```tsx
import { PosterImportBanner } from "@/components/admin/poster-import-banner";
```

and place it between the header and the form:

```tsx
        </PageHeader>

        <PosterImportBanner />

        <PackageForm
```

- [ ] **Step 3: Pre-fill the form from the extraction**

In `components/admin/package-form.tsx`:

Add to the imports at the top:

```tsx
import { useEffect, useState } from "react";
```

(replacing the existing `import { useState } from "react";`)

```tsx
import { usePosterImport } from "./poster-import-context";
```

Inside the `PackageForm` component, after the existing `pendingRemoval` state declaration, add:

```tsx
  const { extraction, importSeq } = usePosterImport();
  const [pendingImport, setPendingImport] = useState<PackageFormValues | null>(
    null
  );

  /**
   * A poster import replaces the whole form. On a fresh draft there is
   * nothing to lose, so apply it straight away; if the admin has already
   * typed something (e.g. importing a second poster), confirm first.
   * Keyed on importSeq, not on `extraction`, so re-importing a poster that
   * yields identical values still re-fills the form.
   */
  useEffect(() => {
    if (importSeq === 0 || extraction === null) return;

    const next: PackageFormValues = { ...EMPTY_DEFAULTS, ...extraction.values };

    if (form.formState.isDirty) {
      setPendingImport(next);
      return;
    }

    form.reset(next);
    setActiveTab("details");
    // form and extraction are stable for a given importSeq; re-running on
    // their identity would re-apply the import on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importSeq]);
```

Then add a second `AlertDialog` immediately after the existing `pendingRemoval` one (before `<FormActionBar>`):

```tsx
        <AlertDialog
          open={pendingImport !== null}
          onOpenChange={(open) => !open && setPendingImport(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace what you&apos;ve entered?</AlertDialogTitle>
              <AlertDialogDescription>
                Importing this poster will overwrite everything currently in
                this form, including any changes you&apos;ve typed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingImport) {
                    form.reset(pendingImport);
                    setActiveTab("details");
                  }
                  setPendingImport(null);
                }}
              >
                Replace
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Verify the full flow in the browser**

Run: `npm run dev`

1. **Add Package** → **Import from Poster** → upload a real TravelSentro poster.
2. The Details tab is selected and populated: name, destination (if it matches a configured one), price, duration.
3. The banner lists exactly the fields the poster didn't supply, each naming its tab.
4. Check the **Travel Dates**, **Itinerary**, and **Inclusions** tabs — anything the poster listed is there.
5. **Verify the pricing direction on a discounted poster:** the Price per pax field holds the *higher* struck-through number and Discount holds the difference. Save, then open the public package page and confirm the displayed price equals the poster's current price.
6. Dismiss the banner with the X; it stays dismissed until the next import.
7. Type something into Name, then import a second poster: the "Replace what you've entered?" dialog appears. Cancel keeps your text; Replace overwrites it.
8. Press **Save Changes**. The package saves normally, and after reload the Import button is gone.

- [ ] **Step 6: Commit**

```bash
git add components/admin/poster-import-banner.tsx components/admin/package-form.tsx "app/admin/(dashboard)/packages/[id]/page.tsx"
git commit -m "feat: pre-fill package form from poster and flag unmapped fields"
```

---

### Task 5: Live smoke test and documentation

Task 1's checks prove the mapping rules offline. This proves the SDK wiring, the prompt, and `zodOutputFormat`'s Zod 4 compatibility against the real API — exactly once, on demand.

**Files:**
- Modify: `scripts/verify-poster-extraction.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add the live mode to the verification script**

At the end of `scripts/verify-poster-extraction.ts`, replace the `main()` call with:

```ts
/**
 * Optional live check: `npm run verify:poster-extraction:live -- <path>`.
 * Costs one real API call. Proves the SDK wiring, the prompt, and
 * zodOutputFormat's Zod 4 compatibility -- none of which the offline checks
 * above can reach. Requires ANTHROPIC_API_KEY, which the :live npm script
 * supplies via `tsx --env-file=.env.local`.
 */
async function runLiveCheck(posterPath: string): Promise<void> {
  const { readFile } = await import("node:fs/promises");
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  const { PosterExtractionSchema, buildPosterSystemPrompt } = await import(
    "../lib/packages/poster-prompt"
  );

  const extension = posterPath.split(".").pop()?.toLowerCase();
  const mediaType =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : "image/jpeg";

  const base64 = (await readFile(posterPath)).toString("base64");
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: process.env.POSTER_EXTRACTION_MODEL || "claude-opus-5",
    max_tokens: 16000,
    system: buildPosterSystemPrompt(DESTINATIONS.map((d) => d.name)),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: "Transcribe this tour package poster into the required structure.",
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(PosterExtractionSchema) },
  });

  if (!response.parsed_output) {
    console.error("FAIL  Live extraction returned no parsed output.");
    process.exit(1);
  }

  console.log("\nRaw extraction:\n");
  console.log(JSON.stringify(response.parsed_output, null, 2));

  const mapped = mapPosterToFormValues(response.parsed_output, DESTINATIONS);
  console.log("\nMapped form values:\n");
  console.log(JSON.stringify(mapped.values, null, 2));
  console.log("\nUnmapped fields:\n");
  for (const entry of mapped.unmapped) {
    console.log(`  - ${entry.label} (${entry.tab}): ${entry.reason}`);
  }
  console.log(
    `\nTokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out\n`
  );
}

const liveIndex = process.argv.indexOf("--live");
if (liveIndex !== -1) {
  const posterPath = process.argv[liveIndex + 1];
  if (!posterPath) {
    console.error("Usage: npm run verify:poster-extraction:live -- <poster-image-path>");
    process.exit(1);
  }
  runLiveCheck(posterPath).catch((error) => {
    console.error("Live check failed:", error);
    process.exit(1);
  });
} else {
  main();
}
```

- [ ] **Step 2: Add a separate npm script for the live mode**

The live check needs `ANTHROPIC_API_KEY`; the offline checks must keep
running with no `.env.local` at all (fresh clone, CI). Do **not** add
`--env-file` to the existing script, and do not reach for
`--env-file-if-exists`: that flag landed in Node 22.9 and this project runs
Node 20 (`node --version` → v20.19.x), where it aborts with
`bad option`.

Instead, leave `verify:poster-extraction` exactly as Task 1 defined it and
add a second entry beside it in `package.json`, matching the
`tsx --env-file=.env.local` form the repo already uses for its other
credential-dependent scripts:

```json
"verify:poster-extraction": "tsx scripts/verify-poster-extraction.ts",
"verify:poster-extraction:live": "tsx --env-file=.env.local scripts/verify-poster-extraction.ts --live",
```

- [ ] **Step 3: Confirm the offline path still passes**

Run: `npm run verify:poster-extraction`
Expected: all checks PASS, exactly as in Task 1. The live branch must not run without `--live`.

- [ ] **Step 4: Run the live check once against a real poster**

Run: `npm run verify:poster-extraction:live -- ./path/to/a-real-poster.jpg`

Expected: the raw extraction JSON, the mapped form values, the unmapped list, and a token count. Read the raw output critically:
- Are any values present that are **not** printed on the poster? That is a prompt failure — the no-inference rule needs strengthening.
- Are dates without a printed year returned as `null` rather than guessed?
- On a discounted poster, is `originalPricePerPax` the higher number?

- [ ] **Step 5: Document the feature**

Add to `README.md`, in the environment-variable section:

```markdown
### Poster import (Claude vision)

The admin package screen can pre-fill a new package from a marketing poster
image. Requires:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Without it the button returns "Poster import isn't configured yet." |
| `POSTER_EXTRACTION_MODEL` | no | `claude-opus-5` | Set to `claude-haiku-4-5` for ~5x lower cost per poster, at some accuracy cost on cluttered posters. |

Roughly $0.08 (~₱4.50) per poster on the default model. The button appears
only on a package that has never been saved. Nothing is written to the
database by the import — it fills the form, and the admin saves as usual.

Verify the mapping rules offline (no API calls, no key needed):

    npm run verify:poster-extraction

Check a real poster end to end (one billed API call, needs `ANTHROPIC_API_KEY`
in `.env.local`):

    npm run verify:poster-extraction:live -- ./poster.jpg
```

- [ ] **Step 6: Full build**

Run: `npm run build`
Expected: builds cleanly. Confirms the per-call Anthropic client construction never trips a missing key at build time.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-poster-extraction.ts package.json README.md
git commit -m "feat: add live poster extraction smoke test and docs"
```

---

## Self-Review Notes

Checked against the spec:

- **Add vs. edit gate** → Task 3, Step 3 (`isUnsavedDraft`), manually verified in Task 3 Step 5.3.
- **Extraction contract, no-inference rule** → Task 1, Step 4; audited against a real poster in Task 5, Step 4.
- **Pricing direction** → Task 1 mapper + check 1 (the inversion guard) + Task 4 Step 5.5 (end-to-end on the public page).
- **All six mapping rules** → Task 1 Step 5, each with a matching check in Step 1.
- **Missing-year policy** → prompt (Task 1 Step 4) + mapper + check 6.
- **Remarks never flagged** → mapper + check 8.
- **Components touched** (7 files) → Tasks 1–4; all created or modified. One file the spec didn't anticipate was added: `lib/packages/poster-upload-limits.ts`, because a `"use server"` module can't export the shared constants.
- **Config** (`@anthropic-ai/sdk`, both env vars, per-call client) → Task 2 Steps 1–3; build-time safety proven in Task 5 Step 6.
- **Error handling** (typed catch chain, null `parsed_output`, MIME/size, empty-result case) → Task 2 Step 3 + Task 3 Step 2.
- **Testing** (8 offline check groups + flagged live test) → Tasks 1 and 5.
- **Out of scope** honored: no PDF support, no batch import, no R2 upload of the poster, no click-to-jump from banner rows.
