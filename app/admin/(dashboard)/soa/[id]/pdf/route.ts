import { redirect } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { contentDisposition } from "@/lib/crm/documents";
import { fetchSoaForPdf, renderSoaPdf } from "@/lib/pdf/soa-pdf";
import { statementToPrintValues } from "@/lib/soa/soa-row";
import { presignDownload } from "@/lib/storage/r2-private";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens an SOA in the browser (default) or downloads it (?download=1).
 * A previous SOA with an attached file redirects to that file through a
 * 5-minute private link; every other SOA is rendered as a PDF here.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const supabase = await createClient();

  const soa = await fetchSoaForPdf(supabase, id);
  if (!soa) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (soa.file_storage_key && soa.file_name && soa.file_content_type) {
    const inline = contentDisposition(soa.file_name);
    let url: string;
    try {
      url = await presignDownload(
        soa.file_storage_key,
        download ? inline.replace(/^inline/, "attachment") : inline,
        soa.file_content_type
      );
    } catch (err) {
      console.error(`SOA file link failed for ${soa.soa_no}:`, err);
      return Response.json({ error: "Failed to open file" }, { status: 500 });
    }
    // Outside the try: redirect() works by throwing.
    redirect(url);
  }

  const logoSrc = new URL("/logo-header.png", request.url).toString();

  let buffer: Buffer;
  try {
    buffer = await renderSoaPdf(
      { soaNo: soa.soa_no, values: statementToPrintValues(soa) },
      logoSrc
    );
  } catch (err) {
    console.error(`SOA PDF failed for ${soa.soa_no}:`, err);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${soa.soa_no}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
