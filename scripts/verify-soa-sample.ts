/** A filled-in SOA used by verify-soa.ts. */
import type { SoaFormValues } from "../components/admin/soa/soa-form-schema";

export const SAMPLE: SoaFormValues = {
  billToName: "Maria Santos",
  billToDetails: "maria@example.com\n0917 123 4567",
  contactId: "",
  reference: "Coron Island Escape, Dec 20–22 · TSQ-000012",
  issueDate: "2026-11-06",
  dueDate: "2026-11-20",
  lineItems: [
    { description: "Coron 3D2N package – Adult", quantity: 2, unitPrice: 8999.5 },
    { description: "Coron 3D2N package – Child", quantity: 1, unitPrice: 6500 },
    { description: "Travel insurance", quantity: 3, unitPrice: 450 },
  ],
  discounts: [
    { source: "discount", label: "Early bird", type: "percent", value: 10 },
    {
      source: "voucher",
      label: "Partner hotel voucher",
      type: "amount",
      value: 1000,
      voucherId: "",
      voucherCode: "HTL-2026-001",
    },
  ],
  payments: [
    { date: "2026-11-01", label: "Downpayment via GCash", amount: 10000 },
  ],
  notes: "BDO Savings 0012-3456-7890 (TravelSentro Travel and Tours)\nGCash 0917 000 0000\nPlease send proof of payment on Messenger.",
};
