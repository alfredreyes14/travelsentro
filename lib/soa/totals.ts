import type {
  SoaDiscount,
  SoaInstallment,
  SoaLineItem,
  SoaPayment,
} from "@/components/admin/soa/soa-form-schema";

/**
 * The one place SOA math happens -- the form's live summary, the list and
 * the PDF all call this, so they can never disagree. Everything is summed
 * in whole centavos to avoid floating-point drift, then converted back.
 *
 * Rules:
 * - A line's amount is quantity x unit price.
 * - A percent discount is a percent of the subtotal (not of the running
 *   total), so the order of discounts doesn't change their amounts.
 * - Discounts never take the total below zero: once the subtotal is used
 *   up, later discounts apply as 0.
 * - Balance = total - payments; it is negative when the customer overpaid.
 */
export type SoaTotals = {
  lineAmounts: number[];
  subtotal: number;
  discountAmounts: number[];
  totalDiscount: number;
  total: number;
  totalPaid: number;
  balance: number;
};

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (cents: number) => cents / 100;

/** Treats missing/NaN numbers (a half-typed form) as 0. */
const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function computeSoaTotals(input: {
  lineItems: Array<Partial<SoaLineItem>>;
  discounts: Array<Partial<SoaDiscount>>;
  payments: Array<Partial<SoaPayment>>;
}): SoaTotals {
  const lineCents = input.lineItems.map((item) =>
    Math.round(num(item.quantity) * num(item.unitPrice) * 100)
  );
  const subtotalCents = lineCents.reduce((sum, c) => sum + c, 0);

  let remaining = Math.max(subtotalCents, 0);
  const discountCents = input.discounts.map((discount) => {
    const value = num(discount.value);
    const wanted =
      discount.type === "percent"
        ? Math.round((subtotalCents * value) / 100)
        : toCents(value);
    const applied = Math.min(Math.max(wanted, 0), remaining);
    remaining -= applied;
    return applied;
  });
  const totalDiscountCents = discountCents.reduce((sum, c) => sum + c, 0);
  const totalCents = subtotalCents - totalDiscountCents;

  const paidCents = input.payments.reduce(
    (sum, payment) => sum + toCents(num(payment.amount)),
    0
  );

  return {
    lineAmounts: lineCents.map(fromCents),
    subtotal: fromCents(subtotalCents),
    discountAmounts: discountCents.map(fromCents),
    totalDiscount: fromCents(totalDiscountCents),
    total: fromCents(totalCents),
    totalPaid: fromCents(paidCents),
    balance: fromCents(totalCents - paidCents),
  };
}

/** Adds money amounts exactly, in whole centavos. Blank/NaN count as 0. */
export function sumCents(values: unknown[]): number {
  return values.reduce<number>((sum, value) => sum + toCents(num(value)), 0);
}

export type InstallmentStatus = "paid" | "partial" | "unpaid";

export type InstallmentProgress = {
  paid: number;
  remaining: number;
  status: InstallmentStatus;
};

/**
 * Applies the total paid to the installments, earliest due date first
 * (ties keep their order), and says how much of each is paid. The result
 * lines up with the input order.
 */
export function applyPaymentsToInstallments(
  installments: Array<Partial<SoaInstallment>>,
  totalPaid: number
): InstallmentProgress[] {
  const order = installments
    .map((installment, index) => ({ index, dueDate: installment.dueDate ?? "" }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.index - b.index);

  let leftCents = Math.max(toCents(totalPaid), 0);
  const progress: InstallmentProgress[] = new Array(installments.length);
  for (const { index } of order) {
    const amountCents = Math.max(toCents(num(installments[index].amount)), 0);
    const paidCents = Math.min(amountCents, leftCents);
    leftCents -= paidCents;
    progress[index] = {
      paid: fromCents(paidCents),
      remaining: fromCents(amountCents - paidCents),
      status:
        amountCents > 0 && paidCents === amountCents
          ? "paid"
          : paidCents > 0
            ? "partial"
            : "unpaid",
    };
  }
  return progress;
}

/**
 * When the customer's next payment is due: the first installment (by due
 * date) that isn't fully paid, or the SOA's own due date when there's no
 * schedule. Null once nothing is owed, or when no date was set.
 */
export function computeNextDueDate(input: {
  installments: Array<Partial<SoaInstallment>>;
  dueDate?: string | null;
  balance: number;
  totalPaid: number;
}): string | null {
  if (input.balance <= 0) return null;
  const progress = applyPaymentsToInstallments(input.installments, input.totalPaid);
  const open = input.installments
    .filter((installment, index) => installment.dueDate && progress[index].remaining > 0)
    .map((installment) => installment.dueDate as string)
    .sort();
  return open[0] ?? (input.dueDate || null);
}

/** "1,234.50" -- always two decimals, en-PH grouping. */
export function formatAmount(value: number): string {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "₱1,234.50" for the admin UI (the PDF uses "PHP" -- see soa-pdf.tsx). */
export function formatPeso(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}₱${formatAmount(Math.abs(value))}`;
}

/** How a discount row is named on the summary and the PDF. */
export function discountLabel(discount: Partial<SoaDiscount>): string {
  const label =
    discount.label?.trim() || (discount.source === "voucher" ? "Unnamed" : "Discount");
  const code = discount.voucherCode?.trim();
  const base =
    discount.source === "voucher"
      ? `Voucher: ${label}${code ? ` (${code})` : ""}`
      : label;
  return discount.type === "percent" && discount.value
    ? `${base} – ${discount.value}%`
    : base;
}
