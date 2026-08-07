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

        {sortedDays.length > 0 ? (
          <View>
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
          </View>
        ) : null}

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
