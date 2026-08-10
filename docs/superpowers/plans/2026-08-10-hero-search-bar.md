# Hero Search Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Destination/Month/Year search bar overlaid on the homepage hero that filters `/packages`, per `docs/superpowers/specs/2026-08-10-hero-search-bar-design.md`.

**Architecture:** A new client component (`HeroSearchBar`) renders three fields — a searchable Destination combobox (grouped International-before-Local, alphabetical) and plain Month/Year selects — and on submit navigates to `/packages?destination=&month=&year=`. `/packages` (existing Server Component) is extended to apply the extra filters and to show a pre-filled `InquiryForm` instead of a dead-end message when nothing matches.

**Deviation from the design spec:** The spec proposed adding shadcn's `Popover`+`Command` combo (`npx shadcn add popover command`, pulling in `cmdk`) for the searchable Destination field. Investigation during planning found this project's shadcn setup is actually the **Base UI** variant (`components.json`'s `"style": "base-nova"`, every existing `components/ui/*.tsx` wraps `@base-ui/react/*`, e.g. `select.tsx` wraps `@base-ui/react/select`) — not Radix. `@base-ui/react` (already an installed dependency, `package.json`) ships its own full-featured `combobox` primitive (`@base-ui/react/combobox`) with built-in filtering and native group support. Task 1 hand-writes `components/ui/combobox.tsx` as a thin wrapper around it, matching every other file in `components/ui/`, instead of installing `cmdk`/Radix Popover, which would introduce a second, inconsistent primitive-component system. **No new npm dependency is needed anywhere in this plan.**

**Tech Stack:** Next.js App Router (Server Components + a `"use client"` search bar), `@base-ui/react` (Select — already used; Combobox — newly wrapped), Supabase (Postgres + RLS, existing `packages`/`destinations`/`package_travel_dates` tables), Tailwind v4 with this project's existing `--primary`/`--secondary` brand tokens.

## Global Constraints

- No new npm dependencies (see Deviation note above).
- No automated test suite exists in this project — verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual dev-server checks, matching this codebase's established convention (see `docs/superpowers/plans/2026-08-08-travel-dates-range.md`).
- No hardcoded hex colors — use existing `bg-primary`/`text-primary`/`border-primary` (marigold `#f49314`) and `bg-secondary`/`text-secondary` (navy `#021f4a`) tokens from `app/globals.css`, per the approved color mapping in the design spec.
- Destination matching uses the existing `destinations.slug` (exact match) — no schema change. Month/Year matching uses `package_travel_dates.travel_date_from`'s month/year via a `>= firstOfMonth AND <= lastOfMonth` range filter — no schema change, no `EXTRACT()`/RPC needed.
- Both Month and Year must be present and individually valid (`month` an integer 1-12, `year` an integer) for the date filter to apply; if only one is present, or either is invalid, the date filter is silently ignored (treated as unset) rather than producing a nonsensical partial filter or broken heading text.
- `YYYY-MM-DD` date strings compare correctly with plain `>=`/`<=` — matches this codebase's existing convention (see travel-dates-range plan).

---

### Task 1: Base UI Combobox primitive + shared month options

**Files:**
- Create: `components/ui/combobox.tsx`
- Create: `lib/months.ts`

**Interfaces:**
- Produces: `Combobox`, `ComboboxInputGroup`, `ComboboxInput`, `ComboboxClear`, `ComboboxTrigger`, `ComboboxPortal`, `ComboboxPositioner`, `ComboboxPopup`, `ComboboxEmpty`, `ComboboxList`, `ComboboxGroup`, `ComboboxGroupLabel`, `ComboboxCollection`, `ComboboxItem` (all from `components/ui/combobox.tsx`, thin wrappers around `@base-ui/react/combobox`, same `cn()`/`data-slot` pattern as `components/ui/select.tsx`).
- Produces: `MONTH_OPTIONS: readonly { value: string; label: string }[]` (from `lib/months.ts`) — a 12-entry `value: "1".."12"`, `label: "January".."December"` list.

- [ ] **Step 1: Write `lib/months.ts`**

```ts
export const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;
```

- [ ] **Step 2: Write `components/ui/combobox.tsx`**

```tsx
"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, XIcon } from "lucide-react"

const Combobox = ComboboxPrimitive.Root

function ComboboxInputGroup({
  className,
  ...props
}: ComboboxPrimitive.InputGroup.Props) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "flex h-8 w-full items-center gap-1.5 rounded-lg border border-input bg-transparent pr-2 pl-2.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-full w-full min-w-0 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground",
        className
      )}
      {...props}
    >
      <XIcon className="size-3.5" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxTrigger({ className, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="pointer-events-none size-4" />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxPortal(props: ComboboxPrimitive.Portal.Props) {
  return <ComboboxPrimitive.Portal {...props} />
}

function ComboboxPositioner({
  className,
  sideOffset = 4,
  ...props
}: ComboboxPrimitive.Positioner.Props) {
  return (
    <ComboboxPrimitive.Positioner
      data-slot="combobox-positioner"
      sideOffset={sideOffset}
      className={cn("isolate z-50 outline-none", className)}
      {...props}
    />
  )
}

function ComboboxPopup({ className, ...props }: ComboboxPrimitive.Popup.Props) {
  return (
    <ComboboxPrimitive.Popup
      data-slot="combobox-popup"
      className={cn(
        "w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-[scale,opacity] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "px-3 py-6 text-center text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-(--available-height) scroll-py-1 overflow-auto overscroll-contain py-1",
        className
      )}
      {...props}
    />
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn("block pb-1 last:pb-0", className)}
      {...props}
    />
  )
}

function ComboboxGroupLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn(
        "px-2.5 py-1.5 text-xs font-medium text-muted-foreground select-none",
        className
      )}
      {...props}
    />
  )
}

function ComboboxCollection(props: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection {...props} />
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="absolute right-2.5 flex size-4 items-center justify-center">
        <CheckIcon className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

export {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxCollection,
  ComboboxItem,
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors (both new files are self-contained and not imported anywhere yet).

- [ ] **Step 4: Commit**

```bash
git add components/ui/combobox.tsx lib/months.ts
git commit -m "feat(ui): add Base UI Combobox primitive and shared month options"
```

---

### Task 2: `InquiryForm` pre-fill support

**Files:**
- Modify: `components/inquiry/inquiry-form.tsx:38-62`

**Interfaces:**
- Consumes: nothing new.
- Produces: `InquiryForm` accepts an additional optional `defaultMessage?: string` prop; when provided, the form's message field starts pre-filled with it instead of empty.

- [ ] **Step 1: Add the `defaultMessage` prop**

Find (current lines 38-62):

```tsx
export function InquiryForm({
  packageName,
  packageId,
}: {
  packageName?: string;
  packageId?: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Stable across a rapid double-click (only rotated after a successful
  // submit, below) so record_inquiry()'s request_id-keyed dedup actually
  // catches near-simultaneous duplicate submit attempts (D-03).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquirySchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
      _gotcha: "",
    },
  });
```

Replace with:

```tsx
export function InquiryForm({
  packageName,
  packageId,
  defaultMessage,
}: {
  packageName?: string;
  packageId?: string;
  defaultMessage?: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Stable across a rapid double-click (only rotated after a successful
  // submit, below) so record_inquiry()'s request_id-keyed dedup actually
  // catches near-simultaneous duplicate submit attempts (D-03).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const form = useForm<InquiryFormValues>({
    resolver: zodResolver(inquirySchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: defaultMessage ?? "",
      _gotcha: "",
    },
  });
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors. Existing callers (`app/(public)/page.tsx`, `app/(public)/contact/page.tsx`, and any package-detail usage) don't pass `defaultMessage` and are unaffected — still default to an empty message field.

- [ ] **Step 3: Commit**

```bash
git add components/inquiry/inquiry-form.tsx
git commit -m "feat(inquiry): support pre-filled default message"
```

---

### Task 3: `HeroSearchBar` component

**Files:**
- Create: `components/homepage/hero-search-bar.tsx`

**Interfaces:**
- Consumes: `Combobox*` primitives (Task 1, `components/ui/combobox.tsx`), `MONTH_OPTIONS` (Task 1, `lib/months.ts`), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` (existing `components/ui/select.tsx`), `DestinationTile` type (existing, exported from `components/homepage/destinations-section.tsx`).
- Produces: `HeroSearchBar({ local, international, className? }: { local: DestinationTile[]; international: DestinationTile[]; className?: string })`, a `"use client"` component. On submit, navigates via `router.push()` to `/packages?destination=<slug>&month=<1-12>&year=<yyyy>`, omitting any param whose field was left unset.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinIcon, CalendarIcon, SearchIcon } from "lucide-react";

import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxEmpty,
  ComboboxList,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxCollection,
  ComboboxItem,
} from "@/components/ui/combobox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MONTH_OPTIONS } from "@/lib/months";
import { cn } from "@/lib/utils";
import type { DestinationTile } from "@/components/homepage/destinations-section";

type DestinationGroup = { value: string; items: DestinationTile[] };

function groupDestinations(
  local: DestinationTile[],
  international: DestinationTile[]
): DestinationGroup[] {
  const byName = (a: DestinationTile, b: DestinationTile) =>
    a.name.localeCompare(b.name);

  return [
    { value: "International", items: [...international].sort(byName) },
    { value: "Local", items: [...local].sort(byName) },
  ].filter((group) => group.items.length > 0);
}

const FIELD_LABEL_CLASSES =
  "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export function HeroSearchBar({
  local,
  international,
  className,
}: {
  local: DestinationTile[];
  international: DestinationTile[];
  className?: string;
}) {
  const router = useRouter();
  const groups = useMemo(
    () => groupDestinations(local, international),
    [local, international]
  );

  const [destination, setDestination] = useState<DestinationTile | null>(
    null
  );
  const [month, setMonth] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const yearOptions = [String(currentYear), String(currentYear + 1)];

  function handleSearch() {
    const params = new URLSearchParams();
    if (destination) params.set("destination", destination.slug);
    if (month) params.set("month", month);
    if (year) params.set("year", year);
    const query = params.toString();
    router.push(query ? `/packages?${query}` : "/packages");
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border-2 border-primary bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-primary/25 sm:p-2",
        className
      )}
    >
      <div className="flex flex-1 flex-col gap-1 px-2">
        <span className={FIELD_LABEL_CLASSES}>Destination</span>
        <Combobox
          items={groups}
          value={destination}
          onValueChange={setDestination}
          itemToStringLabel={(item: DestinationTile) => item.name}
        >
          <ComboboxInputGroup className="h-auto rounded-none border-0 bg-transparent p-0 focus-within:ring-0">
            <MapPinIcon
              className="size-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <ComboboxInput
              placeholder="Destination"
              className="p-0 text-sm font-semibold text-secondary placeholder:font-normal placeholder:text-muted-foreground"
            />
          </ComboboxInputGroup>

          <ComboboxPortal>
            <ComboboxPositioner>
              <ComboboxPopup>
                <ComboboxEmpty>No destinations found.</ComboboxEmpty>
                <ComboboxList>
                  {(group: DestinationGroup) => (
                    <ComboboxGroup key={group.value} items={group.items}>
                      <ComboboxGroupLabel>{group.value}</ComboboxGroupLabel>
                      <ComboboxCollection>
                        {(item: DestinationTile) => (
                          <ComboboxItem key={item.id} value={item}>
                            {item.name}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxPopup>
            </ComboboxPositioner>
          </ComboboxPortal>
        </Combobox>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2">
        <span className={FIELD_LABEL_CLASSES}>Month</span>
        <Select
          value={month ?? ""}
          onValueChange={(value) => setMonth(value || null)}
        >
          <SelectTrigger className="h-auto w-full gap-1.5 rounded-none border-0 bg-transparent p-0 text-sm font-semibold text-secondary data-placeholder:font-normal data-placeholder:text-muted-foreground">
            <CalendarIcon
              className="size-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTH_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2">
        <span className={FIELD_LABEL_CLASSES}>Year</span>
        <Select
          value={year ?? ""}
          onValueChange={(value) => setYear(value || null)}
        >
          <SelectTrigger className="h-auto w-full gap-1.5 rounded-none border-0 bg-transparent p-0 text-sm font-semibold text-secondary data-placeholder:font-normal data-placeholder:text-muted-foreground">
            <CalendarIcon
              className="size-4 shrink-0 text-secondary"
              aria-hidden="true"
            />
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type="button"
        onClick={handleSearch}
        className="flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-secondary/70 transition-colors hover:text-secondary sm:ml-1"
      >
        <SearchIcon className="size-4" aria-hidden="true" />
        Search
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors (component isn't wired into any page yet, but must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add components/homepage/hero-search-bar.tsx
git commit -m "feat(homepage): add hero search bar component"
```

---

### Task 4: Wire `HeroSearchBar` into the homepage hero

**Files:**
- Modify: `app/(public)/page.tsx:5` (import), `:220-222` (render)

**Interfaces:**
- Consumes: `HeroSearchBar` (Task 3), and this file's own existing `localDestinations`/`internationalDestinations` (already computed at lines 172-177 — no new query).

- [ ] **Step 1: Add the import**

Find (current line 5):

```tsx
import { HeroCarousel, type HeroSlideDisplay } from "@/components/homepage/hero-carousel";
```

Replace with:

```tsx
import { HeroCarousel, type HeroSlideDisplay } from "@/components/homepage/hero-carousel";
import { HeroSearchBar } from "@/components/homepage/hero-search-bar";
```

- [ ] **Step 2: Overlay the search bar on the hero**

Find (current lines 220-222):

```tsx
  return (
    <>
      <HeroCarousel slides={slides} />
      <WhyChooseUs />
```

Replace with:

```tsx
  return (
    <>
      <div className="relative">
        <HeroCarousel slides={slides} />
        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 px-4 sm:top-6 sm:px-8">
          <div className="pointer-events-auto mx-auto max-w-4xl">
            <HeroSearchBar
              local={localDestinations}
              international={internationalDestinations}
            />
          </div>
        </div>
      </div>
      <WhyChooseUs />
```

(`HeroCarousel`'s own root element is already `relative` in both its empty-state and populated-carousel branches — `components/homepage/hero-carousel.tsx:54` and the `Carousel` primitive itself — so this wrapping `<div className="relative">` composes cleanly as the positioning context for the absolutely-positioned overlay.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero errors.

Run: `npm run dev`, visit `/`.
Expected: the search bar renders as a white, marigold-bordered pill near the top of the hero, above the (placeholder or real) hero content. Typing in the Destination field filters the list; selecting an option shows its name. Month and Year selects open and show 12 months / 2 years respectively. The layout doesn't visually break the carousel's prev/next arrows or its bottom-anchored headline/CTA.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/page.tsx"
git commit -m "feat(homepage): overlay hero search bar on the hero carousel"
```

---

### Task 5: Extend `/packages` with destination + month/year filtering and a pre-filled contact fallback

**Files:**
- Modify: `app/(public)/packages/page.tsx`

**Interfaces:**
- Consumes: `MONTH_OPTIONS` (Task 1, `lib/months.ts`), `InquiryForm`'s `defaultMessage` prop (Task 2).
- Produces: `PackagesPage` accepts `searchParams: Promise<{ destination?: string; month?: string; year?: string }>`; renders a pre-filled `InquiryForm` whenever the result set is empty.

- [ ] **Step 1: Update imports**

Find (current lines 1-7):

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { PackageCard } from "@/components/packages/package-card";
import type { Database } from "@/types/database";
```

Replace with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { PackageCard } from "@/components/packages/package-card";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { MONTH_OPTIONS } from "@/lib/months";
import type { Database } from "@/types/database";

/** First/last day of the given month as "YYYY-MM-DD" strings (UTC-based, no
 * timezone drift), used to match package_travel_dates.travel_date_from
 * falling within that month without needing EXTRACT()/an RPC. */
function monthDateRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}
```

- [ ] **Step 2: Accept and parse the new search params**

Find (current lines 22-27):

```tsx
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const { destination: destinationSlug } = await searchParams;
  const supabase = await createClient();
```

Replace with:

```tsx
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string; month?: string; year?: string }>;
}) {
  const {
    destination: destinationSlug,
    month: monthParam,
    year: yearParam,
  } = await searchParams;
  const supabase = await createClient();

  // Both Month and Year must be present and individually valid for the date
  // filter to apply -- an invalid or half-set combination is silently
  // ignored (treated as if neither were given) rather than producing a
  // nonsensical partial filter or broken heading text.
  const monthNum = Number(monthParam);
  const yearNum = Number(yearParam);
  const hasDateFilter =
    Boolean(monthParam) &&
    Boolean(yearParam) &&
    Number.isInteger(monthNum) &&
    monthNum >= 1 &&
    monthNum <= 12 &&
    Number.isInteger(yearNum);
  const monthYearLabel = hasDateFilter
    ? `${MONTH_OPTIONS[monthNum - 1].label} ${yearNum}`
    : null;
```

- [ ] **Step 3: Update the query to add the date filter**

Find (current lines 45-74):

```tsx
  // destinations!inner is required, not the default to-one embed --
  // PostgREST only restricts which *parent* rows come back when the
  // embedded relation is an inner join; without !inner, .eq() on the
  // embedded column just nulls out non-matching embeds instead of
  // filtering the packages themselves.
  //
  // .eq("destinations.is_active", true) is kept here even though RLS also
  // scopes anonymous visitors to is_active = true destinations, because RLS
  // grants authenticated can_manage_packages users read access to ALL
  // destinations -- without this query-layer filter, an admin browsing this
  // nominally public page would see packages for an inactive destination
  // that an anonymous visitor cannot, diverging from the destinationName
  // lookup above (which already filters is_active = true). Same
  // belt-and-suspenders reasoning as app/(public)/page.tsx's destinations
  // query.
  const { data: packages, error } = destinationSlug
    ? await supabase
        .from("packages")
        .select(
          "*, package_photos(storage_path, display_order), destinations!inner(slug, name)"
        )
        .eq("is_published", true)
        .eq("destinations.slug", destinationSlug)
        .eq("destinations.is_active", true)
        .order("sort_order", { ascending: true })
    : await supabase
        .from("packages")
        .select("*, package_photos(storage_path, display_order)")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });
