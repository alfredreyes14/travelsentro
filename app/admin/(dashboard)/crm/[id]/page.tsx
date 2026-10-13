import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ContactDocumentsCard } from "@/components/admin/contact-documents-card";
import { ContactQuotesCard } from "@/components/admin/contact-quotes-card";
import { CrmDetail, type CrmDetailContact } from "@/components/admin/crm-detail";
import type {
  CrmDetailInquiry,
  CrmDetailMessage,
} from "@/components/admin/contact-activity";
import {
  contactRowToFormValues,
  parseLabeledList,
} from "@/lib/crm/contact-schema";
import type { MessageChannel, MessageStatus } from "@/lib/crm/messages";
import { toServiceKeys } from "@/lib/crm/services";
import { toClientType, toContactStage } from "@/lib/crm/stage";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Contact | TravelSentro Admin",
};

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];
type PackageRow = Database["public"]["Tables"]["packages"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

type ContactDetail = ContactRow & {
  inquiries: (InquiryRow & {
    packages: Pick<PackageRow, "id" | "name" | "slug"> | null;
  })[];
  messages: Pick<
    MessageRow,
    "id" | "channel" | "subject" | "body" | "status" | "created_at" | "sent_by_name"
  >[];
};

/**
 * CRM-03: universal-read guard (getProfile() session validation only, no
 * redirect-based permission gate) — every authenticated Staff/Admin can view
 * a contact's page regardless of can_edit_crm; only the edit affordances
 * are permission-gated inside CrmDetail.
 */
export default async function CrmContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();

  const { id } = await params;
  const supabase = await createClient();

  const [contactResult, tagsResult] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "*, inquiries(id, contact_id, request_id, message, created_at, package_id, packages(id, name, slug)), messages(id, channel, subject, body, status, created_at, sent_by_name)"
      )
      .eq("id", id)
      .order("created_at", { referencedTable: "inquiries", ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: false })
      .single(),
    supabase.rpc("list_contact_tags"),
  ]);

  if (contactResult.error || !contactResult.data) notFound();
  if (tagsResult.error) {
    console.error("Failed to load tags:", tagsResult.error.message);
  }

  const contact = contactResult.data as unknown as ContactDetail;
  const canEdit = profile.role === "admin" || profile.can_edit_crm;
  const clientType = toClientType(contact.client_type);

  const detailContact: CrmDetailContact = {
    id: contact.id,
    email: contact.email,
    name: contact.name,
    phone: contact.phone,
    clientType,
    stage: toContactStage(clientType, contact.stage),
    tags: contact.tags,
    opted_out: contact.opted_out,
    servicesAvailed: toServiceKeys(contact.services_availed),
    servicesOther: contact.services_other,
    repName: contact.rep_name,
    repPosition: contact.rep_position,
    otherEmails: parseLabeledList(contact.other_emails),
    otherPhones: parseLabeledList(contact.other_phones),
    contractStart: contact.contract_start,
    contractEnd: contact.contract_end,
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

  const detailMessages: CrmDetailMessage[] = contact.messages.map((m) => ({
    id: m.id,
    channel: m.channel as MessageChannel,
    subject: m.subject,
    body: m.body,
    status: m.status as MessageStatus,
    created_at: m.created_at,
    sent_by_name: m.sent_by_name,
  }));

  // Quotes are readable only with can_manage_quotes (RLS), so the card is
  // not rendered at all for anyone else. B2C only, per the spec.
  const canManageQuotes = profile.role === "admin" || profile.can_manage_quotes;
  let quotesSlot: React.ReactNode = null;
  if (clientType === "b2c" && canManageQuotes) {
    const [linkedResult, unlinkedResult] = await Promise.all([
      supabase
        .from("quotes")
        .select("id, quote_no, title, price_per_pax, updated_at")
        .eq("contact_id", id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("quotes")
        .select("id, quote_no, title, customer_name")
        .is("contact_id", null)
        .order("updated_at", { ascending: false }),
    ]);
    if (linkedResult.error) {
      console.error("Failed to load linked quotes:", linkedResult.error.message);
    }
    if (unlinkedResult.error) {
      console.error("Failed to load unlinked quotes:", unlinkedResult.error.message);
    }

    quotesSlot = (
      <ContactQuotesCard
        contactId={id}
        quotes={(linkedResult.data ?? []).map((quote) => ({
          id: quote.id,
          quoteNo: quote.quote_no,
          title: quote.title,
          pricePerPax: quote.price_per_pax,
          updatedAt: quote.updated_at,
        }))}
        unlinkedQuotes={(unlinkedResult.data ?? []).map((quote) => ({
          id: quote.id,
          quoteNo: quote.quote_no,
          title: quote.title,
          customerName: quote.customer_name,
        }))}
      />
    );
  }

  let documentsSlot: React.ReactNode = null;
  if (clientType === "b2b") {
    const { data: documentRows, error: documentsError } = await supabase
      .from("contact_documents")
      .select("id, file_name, size_bytes, uploaded_by_name, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false });
    if (documentsError) {
      console.error("Failed to load documents:", documentsError.message);
    }

    documentsSlot = (
      <ContactDocumentsCard
        contactId={id}
        canEdit={canEdit}
        documents={(documentRows ?? []).map((document) => ({
          id: document.id,
          fileName: document.file_name,
          sizeBytes: document.size_bytes,
          uploadedByName: document.uploaded_by_name,
          createdAt: document.created_at,
        }))}
      />
    );
  }

  return (
    <CrmDetail
      contact={detailContact}
      formValues={contactRowToFormValues(contact)}
      existingTags={tagsResult.data ?? []}
      inquiries={detailInquiries}
      messages={detailMessages}
      canEdit={canEdit}
      quotesSlot={quotesSlot}
      documentsSlot={documentsSlot}
    />
  );
}
