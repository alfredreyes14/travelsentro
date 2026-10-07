import { GoogleAnalytics as NextGoogleAnalytics } from "@next/third-parties/google";

import { GA_MEASUREMENT_ID } from "@/lib/analytics/google-analytics";

/**
 * GA4 via gtag.js, mounted in the public layout only so admin traffic is
 * never tracked. Client-side navigations are counted by GA's Enhanced
 * Measurement "page changes based on browser history events" setting (on by
 * default), so there's deliberately no usePathname()-driven page_view here
 * (that would double-count every navigation).
 */
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;
  return <NextGoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
}
