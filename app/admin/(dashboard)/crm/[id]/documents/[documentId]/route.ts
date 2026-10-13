import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth/dal";
import { contentDisposition } from "@/lib/crm/documents";
import { presignDownload } from "@/lib/storage/r2-private";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens one contact document. The file lives in a private bucket, so this
 * validates the session (any active staff member may read, the same rule
 * as the contact itself -- CRM-03), finds the document through the
 * caller's own Supabase client so RLS applies, and redirects to a link
 * that expires in 5 minutes. getProfile() redirects a logged-out visitor
 * to the login page.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  await getProfile();

  const { id, documentId } = await params;
  const supabase = await createClient();

  // A malformed id makes the query error; that is a 404 like any other miss.
  const { data: document, error } = await supabase
    .from("contact_documents")
    .select("storage_key, file_name, content_type")
    .eq("id", documentId)
    .eq("contact_id", id)
    .maybeSingle();

  if (error || !document) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let url: string;
  try {
    url = await presignDownload(
      document.storage_key,
      contentDisposition(document.file_name),
      document.content_type
    );
  } catch (err) {
    console.error(`Document link failed for ${documentId}:`, err);
    return Response.json({ error: "Failed to open document" }, { status: 500 });
  }

  // Outside the try: redirect() works by throwing.
  redirect(url);
}
