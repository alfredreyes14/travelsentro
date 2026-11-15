"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { requirePermission } from "@/lib/auth/dal";
import { scheduleMetaSync } from "@/lib/meta-sync/schedule";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff linking a contact to a Messenger chat by hand, for chats the
 * webhook couldn't match on its own (lib/meta-sync). Once linked, the
 * chat's inbox stage label and the CRM stage stay in step.
 */

const ERROR = "Couldn't update the Messenger link. Please try again.";

export async function linkMessengerChat(
  contactId: string,
  psid: string
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("link_messenger_thread", {
    p_contact_id: contactId,
    p_psid: psid,
  });
  if (error) {
    console.error("link_messenger_thread failed:", error.message);
    return { ok: false, error: ERROR };
  }
  if (!data) {
    return {
      ok: false,
      error: "That chat is already linked to another contact, or this contact already has a chat.",
    };
  }

  scheduleMetaSync();
  revalidatePath(`/admin/crm/${contactId}`);
  return { ok: true };
}

export async function unlinkMessengerChat(contactId: string): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_messenger_thread", { p_contact_id: contactId });
  if (error) {
    console.error("unlink_messenger_thread failed:", error.message);
    return { ok: false, error: ERROR };
  }

  revalidatePath(`/admin/crm/${contactId}`);
  return { ok: true };
}
