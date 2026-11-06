import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { SoaFormValues } from "@/components/admin/soa/soa-form-schema";
import { CONTACT_ADDRESS, CONTACT_EMAIL } from "@/lib/constants";
import {
  applyPaymentsToInstallments,
  computeNextDueDate,
  computeSoaTotals,
  discountLabel,
  formatAmount,
  type InstallmentStatus,
} from "@/lib/soa/totals";
import { formatWhatsAppNumberForDisplay } from "@/lib/whatsapp";
import type { Database, Tables } from "@/types/database";

export type SoaPdfData = { soaNo: string; quoteNo?: string | null; values: SoaFormValues };

/** A statement row plus the number of its linked quote, for printing. */
export type StatementForPdf = Tables<"statements"> & { quoteNo: string | null };

const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  paid: "Paid",
  partial: "Partly paid",
  unpaid: "Unpaid",
};

// "PHP" text, not "₱": react-pdf's built-in Helvetica has no ₱ glyph (same
// convention as itinerary-pdf.tsx).
function php(amount: number): string {
  return amount < 0 ? `-PHP ${formatAmount(-amount)}` : `PHP ${formatAmount(amount)}`;
}

// Stored dates are plain YYYY-MM-DD; format in UTC so the server's own time
// zone can never shift them by a day.
function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** One <Text> per line: "\n" inside a single Text renders with a double gap. */
function Lines({ text, style }: { text: string; style: (typeof styles)[keyof typeof styles] }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <Text key={index} style={style}>
          {line.trim() || " "}
        </Text>
      ))}
    </>
  );
}

function formatQuantity(quantity: number): string {
  return quantity.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

const NAVY = "#021f4a";
const ORANGE = "#f49314";
const MUTED = "#6b7280";
const BORDER = "#d1d5db";

// Payment schedule columns (same 503pt of row width).
const SCHED = { due: 110, amount: 100, status: 80 };
const SCHED_DESC_WIDTH = 503 - SCHED.due - SCHED.amount - SCHED.status;

// Fixed column widths: a flex:1 <Text> in a row gets mis-measured by
// react-pdf's layout engine and inflates row height. 595pt A4 - 80pt page
// padding - 12pt row padding = 503pt of columns.
const COL = { no: 24, qty: 44, unit: 92, amount: 100 };
const DESC_WIDTH = 503 - COL.no - COL.qty - COL.unit - COL.amount;

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 80,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  // The public site's logo (with tagline), 1600x386.
  logo: { width: 190 },
  docTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    textAlign: "right",
    marginBottom: 6,
  },
  metaLine: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2 },
  metaLabel: { color: MUTED, width: 70, textAlign: "right", marginRight: 8 },
  metaValue: { fontFamily: "Helvetica-Bold", minWidth: 90, textAlign: "right" },
  partiesRow: { flexDirection: "row", gap: 24, marginBottom: 18 },
  party: { flex: 1 },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 4,
  },
  billToName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  paragraph: { marginBottom: 2 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: NAVY,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  colNo: { width: COL.no },
  colDesc: { width: DESC_WIDTH, paddingRight: 8 },
  colQty: { width: COL.qty, textAlign: "right" },
  colUnit: { width: COL.unit, textAlign: "right" },
  colAmount: { width: COL.amount, textAlign: "right" },
  summary: { marginTop: 12, marginLeft: "auto", width: 300 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  summaryLabel: { flex: 1, paddingRight: 8 },
  summaryValue: { textAlign: "right" },
  discountValue: { textAlign: "right", color: "#b91c1c" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: NAVY,
    marginTop: 2,
    fontFamily: "Helvetica-Bold",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 6,
    backgroundColor: ORANGE,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
  },
  subLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    letterSpacing: 1,
    marginTop: 8,
    paddingHorizontal: 6,
  },
  remarks: { marginTop: 24 },
  schedule: { marginTop: 24 },
  schedDue: { width: SCHED.due },
  schedDesc: { width: SCHED_DESC_WIDTH, paddingRight: 8 },
  schedAmount: { width: SCHED.amount, textAlign: "right" },
  schedStatus: { width: SCHED.status, textAlign: "right" },
  schedPaid: { width: SCHED.status, textAlign: "right", color: "#15803d" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0 },
  footerBar: {
    backgroundColor: NAVY,
    color: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
  },
  footerStripe: { height: 6, backgroundColor: ORANGE },
  pageNumber: {
    position: "absolute",
    bottom: 44,
    right: 40,
    fontSize: 8,
    color: MUTED,
  },
});

