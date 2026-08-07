# Travel Dates: From/To Range — Design Spec

**Date:** 2026-08-08
**Status:** Approved by user, pending implementation plan.

## Summary

Change each travel date entry on a package from a single date to a date range (From/To). Both dates are always required — a single-day departure is entered as `From == To`, with `To >= From` enforced. This changes the DB schema, the admin form's Travel Dates tab, the RPC that persists it, and the public site's display, and updates seed data to model real multi-day ranges instead of single-day placeholders.

## Data Model

```sql
alter table package_travel_dates add column travel_date_from date;
alter table package_travel_dates add column travel_date_to date;
update package_travel_dates set travel_date_from = travel_date, travel_date_to = travel_date;
alter table package_travel_dates alter column travel_date_from set not null;
alter table package_travel_dates alter column travel_date_to set not null;
alter table package_travel_dates add constraint package_travel_dates_to_after_from check (travel_date_to >= travel_date_from);
alter table package_travel_dates drop column travel_date;
```

`write_package_children()`'s `p_travel_dates` jsonb entries change from `{travel_date, additional_fee}` to `{travel_date_from, travel_date_to, additional_fee}`. No RLS policy changes needed (they reference `package_id`, not date columns).

## Admin Form

`package-form-schema.ts`'s `travelDateSchema` becomes:
```ts
const travelDateSchema = z
  .object({
    dateFrom: z.string().min(1, "Please pick a start date"),
    dateTo: z.string().min(1, "Please pick an end date"),
    additionalFee: z.number().positive().optional(),
  })
  .refine((v) => v.dateTo >= v.dateFrom, {
    message: "End date must be on or after the start date",
    path: ["dateTo"],
  });
```
(`YYYY-MM-DD` strings compare correctly with `>=`.)

`package-form.tsx`'s Travel Dates tab: each row gets two native `<input type="date">` fields labeled "From" and "To" (replacing the single "Date" field), same numbered-card/confirm-before-remove pattern as today. The row's "has content" check for the remove-confirmation dialog now checks `dateFrom || dateTo || additionalFee`.

## Public Site

`app/(public)/packages/[slug]/page.tsx`'s Travel Dates section: format each entry as `"{From} – {To}"` when `travel_date_from !== travel_date_to`, or just `"{From}"` when they're equal (same-day departure) — avoids a redundant "Sep 12 – Sep 12."

## Seed Data

`scripts/seed.ts`'s 3 `SEED_PACKAGES` travel dates become real ranges matching each package's actual `durationLabel` (e.g. Palawan's "3 days, 2 nights" gets a 3-day-span range) instead of same-day placeholders — a more honest demo of the feature than same-day entries would be.

## Explicit Non-Goals

- No change to `duration_label` (still a separate, general trip-length descriptor).
- No filtering of past travel dates from the public display (pre-existing parked follow-up, out of scope here).
- No change to how `additional_fee` behaves — still one optional fee per travel-date entry, now covering the whole range rather than a single day.
