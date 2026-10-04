import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ItineraryContentValues } from "@/components/admin/itinerary-content-schema";
import { CONTACT_ADDRESS, CONTACT_EMAIL } from "@/lib/constants";
import { formatWhatsAppNumberForDisplay } from "@/lib/whatsapp";

/**
 * Source-neutral input for the "Download Full Itinerary" PDF. Packages
 * (lib/pdf/package-pdf.tsx) and quotes (lib/pdf/quote-pdf.ts) each adapt
 * onto this shape, so the two documents can never drift apart in layout.
 */
export type ItineraryPdfData = {
  title: string;
  content: ItineraryContentValues;
};

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
const RED = "#d12026";

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
    alignItems: "baseline",
    gap: 32,
    marginBottom: 2,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  dateFee: {
    fontSize: 10,
    lineHeight: 1.4,
    color: RED,
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

export function ItineraryPdfDocument({
  data,
  logoSrc,
}: {
  data: ItineraryPdfData;
  logoSrc: string;
}) {
  const { title, content } = data;
  const finalPrice = content.pricePerPax;
  const hasDiscount = (content.discountAmount ?? 0) > 0;
  const strikePrice = content.pricePerPax + (content.discountAmount ?? 0);

  // Quotes store travel dates in entry order; sort here so both sources
  // print chronologically, exactly as the package PDF always has.
  const travelDates = [...content.travelDates].sort(
    (a, b) =>
      a.dateFrom.localeCompare(b.dateFrom) || a.dateTo.localeCompare(b.dateTo)
  );

  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Image src={logoSrc} style={styles.logo} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.duration}>
            {content.durationLabel || "Duration TBA"}
          </Text>
          <View style={styles.priceRow}>
            {hasDiscount ? (
              <Text style={styles.priceStrike}>
                {formatPhp(strikePrice)}
              </Text>
            ) : null}
            <Text style={styles.price}>{formatPhp(finalPrice)} / pax</Text>
          </View>
        </View>

        {content.itinerary.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>ITINERARY</Text>
            {content.itinerary.map((day, dayIndex) => (
              <View key={dayIndex} style={styles.dayBlock} wrap={false}>
                <Text style={styles.dayTitle}>
                  Day {dayIndex + 1}: {day.title}
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

        {content.inclusions.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>WHAT&apos;S INCLUDED</Text>
            {content.inclusions.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {content.exclusions.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>WHAT&apos;S NOT INCLUDED</Text>
            {content.exclusions.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {content.bringItems.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>WHAT TO BRING</Text>
            {content.bringItems.map((item, index) => (
              <Text key={index} style={styles.bullet}>
                • {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {travelDates.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>TRAVEL DATES</Text>
            {travelDates.map((date, index) => (
              <View key={index} style={styles.dateRow}>
                <Text style={styles.paragraph}>
                  {formatTravelDateRange(date.dateFrom, date.dateTo)}
                </Text>
                {date.additionalFee ? (
                  <Text style={styles.dateFee}>
                    +{formatPhp(date.additionalFee)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {content.remarks ? (
          <View>
            <Text style={styles.sectionTitle} minPresenceAhead={30}>REMARKS</Text>
            <Text style={styles.paragraph}>{content.remarks}</Text>
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

export async function renderItineraryPdf(
  data: ItineraryPdfData,
  logoSrc: string
): Promise<Buffer> {
  return renderToBuffer(<ItineraryPdfDocument data={data} logoSrc={logoSrc} />);
}
