import { sendGAEvent } from "@next/third-parties/google";

// GA4 measurement ID ("G-XXXXXXXXXX") -- safe to expose (NEXT_PUBLIC_), it's
// embedded in the public page source anyway. Unset means GA is disabled
// entirely (local dev, preview deploys), so no test traffic pollutes reports.
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Fires a GA4 event (https://developers.google.com/analytics/devguides/collection/ga4/reference/events).
 * No-op when GA is disabled via env. Events sent before gtag.js finishes
 * loading are queued on dataLayer, and an ad blocker just drops them, so
 * callers never need to guard.
 */
export function trackGaEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) return;
  sendGAEvent("event", event, params ?? {});
}
