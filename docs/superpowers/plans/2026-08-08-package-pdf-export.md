# Package PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download PDF" option that generates a printable, letterhead-styled itinerary document for a single package, available on the public package detail page and in the admin package list + edit page.

**Architecture:** A shared `lib/pdf/package-pdf.tsx` module owns a Supabase fetch helper and a `@react-pdf/renderer` document template; two thin Route Handlers (public + admin) call it and stream back a PDF with `Content-Disposition: attachment`. UI additions are plain `<a>`/render-prop links pointing at those routes — no client JS or Server Action needed.

**Tech Stack:** Next.js 16 App Router Route Handlers, `@react-pdf/renderer` (new dependency), existing Supabase server client (`lib/supabase/server.ts`), existing permission DAL (`lib/auth/dal.ts`).

## Global Constraints

- PDF engine is `@react-pdf/renderer` — no headless browser (Puppeteer/Playwright), per approved design.
- The PDF excludes all package photos (explicit requirement) — no `package_photos` query, no `<Image>` of gallery photos.
- "Download PDF" appears on: the public package detail page, the admin package list (both the desktop row and mobile card), and the admin edit page. It does **not** appear on the public packages listing grid card (`components/packages/package-card.tsx` is not touched).
- No bulk/multi-package export, no PDF caching/pre-generation, no editing of PDF content before download — every task in this plan renders on-demand from live data only.
- Footer contact info is sourced verbatim from `public/Letter Head (TravelSentro).docx`: phone `+63-920-535-1673` (formatted from the existing `WHATSAPP_NUMBER` constant), email `info@travelsentro.com`, address `Level 21, Park Triangle Corporate Plaza, North Tower, 32nd St. Cor. 11th Ave., BGC, Taguig City`.
- Price is rendered as `PHP {amount}` text (not the `₱` glyph) — the built-in PDF Helvetica font has no `₱` glyph, and registering a custom font adds real complexity/risk for no visual gain here; the sample PDF this feature is patterned on already uses `PHP` text for the same reason.
- This repo has no unit-test framework (no jest/vitest/playwright) — verification follows the repo's existing `scripts/verify-*.ts` (`tsx --env-file=.env.local`) convention for behavior/security-sensitive logic, and `npm run build` + manual dev-server checks for pure UI wiring, exactly as this repo already does elsewhere. Do not introduce a new test framework.
- Brand colors: navy `#021f4a`, orange `#f49314` — copied from `app/globals.css`'s `--secondary`/`--primary` tokens, not re-guessed from the sample images.

---

### Task 1: Install `@react-pdf/renderer`, add contact constants, configure Next.js

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `next.config.ts`
- Modify: `lib/constants.ts`
- Modify: `lib/whatsapp.ts`

**Interfaces:**
- Produces: `CONTACT_EMAIL: string`, `CONTACT_ADDRESS: string` (exported from `lib/constants.ts`); `WHATSAPP_NUMBER: string` (now exported, was private), `formatWhatsAppNumberForDisplay(): string` (exported from `lib/whatsapp.ts`).

- [ ] **Step 1: Install the dependency**

Run: `npm install @react-pdf/renderer@^4.5.1`

- [ ] **Step 2: Mark it as a server-external package**

`@react-pdf/renderer` ships its own Node-targeted build; letting Turbopack/webpack bundle it risks resolving the wrong entry point inside a Route Handler. Edit `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/package-photos/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/site-content/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
```

(Only the trailing `serverExternalPackages` line is new — everything else is unchanged from the current file.)

- [ ] **Step 3: Add the contact constants**

Edit `lib/constants.ts` — append below the existing `FACEBOOK_URL` export:

```ts
// D-04: TravelSentro's Facebook page — centralized here so every CTA and
// future call site shares one constant instead of inlining the URL.
export const FACEBOOK_URL =
  "https://web.facebook.com/profile.php?id=61567102791951";

// Package PDF export — business contact info for the printable itinerary's
// footer, sourced verbatim from the official letterhead template
// (public/Letter Head (TravelSentro).docx). No email/address constant
// existed anywhere in the codebase before this.
export const CONTACT_EMAIL = "info@travelsentro.com";
export const CONTACT_ADDRESS =
  "Level 21, Park Triangle Corporate Plaza, North Tower, 32nd St. Cor. 11th Ave., BGC, Taguig City";
```

- [ ] **Step 4: Export the WhatsApp number and add a display formatter**

Edit `lib/whatsapp.ts` in full:

```ts
// D-05: build a per-package wa.me deep link with a pre-filled message
// mentioning the specific package name, rather than a single static link.
// D-03: WhatsApp CTA number, international format, no leading "+" and no
// spaces/dashes, per wa.me's documented link format. Exported (was
// previously private) so the package PDF export's footer can reformat the
// same number for display instead of duplicating it as a new literal.
export const WHATSAPP_NUMBER = "639205351673";

export function buildWhatsAppLink(packageName?: string): string {
  const message = packageName
    ? `Hi! I'm interested in ${packageName}`
    : "Hi! I'd like to know more about your tour packages";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Package PDF export's footer wants the business phone number in
