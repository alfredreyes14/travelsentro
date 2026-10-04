import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { renderItineraryPdf } from "@/lib/pdf/itinerary-pdf";
import { fetchQuoteForPdf, quoteToPdfData } from "@/lib/pdf/quote-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin PDF download for a quote -- same shape as
 * app/admin/(dashboard)/packages/[id]/pdf/route.ts, rendered through the
 * same ItineraryPdfDocument, so a quote prints exactly like a package's
 * "Download Full Itinerary". The filename carries the quote number; the
 * document itself does not (spec: nothing quote-specific is printed).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const supabase = await createClient();

  const quote = await fetchQuoteForPdf(supabase, id);
  if (!quote) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const logoSrc = new URL("/logo-header.png", request.url).toString();

  let buffer: Buffer;
  try {
    buffer = await renderItineraryPdf(quoteToPdfData(quote), logoSrc);
  } catch (err) {
    console.error(`Quote PDF failed for ${quote.quote_no}:`, err);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  // Same Buffer -> Uint8Array wrap as the package PDF route (BodyInit typing).
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${quote.quote_no}.pdf"`,
    },
  });
}
