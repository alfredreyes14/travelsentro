import { z } from "zod";

import { VOUCHER_STATUSES, VOUCHER_TYPES } from "@/lib/vouchers/status";

// partnerId/code/contactId/expiresAt are plain optional strings, not
// .nullable() -- mirrors destination-form-schema.ts's photoStoragePath
// convention: "" means unset in the form, converted to null at the
// actions/vouchers.ts boundary right before the insert/update.
export const voucherFormSchema = z.object({
  type: z.enum(VOUCHER_TYPES, { error: "Please select a voucher type" }),
  partnerId: z.string().optional(),
  title: z.string().min(1, "Please enter a title"),
  valueLabel: z.string().min(1, "Please describe the voucher's value"),
  code: z.string().optional(),
  contactId: z.string().optional(),
  status: z.enum(VOUCHER_STATUSES, { error: "Please select a status" }),
  expiresAt: z.string().optional(),
});

export type VoucherFormValues = z.infer<typeof voucherFormSchema>;
