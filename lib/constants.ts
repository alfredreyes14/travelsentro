// Canonical production origin — SEO metadata (metadataBase, sitemap, robots,
// JSON-LD, canonical URLs) all resolve against this so the domain lives in
// exactly one place. staging.travelsentro.com is a separate, non-canonical
// host and must never appear here.
export const SITE_URL = "https://travelsentro.com";

// D-04: TravelSentro's Facebook page — centralized here so every CTA and
// future call site shares one constant instead of inlining the URL.
export const FACEBOOK_URL =
  "https://web.facebook.com/profile.php?id=61567102791951";

// D-04 follow-up: the Page's Messenger vanity username, used to build
// m.me deep links (numeric page IDs aren't a documented m.me format).
export const FACEBOOK_PAGE_USERNAME = "travelsentroph";

// Numeric Page ID — same page as FACEBOOK_URL/FACEBOOK_PAGE_USERNAME,
// needed by the Graph API (which addresses the page by ID, not username)
// for both sending messages and the one-time webhook subscription call.
export const FACEBOOK_PAGE_ID = "61567102791951";

// Package PDF export — business contact info for the printable itinerary's
// footer, sourced verbatim from the official letterhead template
// (public/Letter Head (TravelSentro).docx). No email/address constant
// existed anywhere in the codebase before this.
export const CONTACT_EMAIL = "info@travelsentro.com";
export const CONTACT_ADDRESS =
  "Level 21, Park Triangle Corporate Plaza, North Tower, 32nd St. Cor. 11th Ave., BGC, Taguig City";