export function SoaPdfDocument({ data, logoSrc }: { data: SoaPdfData; logoSrc: string }) {
  const { soaNo, quoteNo, values } = data;
  const totals = computeSoaTotals(values);
  const installments = values.installments ?? [];
  const progress = applyPaymentsToInstallments(installments, totals.totalPaid);
  const schedule = installments
    .map((installment, index) => ({ installment, status: progress[index].status }))
    .sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));
  const nextDue =
    installments.length > 0
      ? computeNextDueDate({
          installments,
          dueDate: values.dueDate,
          balance: totals.balance,
          totalPaid: totals.totalPaid,
        })
      : null;
  const hasAdjustments = values.discounts.length > 0 || values.payments.length > 0;
  const balanceLabel = totals.balance < 0 ? "CREDIT BALANCE" : "BALANCE DUE";

  return (
    <Document title={`${soaNo} – ${values.billToName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Image src={logoSrc} style={styles.logo} />
          <View>
            <Text style={styles.docTitle}>STATEMENT OF ACCOUNT</Text>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>SOA No.</Text>
              <Text style={styles.metaValue}>{soaNo}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{formatDate(values.issueDate)}</Text>
            </View>
            {values.dueDate ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaLabel}>Due date</Text>
                <Text style={styles.metaValue}>{formatDate(values.dueDate)}</Text>
              </View>
            ) : null}
            {nextDue ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaLabel}>Next payment</Text>
                <Text style={styles.metaValue}>{formatDate(nextDue)}</Text>
              </View>
            ) : null}
            {quoteNo ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaLabel}>Quote No.</Text>
                <Text style={styles.metaValue}>{quoteNo}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <Text style={styles.sectionLabel}>BILL TO</Text>
            <Text style={styles.billToName}>{values.billToName}</Text>
            {values.billToDetails ? (
              <Lines text={values.billToDetails} style={styles.paragraph} />
            ) : null}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colNo}>#</Text>
          <Text style={styles.colDesc}>DESCRIPTION</Text>
          <Text style={styles.colQty}>QTY</Text>
          <Text style={styles.colUnit}>UNIT PRICE</Text>
          <Text style={styles.colAmount}>AMOUNT</Text>
        </View>
        {values.lineItems.map((item, index) => (
          <View key={index} style={styles.tableRow} wrap={false}>
            <Text style={styles.colNo}>{index + 1}</Text>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{formatQuantity(item.quantity)}</Text>
            <Text style={styles.colUnit}>{formatAmount(item.unitPrice)}</Text>
            <Text style={styles.colAmount}>{formatAmount(totals.lineAmounts[index])}</Text>
          </View>
        ))}

        <View style={styles.summary} wrap={false}>
          {hasAdjustments ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{php(totals.subtotal)}</Text>
            </View>
          ) : null}

          {values.discounts.map((discount, index) => (
            <View key={index} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{discountLabel(discount)}</Text>
              <Text style={styles.discountValue}>
                {php(-totals.discountAmounts[index])}
              </Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.summaryLabel}>Total Amount</Text>
            <Text style={styles.summaryValue}>{php(totals.total)}</Text>
          </View>

          {values.payments.length > 0 ? (
            <>
              <Text style={styles.subLabel}>PAYMENTS RECEIVED</Text>
              {values.payments.map((payment, index) => (
                <View key={index} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {formatDate(payment.date)}
                  </Text>
                  <Text style={styles.summaryValue}>{php(-payment.amount)}</Text>
                </View>
              ))}
            </>
          ) : null}

          <View style={styles.balanceRow}>
            <Text>{balanceLabel}</Text>
            <Text>{php(Math.abs(totals.balance))}</Text>
          </View>
        </View>

        {installments.length > 0 ? (
          <View style={styles.schedule} wrap={false}>
            <Text style={styles.sectionLabel}>PAYMENT SCHEDULE</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.schedDue}>DUE DATE</Text>
              <Text style={styles.schedDesc}>DESCRIPTION</Text>
              <Text style={styles.schedAmount}>AMOUNT</Text>
              <Text style={styles.schedStatus}>STATUS</Text>
            </View>
            {schedule.map(({ installment, status }, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={styles.schedDue}>{formatDate(installment.dueDate)}</Text>
                <Text style={styles.schedDesc}>
                  {installment.label || `Installment ${index + 1}`}
                </Text>
                <Text style={styles.schedAmount}>{formatAmount(installment.amount)}</Text>
                <Text style={status === "paid" ? styles.schedPaid : styles.schedStatus}>
                  {INSTALLMENT_STATUS_LABELS[status]}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {values.remarks ? (
          <View style={styles.remarks} wrap={false}>
            <Text style={styles.sectionLabel}>REMARKS</Text>
            <Lines text={values.remarks} style={styles.paragraph} />
          </View>
        ) : null}

        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ""
          }
        />
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

export async function renderSoaPdf(data: SoaPdfData, logoSrc: string): Promise<Buffer> {
  return renderToBuffer(<SoaPdfDocument data={data} logoSrc={logoSrc} />);
}

/** RLS (can_manage_quotes) decides visibility; unauthorized callers get null. */
export async function fetchSoaForPdf(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<StatementForPdf | null> {
  const { data, error } = await supabase
    .from("statements")
    .select("*, quote:quotes(quote_no)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("fetchSoaForPdf failed:", error);
    return null;
  }
  if (!data) return null;

  // To-one join; normalize whatever shape the client returns.
  const { quote, ...row } = data as typeof data & {
    quote: { quote_no: string } | Array<{ quote_no: string }> | null;
  };
  const linked = Array.isArray(quote) ? quote[0] : quote;
  return { ...(row as Tables<"statements">), quoteNo: linked?.quote_no ?? null };
}
