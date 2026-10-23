# Events — Design

## Intent

TravelSentro takes part in events: tournaments it sponsors, exhibits it organizes, booths at fairs. The website should show these events.

- **Upcoming events** tell people where to find TravelSentro next.
- **Past events** show a track record. Their photos are the proof that TravelSentro is real and active.

Staff manage all events from the admin panel and pick which ones also appear on the homepage.

## Goals

1. A public `/events` page that lists published events in two groups:
   - **Upcoming**, soonest first.
   - **Past**, newest first.
2. A public page for each event at `/events/[slug]`, with a cover photo, dates, venue, full write-up, photo gallery, and an optional external link.
3. A homepage section that shows only the events staff choose with a "Show on homepage" switch.
4. An admin "Events" page to create, edit, publish or unpublish, feature, and delete events, and to manage each event's photos.

## Non-goals

- Ticketing, registration, RSVPs, or an "attend" button. Visitors who want to ask about an event use the existing contact channels.
- Calendar exports (.ics) or a calendar grid view.
- Recurring events.
- A new staff permission. Events use the existing `can_manage_packages` permission, like Content and Partners do.

## Anti-goals (this would count as a failure)

- An event stays under "Upcoming" after it has ended because someone forgot to move it. Sorting must be automatic and based on the date.
- Draft or unpublished events show up anywhere public: the list, the homepage, a detail URL, or the sitemap.
- The homepage section shows up empty or broken when no events are featured.

## Decisions

### Event fields (agreed)

| Field | Notes |
|---|---|
| Name | Required |
| Type | Required. One of: Sponsorship, Exhibit, Booth, Other. Shown as a tag on cards |
| Start date | Required. Date only, no time |
| End date | Optional. Single-day event when empty. Must be on or after the start date |
| Venue / location | Required, free text (for example "SMX Convention Center, Pasay — Booth 112") |
| Short summary | Optional, shown on cards. About 1–2 sentences |
| Full write-up | Optional, multi-line plain text, shown on the event page |
| Cover photo | Required to publish. Used on cards and at the top of the event page |
| Gallery photos | 0 or more, in an order staff can change |
| External link | Optional. Must be http(s). For example the Facebook post or the organizer's page |
| Published | Switch. Off = draft, visible only in the admin |
| Show on homepage | Switch. Only matters when the event is published |

### Upcoming vs past (agreed: automatic)

An event counts as **upcoming** while today, in Asia/Manila time, is on or before its end date (or its start date when there's no end date). After that it counts as **past**. Nobody has to move it by hand.

Public pages use ISR (`revalidate = 60`, as on the homepage), so an event moves to "Past" within about a minute after midnight Manila time once a request comes in.

### Homepage section (agreed: only picked events)

- Shows events that are published **and** marked "Show on homepage".
- *My call:* at most 4 events. Upcoming ones come first (soonest first), then past ones (newest first). There is a "See all events" link to `/events`.
- *My call:* the section is hidden when no events are picked, the same way the Visa Services section is.
- *My call:* it goes after Testimonials and before Partner Affiliations. Events and testimonials both build trust, so they sit together.

### Navigation (agreed)

- Public header: add "Events" between Packages and FAQ.
- Admin sidebar: add "Events", shown only to staff who have `can_manage_packages`.

### Following existing patterns (my calls)

- **Database:** a new `events` table plus an `event_photos` table for the gallery. Row-level security works like `visa_services` and `partners`:
  - The public can read only published events, and only the photos of published events.
  - `can_manage_packages` users get full access through `has_permission()`.
  - The database checks that the link is http(s) (same as `partners_link_url_http`) and that the end date is on or after the start date.
- **Images:** stored in R2 under an `events/` folder, and shown with `getPublicImageUrl`.
  - The cover photo uploads through `uploadSiteContentImage` (add `"events"` to its folder allow-list).
  - The gallery reuses the package gallery's upload, reorder, and delete approach, minus the watermark check, which only matters for supplier package photos.
  - Deleting an event also deletes its R2 objects.
- **Slug:** created from the name when the event is first saved (for example `manila-travel-fair-2026`). A number is added if that slug is already taken. The slug stays the same when the event is renamed later, so shared links keep working. Staff don't edit it.
- **Admin list ordering:** by start date, newest first. No drag-to-sort, because the date sets the order everywhere.
- **Admin list view:** shows the cover thumbnail, name, type, dates, a Published switch, a Homepage switch, and Edit/Delete. Both switches update instantly, like Partners' visibility toggle.
- **Revalidation:** every event save or delete refreshes `/`, `/events`, that event's page, and `/admin/events`.
- **SEO:** add `/events` and each published event page to `app/sitemap.ts`. Event pages use `buildPageMetadata`, with the cover photo as the OG image.
- **Empty states:** `/events` with no upcoming events shows a short line ("No upcoming events right now — check back soon") above the Past group. When there are no events at all, it shows one friendly empty message.
- **Unpublished or unknown slug:** returns the normal 404 page.
- **Cover photo required to publish:** enforced in three places:
  - The database rejects a published event with no cover.
  - The form won't save a published event without a cover.
  - The Published switch in the admin list refuses (with a short message) when the event has no cover.
- **Gallery uploads:** only available after the event's first save, the same as packages. The form says "Save the event to add gallery photos."

## Constraints

- Stay on the existing stack: Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing code), Supabase with RLS, R2 for images, shadcn/ui, react-hook-form + zod, and dnd-kit for the gallery order.
- Server Actions re-validate their input with zod and check `requirePermission("can_manage_packages")`, as `actions/partners.ts` does.
- Run `supabase gen types` after the migration.
- Both staging and production use the same Supabase project, so the migration only adds new tables and changes nothing that already exists.

## Left to the builder

- Card and event-page visual design, kept consistent with the existing homepage sections and package pages.
- Gallery viewer on the event page (a simple grid with a lightbox is fine).
- Exact copy for labels and empty states.
