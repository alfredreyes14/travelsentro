"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createElement } from "react";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  previousSoaFormSchema,
  soaFormSchema,
  type PreviousSoaFormValues,
  type SoaFormValues,
} from "@/components/admin/soa/soa-form-schema";
import { SoaEmail } from "@/components/email/soa-email";
import {
  MAX_DOCUMENT_BYTES,
  checkDocument,
  isAllowedDocumentType,
  sanitizeFileName,
} from "@/lib/crm/documents";
import { FROM_EMAIL, resend } from "@/lib/resend";
import { buildSoaAttachment } from "@/lib/soa/attachment";
import { SOA_FILE_PREFIX, isSoaFileKey, type SoaFileChange } from "@/lib/soa/files";
import { previousSoaValuesToRow, soaValuesToRow } from "@/lib/soa/soa-row";
import { soaEmailSchema, type SoaEmailValues } from "@/lib/soa/email-schema";
import {
  deletePrivateObject,
  headObject,
  presignUpload,
} from "@/lib/storage/r2-private";
import { getSiteOrigin } from "@/actions/auth";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
const INVALID_MESSAGE =
  "Some fields are invalid. Please review the form and try again.";
const UPLOAD_ERROR_MESSAGE =
  "Something went wrong uploading that file. Please try again.";
const SEND_ERROR_MESSAGE = "Couldn't send the email. Please try again.";
const GONE_MESSAGE = "That statement no longer exists.";

const idSchema = z.uuid();

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Every contact page can show SOAs, so any link change refreshes them all. */
function revalidateSoa(id?: string) {
  revalidatePath("/admin/soa");
  if (id) revalidatePath(`/admin/soa/${id}`);
  revalidatePath("/admin/crm/[id]", "page");
}

const removeStored = (key: string) =>
  deletePrivateObject(key).catch((err) =>
    console.error(`Orphaned private object ${key}:`, err)
  );

// ---------------------------------------------------------------------------
// Attached file (previous SOAs)
// ---------------------------------------------------------------------------

export type SoaUploadStart =
  | { ok: true; url: string; key: string; contentType: string }
  | { ok: false; error: string };

/**
 * Step 1 of attaching a file: checks the file's claimed type and size and
 * hands back a URL the browser PUTs it to (straight to R2 -- Vercel caps
 * request bodies at 4.5 MB). Saving the SOA records it (step 2).
 */
export async function createSoaFileUpload(file: {
  name: string;
  type: string;
  size: number;
}): Promise<SoaUploadStart> {
  await requirePermission("can_manage_quotes");

  const checked = checkDocument({
    name: String(file?.name ?? ""),
    type: String(file?.type ?? ""),
    size: Number(file?.size),
  });
  if (!checked.ok) return checked;

  const key = `${SOA_FILE_PREFIX}${randomUUID()}.${checked.extension}`;
  try {
    const url = await presignUpload(key, checked.contentType);
    return { ok: true, url, key, contentType: checked.contentType };
  } catch (err) {
    console.error("createSoaFileUpload failed:", err);
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }
}

type FilePatch = {
  file_storage_key: string | null;
  file_name: string | null;
  file_content_type: string | null;
  file_size_bytes: number | null;
};

const NO_FILE: FilePatch = {
  file_storage_key: null,
  file_name: null,
  file_content_type: null,
  file_size_bytes: null,
};

/**
 * Step 2: the size and type come from the stored object itself, not from
 * the browser, so a file that lied in step 1 is deleted instead of kept.
 */
async function verifyUploadedFile(
  change: Extract<SoaFileChange, { action: "replace" }>
): Promise<{ ok: true; patch: FilePatch } | { ok: false; error: string }> {
  if (typeof change.key !== "string" || !isSoaFileKey(change.key)) {
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }

  let stored: Awaited<ReturnType<typeof headObject>>;
  try {
    stored = await headObject(change.key);
  } catch (err) {
    console.error("verifyUploadedFile head failed:", err);
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }
  if (!stored) {
    return { ok: false, error: "The file upload didn't finish. Please try again." };
  }
  if (
    !isAllowedDocumentType(stored.contentType) ||
    stored.size <= 0 ||
    stored.size > MAX_DOCUMENT_BYTES
  ) {
    await removeStored(change.key);
    return {
      ok: false,
      error: "That file isn't an allowed type or is larger than 20 MB.",
    };
  }

  return {
    ok: true,
    patch: {
      file_storage_key: change.key,
      file_name: sanitizeFileName(String(change.fileName ?? "")),
      file_content_type: stored.contentType,
      file_size_bytes: stored.size,
    },
  };
}

// ---------------------------------------------------------------------------
// Create / update / delete
// ---------------------------------------------------------------------------

