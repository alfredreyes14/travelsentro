# Travel Dates From/To Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change each package travel date entry from a single date to a required From/To date range (`travel_date_from`/`travel_date_to`, `To >= From`), across the DB schema, the admin form, the public site, and the dev seed script, per `docs/superpowers/specs/2026-08-08-travel-dates-range-design.md`.

**Architecture:** One migration adds the two new columns, backfills existing rows as same-day ranges, enforces `To >= From`, and drops the old `travel_date` column, then updates `write_package_children()`'s body to insert the new columns (its signature/Args are unchanged — still one `p_travel_dates jsonb` param). Every layer above it (types, schema, form, actions, admin page, public page, seed) follows the same `date` → `dateFrom`/`dateTo` field rename already established by the rest of this codebase's conventions.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), react-hook-form + zod, existing shadcn/ui primitives (still a plain `<input type="date">`, now two per row — no new dependency).

## Global Constraints

- No new npm dependencies.
- No automated test suite exists in this project — verification is `npm run lint`, `npx tsc --noEmit`, and manual checks (dev-server/live-DB where applicable), matching this codebase's established convention.
- `YYYY-MM-DD` date strings compare correctly with plain `>=`/`<=` — no date-parsing library needed anywhere in this plan.
- This plan applies a migration to the project's linked Supabase instance (`supabase db push`) and updates seed data via `npm run seed` (a real write) — same workflow every prior migration/seed change in this repo already used.

---

### Task 1: Migration — From/To columns, backfill, constraint, updated RPC body

**Files:**
- Create: `supabase/migrations/20260808120000_travel_dates_range.sql`

