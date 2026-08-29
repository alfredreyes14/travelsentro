// Canonical production origin — SEO metadata (metadataBase, sitemap, robots,
// JSON-LD, canonical URLs) all resolve against this so the domain lives in
// exactly one place. staging.travelsentro.com is a separate, non-canonical
// host and must never appear here.
export const SITE_URL = "https://travelsentro.com";

// D-04: TravelSentro's Facebook page — centralized here so every CTA and
// future call site shares one constant instead of inlining the URL.
//
// Uses the Page's vanity username rather than a numeric ID. The previous
// value here (web.facebook.com/profile.php?id=61567102791951) reaches the
// same Page, but Facebook 301s it to this canonical /travelsentroph URL,
// so pointing at the destination directly avoids the redirect hop. It also
// matters for SEO: this constant is the JSON-LD `sameAs` value in
// app/layout.tsx, which should name the canonical profile URL. Host is
// www, not web — web.facebook.com is a legacy desktop-forcing alias.
export const FACEBOOK_URL = "https://www.facebook.com/travelsentroph";

// D-04 follow-up: the Page's Messenger vanity username, used to build
// m.me deep links (numeric page IDs aren't a documented m.me format).
export const FACEBOOK_PAGE_USERNAME = "travelsentroph";

// Numeric Page ID, needed by the Graph API (which addresses the page by ID,
// not username) for both sending messages and the one-time webhook
// subscription call.
//
// The two IDs floating around this project are NOT two different Pages --
// that earlier concern is resolved. TravelSentro has one Page with two
// identifiers, which is normal under Meta's New Pages Experience:
//   61567102791951  profile ID, what profile.php URLs use
//   446521218543410 Page ID, what the Graph API and Messenger use
// Verified by resolving all three entry points -- m.me/travelsentroph,
// m.me/61567102791951 and m.me/446521218543410 all land on the same
// thread (messenger.com/t/446521218543410), and profile.php?id=6156...
// redirects to facebook.com/travelsentroph. Confirmed independently by
// debug_token, which reports profile_id 446521218543410 for the Page
// token. Use this ID for anything Graph API; use FACEBOOK_URL for links
// shown to customers.
export const FACEBOOK_PAGE_ID = "446521218543410";

// Package PDF export — business contact info for the printable itinerary's
// footer, sourced verbatim from the official letterhead template
// (public/Letter Head (TravelSentro).docx). No email/address constant
// existed anywhere in the codebase before this.
export const CONTACT_EMAIL = "info@travelsentro.com";
export const CONTACT_ADDRESS =
  "Level 21, Park Triangle Corporate Plaza, North Tower, 32nd St. Cor. 11th Ave., BGC, Taguig City";