// human-readable form ("+63-920-535-1673", matching the official letterhead
// template), not wa.me's dash/space-free international format.
export function formatWhatsAppNumberForDisplay(): string {
  const digits = WHATSAPP_NUMBER;
  return `+${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`;
}
```

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: build succeeds with no type errors (proves `next.config.ts` is valid and the new exports typecheck against nothing yet, since nothing imports them yet).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.ts lib/constants.ts lib/whatsapp.ts
git commit -m "feat: add react-pdf dependency and PDF contact constants"
```

---

### Task 2: Build the shared PDF generator (`lib/pdf/package-pdf.tsx`)

**Files:**
- Create: `lib/pdf/package-pdf.tsx`
- Create: `scripts/verify-package-pdf.ts`
- Modify: `package.json` (add `verify:package-pdf` script)

**Interfaces:**
- Consumes: `CONTACT_EMAIL`, `CONTACT_ADDRESS` from `lib/constants.ts` (Task 1); `formatWhatsAppNumberForDisplay` from `lib/whatsapp.ts` (Task 1); `Database`, `Tables` from `types/database.ts`.
- Produces: `type PackagePdfData` (packages row + itinerary/inclusions/travel-dates arrays); `fetchPackageForPdf(supabase: SupabaseClient<Database>, selector: { slug: string } | { id: string }): Promise<PackagePdfData | null>`; `PackagePdfDocument({ pkg, logoSrc }: { pkg: PackagePdfData; logoSrc: string })` (React component); `renderPackagePdf(pkg: PackagePdfData, logoSrc: string): Promise<Buffer>`; `LOCAL_LOGO_PATH: string` (filesystem path to the header logo, for local/script use only). These four names (`fetchPackageForPdf`, `PackagePdfDocument`, `renderPackagePdf`, `LOCAL_LOGO_PATH`) are exactly what Tasks 3 and 4's route handlers import.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-package-pdf.ts`:

