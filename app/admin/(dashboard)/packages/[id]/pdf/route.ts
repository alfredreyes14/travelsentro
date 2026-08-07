import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { fetchPackageForPdf, renderPackagePdf } from "@/lib/pdf/package-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin PDF download for any non-deleted package, including unpublished
 * drafts (no is_published filter, matching
 * app/admin/(dashboard)/packages/[id]/page.tsx's edit-page fetch). Gated
 * the same way as every other admin/packages route (AUTH-05).
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
  const buffer = await renderPackagePdf(pkg, logoSrc);

  // Buffer's TS type isn't directly assignable to BodyInit in this
  // project's TS config -- Uint8Array (which Buffer is a runtime subclass
  // of) is, so this wrapping is a type-correctness fix with no behavior
  // change, not a data copy of consequence.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pkg.slug}.pdf"`,
    },
  });
}