**Interfaces:**
- Produces: `package_travel_dates.travel_date_from date not null`, `package_travel_dates.travel_date_to date not null`, `package_travel_dates_to_after_from` check constraint (`travel_date_to >= travel_date_from`), no more `package_travel_dates.travel_date` column. `write_package_children(p_package_id uuid, p_itinerary jsonb, p_inclusions jsonb, p_travel_dates jsonb)` keeps its exact signature but its body now inserts `travel_date_from`/`travel_date_to` (read from each `p_travel_dates` element's `travel_date_from`/`travel_date_to` keys) instead of `travel_date`.

- [ ] **Step 1: Write the migration file**

```sql
-- Travel dates become a From/To range instead of a single date, so each
-- entry represents a real departure window (e.g. "Sep 12 - Sep 14") rather
-- than just a start date.
--
-- Existing rows are backfilled as same-day ranges (travel_date_from =
-- travel_date_to = travel_date) before the old column is dropped, so no
-- existing travel date is lost.

alter table package_travel_dates add column travel_date_from date;
alter table package_travel_dates add column travel_date_to date;

update package_travel_dates
set travel_date_from = travel_date, travel_date_to = travel_date;

alter table package_travel_dates alter column travel_date_from set not null;
alter table package_travel_dates alter column travel_date_to set not null;

alter table package_travel_dates
  add constraint package_travel_dates_to_after_from check (travel_date_to >= travel_date_from);

alter table package_travel_dates drop column travel_date;

-- ============================================================================
-- write_package_children() -- signature unchanged (still one p_travel_dates
-- jsonb param), only the body's insert into package_travel_dates changes to
-- read travel_date_from/travel_date_to instead of travel_date. create or
-- replace is sufficient here since the Args don't change.
-- ============================================================================
create or replace function public.write_package_children(
  p_package_id uuid,
  p_itinerary jsonb,
  p_inclusions jsonb,
  p_travel_dates jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from itinerary_days where package_id = p_package_id;
  delete from package_inclusions where package_id = p_package_id;
  delete from package_travel_dates where package_id = p_package_id;

  insert into itinerary_days (package_id, day_number, title, description)
  select
    p_package_id,
    (elem->>'day_number')::integer,
    elem->>'title',
    elem->>'description'
  from jsonb_array_elements(p_itinerary) as elem;

  insert into package_inclusions (package_id, kind, label, sort_order)
  select
    p_package_id,
    elem->>'kind',
    elem->>'label',
    (elem->>'sort_order')::integer
  from jsonb_array_elements(p_inclusions) as elem;

  insert into package_travel_dates (package_id, travel_date_from, travel_date_to, additional_fee)
  select
    p_package_id,
    (elem->>'travel_date_from')::date,
    (elem->>'travel_date_to')::date,
    (elem->>'additional_fee')::numeric
  from jsonb_array_elements(p_travel_dates) as elem;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration `20260808120000_travel_dates_range` applies with no errors. Before pushing, confirm the CLI is linked to the correct project — a prior migration task in this repo found the CLI's ambient/global auth session pointed at unrelated projects, and had to explicitly source `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF` from the repo-root `.env.local` and pass `--project-ref` before pushing. Do the same here rather than trusting ambient CLI state.

- [ ] **Step 3: Verify against the live schema**

Run a read-only query confirming: `package_travel_dates` has `travel_date_from`/`travel_date_to` (both not null) and no `travel_date` column; the existing seeded rows (3 packages, a handful of dates) now show `travel_date_from = travel_date_to` equal to their old single date value; `pg_get_functiondef('public.write_package_children'::regproc)` (or equivalent) shows the new column names in its body.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260808120000_travel_dates_range.sql
git commit -m "feat(db): change package travel dates from a single date to a From/To range"
```

---

### Task 2: Sync `types/database.ts`

**Files:**
- Modify: `types/database.ts:375-397` (the `package_travel_dates` block)

**Interfaces:**
- Produces: `Database["public"]["Tables"]["package_travel_dates"]["Row"]` with `travel_date_from: string`, `travel_date_to: string`, no `travel_date`.

- [ ] **Step 1: Replace the `package_travel_dates` block**

Find (current lines 375-397):

```ts
      package_travel_dates: {
        Row: {
          additional_fee: number | null
          created_at: string
          id: string
          package_id: string
          travel_date: string
        }
        Insert: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id: string
          travel_date: string
        }
        Update: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id?: string
          travel_date?: string
        }
        Relationships: [
```

Replace with:

```ts
      package_travel_dates: {
        Row: {
          additional_fee: number | null
          created_at: string
          id: string
          package_id: string
          travel_date_from: string
          travel_date_to: string
        }
        Insert: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id: string
          travel_date_from: string
          travel_date_to: string
        }
        Update: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id?: string
          travel_date_from?: string
          travel_date_to?: string
        }
        Relationships: [
```

(Leave the `Relationships: [...]` block and everything else in the file unchanged — the `write_package_children` `Functions` block's `Args` already just says `p_travel_dates: Json`, which doesn't need to change since the RPC's signature itself didn't change.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: `types/database.ts` itself compiles clean; new errors surface in other files still referencing `travel_date`/`.date` on travel-date objects — expected, fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add types/database.ts
git commit -m "chore(types): sync database types with travel dates From/To range"
```

---

### Task 3: Update `package-form-schema.ts`

**Files:**
- Modify: `components/admin/package-form-schema.ts`

**Interfaces:**
- Produces: `PackageFormValues["travelDates"]` items shaped `{ dateFrom: string; dateTo: string; additionalFee?: number }` (was `{ date: string; additionalFee?: number }`).

- [ ] **Step 1: Replace `travelDateSchema`**

Find (current lines 21-30):

```ts
/**
 * `date` is a plain "YYYY-MM-DD" string from a native <input type="date">
 * — no date library needed. additionalFee is the optional per-date
 * surcharge (e.g. a peak-season upcharge).
 */
const travelDateSchema = z.object({
  date: z.string().min(1, "Please pick a date"),
  additionalFee: z
    .number({ error: "Fee must be a positive number" })
    .positive("Fee must be a positive number")
    .optional(),
});
```

Replace with:

```ts
/**
 * dateFrom/dateTo are plain "YYYY-MM-DD" strings from native
 * <input type="date"> fields — no date library needed, and "YYYY-MM-DD"
 * strings compare correctly with plain >=/<=. additionalFee is the
 * optional surcharge for this whole date range (e.g. a peak-season
 * upcharge).
 */
const travelDateSchema = z
  .object({
    dateFrom: z.string().min(1, "Please pick a start date"),
    dateTo: z.string().min(1, "Please pick an end date"),
    additionalFee: z
      .number({ error: "Fee must be a positive number" })
      .positive("Fee must be a positive number")
      .optional(),
  })
  .refine((value) => value.dateTo >= value.dateFrom, {
    message: "End date must be on or after the start date",
    path: ["dateTo"],
  });
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: `package-form-schema.ts` compiles clean; `package-form.tsx` and `actions/packages.ts` now show errors referencing the old `.date` field — expected, fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add components/admin/package-form-schema.ts
git commit -m "feat(admin): change travel date schema from a single date to a From/To range"
```

---

### Task 4: Update `actions/packages.ts`

**Files:**
- Modify: `actions/packages.ts:52-59` (inside `writePackageChildren`)

**Interfaces:**
- Consumes: `PackageFormValues["travelDates"]` items with `dateFrom`/`dateTo` (Task 3).
- Produces: the `write_package_children` RPC call's `p_travel_dates` array now sends `{ travel_date_from, travel_date_to, additional_fee }` per item.

- [ ] **Step 1: Update the `p_travel_dates` mapping**

Find (current lines 52-59):

```ts
    p_inclusions: inclusionRows,
    p_travel_dates: values.travelDates.map((item) => ({
      travel_date: item.date,
      additional_fee: item.additionalFee ?? null,
    })),
  });
