// Meta Pixel ID -- safe to expose (NEXT_PUBLIC_), it's embedded in the
// public page source anyway. Unset means the pixel is disabled entirely
// (local dev, preview deploys), so no test traffic pollutes the ad account.
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type Fbq = (
  command: "track",
  event: string,
  params?: Record<string, unknown>
) => void;

/**
 * Fires a Meta standard event (https://developers.facebook.com/docs/meta-pixel/reference#standard-events).
 * No-op when the pixel isn't loaded -- disabled via env, blocked by an ad
 * blocker, or not yet initialized -- so callers never need to guard.
 */
export function trackMetaEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  fbq?.("track", event, params);
}
