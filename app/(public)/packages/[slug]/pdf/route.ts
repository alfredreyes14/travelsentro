import { fetchPackageForPdf, renderPackagePdf } from "@/lib/pdf/package-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Public PDF download for a single published package. Same
 * "unpublished slug is indistinguishable from nonexistent" behavior as
 * app/(public)/packages/[slug]/page.tsx -- fetchPackageForPdf's slug path
 * already filters on is_published.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const pkg = await fetchPackageForPdf(supabase, { slug });
  if (!pkg) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const logoSrc = new URL("/logo-header.png", request.url).toString();

  let buffer: Buffer;
  try {
    buffer = await renderPackagePdf(pkg, logoSrc);
  } catch (err) {
    console.error("renderPackagePdf failed:", err);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  // Response's BodyInit type doesn't accept Node's Buffer directly under
  // this repo's TS config (Buffer<ArrayBufferLike> vs. the DOM lib's
  // ArrayBufferView) -- wrap in a plain Uint8Array (a single small copy,
  // negligible for a one-off PDF response) to satisfy the type.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pkg.slug}.pdf"`,
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
