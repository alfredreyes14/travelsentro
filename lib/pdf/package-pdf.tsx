import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { packageRowToContentValues } from "@/lib/packages/package-content";
import { renderItineraryPdf, type ItineraryPdfData } from "@/lib/pdf/itinerary-pdf";
import type { Database, Tables } from "@/types/database";

export type PackagePdfData = Tables<"packages"> & {
  itinerary_days: Pick<
    Tables<"itinerary_days">,
    "day_number" | "title" | "description"
  >[];
  package_inclusions: Pick<
    Tables<"package_inclusions">,
    "kind" | "label" | "sort_order"
  >[];
  package_travel_dates: Pick<
    Tables<"package_travel_dates">,
    "travel_date_from" | "travel_date_to" | "additional_fee"
  >[];
};

/**
 * Local filesystem path to the header logo, for use by scripts/tsx code
 * that runs directly on disk (e.g. scripts/verify-package-pdf.ts). Route
 * handlers must NOT use this -- reading public/ via fs at runtime is
 * unreliable on Vercel's serverless functions (public/ isn't guaranteed to
 * be present on the function's local disk), so
 * app/(public)/packages/[slug]/pdf/route.ts and
 * app/admin/(dashboard)/packages/[id]/pdf/route.ts instead pass an
 * absolute HTTP(S) URL built from the incoming request, which react-pdf's
 * <Image> fetches directly and which always resolves correctly since it's
 * the site's own public, CDN-served asset.
 */
export const LOCAL_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "logo-header.png"
);

/**
 * Same joins as the public detail page's query
 * (app/(public)/packages/[slug]/page.tsx) minus package_photos -- the PDF
 * never includes photos (explicit requirement). `{ slug }` additionally
 * filters on is_published, matching the detail page's "unpublished slug is
 * indistinguishable from nonexistent" behavior; `{ id }` doesn't, so admin
 * can download drafts.
 */
export async function fetchPackageForPdf(
  supabase: SupabaseClient<Database>,
  selector: { slug: string } | { id: string }
): Promise<PackagePdfData | null> {
  const columns = `*,
    itinerary_days(day_number, title, description),
    package_inclusions(kind, label, sort_order),
    package_travel_dates(travel_date_from, travel_date_to, additional_fee)`;

  // Written as two full, separate chains (rather than building a shared
  // partial query builder and branching with .eq() calls) to avoid relying
  // on TypeScript unifying the builder's type across two different filter
  // paths -- matches how every other page in this codebase (detail page,
  // admin edit page) writes its own full Supabase chain rather than
  // sharing partial builders.
  const { data, error } =
    "slug" in selector
      ? await supabase
          .from("packages")
          .select(columns)
          .eq("slug", selector.slug)
          .eq("is_published", true)
          .single()
      : await supabase
          .from("packages")
          .select(columns)
          .eq("id", selector.id)
          .single();

  if (error) {
    console.error("fetchPackageForPdf failed:", error);
    return null;
  }
  if (!data) return null;

  return data as PackagePdfData;
}

export function packageToPdfData(pkg: PackagePdfData): ItineraryPdfData {
  return { title: pkg.name, content: packageRowToContentValues(pkg) };
}

export async function renderPackagePdf(
  pkg: PackagePdfData,
  logoSrc: string
): Promise<Buffer> {
  return renderItineraryPdf(packageToPdfData(pkg), logoSrc);
}
