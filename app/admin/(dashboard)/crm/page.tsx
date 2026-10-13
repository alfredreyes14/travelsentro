import type { Metadata } from "next";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CrmContactsView } from "@/components/admin/crm-contacts-view";
import type { AdminContactListItem } from "@/components/admin/crm-table";
import { toServiceKeys } from "@/lib/crm/services";
import { isClientType, toClientType, toContactStage } from "@/lib/crm/stage";

export const metadata: Metadata = {
  title: "Contacts | TravelSentro Admin",
};

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  // CRM-03: read access is universal for every authenticated Staff/Admin,
  // regardless of can_edit_crm -- session validation only, no permission
  // gate. can_edit_crm only decides whether "Add Contact" shows.
  const profile = await getProfile();
  const { type } = await searchParams;

  const supabase = await createClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select(
      "id, name, email, phone, client_type, stage, tags, opted_out, services_availed, services_other, rep_name, contract_end, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load contacts:", error.message);
  }

  const items: AdminContactListItem[] = (contacts ?? []).map((contact) => {
    const clientType = toClientType(contact.client_type);
    return {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      clientType,
      stage: toContactStage(clientType, contact.stage),
      tags: contact.tags,
      opted_out: contact.opted_out,
      servicesAvailed: toServiceKeys(contact.services_availed),
      servicesOther: contact.services_other,
      repName: contact.rep_name,
      contractEnd: contact.contract_end,
      createdAt: contact.created_at,
    };
  });

  return (
    <CrmContactsView
      contacts={items}
      initialType={isClientType(type) ? type : "b2c"}
      canEdit={profile.role === "admin" || profile.can_edit_crm}
    />
  );
}
