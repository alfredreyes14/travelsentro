import { z } from "zod";

import {
  soaDiscountSchema,
  soaInstallmentSchema,
  soaLineItemSchema,
  soaPaymentSchema,
  type PreviousSoaFormValues,
  type SoaFormValues,
  type SoaKind,
} from "@/components/admin/soa/soa-form-schema";
import { computeNextDueDate, computeSoaTotals } from "@/lib/soa/totals";
import type { Tables, TablesInsert } from "@/types/database";

type StatementRow = Tables<"statements">;

/** Columns the SOA forms own -- everything except id/soa_no/kind/file/audit. */
export type SoaRowPatch = Pick<
  TablesInsert<"statements">,
  | "bill_to_name"
  | "bill_to_details"
  | "contact_id"
  | "quote_id"
  | "issue_date"
  | "due_date"
  | "line_items"
  | "discounts"
  | "payments"
  | "installments"
  | "remarks"
  | "original_no"
  | "total_amount"
  | "amount_paid"
  | "next_due_date"
>;

export type SoaContentRow = Pick<
  StatementRow,
  | "bill_to_name"
  | "bill_to_details"
  | "contact_id"
  | "quote_id"
  | "issue_date"
  | "due_date"
  | "line_items"
  | "discounts"
  | "payments"
  | "installments"
  | "remarks"
>;

export type PreviousSoaContentRow = Pick<
  StatementRow,
  | "bill_to_name"
  | "bill_to_details"
  | "contact_id"
  | "quote_id"
  | "issue_date"
  | "due_date"
  | "remarks"
  | "original_no"
  | "total_amount"
  | "amount_paid"
>;

/**
 * Re-validates jsonb on the way OUT of the database with the same item
 * schemas the form writes with -- a row that no longer matches must fail
 * loudly rather than print an SOA with missing lines (same as quotes).
 */
const storedSchema = z.object({
  lineItems: z.array(soaLineItemSchema),
  discounts: z.array(soaDiscountSchema),
  payments: z.array(soaPaymentSchema),
  installments: z.array(soaInstallmentSchema),
});

const blankToNull = (value: string | undefined) => value?.trim() || null;

export function toSoaKind(value: string): SoaKind {
  return value === "previous" ? "previous" : "generated";
}

function headerToRow(values: {
  billToName: string;
  billToDetails?: string;
  contactId?: string;
  quoteId?: string;
  issueDate: string;
  dueDate?: string;
  remarks?: string;
}) {
  return {
    bill_to_name: values.billToName.trim(),
    bill_to_details: blankToNull(values.billToDetails),
    contact_id: values.contactId || null,
    quote_id: values.quoteId || null,
    issue_date: values.issueDate,
    due_date: values.dueDate || null,
    remarks: blankToNull(values.remarks),
  };
}

function headerToValues(row: SoaContentRow | PreviousSoaContentRow) {
  return {
    billToName: row.bill_to_name,
    billToDetails: row.bill_to_details ?? "",
    contactId: row.contact_id ?? "",
    quoteId: row.quote_id ?? "",
    issueDate: row.issue_date,
    dueDate: row.due_date ?? "",
    remarks: row.remarks ?? "",
  };
}

/** Installments are stored in due-date order, which is how they print. */
function sortInstallments<T extends { dueDate: string }>(installments: T[]): T[] {
  return [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * A generated SOA's row. total_amount/amount_paid/next_due_date are
 * computed here from the validated rows -- the browser never supplies them.
 */
export function soaValuesToRow(values: SoaFormValues): SoaRowPatch {
  const totals = computeSoaTotals(values);
  return {
    ...headerToRow(values),
    original_no: null,
    total_amount: totals.total,
    amount_paid: totals.totalPaid,
    next_due_date: computeNextDueDate({
      installments: values.installments,
      dueDate: values.dueDate,
      balance: totals.balance,
      totalPaid: totals.totalPaid,
    }),
    installments: sortInstallments(values.installments).map((installment) => ({
      dueDate: installment.dueDate,
      amount: installment.amount,
      ...(installment.label?.trim() ? { label: installment.label.trim() } : {}),
    })),
    line_items: values.lineItems.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    discounts: values.discounts.map((discount) => ({
      source: discount.source,
      label: discount.label.trim(),
      type: discount.type,
      value: discount.value,
      // Voucher fields are kept only on voucher rows, so switching a row
      // back to a plain discount doesn't leave a stale voucher behind.
      ...(discount.source === "voucher"
        ? {
            ...(discount.voucherId ? { voucherId: discount.voucherId } : {}),
            ...(discount.voucherCode?.trim()
              ? { voucherCode: discount.voucherCode.trim() }
              : {}),
          }
        : {}),
    })),
    payments: values.payments.map((payment) => ({
      date: payment.date,
      amount: payment.amount,
    })),
  };
}

/** A previous SOA's row: amounts as typed, no line items. */
export function previousSoaValuesToRow(values: PreviousSoaFormValues): SoaRowPatch {
  return {
    ...headerToRow(values),
    original_no: blankToNull(values.originalNo),
    total_amount: values.totalAmount,
    amount_paid: values.amountPaid,
    next_due_date:
      values.totalAmount > values.amountPaid ? values.dueDate || null : null,
    line_items: [],
    discounts: [],
    payments: [],
    installments: [],
  };
}

/** Throws ZodError if the stored jsonb doesn't match the form schema. */
export function soaRowToFormValues(row: SoaContentRow): SoaFormValues {
  const stored = storedSchema.parse({
    lineItems: row.line_items,
    discounts: row.discounts,
    payments: row.payments,
    installments: row.installments,
  });

  return {
    ...headerToValues(row),
    lineItems: stored.lineItems,
    discounts: stored.discounts.map((discount) => ({
      ...discount,
      voucherId: discount.voucherId ?? "",
      voucherCode: discount.voucherCode ?? "",
    })),
    payments: stored.payments,
    installments: stored.installments.map((installment) => ({
      ...installment,
      label: installment.label ?? "",
    })),
  };
}

export function previousSoaRowToFormValues(
  row: PreviousSoaContentRow
): PreviousSoaFormValues {
  return {
    ...headerToValues(row),
    originalNo: row.original_no ?? "",
    totalAmount: Number(row.total_amount),
    amountPaid: Number(row.amount_paid),
  };
}

/**
 * A previous SOA as printable SOA values, for when it has no attached file
 * (or for the email attachment): one line for the original statement and,
 * if anything was paid, one payment line.
 */
export function previousSoaToPrintValues(
  row: PreviousSoaContentRow
): SoaFormValues {
  const values = previousSoaRowToFormValues(row);
  return {
    ...headerToValues(row),
    lineItems: [
      {
        description: values.originalNo
          ? `Statement of Account ${values.originalNo}`
          : "Statement of Account",
        quantity: 1,
        unitPrice: values.totalAmount,
      },
    ],
    discounts: [],
    payments:
      values.amountPaid > 0
        ? [{ date: values.issueDate, amount: values.amountPaid }]
        : [],
    installments: [],
  };
}

/** The values the PDF prints for any statement row. */
export function statementToPrintValues(row: StatementRow): SoaFormValues {
  return toSoaKind(row.kind) === "previous"
    ? previousSoaToPrintValues(row)
    : soaRowToFormValues(row);
}
