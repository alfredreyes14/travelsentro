import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireModuleOrRedirect } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ContactDocumentsCard } from "@/components/admin/contact-documents-card";
import { ContactQuotesCard } from "@/components/admin/contact-quotes-card";
import { ContactSoaCard } from "@/components/admin/contact-soa-card";
import { CrmDetail, type CrmDetailContact } from "@/components/admin/crm-detail";
import {
  ContactMessengerLink,
  type MessengerChatOption,
} from "@/components/admin/contact-messenger-link";
import type {
  CrmDetailContactLog,
  CrmDetailInquiry,
  CrmDetailMessage,
} from "@/components/admin/contact-activity";
import {
  contactRowToFormValues,
  parseLabeledList,
} from "@/lib/crm/contact-schema";
import { CONTACT_LOG_CHANNEL_LABELS, toContactLogChannel } from "@/lib/crm/contact-logs";
import type { MessageChannel, MessageStatus } from "@/lib/crm/messages";
import { toMetaLeadSourceDetails } from "@/lib/crm/inquiry-source";
import { toServiceKeys } from "@/lib/crm/services";
import { toClientType, toContactStage } from "@/lib/crm/stage";
import { toChatTarget } from "@/lib/follow-ups/links";
import { chatUrl } from "@/lib/meta-sync/chats";
import { toFollowUpProgress } from "@/lib/follow-ups/progress";
import {
  followUpSequenceFor,
  toFollowUpSequence,
} from "@/lib/follow-ups/templates";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Lead | TravelSentro Admin",
};

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];
type PackageRow = Database["public"]["Tables"]["packages"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type ContactLogRow = Database["public"]["Tables"]["contact_logs"]["Row"];

type ContactDetail = ContactRow & {
  inquiries: (InquiryRow & {
    packages: Pick<PackageRow, "id" | "name" | "slug"> | null;
  })[];
  messages: (Pick<
    MessageRow,
    | "id"
    | "channel"
    | "subject"
    | "body"
    | "status"
    | "created_at"
    | "sent_by_name"
    | "kind"
    | "follow_up_sequence"
    | "follow_up_step"
    | "click_count"
  > & {
    message_clicks: { target: string; created_at: string }[];
  })[];
  contact_logs: Pick<
    ContactLogRow,
    "id" | "channel" | "note" | "contacted_at" | "logged_by_name"
  >[];
};

/**
 * Needs Leads View. Edit affordances are gated by Leads Edit (canEdit) and,
 * for deleting notes/documents, Leads Delete inside the cards (useCan).
 */
export default async function CrmContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireModuleOrRedirect("leads");

  const { id } = await params;
  const supabase = await createClient();

  const [contactResult, tagsResult, progressResult, chatsResult] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "*, inquiries(id, contact_id, request_id, message, created_at, package_id, source, source_details, packages(id, name, slug)), messages(id, channel, subject, body, status, created_at, sent_by_name, kind, follow_up_sequence, follow_up_step, click_count, message_clicks(target, created_at)), contact_logs(id, channel, note, contacted_at, logged_by_name)"
      )
      .eq("id", id)
      .order("created_at", { referencedTable: "inquiries", ascending: false })
      .order("created_at", { referencedTable: "messages", ascending: false })
      .order("contacted_at", { referencedTable: "contact_logs", ascending: false })
      .single(),
    supabase.rpc("list_contact_tags"),
    supabase
      .from("follow_up_progress")
      .select("sequence, sent_count, clicked")
      .eq("contact_id", id)
      .maybeSingle(),
    // This contact's chat (if linked) plus recent chats nobody linked yet.
    supabase
      .from("messenger_threads")
      .select("psid, name, last_snippet, last_inbound_at, chat_link, contact_id")
      .or(`contact_id.eq.${id},contact_id.is.null`)
      .order("last_inbound_at", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  if (contactResult.error || !contactResult.data) notFound();
  if (tagsResult.error) {
    console.error("Failed to load tags:", tagsResult.error.message);
  }

  const contact = contactResult.data as unknown as ContactDetail;
  const canEdit = can(profile, "leads", "update");
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
    quoteSuggestedAt: contact.quote_suggested_at,
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
      source: inquiry.source === "meta_lead_ad" ? "meta_lead_ad" : "website",
      sourceDetails: toMetaLeadSourceDetails(inquiry.source_details),
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
    followUp:
      m.kind === "follow_up"
        ? {
            sequence: toFollowUpSequence(m.follow_up_sequence),
            step: m.follow_up_step ?? 1,
          }
        : null,
    clicks: (m.message_clicks ?? [])
      .map((click) => ({
        target: toChatTarget(click.target),
        createdAt: click.created_at,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));

  // The current sequence and its next step (follow_up_progress counts only
  // this sequence since the contact entered its stage), and the package to
  // mention in the draft.
  if (progressResult.error) {
    console.error("Failed to load follow-up progress:", progressResult.error.message);
  }
  const followUpProgress = progressResult.data
    ? toFollowUpProgress(progressResult.data)
    : undefined;
  const nextFollowUp = {
    sequence: followUpProgress?.sequence ?? followUpSequenceFor(contact.client_type, contact.stage),
    step: (followUpProgress?.sentCount ?? 0) + 1,
  };
  if (chatsResult.error) {
    console.error("Failed to load Messenger chats:", chatsResult.error.message);
  }
  const toChat = (row: {
    psid: string;
    name: string | null;
    last_snippet: string | null;
    last_inbound_at: string | null;
    chat_link: string | null;
  }): MessengerChatOption => ({
    psid: row.psid,
    name: row.name,
    snippet: row.last_snippet,
    lastInboundAt: row.last_inbound_at,
    chatUrl: chatUrl(row.chat_link),
  });
  const chatRows = chatsResult.data ?? [];
  const linkedRow = chatRows.find((row) => row.contact_id === id);
  const messengerSlot = (
    <ContactMessengerLink
      contactId={id}
      linkedChat={
        linkedRow
          ? toChat(linkedRow)
          : contact.messenger_psid
            ? { psid: contact.messenger_psid, name: null, snippet: null, lastInboundAt: null, chatUrl: null }
            : null
      }
      unlinkedChats={chatRows.filter((row) => row.contact_id === null).map(toChat)}
      canEdit={canEdit}
    />
  );

  const latestPackageName =
    contact.inquiries.find((inquiry) => inquiry.packages)?.packages?.name ?? null;

  const detailContactLogs: CrmDetailContactLog[] = contact.contact_logs.map((log) => ({
    id: log.id,
    channel: toContactLogChannel(log.channel),
    note: log.note,
    created_at: log.contacted_at,
    logged_by_name: log.logged_by_name,
  }));

  // Same rule as the contact_last_activity view: a sent email/SMS or a
  // logged contact, whichever is latest. Both lists are newest first.
  const lastSent = detailMessages.find((m) => m.status === "sent");
  const lastLog = detailContactLogs[0];
  const lastContact =
    lastSent &&
    (!lastLog || new Date(lastSent.created_at).getTime() > new Date(lastLog.created_at).getTime())
      ? { at: lastSent.created_at, via: { email: "email", sms: "SMS", messenger: "Messenger" }[lastSent.channel] }
      : lastLog
        ? { at: lastLog.created_at, via: CONTACT_LOG_CHANNEL_LABELS[lastLog.channel] }
        : null;

  // Quotes are readable only with Quotes View (RLS), so the card is not
  // rendered at all for anyone else. B2C only, per the spec.
  let quotesSlot: React.ReactNode = null;
  if (clientType === "b2c" && can(profile, "quotes", "read")) {
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

  // Statements of Account, for B2C and B2B alike. Needs SOA View.
  let soaSlot: React.ReactNode = null;
  if (can(profile, "soa", "read")) {
    const [linkedResult, unlinkedResult] = await Promise.all([
      supabase
        .from("statements")
        .select("id, soa_no, kind, original_no, issue_date, total_amount, balance, next_due_date")
        .eq("contact_id", id)
        .order("issue_date", { ascending: false }),
      supabase
        .from("statements")
        .select("id, soa_no, original_no, bill_to_name, total_amount")
        .is("contact_id", null)
        .order("issue_date", { ascending: false }),
    ]);
    if (linkedResult.error) {
      console.error("Failed to load linked statements:", linkedResult.error.message);
    }
    if (unlinkedResult.error) {
      console.error("Failed to load unlinked statements:", unlinkedResult.error.message);
    }

    soaSlot = (
      <ContactSoaCard
        contactId={id}
        statements={(linkedResult.data ?? []).map((soa) => ({
          id: soa.id,
          soaNo: soa.soa_no,
          isPrevious: soa.kind === "previous",
          originalNo: soa.original_no,
          issueDate: soa.issue_date,
          total: Number(soa.total_amount),
          balance: Number(soa.balance),
          nextDueDate: soa.next_due_date,
        }))}
        unlinkedStatements={(unlinkedResult.data ?? []).map((soa) => ({
          id: soa.id,
          soaNo: soa.soa_no,
          originalNo: soa.original_no,
          billToName: soa.bill_to_name,
          total: Number(soa.total_amount),
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
      followUp={{ ...nextFollowUp, packageName: latestPackageName }}
      followUpProgress={followUpProgress}
      messengerSlot={messengerSlot}
      contactLogs={detailContactLogs}
      lastContact={lastContact}
      canEdit={canEdit}
      quotesSlot={quotesSlot}
      documentsSlot={documentsSlot}
      soaSlot={soaSlot}
    />
  );
}
