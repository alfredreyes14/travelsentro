import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { fetchSoaForPdf, renderSoaPdf } from "@/lib/pdf/soa-pdf";
import { soaRowToFormValues } from "@/lib/soa/soa-row";
import { createClient } from "@/lib/supabase/server";

/** Admin PDF download for a Statement of Account (same shape as the quote route). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const supabase = await createClient();

  const soa = await fetchSoaForPdf(supabase, id);
  if (!soa) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const logoSrc = new URL("/logo-header.png", request.url).toString();

  let buffer: Buffer;
  try {
    buffer = await renderSoaPdf(
      { soaNo: soa.soa_no, values: soaRowToFormValues(soa) },
      logoSrc
    );
  } catch (err) {
    console.error(`SOA PDF failed for ${soa.soa_no}:`, err);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${soa.soa_no}.pdf"`,
    },
  });
}
