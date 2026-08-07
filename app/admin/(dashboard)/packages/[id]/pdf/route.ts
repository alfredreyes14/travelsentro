import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { fetchPackageForPdf, renderPackagePdf } from "@/lib/pdf/package-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin PDF download for any package, including unpublished drafts (no
 * is_published filter, matching app/admin/(dashboard)/packages/[id]/page.tsx's
 * edit-page fetch). Note: fetchPackageForPdf's `{ id }` selector also has no
 * deleted_at filter, so a soft-deleted package remains downloadable by direct
 * id -- same behavior as the edit page. Gated the same way as every other
 * admin/packages route (AUTH-05).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissionOrRedirect("can_manage_packages");

  const { id } = await params;
  const supabase = await createClient();

  const pkg = await fetchPackageForPdf(supabase, { id });
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
    },
  });
}
