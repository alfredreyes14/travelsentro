import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { toClientType, type ClientType } from "@/lib/crm/stage";
import type { Database } from "@/types/database";

export type SoaContactOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  clientType: ClientType;
};

export type SoaVoucherOption = {
  id: string;
  title: string;
  valueLabel: string;
  code: string | null;
  status: string;
  contactId: string | null;
};

/**
 * Contacts (with tags, for the "New contact" dialog) and usable vouchers
 * for the SOA forms' pickers. Vouchers are
 * RLS-gated by can_manage_vouchers, so staff without it just get an empty
 * list and type the voucher in by hand.
 */
export async function loadSoaFormOptions(
  supabase: SupabaseClient<Database>
): Promise<{
  contacts: SoaContactOption[];
  vouchers: SoaVoucherOption[];
  existingTags: string[];
}> {
  const [contactsResult, vouchersResult, tagsResult] = await Promise.all([
    supabase.from("contacts").select("id, name, email, phone, client_type").order("name"),
    supabase
      .from("vouchers")
      .select("id, title, value_label, code, status, contact_id")
      .in("status", ["available", "assigned", "redeemed"])
      .order("created_at", { ascending: false }),
    supabase.rpc("list_contact_tags"),
  ]);

  if (contactsResult.error) console.error("Failed to load contacts:", contactsResult.error.message);
  if (vouchersResult.error) console.error("Failed to load vouchers:", vouchersResult.error.message);

  return {
    contacts: (contactsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      clientType: toClientType(row.client_type),
    })),
    existingTags: tagsResult.data ?? [],
    vouchers: (vouchersResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      valueLabel: row.value_label,
      code: row.code,
      status: row.status,
      contactId: row.contact_id,
    })),
  };
}
