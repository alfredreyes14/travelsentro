# Package PDF Export — Design Spec

**Date:** 2026-08-08
**Status:** Approved by user, pending implementation plan.

## Summary

Add a "Download PDF" option that generates a printable itinerary document for a single package — package name, duration, price, itinerary, inclusions/exclusions, what to bring, travel dates, and remarks, in the visual style of the existing `BEIJING 5D4N ALL-IN PACKAGE.pdf` sample and the `Letter Head (TravelSentro).docx` template (logo header, navy/orange footer contact bar). Photos are excluded. Available on the public package detail page and in the admin package list + edit page; not on the public listing grid card.

Generated with `@react-pdf/renderer` (new dependency) — a React-component-tree PDF builder, the same authoring model this repo already uses for email templates via `react-email`. No headless browser, so it stays cheap and reliable on Vercel Hobby.

## Content

Mirrors `app/(public)/packages/[slug]/page.tsx`'s sections, minus `package_photos`, the WhatsApp/Facebook/Inquiry CTAs, and the sticky bar:

- **Header:** `logo-header.png`, package `name`, `duration_label` badge, price — struck-through `price_per_pax` plus discounted total when `discount_amount` is set, same math as the detail page (`price_per_pax - (discount_amount ?? 0)`).
- **Itinerary:** one block per `itinerary_days` row sorted by `day_number` — `"Day {day_number}: {title}"` bold, then `description` split on `\n` into bullet lines (a single-paragraph description becomes one bullet — mirrors the sample PDF's bulleted-activities look without requiring new structured fields).
- **What's Included / What's Not Included / What to Bring:** bullet lists from `package_inclusions`, filtered by `kind` (`"included" | "excluded" | "bring"`), sorted by `sort_order`. Unlike the website's persistent cards, **a section is omitted entirely when it has zero items** — cleaner for a printable/shareable document.
- **Travel Dates:** only rendered if `package_travel_dates` is non-empty. Each entry: `travel_date` formatted `en-PH` long-form (`"August 20, 2026"`), plus `+₱{additional_fee}` when set — same formatting as the detail page.
- **Remarks:** only rendered if `pkg.remarks` is non-null.
- **Footer (every page):** navy (`#021f4a`) bar with phone, email, and address, plus a thin orange (`#f49314`) strip below — built natively with react-pdf primitives (not a raster image), reusing the exact brand hex already defined in `app/globals.css` (`--secondary`, `--primary`).

No email or physical address constant exists in the codebase today. Add them next to `FACEBOOK_URL` in `lib/constants.ts`, sourced from the letterhead docx:

```ts
export const CONTACT_EMAIL = "info@travelsentro.com";
export const CONTACT_ADDRESS =
  "Level 21, Park Triangle Corporate Plaza, North Tower, 32nd St. Cor. 11th Ave., BGC, Taguig City";
```

The phone number is reformatted from the existing `WHATSAPP_NUMBER` constant in `lib/whatsapp.ts` (`"639205351673"` → `"+63 920 535 1673"`) rather than duplicated as a new literal.

## Tech Structure

- **`lib/pdf/package-pdf.tsx`** — shared module:
  - `fetchPackageForPdf(supabase, { slug: string } | { id: string })` — same joins as the detail page's query (`itinerary_days`, `package_inclusions`, `package_travel_dates`), minus `package_photos`; slug lookups add `.eq("is_published", true)`, id lookups don't.
  - `<PackagePdfDocument pkg={...} />` — the `@react-pdf/renderer` `Document`/`Page`/`View`/`Text`/`Image` tree described above.
  - `renderPackagePdf(pkg)` — wraps `@react-pdf/renderer`'s `renderToBuffer` for use in both route handlers.

- **`app/(public)/packages/[slug]/pdf/route.ts`** — public `GET`. Fetches via `fetchPackageForPdf({ slug })`; `notFound()`-equivalent (404 `Response`) if missing or unpublished, matching the detail page's "unpublished slug is indistinguishable from nonexistent" behavior. Returns:
  ```ts
  new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pkg.slug}.pdf"`,
    },
  });
  ```

- **`app/admin/(dashboard)/packages/[id]/pdf/route.ts`** — admin `GET`, gated with `requirePermissionOrRedirect("can_manage_packages")` (same convention as `app/admin/(dashboard)/packages/page.tsx`). Fetches via `fetchPackageForPdf({ id })` with no published filter, so drafts are downloadable. Same response shape as the public route.

Both routes are plain link targets (`<a href=... download>` / `<Link>`) — no client JS or Server Action needed, consistent with how `WhatsAppCta`/`FacebookCta` are themselves just anchor tags.

## UI Additions

- **New `components/packages/package-pdf-cta.tsx`** — styled like `WhatsAppCta`/`FacebookCta` (`min-h-11 min-w-11`, `variant?: "icon-only" | "icon-label"`, default `"icon-only"`), but using `bg-primary`/`text-primary-foreground` theme tokens instead of a hardcoded brand hex (it isn't a third-party brand). Renders `<a href={`/packages/${slug}/pdf`} download>`. Placed in the "Ready to Book This Trip?" banner on the public detail page (`app/(public)/packages/[slug]/page.tsx`), next to `WhatsAppCta`/`FacebookCta`, `variant="icon-label"`.
- **`components/admin/package-list-row.tsx`** and **`components/admin/package-list-card.tsx`** — add a `<DropdownMenuItem>` "Download PDF" (opens `/admin/packages/${item.id}/pdf` in a new tab) next to the existing "Edit" item, in both files (row + mobile card are separate components for the two breakpoints).
- **`app/admin/(dashboard)/packages/[id]/page.tsx`** — pass a "Download PDF" `<Button>`/link as `<PageHeader>` children (currently renders no children), pointing at the same admin PDF route.

## Explicit Non-Goals

- No photos/gallery in the generated PDF (explicit user requirement).
- No editing/customization of the PDF content before download — it's a direct, deterministic render of the package's current published data.
- No caching/pre-generation of PDFs — generated on-demand per request.
- No change to the public listing grid card (`components/packages/package-card.tsx`) — decided against during design.
- No bulk/multi-package PDF export — single package per document only.