```

Replace with:

```tsx
  // destinations!inner / package_travel_dates!inner are required, not the
  // default to-one embed -- PostgREST only restricts which *parent* rows
  // come back when the embedded relation is an inner join; without !inner,
  // .eq()/.gte()/.lte() on an embedded column just nulls out non-matching
  // embeds instead of filtering the packages themselves. Both embeds are
  // only added to the select() when their filter is actually active, so an
  // unfiltered visit still gets the plain, cheaper query.
  //
  // .eq("destinations.is_active", true) is kept here even though RLS also
  // scopes anonymous visitors to is_active = true destinations, because RLS
  // grants authenticated can_manage_packages users read access to ALL
  // destinations -- without this query-layer filter, an admin browsing this
  // nominally public page would see packages for an inactive destination
  // that an anonymous visitor cannot, diverging from the destinationName
  // lookup above (which already filters is_active = true). Same
  // belt-and-suspenders reasoning as app/(public)/page.tsx's destinations
  // query.
  const selectParts = ["*", "package_photos(storage_path, display_order)"];
  if (destinationSlug) selectParts.push("destinations!inner(slug, name)");
  if (hasDateFilter)
    selectParts.push(
      "package_travel_dates!inner(travel_date_from, travel_date_to)"
    );

  let query = supabase
    .from("packages")
    .select(selectParts.join(", "))
    .eq("is_published", true);

  if (destinationSlug) {
    query = query
      .eq("destinations.slug", destinationSlug)
      .eq("destinations.is_active", true);
  }

  if (hasDateFilter) {
    const { from, to } = monthDateRange(yearNum, monthNum);
    query = query
      .gte("package_travel_dates.travel_date_from", from)
      .lte("package_travel_dates.travel_date_from", to);
  }

  const { data: packages, error } = await query.order("sort_order", {
    ascending: true,
  });
