import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { CrmDetail, type CrmDetailContact, type CrmDetailInquiry } from "@/components/admin/crm-detail";
import type { ContactStatus } from "@/lib/crm/status";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Contact | TravelSentro Admin",
};

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];
type PackageRow = Database["public"]["Tables"]["packages"]["Row"];

type ContactDetail = ContactRow & {
  inquiries: (InquiryRow & {
    packages: Pick<PackageRow, "id" | "name" | "slug"> | null;
  })[];
};

/**
 * CRM-03: universal-read guard (getProfile() session validation only, no
 * redirect-based permission gate) — every authenticated Staff/Admin can view
 * a contact's detail page regardless of can_edit_crm; only the edit
 * affordances (status Select, "Edit Contact" button) are permission-gated
 * inside CrmDetail below.
 */
export default async function CrmContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select(
      "*, inquiries(id, contact_id, request_id, message, created_at, package_id, packages(id, name, slug))"
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "inquiries", ascending: false })
    .single();

  if (error || !data) notFound();

  const contact = data as unknown as ContactDetail;
  const canEdit = profile.role === "admin" || profile.can_edit_crm;

  const detailContact: CrmDetailContact = {
    id: contact.id,
    email: contact.email,
    name: contact.name,
    phone: contact.phone,
    status: contact.status as ContactStatus,
    tags: contact.tags,
    opted_out: contact.opted_out,
    created_at: contact.created_at,
    created_by: contact.created_by,
    created_by_name: contact.created_by_name,
    updated_at: contact.updated_at,
    updated_by: contact.updated_by,
    updated_by_name: contact.updated_by_name,
  };

  const detailInquiries: CrmDetailInquiry[] = contact.inquiries.map(
    (inquiry) => ({
      id: inquiry.id,
      message: inquiry.message,
      created_at: inquiry.created_at,
      package_id: inquiry.package_id,
      packages: inquiry.packages,
    })
  );

  return (
    <CrmDetail
      contact={detailContact}
      inquiries={detailInquiries}
      canEdit={canEdit}
    />
  );
}
