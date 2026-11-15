import type { Permission } from "@/lib/auth/dal";

export type PermissionFieldName =
  | "canManagePackages"
  | "canMessageCustomers"
  | "canEditCrm"
  | "canManageVouchers"
  | "canManageQuotes";

/**
 * Every staff permission toggle, in display order. `covers` lists the admin
 * pages and actions each toggle unlocks -- newer features reuse an existing
 * toggle instead of adding a new one, so keep this in sync with the
 * requirePermission() calls in actions/ and app/admin/.
 */
export const PERMISSION_ITEMS: {
  field: PermissionFieldName;
  column: Permission;
  label: string;
  badge: string;
  covers: string;
}[] = [
  {
    field: "canEditCrm",
    column: "can_edit_crm",
    label: "Edit Leads",
    badge: "Leads",
    covers:
      "Add and edit leads, notes, documents, Messenger chats and saved replies, Meta lead sync",
  },
  {
    field: "canMessageCustomers",
    column: "can_message_customers",
    label: "Message Customers",
    badge: "Messages",
    covers: "Send emails and SMS, bulk sends, follow-ups, Messenger to-dos",
  },
  {
    field: "canManageQuotes",
    column: "can_manage_quotes",
    label: "Manage Quotes & SOA",
    badge: "Quotes & SOA",
    covers: "Quotes and Statements of Account",
  },
  {
    field: "canManageVouchers",
    column: "can_manage_vouchers",
    label: "Manage Vouchers",
    badge: "Vouchers",
    covers: "Vouchers and voucher partners",
  },
  {
    field: "canManagePackages",
    column: "can_manage_packages",
    label: "Manage Tours & Website",
    badge: "Tours & Website",
    covers:
      "Packages, Destinations, Site Content (hero slides, testimonials, FAQs, visa services, add-ons, booking terms), Events, Partners",
  },
];

export const NO_PERMISSIONS: Record<PermissionFieldName, boolean> = {
  canManagePackages: false,
  canMessageCustomers: false,
  canEditCrm: false,
  canManageVouchers: false,
  canManageQuotes: false,
};
