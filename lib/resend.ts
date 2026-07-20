import { Resend } from "resend";

/**
 * Resend client factory singleton (server-only). Mirrors
 * lib/supabase/server.ts's "one exported factory wrapping an SDK client
 * constructor" convention -- simpler here since Resend needs no
 * cookie/session wiring, just the API key.
 *
 * Safe because this module is never imported into a "use client" module
 * (same discipline actions/users.ts applies to its inline service-role
 * client) -- RESEND_API_KEY never reaches the browser.
 *
 * The Resend constructor throws synchronously when its key is empty, which
 * would otherwise crash `next build`'s route-data collection for
 * app/api/inquiries/route.ts in any environment without RESEND_API_KEY set
 * (e.g. CI, or before this plan's user_setup step is completed). A
 * placeholder string keeps module evaluation safe; every actual send is
 * already wrapped in a try/catch that logs on failure (best-effort,
 * non-blocking per D-02), so an unset key degrades to a logged auth error
 * at send time instead of a build-time crash.
 */
export const resend = new Resend(
  process.env.RESEND_API_KEY || "re_unconfigured_placeholder"
);

// Falls back to Resend's own shared test domain (delivers only to the
// account owner's verified email) until a real sending domain is verified
// -- see this plan's user_setup for the go-live blocker.
export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "TravelSentro <onboarding@resend.dev>";