```

Replace with:

```ts
    p_inclusions: inclusionRows,
    p_travel_dates: values.travelDates.map((item) => ({
      travel_date_from: item.dateFrom,
      travel_date_to: item.dateTo,
      additional_fee: item.additionalFee ?? null,
    })),
  });
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: `actions/packages.ts` compiles clean. `package-form.tsx` still shows expected errors until Task 5.

- [ ] **Step 3: Commit**

```bash
git add actions/packages.ts
git commit -m "feat(admin): send travel date ranges to write_package_children"
```

---

### Task 5: Update `package-form.tsx`'s Travel Dates tab

**Files:**
- Modify: `components/admin/package-form.tsx`

**Interfaces:**
- Consumes: `travelDateSchema`'s `dateFrom`/`dateTo` fields (Task 3).
- Produces: no new exports — each Travel Dates row now renders two date inputs instead of one.

- [ ] **Step 1: Replace the Travel Dates tab's per-row fields**

Find the travel-dates `TabsContent` block's row rendering (current lines 341-411, inside the `travelDatesArray.fields.map(...)` — the header/remove-button div stays the same, only the two `FormField`s inside change):

```tsx
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.date`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.additionalFee`}
```

Replace with:

```tsx
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.dateFrom`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.dateTo`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`travelDates.${index}.additionalFee`}
```

(The `additionalFee` `FormField` block that follows is unchanged — leave it exactly as-is.)

- [ ] **Step 2: Update the remove-confirmation "has content" check**