```ts
/**
 * Live-data verification for the package PDF generator
 * (lib/pdf/package-pdf.tsx). Creates a disposable draft package with
 * itinerary/inclusions/exclusions/bring-items/travel-dates/remarks so every
 * optional PDF section has content to render, fetches it via
 * fetchPackageForPdf() and renders it via renderPackagePdf(), then asserts
 * the output is a real, well-formed PDF buffer. Always deletes the
 * disposable package in a finally block (cascades to its child rows —
 * see supabase/migrations/20260718114727_create_package_schema.sql and
 * .../20260807180000_package_fields_rework.sql, both `on delete cascade`),
 * mirroring scripts/verify-permission-denial.ts's disposable-row hygiene.
 *
 * Run via `npm run verify:package-pdf` (-> `tsx --env-file=.env.local
 * scripts/verify-package-pdf.ts`).
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import {
  fetchPackageForPdf,
  renderPackagePdf,
  LOCAL_LOGO_PATH,
} from "../lib/pdf/package-pdf";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:package-pdf`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const supabase = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const results: CheckResult[] = [];
  let packageId: string | undefined;

  try {
    // Deliberately left unpublished (no destination_id) -- publishing
    // requires a destination per packages_destination_required_if_published,
    // and this script only needs id-based fetch, never the published path.
    const { data: pkgRow, error: pkgError } = await supabase
      .from("packages")
      .insert({
        name: "Verify PDF Smoke Test Package",
        price_per_pax: 12000,
        discount_amount: 1000,
        duration_label: "3 days, 2 nights",
        remarks:
          "Verification-only package, safe to ignore if seen in the admin list.",
      })
      .select("id, slug")
      .single();

    if (pkgError || !pkgRow) {
      throw new Error(
        `Failed to insert disposable package: ${pkgError?.message ?? "no row returned"}`
      );
    }
    packageId = pkgRow.id;

    const { error: itineraryError } = await supabase
      .from("itinerary_days")
      .insert([
        {
          package_id: packageId,
          day_number: 1,
          title: "Arrival",
          description: "Check in to hotel.\nWelcome dinner.",
        },
        {
          package_id: packageId,
          day_number: 2,
          title: "City Tour",
          description: "Full-day guided tour.",
        },
      ]);
    if (itineraryError) {
      throw new Error(
        `Failed to insert itinerary_days: ${itineraryError.message}`
      );
    }

    const { error: inclusionsError } = await supabase
      .from("package_inclusions")
      .insert([
        {
          package_id: packageId,
          kind: "included",
          label: "Hotel accommodation",
          sort_order: 0,
        },
        {
          package_id: packageId,
          kind: "excluded",
          label: "Airfare",
          sort_order: 0,
        },
        { package_id: packageId, kind: "bring", label: "Sunscreen", sort_order: 0 },
      ]);
    if (inclusionsError) {
      throw new Error(
        `Failed to insert package_inclusions: ${inclusionsError.message}`
      );
    }

    const { error: travelDatesError } = await supabase
      .from("package_travel_dates")
      .insert([
        {
          package_id: packageId,
          travel_date_from: "2026-12-01",
          travel_date_to: "2026-12-03",
          additional_fee: 500,
        },
      ]);
    if (travelDatesError) {
      throw new Error(
        `Failed to insert package_travel_dates: ${travelDatesError.message}`
      );
    }

    const pkg = await fetchPackageForPdf(supabase, { id: packageId });
    results.push({
      name: "fetchPackageForPdf returns the package",
      pass: pkg !== null && pkg.id === packageId,
      detail: pkg ? `fetched id=${pkg.id}` : "fetchPackageForPdf returned null",
    });

    if (!pkg) throw new Error("Cannot continue -- fetchPackageForPdf returned null");

    results.push({
      name: "fetched package includes all child rows",
      pass:
        pkg.itinerary_days.length === 2 &&
        pkg.package_inclusions.length === 3 &&
        pkg.package_travel_dates.length === 1,
      detail: `itinerary_days=${pkg.itinerary_days.length} package_inclusions=${pkg.package_inclusions.length} package_travel_dates=${pkg.package_travel_dates.length}`,
    });

    const buffer = await renderPackagePdf(pkg, LOCAL_LOGO_PATH);
    const signature = buffer.subarray(0, 5).toString("ascii");

    results.push({
      name: "renderPackagePdf produces a well-formed PDF buffer",
      pass: signature === "%PDF-" && buffer.length > 1000,
      detail: `signature=${JSON.stringify(signature)} length=${buffer.length}`,
    });
  } finally {
    if (packageId) {
      const { error: deleteError } = await supabase
        .from("packages")
        .delete()
        .eq("id", packageId);
      if (deleteError) {
        console.error(
          `WARNING: failed to delete disposable package ${packageId}: ${deleteError.message}`
        );
      }
    }
  }

  console.log("\nverify-package-pdf\n");
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-package-pdf failed:", err);
  process.exit(1);
});
```

Add the npm script — edit `package.json`'s `"scripts"` block, adding this line alongside the existing `verify:*` entries:

```json
"verify:package-pdf": "tsx --env-file=.env.local scripts/verify-package-pdf.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run verify:package-pdf`
Expected: fails immediately with a module-not-found error for `../lib/pdf/package-pdf` (the file doesn't exist yet).

- [ ] **Step 3: Write the PDF generator**

Create `lib/pdf/package-pdf.tsx`:

```tsx
import path from "node:path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CONTACT_ADDRESS, CONTACT_EMAIL } from "@/lib/constants";
import { formatWhatsAppNumberForDisplay } from "@/lib/whatsapp";
import type { Database, Tables } from "@/types/database";

export type PackagePdfData = Tables<"packages"> & {
  itinerary_days: Pick<
    Tables<"itinerary_days">,
    "day_number" | "title" | "description"
  >[];
  package_inclusions: Pick<
    Tables<"package_inclusions">,
    "kind" | "label" | "sort_order"
  >[];
  package_travel_dates: Pick<
    Tables<"package_travel_dates">,
    "travel_date_from" | "travel_date_to" | "additional_fee"
  >[];
};

/**
 * Local filesystem path to the header logo, for use by scripts/tsx code
 * that runs directly on disk (e.g. scripts/verify-package-pdf.ts). Route
 * handlers must NOT use this -- reading public/ via fs at runtime is
 * unreliable on Vercel's serverless functions (public/ isn't guaranteed to
 * be present on the function's local disk), so
 * app/(public)/packages/[slug]/pdf/route.ts and
 * app/admin/(dashboard)/packages/[id]/pdf/route.ts instead pass an
 * absolute HTTP(S) URL built from the incoming request, which react-pdf's
 * <Image> fetches directly and which always resolves correctly since it's
 * the site's own public, CDN-served asset.
 */
export const LOCAL_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "logo-header.png"
);

/**
 * Same joins as the public detail page's query
 * (app/(public)/packages/[slug]/page.tsx) minus package_photos -- the PDF
 * never includes photos (explicit requirement). `{ slug }` additionally
 * filters on is_published, matching the detail page's "unpublished slug is
 * indistinguishable from nonexistent" behavior; `{ id }` doesn't, so admin
 * can download drafts.
 */
export async function fetchPackageForPdf(
  supabase: SupabaseClient<Database>,
  selector: { slug: string } | { id: string }
): Promise<PackagePdfData | null> {
  const columns = `*,
    itinerary_days(day_number, title, description),
    package_inclusions(kind, label, sort_order),
    package_travel_dates(travel_date_from, travel_date_to, additional_fee)`;

  // Written as two full, separate chains (rather than building a shared
  // partial query builder and branching with .eq() calls) to avoid relying
  // on TypeScript unifying the builder's type across two different filter
  // paths -- matches how every other page in this codebase (detail page,
  // admin edit page) writes its own full Supabase chain rather than
  // sharing partial builders.
  const { data, error } =
    "slug" in selector
      ? await supabase
          .from("packages")
          .select(columns)
          .eq("slug", selector.slug)
          .eq("is_published", true)
          .single()
      : await supabase
          .from("packages")
          .select(columns)
          .eq("id", selector.id)
          .single();

  if (error || !data) return null;

  return data as PackagePdfData;
}

// Rendered as "PHP {amount}" text, not the "₱" glyph -- react-pdf's default
// Helvetica font (a PDF standard-14 font) has no ₱ glyph, and this is the
// same convention the sample PDF this feature is patterned on already uses.
function formatPhp(amount: number): string {
  return `PHP ${amount.toLocaleString("en-PH")}`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Same "From" / "From – To" collapsing as the public detail page
// (app/(public)/packages/[slug]/page.tsx) -- a same-day departure (from ===
// to) shows just one date instead of a redundant "Sep 12 – Sep 12."
function formatTravelDateRange(from: string, to: string): string {
  return from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
}

const NAVY = "#021f4a";
const ORANGE = "#f49314";

const styles = StyleSheet.create({
  page: {
    paddingTop: 90,
    paddingBottom: 90,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    position: "absolute",
    top: 30,
    left: 40,
  },
  logo: {
    width: 150,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  duration: {
    fontSize: 11,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceStrike: {
    fontSize: 10,
    textDecoration: "line-through",
    color: "#6b7280",
    marginRight: 6,
  },
  price: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 6,
  },
  dayBlock: {
    marginBottom: 8,
  },
  dayTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  bullet: {
    fontSize: 10,
    lineHeight: 1.4,
    marginLeft: 12,
    marginBottom: 1,
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerBar: {
    backgroundColor: NAVY,
    color: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
  },
  footerStripe: {
    height: 6,
    backgroundColor: ORANGE,
  },
});

export function PackagePdfDocument({
  pkg,
  logoSrc,
}: {
  pkg: PackagePdfData;
  logoSrc: string;
}) {
  const finalPrice = pkg.price_per_pax - (pkg.discount_amount ?? 0);
  const hasDiscount = (pkg.discount_amount ?? 0) > 0;

  const sortedDays = [...pkg.itinerary_days].sort(
    (a, b) => a.day_number - b.day_number
  );
  const inclusions = pkg.package_inclusions
    .filter((item) => item.kind === "included")
    .sort((a, b) => a.sort_order - b.sort_order);
  const exclusions = pkg.package_inclusions
    .filter((item) => item.kind === "excluded")
    .sort((a, b) => a.sort_order - b.sort_order);
  const bringItems = pkg.package_inclusions
    .filter((item) => item.kind === "bring")
    .sort((a, b) => a.sort_order - b.sort_order);
  const travelDates = [...pkg.package_travel_dates].sort(
    (a, b) =>
      a.travel_date_from.localeCompare(b.travel_date_from) ||
      a.travel_date_to.localeCompare(b.travel_date_to)
  );

  return (
    <Document title={pkg.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src={logoSrc} style={styles.logo} />
        </View>

        <Text style={styles.title}>{pkg.name}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.duration}>
            {pkg.duration_label ?? "Duration TBA"}
          </Text>
          <View style={styles.priceRow}>
            {hasDiscount ? (
              <Text style={styles.priceStrike}>
                {formatPhp(pkg.price_per_pax)}
              </Text>
            ) : null}
            <Text style={styles.price}>{formatPhp(finalPrice)} / pax</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>ITINERARY</Text>
        {sortedDays.map((day) => (
          <View key={day.day_number} style={styles.dayBlock} wrap={false}>
            <Text style={styles.dayTitle}>
              Day {day.day_number}: {day.title}
            </Text>
            {day.description
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, index) => (
                <Text key={index} style={styles.bullet}>
                  • {line}
                </Text>
              ))}
          </View>
        ))}

        {inclusions.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>WHAT&apos;S INCLUDED</Text>
            {inclusions.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {exclusions.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>WHAT&apos;S NOT INCLUDED</Text>
            {exclusions.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {bringItems.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>WHAT TO BRING</Text>
            {bringItems.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {travelDates.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>TRAVEL DATES</Text>
            {travelDates.map((date, index) => (
              <View key={index} style={styles.dateRow}>
                <Text style={styles.paragraph}>
                  {formatTravelDateRange(date.travel_date_from, date.travel_date_to)}
                </Text>
                {date.additional_fee ? (
                  <Text style={styles.paragraph}>
                    +{formatPhp(date.additional_fee)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {pkg.remarks ? (
          <View>
            <Text style={styles.sectionTitle}>REMARKS</Text>
            <Text style={styles.paragraph}>{pkg.remarks}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <View style={styles.footerBar}>
            <Text>{formatWhatsAppNumberForDisplay()}</Text>
            <Text>{CONTACT_EMAIL}</Text>
            <Text>{CONTACT_ADDRESS}</Text>
          </View>
          <View style={styles.footerStripe} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPackagePdf(
  pkg: PackagePdfData,
  logoSrc: string
): Promise<Buffer> {
  return renderToBuffer(<PackagePdfDocument pkg={pkg} logoSrc={logoSrc} />);
}
```

- [ ] **Step 4: Run the verification script again to confirm it passes**

Run: `npm run verify:package-pdf`
Expected: `PASS: 3/3 checks passed`

- [ ] **Step 5: Run the type checker**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/package-pdf.tsx scripts/verify-package-pdf.ts package.json
git commit -m "feat: add package PDF generator with letterhead-style template"
```

---

### Task 3: Public PDF download route

**Files:**
- Create: `app/(public)/packages/[slug]/pdf/route.ts`
- Create: `scripts/verify-public-package-pdf.ts`
- Modify: `package.json` (add `verify:public-package-pdf` script)

**Interfaces:**
- Consumes: `fetchPackageForPdf`, `renderPackagePdf` from `@/lib/pdf/package-pdf` (Task 2); `createClient` from `@/lib/supabase/server`.

- [ ] **Step 1: Write the failing verification script**

This script exercises a real, running dev server (same live-HTTP style as `scripts/verify-permission-denial.ts`), so it can't "fail" the usual way before the route exists — it'll fail with a connection/404 error instead. Create `scripts/verify-public-package-pdf.ts`:

```ts
/**
 * Live-HTTP verification for the public package PDF download route
 * (app/(public)/packages/[slug]/pdf/route.ts). Looks up the real, published
 * "Palawan Island Hopping" seed package (scripts/seed.ts) via the
 * service-role client to get its DB-generated slug, then proves:
 *  1. a published package's PDF route returns 200 with the right headers
 *     and a well-formed PDF body.
 *  2. a nonexistent slug returns 404.
 *
 * Requires a running server (`npm run dev -- -p 3100` or
 * `npm run build && npm run start -- -p 3100`) and a seeded database
 * (`npm run seed`). Run via `npm run verify:public-package-pdf` (-> `tsx
 * --env-file=.env.local scripts/verify-public-package-pdf.ts`), with
 * BASE_URL optionally overriding the default http://localhost:3100 target.
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:public-package-pdf`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function main() {
  const supabase = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const { data: pkg, error } = await supabase
    .from("packages")
    .select("slug")
    .eq("name", "Palawan Island Hopping")
    .eq("is_published", true)
    .single();

  if (error || !pkg) {
    throw new Error(
      `Could not find published seed package "Palawan Island Hopping" -- run \`npm run seed\` first. (${error?.message ?? "no row"})`
    );
  }

  const results: CheckResult[] = [];

  const res = await fetch(`${BASE_URL}/packages/${pkg.slug}/pdf`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const signature = buffer.subarray(0, 5).toString("ascii");

  results.push({
    name: "Published package PDF route returns 200",
    pass: res.status === 200,
    detail: `status=${res.status}`,
  });
  results.push({
    name: "Published package PDF route sets Content-Type: application/pdf",
    pass: res.headers.get("content-type") === "application/pdf",
    detail: `content-type=${res.headers.get("content-type")}`,
  });
  results.push({
    name: "Published package PDF route sets an attachment Content-Disposition",
    pass: (res.headers.get("content-disposition") ?? "").startsWith(
      `attachment; filename="${pkg.slug}.pdf"`
    ),
    detail: `content-disposition=${res.headers.get("content-disposition")}`,
  });
  results.push({
    name: "Published package PDF body is a well-formed PDF",
    pass: signature === "%PDF-" && buffer.length > 1000,
    detail: `signature=${JSON.stringify(signature)} length=${buffer.length}`,
  });

  const notFoundRes = await fetch(
    `${BASE_URL}/packages/does-not-exist-xyz/pdf`
  );
  results.push({
    name: "Nonexistent slug returns 404",
    pass: notFoundRes.status === 404,
    detail: `status=${notFoundRes.status}`,
  });

  console.log(`\nverify-public-package-pdf -- BASE_URL=${BASE_URL}\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-public-package-pdf failed:", err);
  process.exit(1);
});
```

Add the npm script — edit `package.json`'s `"scripts"` block:

```json
"verify:public-package-pdf": "tsx --env-file=.env.local scripts/verify-public-package-pdf.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run (with a dev server running on port 3100 — `npm run dev -- -p 3100` in a separate terminal — and the database seeded via `npm run seed` if not already):
`npm run verify:public-package-pdf`
Expected: FAIL on the first two checks — status is 404 (route doesn't exist yet), not 200.

- [ ] **Step 3: Write the route handler**

Create `app/(public)/packages/[slug]/pdf/route.ts`:

```ts
import { fetchPackageForPdf, renderPackagePdf } from "@/lib/pdf/package-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Public PDF download for a single published package (D-XX). Same
 * "unpublished slug is indistinguishable from nonexistent" behavior as
 * app/(public)/packages/[slug]/page.tsx -- fetchPackageForPdf's slug path
 * already filters on is_published.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const pkg = await fetchPackageForPdf(supabase, { slug });
  if (!pkg) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const logoSrc = new URL("/logo-header.png", request.url).toString();
  const buffer = await renderPackagePdf(pkg, logoSrc);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pkg.slug}.pdf"`,
    },
  });
}
```

- [ ] **Step 4: Run the verification script again to confirm it passes**

Run: `npm run verify:public-package-pdf`
Expected: `PASS: 5/5 checks passed`

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/packages/[slug]/pdf/route.ts" scripts/verify-public-package-pdf.ts package.json
git commit -m "feat: add public package PDF download route"
```

---

### Task 4: Admin PDF download route (permission-gated, drafts included)

**Files:**
- Create: `app/admin/(dashboard)/packages/[id]/pdf/route.ts`
- Create: `scripts/verify-admin-package-pdf.ts`
- Modify: `package.json` (add `verify:admin-package-pdf` script)

**Interfaces:**
- Consumes: `fetchPackageForPdf`, `renderPackagePdf` from `@/lib/pdf/package-pdf` (Task 2); `requirePermissionOrRedirect` from `@/lib/auth/dal`; `createClient` from `@/lib/supabase/server`.

- [ ] **Step 1: Write the failing verification script**

This mirrors `scripts/verify-permission-denial.ts`'s disposable-Staff-account + real-cookie pattern, and additionally proves the admin route serves an unpublished (draft) package by transiently unpublishing the seeded Palawan package, always restoring it in a `finally` block. Create `scripts/verify-admin-package-pdf.ts`:

```ts
/**
 * Live-HTTP verification for the admin package PDF download route
 * (app/admin/(dashboard)/packages/[id]/pdf/route.ts). Proves:
 *  1. a zero-permission Staff session is redirected to /admin/forbidden
 *     (never served a PDF).
 *  2. a real Admin session gets a valid PDF for the seeded "Palawan Island
 *     Hopping" package.
 *  3. the admin route serves a package even while it's unpublished (a
 *     draft) -- proving no is_published filter, unlike the public route.
 *     The package's publish state is always restored in a finally block.
 *
 * Mirrors scripts/verify-permission-denial.ts's disposable-account +
 * cookie-jar sign-in helper.
 *
 * Requires a running server (`npm run dev -- -p 3100` or
 * `npm run build && npm run start -- -p 3100`) and a seeded database
 * (`npm run seed`). Run via `npm run verify:admin-package-pdf` (-> `tsx
 * --env-file=.env.local scripts/verify-admin-package-pdf.ts`), with
 * BASE_URL optionally overriding the default http://localhost:3100 target.
 *
 * SECURITY: uses the Supabase service-role key (mirroring
 * scripts/seed-admin.ts's existing safeguard) -- constructed inline here
 * only, never exported, never imported from app/ or components/.
 */
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "../types/database";

async function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket === "undefined") {
    const { WebSocket } = await import("undici");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WebSocket;
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:admin-package-pdf`."
  );
}
if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment. " +
      "Ensure .env.local is populated and run via `npm run verify:admin-package-pdf`."
  );
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "Missing ADMIN_EMAIL or ADMIN_PASSWORD in the environment. " +
      "Set both in .env.local before running `npm run verify:admin-package-pdf`."
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

async function signInAndGetCookieHeader(
  email: string,
  password: string
): Promise<string> {
  const jar = new Map<string, string>();

  const supabase = createServerClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return Array.from(jar.entries()).map(([name, value]) => ({
            name,
            value,
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => jar.set(name, value));
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInWithPassword failed for ${email}: ${error.message}`);
  }
  if (jar.size === 0) {
    throw new Error(
      `signInWithPassword for ${email} succeeded but no cookies were captured.`
    );
  }

  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function main() {
  await ensureWebSocketPolyfill();

  const serviceRoleClient = createServiceRoleClient<Database>(
    SUPABASE_URL as string,
    SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const { data: pkg, error: pkgError } = await serviceRoleClient
    .from("packages")
    .select("id, is_published")
    .eq("name", "Palawan Island Hopping")
    .single();

  if (pkgError || !pkg) {
    throw new Error(
      `Could not find seed package "Palawan Island Hopping" -- run \`npm run seed\` first. (${pkgError?.message ?? "no row"})`
    );
  }

  const disposableEmail = `verify-admin-package-pdf-${Date.now()}@travelsentro.test`;
  const disposablePassword = `Verify-${Math.random().toString(36).slice(2)}!Aa1`;
  let disposableUserId: string | undefined;
  const results: CheckResult[] = [];
  const originalIsPublished = pkg.is_published;

  try {
    const { data: created, error: createError } =
      await serviceRoleClient.auth.admin.createUser({
        email: disposableEmail,
        password: disposablePassword,
        email_confirm: true,
      });
    if (createError || !created.user) {
      throw new Error(
        `Failed to create disposable Staff auth user: ${createError?.message ?? "no user returned"}`
      );
    }
    disposableUserId = created.user.id;

    const staffCookieHeader = await signInAndGetCookieHeader(
      disposableEmail,
      disposablePassword
    );
    const adminCookieHeader = await signInAndGetCookieHeader(
      ADMIN_EMAIL as string,
      ADMIN_PASSWORD as string
    );

    // (1) Zero-permission Staff is redirected, never served a PDF.
    const staffRes = await fetch(`${BASE_URL}/admin/packages/${pkg.id}/pdf`, {
      redirect: "follow",
      headers: { cookie: staffCookieHeader },
    });
    results.push({
      name: "Zero-permission Staff is redirected away from the admin PDF route",
      pass: staffRes.url.endsWith("/admin/forbidden"),
      detail: `final url=${staffRes.url}`,
    });

    // (2) Real Admin gets a valid PDF for the published package.
    const adminRes = await fetch(`${BASE_URL}/admin/packages/${pkg.id}/pdf`, {
      headers: { cookie: adminCookieHeader },
    });
    const adminBuffer = Buffer.from(await adminRes.arrayBuffer());
    results.push({
      name: "Admin gets a well-formed PDF for a published package",
      pass:
        adminRes.status === 200 &&
        adminRes.headers.get("content-type") === "application/pdf" &&
        adminBuffer.subarray(0, 5).toString("ascii") === "%PDF-",
      detail: `status=${adminRes.status} content-type=${adminRes.headers.get("content-type")} signature=${JSON.stringify(adminBuffer.subarray(0, 5).toString("ascii"))}`,
    });

    // (3) Admin still gets a valid PDF once the package is a draft.
    const { error: unpublishError } = await serviceRoleClient
      .from("packages")
      .update({ is_published: false })
      .eq("id", pkg.id);
    if (unpublishError) {
      throw new Error(`Failed to unpublish package for test: ${unpublishError.message}`);
    }

    const draftRes = await fetch(`${BASE_URL}/admin/packages/${pkg.id}/pdf`, {
      headers: { cookie: adminCookieHeader },
    });
    const draftBuffer = Buffer.from(await draftRes.arrayBuffer());
    results.push({
      name: "Admin gets a well-formed PDF for an unpublished (draft) package",
      pass:
        draftRes.status === 200 &&
        draftBuffer.subarray(0, 5).toString("ascii") === "%PDF-",
      detail: `status=${draftRes.status} signature=${JSON.stringify(draftBuffer.subarray(0, 5).toString("ascii"))}`,
    });
  } finally {
    const { error: restoreError } = await serviceRoleClient
      .from("packages")
      .update({ is_published: originalIsPublished })
      .eq("id", pkg.id);
    if (restoreError) {
      console.error(
        `WARNING: failed to restore is_published=${originalIsPublished} on package ${pkg.id}: ${restoreError.message}`
      );
    }
    if (disposableUserId) {
      const { error: deleteError } =
        await serviceRoleClient.auth.admin.deleteUser(disposableUserId);
      if (deleteError) {
        console.error(
          `WARNING: failed to delete disposable user ${disposableUserId}: ${deleteError.message}`
        );
      }
    }
  }

  console.log(`\nverify-admin-package-pdf -- BASE_URL=${BASE_URL}\n`);
  let allPass = true;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${label}] ${r.name} -- ${r.detail}`);
  }
  console.log(
    `\n${allPass ? "PASS" : "FAIL"}: ${results.filter((r) => r.pass).length}/${results.length} checks passed\n`
  );

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("verify-admin-package-pdf failed:", err);
  process.exit(1);
});
```

Add the npm script — edit `package.json`'s `"scripts"` block:

```json
"verify:admin-package-pdf": "tsx --env-file=.env.local scripts/verify-admin-package-pdf.ts",
```

- [ ] **Step 2: Run it to verify it fails**

Run (dev server on port 3100, database seeded, `ADMIN_EMAIL`/`ADMIN_PASSWORD` set in `.env.local` per `npm run seed:admin`'s setup):
`npm run verify:admin-package-pdf`
Expected: FAIL on all 3 checks — the route doesn't exist yet, so every request hits Next's default 404 (whose `res.url` stays the originally-requested URL rather than redirecting to `/admin/forbidden`, and whose body isn't a PDF).

- [ ] **Step 3: Write the route handler**

Create `app/admin/(dashboard)/packages/[id]/pdf/route.ts`:

```ts
import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { fetchPackageForPdf, renderPackagePdf } from "@/lib/pdf/package-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin PDF download for any non-deleted package, including unpublished
 * drafts (no is_published filter, matching
 * app/admin/(dashboard)/packages/[id]/page.tsx's edit-page fetch). Gated
 * the same way as every other admin/packages route (AUTH-05).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissionOrRedirect("can_manage_packages");

  const { id } = await params;
  const supabase = await createClient();

  const pkg = await fetchPackageForPdf(supabase, { id });
  if (!pkg) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const logoSrc = new URL("/logo-header.png", request.url).toString();
  const buffer = await renderPackagePdf(pkg, logoSrc);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pkg.slug}.pdf"`,
    },
  });
}
```

- [ ] **Step 4: Run the verification script again to confirm it passes**

Run: `npm run verify:admin-package-pdf`
Expected: `PASS: 3/3 checks passed`

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(dashboard)/packages/[id]/pdf/route.ts" scripts/verify-admin-package-pdf.ts package.json
git commit -m "feat: add admin package PDF download route"
```

