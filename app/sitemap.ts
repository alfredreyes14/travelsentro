import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/constants";
import { packagePath } from "@/lib/packages/package-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // Same public-read filter as app/(public)/packages/page.tsx — RLS already
  // scopes this to published, non-deleted packages.
  const { data: packages } = await supabase
    .from("packages")
    .select("slug, name, created_at")
    .eq("is_published", true);

  const packageEntries: MetadataRoute.Sitemap = (packages ?? []).map(
    (pkg) => ({
      url: `${SITE_URL}${packagePath(pkg)}`,
      lastModified: pkg.created_at,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  );

  // RLS limits anonymous reads to published events too; the filter keeps
  // drafts out even for a session-aware client.
  const { data: events } = await supabase
    .from("events")
    .select("slug, created_at")
    .eq("is_published", true);

  const eventEntries: MetadataRoute.Sitemap = (events ?? []).map((event) => ({
    url: `${SITE_URL}/events/${event.slug}`,
    lastModified: event.created_at,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/packages`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/events`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.5 },
    {
      url: `${SITE_URL}/booking-terms`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy-policy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...packageEntries,
    ...eventEntries,
  ];
}
