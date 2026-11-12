import { z } from "zod";

import {
  soaDiscountSchema,
  soaLineItemSchema,
  soaPaymentSchema,
  type PreviousSoaFormValues,
  type SoaFormValues,
  type SoaKind,
} from "@/components/admin/soa/soa-form-schema";
import { computeSoaTotals } from "@/lib/soa/totals";
import type { Tables, TablesInsert } from "@/types/database";

type StatementRow = Tables<"statements">;

/** Columns the SOA forms own -- everything except id/soa_no/kind/file/audit. */
export type SoaRowPatch = Pick<
  TablesInsert<"statements">,
  | "bill_to_name"
  | "bill_to_details"
  | "contact_id"
  | "reference"
  | "issue_date"
  | "due_date"
  | "line_items"
  | "discounts"
  | "payments"
  | "notes"
  | "original_no"
  | "total_amount"
  | "amount_paid"
>;

export type SoaContentRow = Pick<
  StatementRow,
  | "bill_to_name"
  | "bill_to_details"
  | "contact_id"
  | "reference"
  | "issue_date"
  | "due_date"
  | "line_items"
  | "discounts"
  | "payments"
  | "notes"
>;

export type PreviousSoaContentRow = Pick<
  StatementRow,
  | "bill_to_name"
  | "bill_to_details"
  | "contact_id"
  | "reference"
  | "issue_date"
  | "due_date"
  | "notes"
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
});

const blankToNull = (value: string | undefined) => value?.trim() || null;

export function toSoaKind(value: string): SoaKind {
  return value === "previous" ? "previous" : "generated";
}

function headerToRow(values: {
  billToName: string;
  billToDetails?: string;
  contactId?: string;
  reference?: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
}) {
  return {
    bill_to_name: values.billToName.trim(),
    bill_to_details: blankToNull(values.billToDetails),
    contact_id: values.contactId || null,
    reference: blankToNull(values.reference),
    issue_date: values.issueDate,
    due_date: values.dueDate || null,
    notes: blankToNull(values.notes),
  };
}

function headerToValues(row: SoaContentRow | PreviousSoaContentRow) {
  return {
    billToName: row.bill_to_name,
    billToDetails: row.bill_to_details ?? "",
    contactId: row.contact_id ?? "",
    reference: row.reference ?? "",
    issueDate: row.issue_date,
    dueDate: row.due_date ?? "",
    notes: row.notes ?? "",
  };
}

/**
 * A generated SOA's row. total_amount/amount_paid are computed here from
 * the validated rows -- the browser never supplies them.
 */
export function soaValuesToRow(values: SoaFormValues): SoaRowPatch {
  const totals = computeSoaTotals(values);
  return {
    ...headerToRow(values),
    original_no: null,
    total_amount: totals.total,
    amount_paid: totals.totalPaid,
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
      ...(payment.label?.trim() ? { label: payment.label.trim() } : {}),
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
    line_items: [],
    discounts: [],
    payments: [],
  };
}

/** Throws ZodError if the stored jsonb doesn't match the form schema. */
export function soaRowToFormValues(row: SoaContentRow): SoaFormValues {
  const stored = storedSchema.parse({
    lineItems: row.line_items,
    discounts: row.discounts,
    payments: row.payments,
  });

  return {
    ...headerToValues(row),
    lineItems: stored.lineItems,
    discounts: stored.discounts.map((discount) => ({
      ...discount,
      voucherId: discount.voucherId ?? "",
      voucherCode: discount.voucherCode ?? "",
    })),
    payments: stored.payments.map((payment) => ({
      ...payment,
      label: payment.label ?? "",
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
    reference: [values.originalNo ? `Original SOA no. ${values.originalNo}` : "", values.reference]
      .filter(Boolean)
      .join(" · "),
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
        ? [{ date: values.issueDate, label: "Amount paid", amount: values.amountPaid }]
        : [],
  };
}

/** The values the PDF prints for any statement row. */
export function statementToPrintValues(row: StatementRow): SoaFormValues {
  return toSoaKind(row.kind) === "previous"
    ? previousSoaToPrintValues(row)
    : soaRowToFormValues(row);
}