---

### Task 5: Public detail page "Download PDF" button

**Files:**
- Create: `components/packages/package-pdf-cta.tsx`
- Modify: `app/(public)/packages/[slug]/page.tsx:175-178`

**Interfaces:**
- Consumes: nothing new from earlier tasks besides the route from Task 3 (`/packages/{slug}/pdf`, plain link href — no imported function).
- Produces: `PackagePdfCta({ slug, variant, className }: { slug: string; variant?: "icon-only" | "icon-label"; className?: string })` (React component), used by Task 6 nowhere — this component is public-page-only, the admin side uses plain links directly (Task 6).

- [ ] **Step 1: Write the component**

Create `components/packages/package-pdf-cta.tsx`:

```tsx
import { FileDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Outbound-only link to a package's PDF download route (D-XX), same shape
 * as WhatsAppCta/FacebookCta -- plain anchor, no client JS, since
 * Content-Disposition: attachment on the response already makes the
 * browser download the file without navigating away. Uses bg-primary
 * (theme token) rather than a hardcoded brand hex, since this isn't a
 * third-party brand CTA like WhatsApp/Facebook.
 */
export function PackagePdfCta({
  slug,
  variant = "icon-only",
  className,
}: {
  slug: string;
  variant?: "icon-only" | "icon-label";
  className?: string;
}) {
  return (
    <a
      href={`/packages/${slug}/pdf`}
      download
      aria-label="Download PDF itinerary"
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-primary/50 focus-visible:outline-none",
        className
      )}
    >
      <FileDown className="size-5" aria-hidden="true" />
      {variant === "icon-label" && <span>Download PDF</span>}
    </a>
  );
}
```

