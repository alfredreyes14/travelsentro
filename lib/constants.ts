// D-04: TravelSentro's Facebook page — centralized here so every CTA and
// future call site shares one constant instead of inlining the URL.
export const FACEBOOK_URL =
  "https://web.facebook.com/profile.php?id=61567102791951";

// Package PDF export — business contact info for the printable itinerary's
// footer, sourced verbatim from the official letterhead template
// (public/Letter Head (TravelSentro).docx). No email/address constant
// existed anywhere in the codebase before this.
export const CONTACT_EMAIL = "info@travelsentro.com";
export const CONTACT_ADDRESS =
  "Level 21, Park Triangle Corporate Plaza, North Tower, 32nd St. Cor. 11th Ave., BGC, Taguig City";
