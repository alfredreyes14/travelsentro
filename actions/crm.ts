"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  contactFormSchema,
  contactValuesToRow,
  convertSchema,
  type ContactFormValues,
} from "@/lib/crm/contact-schema";
import {
  isClientType,
  isStageForType,
  type ClientType,
  type ContactStage,
} from "@/lib/crm/stage";

const STAGE_ERROR_MESSAGE =
  "Something went wrong updating the stage. Please try again.";
const STAGE_MISMATCH_MESSAGE =
  "That stage doesn't belong to this contact's pipeline anymore. Refresh the page and try again.";
const CONTACT_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
const INVALID_MESSAGE =
  "Some fields are invalid. Please review the form and try again.";
const DUPLICATE_EMAIL_MESSAGE = "A contact with this email already exists.";
const GONE_MESSAGE = "That contact no longer exists.";

// Postgres error codes.
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

export type ContactActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; existingContactId?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadExistingTags(supabase: Supabase): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_contact_tags");
  if (error) console.error("list_contact_tags failed:", error.message);
  return data ?? [];
}

/** The duplicate-email result, with the other contact's id so the form can link to it. */
async function duplicateEmailResult(
  supabase: Supabase,
  email: string | null,
  ownId?: string
): Promise<ContactActionResult> {
  let existingContactId: string | undefined;
  if (email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (data && data.id !== ownId) existingContactId = data.id;
  }
  return { ok: false, error: DUPLICATE_EMAIL_MESSAGE, existingContactId };
}

/**
 * Adds a contact by hand. Until this action existed, record_inquiry() was
 * the only way a contact was created; the stage starts at New for either
 * client type (the column default).
 */
export async function createContact(
  clientType: ClientType,
  values: ContactFormValues
): Promise<ContactActionResult> {
  const profile = await requirePermission("can_edit_crm");

  const parsed = contactFormSchema.safeParse(values);
  if (!isClientType(clientType) || !parsed.success) {
    return { ok: false, error: INVALID_MESSAGE };
  }

  const supabase = await createClient();
  const row = contactValuesToRow(parsed.data, await loadExistingTags(supabase));

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      ...row,
      client_type: clientType,
      created_by: profile.id,
      created_by_name: profile.name,
    })
    .select("id")
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    return duplicateEmailResult(supabase, row.email);
  }
  if (error || !data) {
    console.error("createContact failed:", error?.message);
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }

  revalidatePath("/admin/crm");
  return { ok: true, id: data.id };
}

/**
 * Saves the contact form. The client type and stage are not part of the
 * form: updateStage() and convertContactType() own those.
 */
export async function updateContact(
  id: string,
  values: ContactFormValues
): Promise<ContactActionResult> {
  await requirePermission("can_edit_crm");

  const parsed = contactFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const row = contactValuesToRow(parsed.data, await loadExistingTags(supabase));

  const { data, error } = await supabase
    .from("contacts")
    .update(row)
    .eq("id", id)
    .select("id");

  if (error?.code === UNIQUE_VIOLATION) {
    return duplicateEmailResult(supabase, row.email, id);
  }
  if (error) {
    console.error("updateContact failed:", error.message);
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) return { ok: false, error: GONE_MESSAGE };

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true, id };
}

/**
 * Moves a contact along its pipeline. Whether the stage belongs to the
 * contact's client type is decided by the database
 * (contacts_stage_matches_type), so a stale tab that still shows the
 * pipeline of a contact someone just converted gets a clear message.
 */
export async function updateStage(
  id: string,
  stage: ContactStage
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  if (!isStageForType("b2c", stage) && !isStageForType("b2b", stage)) {
    return { ok: false, error: STAGE_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ stage })
    .eq("id", id)
    .select("id");

  if (error?.code === CHECK_VIOLATION) {
    return { ok: false, error: STAGE_MISMATCH_MESSAGE };
  }
  if (error) {
    console.error("updateStage failed:", error.message);
    return { ok: false, error: STAGE_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) return { ok: false, error: GONE_MESSAGE };

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}

/**
 * Switches a contact between B2C and B2B. Only the type and stage change:
 * the other type's fields stay on the row, hidden, so converting back
 * loses nothing.
 */
export async function convertContactType(
  id: string,
  clientType: ClientType,
  stage: ContactStage
): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  const parsed = convertSchema.safeParse({ clientType, stage });
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ client_type: parsed.data.clientType, stage: parsed.data.stage })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("convertContactType failed:", error.message);
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) return { ok: false, error: GONE_MESSAGE };

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${id}`);
  return { ok: true };
}
