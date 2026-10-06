/**
 * Public package URLs: `/packages/<name-slug>-<code>`, e.g.
 * `/packages/hong-kong-macau-4d3n-tsp-000032`.
 *
 * The `slug` column holds the package code (TSP-000032, assigned once by
 * the generate_package_code() trigger and never changed) -- it's also the
 * admin-facing code, the PDF filename, and the Messenger `ref`, so it stays
 * as-is. The readable name prefix is derived from `name` at render time
 * and never stored: the detail page resolves a URL by its trailing code
 * alone, then 308-redirects any non-matching prefix (an old name after a
 * rename, or a bare-code URL from before this format existed) to the
 * current one. So renaming a package never breaks a link.
 */

const PACKAGE_CODE_SUFFIX = /(?:^|-)(tsp-\d+)$/i;

/** Lowercase, ASCII, hyphen-separated -- "Boracay & Coron (5D4N)" ->
 * "boracay-and-coron-5d4n". Diacritics are stripped ("Señor" -> "senor")
 * rather than dropped so names keep their words. */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The `[slug]` route segment for a package. Codes that don't follow the
 * TSP format (none are published today, but the column predates the
 * trigger) are returned untouched, since packageCodeFromSegment() couldn't
 * find where the name prefix ends for them. */
export function packageSegment(pkg: { slug: string; name: string }): string {
  if (!PACKAGE_CODE_SUFFIX.test(pkg.slug)) return pkg.slug;
  const code = pkg.slug.toLowerCase();
  const namePart = slugifyName(pkg.name);
  return namePart ? `${namePart}-${code}` : code;
}

export function packagePath(pkg: { slug: string; name: string }): string {
  return `/packages/${packageSegment(pkg)}`;
}

/** True for a segment that is only a code (`TSP-000032`) -- the URL format
 * used before readable URLs, still out in the wild in shared links. */
export function isBarePackageCode(segment: string): boolean {
  return /^tsp-\d+$/i.test(segment);
}

/** Inverse of packageSegment(): the package code to look up for a given
 * route segment. Accepts the readable form, a bare code in any case, or
 * (fallback) a non-TSP legacy slug verbatim. */
export function packageCodeFromSegment(segment: string): string {
  const match = segment.match(PACKAGE_CODE_SUFFIX);
  return match ? match[1].toUpperCase() : segment;
}
