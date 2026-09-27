export const VOUCHER_TYPES = ["digital", "physical"] as const;

export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  digital: "E-voucher",
  physical: "Physical",
};

export const VOUCHER_STATUSES = [
  "available",
  "assigned",
  "redeemed",
  "expired",
  "void",
] as const;

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  redeemed: "Redeemed",
  expired: "Expired",
  void: "Void",
};

export const VOUCHER_STATUS_BADGE_VARIANT: Record<
  VoucherStatus,
  "default" | "outline" | "secondary" | "destructive"
> = {
  available: "outline",
  assigned: "default",
  redeemed: "secondary",
  expired: "destructive",
  void: "destructive",
};

// Redeemed's green mirrors lib/crm/status.ts's identical STATUS_BADGE_CLASSNAME
// override -- a utility-class override on the `secondary` variant, not a new
// badge.tsx cva variant, for the same single-use-case reason.
export const VOUCHER_STATUS_BADGE_CLASSNAME: Partial<
  Record<VoucherStatus, string>
> = {
  redeemed: "bg-green-600 text-white border-transparent hover:bg-green-600/90",
};
