"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { ContactStatus } from "@/lib/crm/status";

const STATUS_ERROR_MESSAGE =
  "Something went wrong updating the status. Please try again.";
const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";

export async function updateStatus(
  id: string,
  status: ContactStatus
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { ok: false, error: STATUS_ERROR_MESSAGE };
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}

export async function updateContact(
  id: string,
  values: { name: string; phone: string | null; tags: string[] }
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({ name: values.name, phone: values.phone, tags: values.tags })
    .eq("id", id);

  if (error) {
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}
