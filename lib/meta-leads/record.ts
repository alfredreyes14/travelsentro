import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedMetaLead } from "./lead";

export type RecordMetaLeadResult = {
  contactId: string;
  inquiryId: string;
  isNew: boolean;
};

/**
 * Saves one lead through record_meta_lead(). The client must use the
 * service-role key -- the function is not granted to anon or staff.
 * Idempotent on the leadgen ID: isNew is false for a lead already saved.
 */
export async function recordMetaLead(
  serviceClient: SupabaseClient,
  lead: ParsedMetaLead
): Promise<RecordMetaLeadResult> {
  const { data, error } = await serviceClient.rpc("record_meta_lead", {
    p_leadgen_id: lead.leadgenId,
    p_email: lead.email,
    p_name: lead.name,
    p_phone: lead.phone,
    p_message: lead.message,
    p_details: lead.details,
    p_created_at: lead.createdAt,
  });

  const row = (data as { contact_id: string; inquiry_id: string; is_new: boolean }[] | null)?.[0];
  if (error || !row) {
    throw new Error(`record_meta_lead failed: ${error?.message ?? "no row returned"}`);
  }
  return { contactId: row.contact_id, inquiryId: row.inquiry_id, isNew: row.is_new };
}
