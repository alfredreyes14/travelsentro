/**
 * Offline proof for lib/packages/poster-mapping.ts. Mirrors
 * scripts/verify-unsubscribe-token-secret.ts's structure (CheckResult type,
 * structured PASS/FAIL summary, process.exit(1) on any failure) but needs no
 * Supabase client, no network, and no ANTHROPIC_API_KEY -- every check runs
 * the pure mapper against a hand-written PosterExtraction fixture.
 *
 * Run via `npm run verify:poster-extraction`.
 */
import {
  packageFormSchema,
  EMPTY_DEFAULTS,
} from "../components/admin/package-form-schema";
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
  const { values, unmapped } = mapPosterToFormValues(
    poster({ pricePerPax: 5999, originalPricePerPax: 6999 }),
    DESTINATIONS
  );
  // pricePerPax takes the PRE-discount price so a hand-entered discount
  // subtracts from the right number. discountAmount is never auto-filled.
  const pass =
    values.pricePerPax === 6999 &&
    values.discountAmount === undefined &&
    flaggedFields(unmapped).includes("discountAmount");
  record(
    "Struck-through price seeds pre-discount pricePerPax and flags the discount",
    pass,
    pass
      ? "6999 / undefined + flagged (type 1000 by hand -> struck 6999, pay 5999)"
      : `expected 6999/undefined+flagged, got ${values.pricePerPax}/${values.discountAmount}, flags: ${flaggedFields(unmapped).join(",")}`
  );

  // The banner has to carry the exact figure to type, or the manual step is
  // guesswork.
  const reason =
    unmapped.find((entry) => entry.field === "discountAmount")?.reason ?? "";
  const reasonPass = reason.includes("1000") && reason.includes("6,999");
  record(
    "Discount flag names the amount to enter and the marked-down price",
    reasonPass,
    reasonPass ? `reason: "${reason}"` : `reason lacked the figures: "${reason}"`
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

// --- 7b. Partial drops still raise a flag ----------------------------------
function checkPartialDrops(): void {
  const dates = mapPosterToFormValues(
    poster({
      travelDates: [
        { dateFrom: "2026-03-14", dateTo: "2026-03-16", additionalFee: null },
        { dateFrom: null, dateTo: null, additionalFee: null },
      ],
    }),
    DESTINATIONS
  );
  const datesPass =
    dates.values.travelDates?.length === 1 &&
    flaggedFields(dates.unmapped).includes("travelDates");
  record(
    "A partially-invalid travel dates list keeps the valid row and still flags travelDates",
    datesPass,
    datesPass
      ? "1 kept, flagged"
      : `travelDates: ${JSON.stringify(dates.values.travelDates)}, flags: ${flaggedFields(dates.unmapped).join(",")}`
  );

  const days = mapPosterToFormValues(
    poster({
      itinerary: [
        { title: "Arrival", description: "Check in" },
        { title: "Departure", description: "" },
      ],
    }),
    DESTINATIONS
  );
  const daysPass =
    days.values.itinerary?.length === 1 &&
    flaggedFields(days.unmapped).includes("itinerary");
  record(
    "A partially-invalid itinerary keeps the complete day and still flags itinerary",
    daysPass,
    daysPass
      ? "1 kept, flagged"
      : `itinerary: ${JSON.stringify(days.values.itinerary)}, flags: ${flaggedFields(days.unmapped).join(",")}`
  );
}

// --- 7c. Itinerary banner distinguishes "absent" from "present but unusable"
function checkItineraryPresentButUnusable(): void {
  const { values, unmapped } = mapPosterToFormValues(
    poster({
      itinerary: [
        { title: "Day 1", description: "" },
        { title: "", description: "x" },
      ],
    }),
    DESTINATIONS
  );

  const entry = unmapped.find((item) => item.field === "itinerary");
  const pass =
    values.itinerary === undefined &&
    entry !== undefined &&
    entry.reason.includes("missing a title or description") &&
    !entry.reason.includes("doesn't show a day-by-day itinerary");
  record(
    "An itinerary whose every day is incomplete is flagged as unusable, not as absent",
    pass,
    pass
      ? `reason: "${entry?.reason}"`
      : `itinerary: ${JSON.stringify(values.itinerary)}, reason: "${entry?.reason ?? "(not flagged)"}"`
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

  for (const fixture of fixtures) {
    const { values, unmapped } = mapPosterToFormValues(fixture.value, DESTINATIONS);
    const parsed = packageFormSchema.safeParse({ ...EMPTY_DEFAULTS, ...values });
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

// --- 10. discountAmount is never auto-filled (user decision, 2026-08-31) --
function checkDiscountNeverAutoFilled(): void {
  const fixtures: { label: string; value: PosterExtraction }[] = [
    { label: "struck-through price", value: poster({ pricePerPax: 5999, originalPricePerPax: 6999 }) },
    { label: "single price", value: poster({ pricePerPax: 5999 }) },
    { label: "inverted was/now", value: poster({ pricePerPax: 6999, originalPricePerPax: 5999 }) },
    { label: "equal was/now", value: poster({ pricePerPax: 5999, originalPricePerPax: 5999 }) },
    { label: "no price at all", value: emptyPoster() },
  ];

  for (const fixture of fixtures) {
    const { values } = mapPosterToFormValues(fixture.value, DESTINATIONS);
    const pass = values.discountAmount === undefined;
    record(
      `Discount is never auto-filled (${fixture.label})`,
      pass,
      pass ? "undefined" : `auto-filled ${values.discountAmount}`
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
  checkPartialDrops();
  checkItineraryPresentButUnusable();
  checkRemarksNeverFlagged();
  checkSchemaInvariant();
  checkDiscountNeverAutoFilled();

  console.log("\nPoster extraction mapping checks\n");
  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.name}\n      ${result.detail}`);
  }

  const failed = results.filter((result) => !result.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
  if (failed > 0) process.exit(1);
}

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
