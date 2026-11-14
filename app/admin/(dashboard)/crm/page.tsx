import type { Metadata } from "next";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CrmContactsView } from "@/components/admin/crm-contacts-view";
import type { AdminContactListItem } from "@/components/admin/crm-table";
import { toServiceKeys } from "@/lib/crm/services";
import { isClientType, toClientType, toContactStage } from "@/lib/crm/stage";
import { isMetaLeadSyncEnabled } from "@/lib/meta-leads/run-sync";

export const metadata: Metadata = {
  title: "Leads | TravelSentro Admin",
};

// Covers the "Sync Meta leads" Server Action (same limit as the cron route).
export const maxDuration = 60;

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

  const [contactsResult, activityResult] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, name, email, phone, client_type, stage, tags, opted_out, services_availed, services_other, rep_name, contract_end, created_at"
      )
      .order("created_at", { ascending: false }),
    // Latest inquiry and latest contact per lead (a view; see
    // 20261115120000_lead_contact_tracking.sql).
    supabase
      .from("contact_last_activity")
      .select("contact_id, last_inquiry_at, last_contacted_at"),
  ]);
  const { data: contacts, error } = contactsResult;

  if (error) {
    console.error("Failed to load contacts:", error.message);
  }
  if (activityResult.error) {
    console.error("Failed to load lead activity dates:", activityResult.error.message);
  }
  const activityById = new Map(
    (activityResult.data ?? []).map((row) => [row.contact_id, row])
  );

  const items: AdminContactListItem[] = (contacts ?? []).map((contact) => {
    const clientType = toClientType(contact.client_type);
    const activity = activityById.get(contact.id);
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
      lastInquiryAt: activity?.last_inquiry_at ?? null,
      lastContactedAt: activity?.last_contacted_at ?? null,
    };
  });

  return (
    <CrmContactsView
      contacts={items}
      initialType={isClientType(type) ? type : "b2c"}
      canEdit={profile.role === "admin" || profile.can_edit_crm}
      metaLeadSyncEnabled={isMetaLeadSyncEnabled()}
    />
  );
}
