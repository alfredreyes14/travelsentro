export type PartnerLinkResult =
  | { ok: true; url: string | null }
  | { ok: false };

const MAX_LINK_LENGTH = 2048;
const WEB_SCHEME = /^https?:\/\//i;
// A leading "word:" that is a scheme (javascript:, mailto:, ftp:) rather
// than a host:port pair such as "example.com:8080".
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i;

/**
 * Normalizes a partner's website link for storage. Pure and client-safe:
 * the admin form uses it for validation and actions/partners.ts re-runs it
 * server-side, so the rule lives once.
 *
 * A blank input is valid and means "no link". A link typed without a
 * scheme gets https:// prepended. Anything that isn't an http(s) address
 * with a dotted hostname and no username is rejected -- the result is
 * rendered as an href on the public homepage, so a javascript: URL must
 * never get through.
 */
export function normalizePartnerLink(input: string): PartnerLinkResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, url: null };
  if (trimmed.length > MAX_LINK_LENGTH) return { ok: false };

  let candidate = trimmed;
  if (!WEB_SCHEME.test(trimmed)) {
    if (OTHER_SCHEME.test(trimmed)) return { ok: false };
    candidate = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false };
  }
  if (!parsed.hostname.includes(".")) return { ok: false };
  // "info@example.com" parses as a URL with a username -- an email address
  // typed into the link field, not a website.
  if (parsed.username || parsed.password) return { ok: false };

  // URL#href always adds a trailing slash to a bare origin; drop it unless
  // the admin typed one, so "paynamics.com" is stored as typed plus scheme.
  const isBareOrigin =
    parsed.pathname === "/" &&
    !parsed.search &&
    !parsed.hash &&
    !candidate.endsWith("/");

  return { ok: true, url: isBareOrigin ? parsed.href.slice(0, -1) : parsed.href };
}