```

- [ ] **Step 4: Fix the final result cast**

`select(selectParts.join(", "))` is a dynamically built string, not a literal, so Supabase's typed overloads produce a `GenericStringError`-flavored result that doesn't sufficiently overlap with `PackageWithPhotos[]` for a direct `as` cast (confirmed by actually running `npx tsc --noEmit` against this exact change during planning — this is not a hypothetical). Find (current line, a few lines below the query, unchanged from before this task):

```tsx
  const rows = (packages ?? []) as PackageWithPhotos[];
```

Replace with:

```tsx
  // select() is a dynamically built string (not a literal), so Supabase's
  // typed overloads fall back to a GenericStringError result type that
  // doesn't sufficiently overlap with PackageWithPhotos[] for a direct
  // cast -- `as unknown as` is this codebase's existing convention for that
  // exact situation (see app/admin/(dashboard)/crm/[id]/page.tsx:64).
  const rows = (packages ?? []) as unknown as PackageWithPhotos[];
```

Do **not** use `let query: any` as a fix here even though it also resolves the type error — this project's ESLint config (`@typescript-eslint/no-explicit-any`) rejects explicit `any` and `npm run lint` will fail. The `as unknown as` cast on the final result is the only one of the two that passes both `tsc` and `lint`.

- [ ] **Step 5: Build the combined filter description and update the heading**

Find (current lines 84-102):

```tsx
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {destinationName ? `Packages in ${destinationName}` : "Tour Packages"}
        </h1>
        <p className="max-w-xl text-base leading-[1.5] text-muted-foreground">
          Browse our tour packages and reach out on WhatsApp or Facebook to
          start planning your trip.
        </p>
        {destinationName ? (
          <Link
            href="/packages"
            className="w-fit text-sm text-primary underline underline-offset-2"
          >
            Clear filter
          </Link>
        ) : null}
      </div>
