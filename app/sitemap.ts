import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/constants";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // Same public-read filter as app/(public)/packages/page.tsx — RLS already
  // scopes this to published, non-deleted packages.
  const { data: packages } = await supabase
    .from("packages")
    .select("slug, created_at")
    .eq("is_published", true);

  const packageEntries: MetadataRoute.Sitemap = (packages ?? []).map(
    (pkg) => ({
      url: `${SITE_URL}/packages/${pkg.slug}`,
      lastModified: pkg.created_at,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  );

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/packages`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.5 },
    ...packageEntries,
  ];
}
