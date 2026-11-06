import { z } from "zod";

import {
  soaDiscountSchema,
  soaLineItemSchema,
  soaPaymentSchema,
  type SoaFormValues,
} from "@/components/admin/soa/soa-form-schema";
import type { Tables, TablesInsert } from "@/types/database";

/** Columns the SOA form owns -- everything except id/soa_no/audit. */
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
>;

export type SoaContentRow = Pick<
  Tables<"statements">,
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

export function soaValuesToRow(values: SoaFormValues): SoaRowPatch {
  return {
    bill_to_name: values.billToName.trim(),
    bill_to_details: blankToNull(values.billToDetails),
    contact_id: values.contactId || null,
    reference: blankToNull(values.reference),
    issue_date: values.issueDate,
    due_date: values.dueDate || null,
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
    notes: blankToNull(values.notes),
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
    billToName: row.bill_to_name,
    billToDetails: row.bill_to_details ?? "",
    contactId: row.contact_id ?? "",
    reference: row.reference ?? "",
    issueDate: row.issue_date,
    dueDate: row.due_date ?? "",
    ...stored,
    discounts: stored.discounts.map((discount) => ({
      ...discount,
      voucherId: discount.voucherId ?? "",
      voucherCode: discount.voucherCode ?? "",
    })),
    payments: stored.payments.map((payment) => ({
      ...payment,
      label: payment.label ?? "",
    })),
    notes: row.notes ?? "",
  };
}