```

Replace with:

```tsx
  // A natural-language description of the active search, reused for the
  // heading, the empty-state copy, and the pre-filled inquiry message --
  // e.g. "a Palawan trip in August 2026", "a Palawan trip", "a trip in
  // August 2026", or null when no filter is active.
  const searchDescription =
    destinationName && monthYearLabel
      ? `a ${destinationName} trip in ${monthYearLabel}`
      : destinationName
        ? `a ${destinationName} trip`
        : monthYearLabel
          ? `a trip in ${monthYearLabel}`
          : null;
  const hasAnyFilter = Boolean(destinationSlug) || hasDateFilter;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {searchDescription
            ? `Packages for ${searchDescription}`
            : "Tour Packages"}
        </h1>
        <p className="max-w-xl text-base leading-[1.5] text-muted-foreground">
          Browse our tour packages and reach out on WhatsApp or Facebook to
          start planning your trip.
        </p>
        {hasAnyFilter ? (
          <Link
            href="/packages"
            className="w-fit text-sm text-primary underline underline-offset-2"
          >
            Clear filter
          </Link>
        ) : null}
      </div>
```

- [ ] **Step 6: Replace the empty state with a pre-filled `InquiryForm`**

Find (current lines 104-113):

```tsx
      {rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No packages available right now
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Check back soon, or reach out to us directly on WhatsApp or
            Facebook — we&apos;re happy to help you plan your trip.
          </p>
        </div>
      ) : (
```

Replace with:

```tsx
      {rows.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <div className="flex flex-col gap-2 text-center">
            <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
              {searchDescription
                ? `No packages found for ${searchDescription}`
                : "No packages available right now"}
            </h2>
            <p className="text-base leading-[1.5] text-muted-foreground">
              {searchDescription
                ? "We don't have a ready-made package matching that search, but we'd love to build one for you — send us the details below."
                : "Check back soon, or send us a message below and we'll help you plan your trip."}
            </p>
          </div>
          <InquiryForm
            defaultMessage={
              searchDescription
                ? `I couldn't find ${searchDescription} — I'd like to ask about a custom itinerary.`
                : undefined
            }
          />
        </div>
      ) : (
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npm run lint`
Expected: zero errors (the `as unknown as` cast from Step 4 is required to keep this clean — do not swap it for `let query: any`, which fails lint).

Run: `npm run dev`.
1. Visit `/packages?destination=<a-real-slug>` — confirm unchanged behavior (still filters by destination only, same as before this plan).
2. Visit `/packages?month=8&year=2026` (pick a month/year that has no matching seeded package) — confirm the heading reads "Packages for a trip in August 2026", the grid is replaced by the inquiry form pre-filled with "I couldn't find a trip in August 2026 — I'd like to ask about a custom itinerary.", and "Clear filter" appears and returns to unfiltered `/packages`.
3. Visit `/packages?destination=<real-slug>&month=13&year=abc` (invalid month/year) — confirm this behaves identically to `/packages?destination=<real-slug>` (date filter silently ignored).
4. From `/`, use the new hero search bar end-to-end: pick a destination, month, and year, click Search, confirm it lands on `/packages` with the right query string and results.

- [ ] **Step 8: Commit**

```bash
git add "app/(public)/packages/page.tsx"
git commit -m "feat(public): filter packages by month/year and offer a pre-filled inquiry form on no match"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type check, lint, build**

Run: `npx tsc --noEmit` — expect zero errors.
Run: `npm run lint` — expect zero errors (pre-existing unrelated warnings are fine).
Run: `npm run build` — expect success.

- [ ] **Step 2: Manual end-to-end walkthrough**

Run: `npm run dev`.
1. On `/`, confirm the hero search bar renders as a white pill with a marigold (`border-primary`) border, navy (`text-secondary`) bold field values, and doesn't visually clash with the hero carousel's own content or controls.
2. Type a few letters of a real destination's name into the Destination field — confirm it filters to matching items, grouped International-then-Local, alphabetical within each group.
3. Search with only a Destination selected — confirm it lands on `/packages?destination=...` and existing destination-only filtering still works exactly as before.
4. Search with only Month+Year selected (no destination) — confirm correct filtering against real seeded travel dates (packages whose `travel_date_from` falls in that month/year appear; others don't).
5. Search with all three set to a combination with zero matches — confirm the pre-filled `InquiryForm` renders with an accurate message, and successfully submits (check the CRM/inquiries table or toast confirmation).
6. Confirm `/packages` (no params) and `/packages?destination=...` (existing links from `components/homepage/destinations-section.tsx`) are visually and functionally unchanged from before this plan.

- [ ] **Step 3: No commit** — this task is verification-only; if any check fails, fix it within the task that owns the affected file and re-run this task.
