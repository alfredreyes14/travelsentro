import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import {
  VoucherTable,
  type VoucherListItem,
} from "@/components/admin/vouchers/voucher-table";
import type { VoucherStatus, VoucherType } from "@/lib/vouchers/status";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Vouchers | TravelSentro Admin",
};

type VoucherRow = Database["public"]["Tables"]["vouchers"]["Row"] & {
  voucher_partners: { name: string } | null;
  contacts: { name: string; email: string } | null;
};

export default async function AdminVouchersPage() {
  // AUTH-05 — gate independent of nav hiding; RLS is the second, independent
  // enforcement layer (mirrors every other admin page).
  await requirePermissionOrRedirect("can_manage_vouchers");

  const supabase = await createClient();

  const [vouchersResult, partnersResult, contactsResult] = await Promise.all([
    supabase
      .from("vouchers")
      .select("*, voucher_partners(name), contacts(name, email)")
      .order("created_at", { ascending: false }),
    supabase.from("voucher_partners").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, email").order("name"),
  ]);

  if (vouchersResult.error) {
    console.error("Failed to load vouchers:", vouchersResult.error.message);
  }
  if (partnersResult.error) {
    console.error(
      "Failed to load voucher partners:",
      partnersResult.error.message
    );
  }
  if (contactsResult.error) {
    console.error("Failed to load contacts:", contactsResult.error.message);
  }

  const vouchers: VoucherListItem[] = (
    (vouchersResult.data ?? []) as VoucherRow[]
  ).map((row) => ({
    id: row.id,
    type: row.type as VoucherType,
    partnerId: row.partner_id,
    partnerName: row.voucher_partners?.name ?? null,
    title: row.title,
    valueLabel: row.value_label,
    code: row.code,
    contactId: row.contact_id,
    contactLabel: row.contacts
      ? `${row.contacts.name} (${row.contacts.email})`
      : null,
    status: row.status as VoucherStatus,
    expiresAt: row.expires_at ? row.expires_at.slice(0, 10) : "",
    createdAt: row.created_at,
  }));

  const partners = partnersResult.data ?? [];
  const contacts = contactsResult.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vouchers"
        description="Track e-vouchers and physical vouchers from brand partners or TravelSentro, and assign them to a contact when handed out."
      />

      <VoucherTable
        vouchers={vouchers}
        partners={partners}
        contacts={contacts}
      />
    </div>
  );
}
