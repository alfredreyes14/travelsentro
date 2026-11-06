import { z } from "zod";

/** Whole centavos only -- 1234.5 and 1234.56 pass, 1234.567 doesn't. */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

const money = z
  .number({ error: "Please enter an amount" })
  .refine(hasAtMostTwoDecimals, "Use at most 2 decimal places");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please pick a date");

export const SOA_DISCOUNT_SOURCES = ["discount", "voucher"] as const;
export type SoaDiscountSource = (typeof SOA_DISCOUNT_SOURCES)[number];

export const SOA_DISCOUNT_TYPES = ["amount", "percent"] as const;
export type SoaDiscountType = (typeof SOA_DISCOUNT_TYPES)[number];

export const soaLineItemSchema = z.object({
  description: z.string().trim().min(1, "Please describe this item"),
  quantity: z
    .number({ error: "Please enter a quantity" })
    .positive("Quantity must be more than 0")
    .refine(hasAtMostTwoDecimals, "Use at most 2 decimal places"),
  unitPrice: money.min(0, "Price can't be negative"),
});

export const soaDiscountSchema = z
  .object({
    source: z.enum(SOA_DISCOUNT_SOURCES),
    label: z.string().trim().min(1, "Please name this discount"),
    type: z.enum(SOA_DISCOUNT_TYPES),
    value: money.positive("Must be more than 0"),
    // Voucher discounts only. voucherId is a soft link to the vouchers
    // table (when picked from the list); voucherCode is what prints.
    voucherId: z.string().optional(),
    voucherCode: z.string().optional(),
  })
  .refine((d) => d.type !== "percent" || d.value <= 100, {
    message: "A percentage can't be more than 100",
    path: ["value"],
  });

export const soaPaymentSchema = z.object({
  date: isoDate,
  label: z.string().optional(),
  amount: money.positive("Must be more than 0"),
});

// Optional text fields are plain optional strings ("" = unset), converted
// to null at the lib/soa/soa-row.ts boundary -- same as quote-form-schema.
export const soaFormSchema = z
  .object({
    billToName: z.string().trim().min(1, "Please enter who this is billed to"),
    billToDetails: z.string().optional(),
    contactId: z.string().optional(),
    reference: z.string().optional(),
    issueDate: isoDate,
    dueDate: z.union([isoDate, z.literal("")]).optional(),
    lineItems: z.array(soaLineItemSchema).min(1, "Add at least one line item"),
    discounts: z.array(soaDiscountSchema),
    payments: z.array(soaPaymentSchema),
    notes: z.string().optional(),
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.issueDate, {
    message: "Due date can't be before the statement date",
    path: ["dueDate"],
  });

export type SoaLineItem = z.infer<typeof soaLineItemSchema>;
export type SoaDiscount = z.infer<typeof soaDiscountSchema>;
export type SoaPayment = z.infer<typeof soaPaymentSchema>;
export type SoaFormValues = z.infer<typeof soaFormSchema>;

/** Today in Manila as YYYY-MM-DD (en-CA formats dates that way). */
export function todayInManila(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export function emptySoaValues(): SoaFormValues {
  return {
    billToName: "",
    billToDetails: "",
    contactId: "",
    reference: "",
    issueDate: todayInManila(),
    dueDate: "",
    lineItems: [{ description: "", quantity: 1, unitPrice: 0 }],
    discounts: [],
    payments: [],
    notes: "",
  };
}
