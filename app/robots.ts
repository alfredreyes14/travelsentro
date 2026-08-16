import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/constants";

const DISALLOW_ALL: MetadataRoute.Robots = {
  rules: { userAgent: "*", disallow: "/" },
};

// Reading the request host makes this route request-time rather than
// build-time cached — robots.txt is fetched rarely enough that this is a
// non-issue, and it's the only way to tell staging.travelsentro.com apart
// from the canonical domain.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  const canonicalHost = new URL(SITE_URL).host;

  // Non-canonical hosts (e.g. staging.travelsentro.com) never get indexed —
  // otherwise the same content would compete with the real domain in search.
  if (host !== canonicalHost) return DISALLOW_ALL;

  // proxy.ts rewrites every route to the same coming-soon placeholder while
  // this is on, so every path would look like duplicate content to a
  // crawler — block indexing entirely until the real site is live.
  if (process.env.COMING_SOON_MODE === "true") return DISALLOW_ALL;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/unsubscribe"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