- [ ] **Step 2: Wire it into the public detail page**

Edit `app/(public)/packages/[slug]/page.tsx` — add the import near the other CTA imports (after the `FacebookCta` import, around line 24):

```tsx
import { FacebookCta } from "@/components/packages/facebook-cta";
import { PackagePdfCta } from "@/components/packages/package-pdf-cta";
```

Then edit the "Ready to Book This Trip?" banner's CTA group (currently lines 175-178):

```tsx
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
          <WhatsAppCta packageName={pkg.name} variant="icon-label" />
          <FacebookCta packageName={pkg.name} variant="icon-label" />
          <PackagePdfCta slug={pkg.slug} variant="icon-label" />
        </div>
```

- [ ] **Step 3: Run the type checker**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Verify against a running dev server**

With a dev server running on port 3100 and the database seeded, run:

```bash
curl -s http://localhost:3100/packages/$(
  npx tsx --env-file=.env.local -e "
    import { createClient } from '@supabase/supabase-js';
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data } = await c.from('packages').select('slug').eq('name', 'Palawan Island Hopping').single();
    console.log(data.slug);
  "
) | grep -o 'href="/packages/[^"]*/pdf"'
```

Expected: prints one match, e.g. `href="/packages/TSP-000001/pdf"`. Then open `http://localhost:3100/packages/TSP-000001` (use the real printed slug) in a browser, confirm a "Download PDF" button appears next to "Message us on WhatsApp"/"Message us on Facebook" in the "Ready to Book This Trip?" section, and clicking it downloads a PDF.

