# Hero Search Bar (Destination / Month / Year) — Design Spec

**Date:** 2026-08-10
**Status:** Approved by user, pending implementation plan.

## Summary

Add a search bar to the homepage hero (overlaid on the existing `HeroCarousel`, which stays unchanged as a placeholder) letting visitors filter tour packages by Destination, Month, and Year. Submitting navigates to `/packages` with the chosen filters as query params, extending the existing destination-filter page rather than building a new route. If no packages match, the page's empty state now offers the inquiry form pre-filled with a custom-trip request instead of just WhatsApp/Facebook links.

## Feasibility Notes (from investigation)

- No "country" concept exists in the schema — `destinations` are individual named places tagged only `region: 'local' | 'international'`. The filter is a **Destination** filter (existing table, as-is), not a literal country filter.
- No `month`/`year` columns exist on packages. Departure dates live in `package_travel_dates` (`travel_date_from`, `travel_date_to`). Month/year filtering is done by matching the **month/year of `travel_date_from`** — a trip spanning Jul 28–Aug 3 matches July only, not August.
- `/packages?destination=<slug>` is an existing, working pattern (`app/(public)/packages/page.tsx`) — this design extends it rather than duplicating it.

## Architecture

`HeroSearchBar` is a new client component rendered as a sibling overlay to `HeroCarousel` in `app/(public)/page.tsx` (not part of the carousel itself). On submit it does `router.push()` to:

```
/packages?destination=<slug>&month=<1-12>&year=<yyyy>
```

Any filter left unset is omitted from the URL. An all-empty search behaves exactly like clicking "Packages" today (goes to `/packages` unfiltered).

## Data Model / Matching Logic

- **Destination**: exact match on `destinations.slug` (existing behavior, unchanged).
- **Month/Year**: package matches if any of its `package_travel_dates` rows has `EXTRACT(MONTH FROM travel_date_from) = :month AND EXTRACT(YEAR FROM travel_date_from) = :year`. Implemented as a filter against `package_travel_dates` joined back to `packages` (public RLS on `package_travel_dates` already permits this read).
- All three filters are optional and independent — any combination (including none) is valid.
- Invalid/nonsensical params (bad month number, unknown slug) simply produce zero matches; no special error handling needed.

## Components

- **`components/homepage/hero-search-bar.tsx`** (new, `"use client"`)
  - Destination field: searchable combobox (shadcn `Popover` + `Command`, added via `npx shadcn add popover command` — introduces `cmdk` dependency, not currently installed). Options grouped **international before local** (by `destinations.region`), alphabetical by `name` within each group, filterable by typing.
  - Month field: plain shadcn `Select`, static 12-item list.
  - Year field: plain shadcn `Select`, options = current year and next year only.
  - Search action navigates as described above.
  - Styling uses existing brand tokens, matching the reference image: pill container `bg-white`/`bg-card` with `border-primary` (marigold) outline; field labels (`COUNTRY`/`MONTH`/`YEAR` equivalents) in `text-muted-foreground`; field values in `text-secondary` (navy, bold) matching the existing heading-weight convention (`why-choose-us.tsx`, `destinations-section.tsx`); Search icon/label in `text-secondary/70`. No hardcoded hex values.

- **`components/ui/popover.tsx`, `components/ui/command.tsx`** (new shadcn-installed primitives)

- **`components/inquiry/inquiry-form.tsx`** — add optional `defaultMessage?: string` prop, used as `defaultValues.message` (currently hardcoded to `""`).

- **`app/(public)/packages/page.tsx`**:
  - Extend `searchParams` type to accept `month`/`year` alongside existing `destination`.
  - Extend the Supabase query to add the `package_travel_dates` month/year filter when present.
  - Extend the empty-state block: build a message summarizing the active filters (e.g. *"I couldn't find a Palawan trip in August 2026 — I'd like to ask about a custom itinerary."*) and render `InquiryForm` with `defaultMessage` set, in place of today's WhatsApp/Facebook-only fallback.

## Error Handling

- No new error states. Bad params degrade to "no results" → same fallback path as a legitimately empty search.
- No JS-required fallback beyond what already exists — this is a client-side filter form on top of an already server-rendered results page.

## Testing

Manual UAT covering: destination-only search, month+year-only search, all three combined, and an empty search — confirming correct result sets and correct empty-state pre-filled message text for each combination. Confirm existing `/packages?destination=` links (from `destinations-section.tsx`) still behave unchanged.

## Explicit Non-Goals

- No schema change to add a "country" concept — destinations are used as-is.
- No new `month`/`year` columns on packages or travel dates — matching is computed from existing `travel_date_from`.
- No inline/AJAX results in the hero itself — search always navigates to `/packages`.
- No change to `HeroCarousel` itself; the search bar is a separate overlay component.
