import type { Metadata } from "next";

export const SITE_NAME = "TravelSentro";

// Next.js merges metadata shallowly: a page that sets `openGraph` replaces
// the root layout's `openGraph` object wholesale rather than merging into
// it. Every page that sets its own OG fields spreads this in so siteName,
// locale and type survive the override.
export const BASE_OPEN_GRAPH = {
  type: "website",
  siteName: SITE_NAME,
  locale: "en_PH",
} satisfies Metadata["openGraph"];

/**
 * Per-page title, description, canonical URL, and matching Open Graph /
 * Twitter tags. Pages only setting `title` would otherwise inherit the
 * root layout's OG/Twitter title, so a shared /contact link previews as
 * the homepage.
 *
 * `title` is the bare page name ("Contact Us"); the root layout's
 * "%s | TravelSentro" template adds the brand to <title>, and the same
 * suffix is applied here for og:title / twitter:title, which the template
 * doesn't touch. Pass `absoluteTitle` for a title that already includes
 * the brand (the homepage).
 */
export function buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      ...BASE_OPEN_GRAPH,
      title: fullTitle,
      description,
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}
