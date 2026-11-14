"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/action-result";
import { contactLogSchema, type ContactLogValues } from "@/lib/crm/contact-logs";
import { createClient } from "@/lib/supabase/server";

const LOG_ERROR_MESSAGE = "Something went wrong logging this contact. Please try again.";
const DELETE_ERROR_MESSAGE = "Something went wrong removing this entry. Please try again.";

// A minute of slack for clock drift between the browser and the server.
const FUTURE_TOLERANCE_MS = 60 * 1000;

function revalidateLead(contactId: string) {
  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${contactId}`);
}

/** Records a contact made outside the panel (call, WhatsApp, ...). */
export async function logContact(
  contactId: string,
  values: ContactLogValues
): Promise<ActionResult> {
  const profile = await requirePermission("can_edit_crm");

  const id = z.uuid().safeParse(contactId);
  const parsed = contactLogSchema.safeParse(values);
  if (!id.success || !parsed.success) {
    return { ok: false, error: "Some fields are invalid. Please review the form and try again." };
  }
  const contactedAt = new Date(parsed.data.contactedAt);
  if (contactedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    return { ok: false, error: "The contact date can't be in the future." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contact_logs").insert({
    contact_id: id.data,
    channel: parsed.data.channel,
    contacted_at: contactedAt.toISOString(),
    note: parsed.data.note || null,
    logged_by: profile.id,
    logged_by_name: profile.name || profile.email,
  });

  if (error) {
    console.error("logContact failed:", error.message);
    return { ok: false, error: LOG_ERROR_MESSAGE };
  }

  revalidateLead(id.data);
  return { ok: true };
}

/** Removes a contact log entered by mistake. */
export async function deleteContactLog(
  contactId: string,
  logId: string
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const ids = z.object({ contactId: z.uuid(), logId: z.uuid() }).safeParse({ contactId, logId });
  if (!ids.success) return { ok: false, error: DELETE_ERROR_MESSAGE };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_logs")
    .delete()
    .eq("id", ids.data.logId)
    .eq("contact_id", ids.data.contactId);

  if (error) {
    console.error("deleteContactLog failed:", error.message);
    return { ok: false, error: DELETE_ERROR_MESSAGE };
  }

  revalidateLead(ids.data.contactId);
  return { ok: true };
}