/** soa_no and created_by are set by the database, never sent from here. */
export async function createSoa(
  values: SoaFormValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_quotes");

  const parsed = soaFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .insert({ ...soaValuesToRow(parsed.data), kind: "generated" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createSoa failed:", error?.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateSoa();
  return { ok: true, id: data.id };
}

export async function updateSoa(
  id: string,
  values: SoaFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const parsed = soaFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .update({ ...soaValuesToRow(parsed.data), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("kind", "generated")
    .select("id");

  if (error) {
    console.error("updateSoa failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) return { ok: false, error: GONE_MESSAGE };

  revalidateSoa(id);
  return { ok: true };
}

/** Records an SOA issued before this system, with an optional file. */
export async function createPreviousSoa(
  values: PreviousSoaFormValues,
  file: SoaFileChange
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_quotes");

  const parsed = previousSoaFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  let filePatch = NO_FILE;
  if (file?.action === "replace") {
    const verified = await verifyUploadedFile(file);
    if (!verified.ok) return verified;
    filePatch = verified.patch;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .insert({ ...previousSoaValuesToRow(parsed.data), ...filePatch, kind: "previous" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createPreviousSoa failed:", error?.message);
    if (filePatch.file_storage_key) await removeStored(filePatch.file_storage_key);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateSoa();
  return { ok: true, id: data.id };
}

export async function updatePreviousSoa(
  id: string,
  values: PreviousSoaFormValues,
  file: SoaFileChange
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const parsed = previousSoaFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("statements")
    .select("file_storage_key")
    .eq("id", id)
    .eq("kind", "previous")
    .maybeSingle();
  if (currentError) {
    console.error("updatePreviousSoa read failed:", currentError.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  if (!current) return { ok: false, error: GONE_MESSAGE };

  let filePatch: FilePatch | null = null;
  if (file?.action === "replace") {
    const verified = await verifyUploadedFile(file);
    if (!verified.ok) return verified;
    filePatch = verified.patch;
  } else if (file?.action === "remove") {
    filePatch = NO_FILE;
  }

  const { error } = await supabase
    .from("statements")
    .update({
      ...previousSoaValuesToRow(parsed.data),
      ...(filePatch ?? {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updatePreviousSoa failed:", error.message);
    if (filePatch?.file_storage_key) await removeStored(filePatch.file_storage_key);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  // The row no longer points at the old file, so it can go.
  if (filePatch && current.file_storage_key) {
    await removeStored(current.file_storage_key);
  }

  revalidateSoa(id);
  return { ok: true };
}

export async function deleteSoa(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .delete()
    .eq("id", id)
    .select("file_storage_key");

  if (error) {
    console.error("deleteSoa failed:", error.message);
    return {
      ok: false,
      error: "Something went wrong deleting that statement. Please try again.",
    };
  }

  const key = data?.[0]?.file_storage_key;
  if (key) await removeStored(key);

  revalidateSoa();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CRM links
// ---------------------------------------------------------------------------

/**
 * Links an SOA to a contact from the contact's page. Only an unlinked SOA
 * is changed, so a stale "Link existing" list can't take an SOA away from
 * another contact.
 */
export async function linkSoaToContact(
  soaId: string,
  contactId: string
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .update({ contact_id: contactId })
    .eq("id", soaId)
    .is("contact_id", null)
    .select("id");

  if (error) {
    console.error("linkSoaToContact failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "That statement is already linked to a contact. Refresh and try again.",
    };
  }

  revalidateSoa(soaId);
  return { ok: true };
}

/** Removes an SOA's link to this contact. The SOA itself is untouched. */
export async function unlinkSoaFromContact(
  soaId: string,
  contactId: string
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { error } = await supabase
    .from("statements")
    .update({ contact_id: null })
    .eq("id", soaId)
    .eq("contact_id", contactId);

  if (error) {
    console.error("unlinkSoaFromContact failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidateSoa(soaId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

async function logSend(
  supabase: Supabase,
  entry: {
    statementId: string;
    sentTo: string;
    subject: string;
    status: "sent" | "failed";
    providerMessageId: string | null;
    sentByName: string | null;
  }
) {
  const { error } = await supabase.from("statement_emails").insert({
    statement_id: entry.statementId,
    sent_to: entry.sentTo,
    subject: entry.subject,
    status: entry.status,
    provider_message_id: entry.providerMessageId,
    sent_by_name: entry.sentByName,
  });
  if (error) console.error("statement_emails insert failed:", error.message);
}

/**
 * Emails the SOA as an attachment: the generated PDF, or a previous SOA's
 * own file (a PDF built from its amounts when it has none). Awaited inline
 * so a failure shows as an error, never a false success. Every attempt is
 * logged.
 */
export async function sendSoaEmail(
  soaId: string,
  values: SoaEmailValues
): Promise<ActionResult> {
  const profile = await requirePermission("can_manage_quotes");

  const parsed = soaEmailSchema.safeParse(values);
  if (!idSchema.safeParse(soaId).success || !parsed.success) {
    return { ok: false, error: INVALID_MESSAGE };
  }

  const supabase = await createClient();
  const { data: soa, error } = await supabase
    .from("statements")
    .select("*")
    .eq("id", soaId)
    .maybeSingle();
  if (error) console.error("sendSoaEmail read failed:", error.message);
  if (!soa) return { ok: false, error: GONE_MESSAGE };

  let attachment: Awaited<ReturnType<typeof buildSoaAttachment>>;
  try {
    const logoSrc = new URL("/logo-header.png", await getSiteOrigin()).toString();
    attachment = await buildSoaAttachment(soa, logoSrc);
  } catch (err) {
    console.error(`sendSoaEmail attachment failed for ${soa.soa_no}:`, err);
    return { ok: false, error: "Couldn't prepare the SOA file. Please try again." };
  }

  const { to, subject, message } = parsed.data;
  let providerMessageId: string | null = null;
  let sendError: string | null = null;
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      react: createElement(SoaEmail, { name: soa.bill_to_name, message }),
      attachments: [attachment],
    });
    providerMessageId = result.data?.id ?? null;
    sendError = result.error?.message ?? null;
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
  }

  if (sendError) console.error(`sendSoaEmail failed for ${soa.soa_no}:`, sendError);

  await logSend(supabase, {
    statementId: soa.id,
    sentTo: to,
    subject,
    status: sendError ? "failed" : "sent",
    providerMessageId,
    sentByName: profile.name,
  });

  revalidatePath(`/admin/soa/${soa.id}`);
  return sendError ? { ok: false, error: SEND_ERROR_MESSAGE } : { ok: true };
}