Find (current lines 356-364, inside the same row's header):

```tsx
                    onClick={() =>
                      requestRemove(
                        Boolean(
                          form.getValues(`travelDates.${index}.date`) ||
                            form.getValues(`travelDates.${index}.additionalFee`)
                        ),
                        `Date ${index + 1}`,
                        () => travelDatesArray.remove(index)
                      )
                    }
```

Replace with:

```tsx
                    onClick={() =>
                      requestRemove(
                        Boolean(
                          form.getValues(`travelDates.${index}.dateFrom`) ||
                            form.getValues(`travelDates.${index}.dateTo`) ||
                            form.getValues(`travelDates.${index}.additionalFee`)
                        ),
                        `Date ${index + 1}`,
                        () => travelDatesArray.remove(index)
                      )
                    }
```

- [ ] **Step 3: Update the "Add travel date" button's default row**

Find (current lines 417-420):

```tsx
              onClick={() =>
                travelDatesArray.append({ date: "", additionalFee: undefined })
              }
```

Replace with:

```tsx
              onClick={() =>
                travelDatesArray.append({
                  dateFrom: "",
                  dateTo: "",
                  additionalFee: undefined,
                })
              }
```

- [ ] **Step 4: Update `EMPTY_DEFAULTS`**

This component has no `EMPTY_DEFAULTS.travelDates` entries with a `date` field (it defaults to `travelDates: []`, an empty array), so no change is needed there — confirm this is still the case (search for `travelDates: []` near the top of the file) rather than assuming.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: `package-form.tsx` compiles clean. Errors remain in `app/admin/(dashboard)/packages/[id]/page.tsx` and `app/(public)/packages/[slug]/page.tsx` and `scripts/seed.ts` until Tasks 6-8 — expected.

- [ ] **Step 6: Commit**

```bash
git add components/admin/package-form.tsx
git commit -m "feat(admin): render From/To date inputs in the Travel Dates tab"
```

---

### Task 6: Update the admin edit page's travel-dates mapping

**Files:**
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx`

**Interfaces:**
- Consumes: `Database["public"]["Tables"]["package_travel_dates"]["Row"]` with `travel_date_from`/`travel_date_to` (Task 2).
- Produces: `defaultValues.travelDates` items shaped `{ dateFrom, dateTo, additionalFee }` matching `PackageFormValues` (Task 3).

- [ ] **Step 1: Update the query**

Find (current line 52):

```tsx
          package_travel_dates(id, travel_date, additional_fee),
```

Replace with:

```tsx
          package_travel_dates(id, travel_date_from, travel_date_to, additional_fee),
```

- [ ] **Step 2: Update the `travelDates` mapping**

Find (current lines 88-93):

```tsx
  const travelDates = [...pkg.package_travel_dates]
    .sort((a, b) => a.travel_date.localeCompare(b.travel_date))
    .map((date) => ({
      date: date.travel_date,
      additionalFee: date.additional_fee ?? undefined,
    }));
```

Replace with:

```tsx
  const travelDates = [...pkg.package_travel_dates]
    .sort((a, b) => a.travel_date_from.localeCompare(b.travel_date_from))
    .map((date) => ({
      dateFrom: date.travel_date_from,
      dateTo: date.travel_date_to,
      additionalFee: date.additional_fee ?? undefined,
    }));
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: this file compiles clean now. `app/(public)/packages/[slug]/page.tsx` and `scripts/seed.ts` still show expected errors until Tasks 7-8.

Run: `npm run dev`, open an existing package's edit page (e.g. one of the 3 seeded packages), check the Travel Dates tab.
Expected: each existing travel date now shows the same From and To value (same-day range, per the migration's backfill) in two separate date fields, not a validation error.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(dashboard)/packages/[id]/page.tsx"
git commit -m "feat(admin): map travel date ranges into the edit page's form defaults"
```

---

### Task 7: Update the public detail page's Travel Dates display

**Files:**
- Modify: `app/(public)/packages/[slug]/page.tsx`

**Interfaces:**
- Consumes: `Database["public"]["Tables"]["package_travel_dates"]["Row"]` with `travel_date_from`/`travel_date_to` (Task 2).
- Produces: each Travel Dates list item shows `"{From} – {To}"` when the range spans more than one day, or just `"{From}"` when it's a same-day range.

- [ ] **Step 1: Update the query**

Find (current line 88):

```tsx
      package_travel_dates(travel_date, additional_fee)`
```

Replace with:

```tsx
      package_travel_dates(travel_date_from, travel_date_to, additional_fee)`
```

- [ ] **Step 2: Update the sort**

Find (current lines 116-118):

```tsx
  const travelDates = [...pkg.package_travel_dates].sort((a, b) =>
    a.travel_date.localeCompare(b.travel_date)
  );
```

Replace with:

```tsx
  const travelDates = [...pkg.package_travel_dates].sort((a, b) =>
    a.travel_date_from.localeCompare(b.travel_date_from)
  );
```

- [ ] **Step 3: Update the rendered list item**

Find (current lines 203-227, the whole Travel Dates section):

```tsx
      {travelDates.length > 0 ? (
        <section className={SECTION_CARD}>
          <SectionHeading icon={CalendarDays}>Travel Dates</SectionHeading>
          <ul className="flex flex-col gap-2">
            {travelDates.map((date) => (
              <li
                key={date.travel_date}
                className="flex items-center justify-between gap-2 text-[14px] leading-[1.4] text-foreground"
              >
                <span>
                  {new Date(date.travel_date).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                {date.additional_fee ? (
                  <Badge variant="outline">
                    +&#8369;{date.additional_fee.toLocaleString("en-PH")}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
```

Replace with:

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

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: this file compiles clean. Only `scripts/seed.ts` shows expected errors until Task 8.

Run: `npm run dev`, open a package detail page with a multi-day travel date and one with a same-day range (after Task 8's seed update, all 3 seeded packages will have real multi-day ranges — until then, the existing same-day-backfilled seeded dates will render as single dates, which is also a valid way to confirm the equal-dates branch works).
Expected: multi-day ranges show as "Month D – Month D, YYYY"; same-day ranges show as a single "Month D, YYYY".

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/packages/[slug]/page.tsx"
git commit -m "feat(public): display travel dates as a From/To range"
```

---

### Task 8: Update `scripts/seed.ts`

**Files:**
- Modify: `scripts/seed.ts`

**Interfaces:**
- Produces: `SeedTravelDate` shaped `{ dateFrom: string; dateTo: string; additionalFee?: number }`; the 3 `SEED_PACKAGES` entries' travel dates become real multi-day ranges matching each package's `durationLabel` instead of same-day placeholders; the insert mapping writes `travel_date_from`/`travel_date_to`.

- [ ] **Step 1: Update the `SeedTravelDate` type**

Find (current line 62):

```ts
type SeedTravelDate = { date: string; additionalFee?: number }
```

Replace with:

```ts
type SeedTravelDate = { dateFrom: string; dateTo: string; additionalFee?: number }
```

- [ ] **Step 2: Update Palawan's travel dates (3 days, 2 nights — a 3-day span)**

Find (current lines 151-155):

```ts
    travelDates: [
      { date: '2026-09-12' },
      { date: '2026-10-17', additionalFee: 1500 },
      { date: '2026-11-21' },
    ],
```

Replace with:

```ts
    travelDates: [
      { dateFrom: '2026-09-12', dateTo: '2026-09-14' },
      { dateFrom: '2026-10-17', dateTo: '2026-10-19', additionalFee: 1500 },
      { dateFrom: '2026-11-21', dateTo: '2026-11-23' },
    ],
```

- [ ] **Step 3: Update Siargao's travel dates (4 days, 3 nights — a 4-day span)**

Find (current lines 206-209):

```ts
    travelDates: [
      { date: '2026-09-05' },
      { date: '2026-10-03' },
    ],
```

Replace with:

```ts
    travelDates: [
      { dateFrom: '2026-09-05', dateTo: '2026-09-08' },
      { dateFrom: '2026-10-03', dateTo: '2026-10-06' },
    ],
```

- [ ] **Step 4: Update Banaue's travel dates (3 days, 2 nights — a 3-day span)**

Find (current lines 254-256):

```ts
    travelDates: [
      { date: '2026-11-14' },
    ],
```

Replace with:

```ts
    travelDates: [
      { dateFrom: '2026-11-14', dateTo: '2026-11-16' },
    ],
```

- [ ] **Step 5: Update the insert mapping**

Find (current lines 397-402):

```ts
  // Travel dates (at least one per package).
  const { error: travelDatesError } = await supabase.from('package_travel_dates').insert(
    pkg.travelDates.map((date) => ({
      package_id: packageId,
      travel_date: date.date,
      additional_fee: date.additionalFee ?? null,
    }))
  )
```

Replace with:

```ts
  // Travel dates (at least one per package).
  const { error: travelDatesError } = await supabase.from('package_travel_dates').insert(
    pkg.travelDates.map((date) => ({
      package_id: packageId,
      travel_date_from: date.dateFrom,
      travel_date_to: date.dateTo,
      additional_fee: date.additionalFee ?? null,
    }))
  )
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: the entire project now compiles with zero errors.

Run: `npm run seed`
Expected: "Seed complete.", no errors. Run it a second time immediately after to confirm idempotency (same package IDs, no duplicates — the existing name-based upsert from a prior plan already handles this; this task doesn't change that logic).

- [ ] **Step 7: Commit**

```bash
git add scripts/seed.ts
git commit -m "chore(seed): update seed script for travel date ranges"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type check, lint, build**

Run: `npx tsc --noEmit` — expect zero errors.
Run: `npm run lint` — expect zero errors (pre-existing unrelated warnings are fine).
Run: `npm run build` — expect success.

- [ ] **Step 2: Manual walkthrough**

Run: `npm run dev`.
1. Visit `/packages` and a couple of package detail pages — confirm Travel Dates now show as ranges (e.g. "September 12 – September 14, 2026") for the reseeded packages, with the additional-fee badge still showing where set.
2. As an admin, open one of the reseeded packages' edit page → Travel Dates tab — confirm each row shows separate From/To fields populated with the real range, not the same date twice.
3. Try setting a To date earlier than From on one row and Save — confirm the form blocks submission with "End date must be on or after the start date" under the To field, and switches to the Travel Dates tab.
4. Add a new travel date row, fill in valid From/To (and optionally a fee), save — confirm it persists and displays correctly on the public detail page.

- [ ] **Step 3: No commit** — this task is verification-only; if any check fails, fix it within the task that owns the affected file and re-run this task.
