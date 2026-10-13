"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  MAX_DOCUMENT_BYTES,
  checkDocument,
  documentKeyPrefix,
  isAllowedDocumentType,
  isDocumentKeyForContact,
  sanitizeFileName,
} from "@/lib/crm/documents";
import {
  deletePrivateObject,
  headObject,
  presignUpload,
} from "@/lib/storage/r2-private";

const UPLOAD_ERROR_MESSAGE =
  "Something went wrong uploading that document. Please try again.";
const DELETE_ERROR_MESSAGE =
  "Something went wrong deleting that document. Please try again.";

const idSchema = z.uuid();

export type DocumentUploadStart =
  | { ok: true; url: string; key: string; contentType: string }
  | { ok: false; error: string };

/**
 * Step 1 of an upload: checks the file's claimed type and size and hands
 * back a URL the browser PUTs the file to. The file goes straight to R2,
 * never through this app (Vercel caps a function's request body at 4.5 MB).
 * Nothing is recorded yet -- confirmDocumentUpload() does that.
 */
export async function createDocumentUpload(
  contactId: string,
  file: { name: string; type: string; size: number }
): Promise<DocumentUploadStart> {
  await requirePermission("can_edit_crm");

  if (!idSchema.safeParse(contactId).success) {
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }

  const checked = checkDocument({
    name: String(file?.name ?? ""),
    type: String(file?.type ?? ""),
    size: Number(file?.size),
  });
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("client_type")
    .eq("id", contactId)
    .maybeSingle();

  if (!contact) return { ok: false, error: "That contact no longer exists." };
  if (contact.client_type !== "b2b") {
    return {
      ok: false,
      error: "Documents can only be attached to B2B clients.",
    };
  }

  const key = `${documentKeyPrefix(contactId)}${randomUUID()}.${checked.extension}`;
  try {
    const url = await presignUpload(key, checked.contentType);
    return { ok: true, url, key, contentType: checked.contentType };
  } catch (err) {
    console.error("createDocumentUpload failed:", err);
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }
}

/**
 * Step 2 of an upload: records the document. The size and type come from
 * the stored object itself, not from the browser, so a file that lied in
 * step 1 is deleted here instead of being listed.
 */
export async function confirmDocumentUpload(
  contactId: string,
  key: string,
  fileName: string
): Promise<ActionResult> {
  const profile = await requirePermission("can_edit_crm");

  if (
    !idSchema.safeParse(contactId).success ||
    typeof key !== "string" ||
    !isDocumentKeyForContact(key, contactId)
  ) {
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }

  let stored: Awaited<ReturnType<typeof headObject>>;
  try {
    stored = await headObject(key);
  } catch (err) {
    console.error("confirmDocumentUpload head failed:", err);
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }
  if (!stored) {
    return { ok: false, error: "The upload didn't finish. Please try again." };
  }

  const removeStored = () =>
    deletePrivateObject(key).catch((err) =>
      console.error(`Orphaned private object ${key}:`, err)
    );

  if (
    !isAllowedDocumentType(stored.contentType) ||
    stored.size <= 0 ||
    stored.size > MAX_DOCUMENT_BYTES
  ) {
    await removeStored();
    return {
      ok: false,
      error: "That file isn't an allowed type or is larger than 20 MB.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contact_documents").insert({
    contact_id: contactId,
    file_name: sanitizeFileName(String(fileName ?? "")),
    storage_key: key,
    content_type: stored.contentType,
    size_bytes: stored.size,
    uploaded_by_name: profile.name,
  });

  // 23505 = this key is already recorded (a double submit): that is success.
  if (error && error.code !== "23505") {
    console.error("confirmDocumentUpload insert failed:", error.message);
    await removeStored();
    return { ok: false, error: UPLOAD_ERROR_MESSAGE };
  }

  revalidatePath(`/admin/crm/${contactId}`);
  return { ok: true };
}

/** Removes the document's row, then its file. */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  await requirePermission("can_edit_crm");

  if (!idSchema.safeParse(documentId).success) {
    return { ok: false, error: DELETE_ERROR_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_documents")
    .delete()
    .eq("id", documentId)
    .select("contact_id, storage_key");

  if (error) {
    console.error("deleteDocument failed:", error.message);
    return { ok: false, error: DELETE_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "That document no longer exists." };
  }

  // The row is gone, so the document is no longer listed or reachable. A
  // failed object delete only leaves an orphan in a private bucket.
  try {
    await deletePrivateObject(data[0].storage_key);
  } catch (err) {
    console.error(`Orphaned private object ${data[0].storage_key}:`, err);
  }

  revalidatePath(`/admin/crm/${data[0].contact_id}`);
  return { ok: true };
}