- [ ] **Step 5: Commit**

```bash
git add components/packages/package-pdf-cta.tsx "app/(public)/packages/[slug]/page.tsx"
git commit -m "feat: add Download PDF button to public package detail page"
```

---

### Task 6: Admin list + edit page "Download PDF" links

**Files:**
- Modify: `components/admin/package-list-row.tsx:190-199`
- Modify: `components/admin/package-list-card.tsx:193-198`
- Modify: `app/admin/(dashboard)/packages/[id]/page.tsx:130`

**Interfaces:**
- Consumes: the route from Task 4 (`/admin/packages/{id}/pdf`, plain link href). No shared component — each of these three spots is a plain `<a>`/render-prop link, following the codebase's existing `render={<Link href={...} />}` pattern for `DropdownMenuItem` and the same pattern for `Button`.

- [ ] **Step 1: Add the dropdown item to the desktop row**

Edit `components/admin/package-list-row.tsx` — the `DropdownMenuContent` block (currently lines 190-199):

```tsx
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={<Link href={`/admin/packages/${item.id}`} />}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<a href={`/admin/packages/${item.id}/pdf`} />}
              >
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
```

- [ ] **Step 2: Add the identical dropdown item to the mobile card**

Edit `components/admin/package-list-card.tsx` — the `DropdownMenuContent` block (currently lines 193-198), same change:

```tsx
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={<Link href={`/admin/packages/${item.id}`} />}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<a href={`/admin/packages/${item.id}/pdf`} />}
              >
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
```

- [ ] **Step 3: Add a button to the admin edit page header**

Edit `app/admin/(dashboard)/packages/[id]/page.tsx` — add the `Button` import (it isn't currently imported in this file) alongside the existing imports:

```tsx
import { Button } from "@/components/ui/button";
```

Then replace the current childless `PageHeader` call (line 130):

```tsx
      <PageHeader title="Edit Package" description={`${pkg.name} · ${pkg.slug}`} />
```

with:

```tsx
      <PageHeader title="Edit Package" description={`${pkg.name} · ${pkg.slug}`}>
        <Button
          variant="outline"
          size="lg"
          render={<a href={`/admin/packages/${pkg.id}/pdf`} />}
        >
          Download PDF
        </Button>
      </PageHeader>
```

- [ ] **Step 4: Run the type checker**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 5: Manually verify in the browser**

With a dev server running on port 3100, an Admin session logged in (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), and the database seeded:

1. Visit `http://localhost:3100/admin/packages`. Open the row-actions dropdown (⋯) on any package (both on a wide desktop viewport, which renders `PackageListRow`, and on a narrow/mobile viewport, which renders `PackageListCard`). Confirm "Download PDF" appears between "Edit" and "Delete" in both, and clicking it downloads a PDF.
2. Visit `http://localhost:3100/admin/packages/{id}` (any real package id from step 1). Confirm a "Download PDF" button appears at the top right next to the page title, and clicking it downloads a PDF.

Expected: both checks pass with no console errors.

- [ ] **Step 6: Commit**

```bash
git add components/admin/package-list-row.tsx components/admin/package-list-card.tsx "app/admin/(dashboard)/packages/[id]/page.tsx"
git commit -m "feat: add Download PDF links to admin package list and edit page"
```
