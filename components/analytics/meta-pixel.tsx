"use client";

import { useEffect } from "react";
import Script from "next/script";

import { META_PIXEL_ID, trackMetaEvent } from "@/lib/analytics/meta-pixel";

// Outbound chat links that count as a "Contact" conversion. Matched by
// href rather than wired into each CTA so WhatsAppCta/FacebookCta and the
// footer icons can stay plain server-rendered anchors.
const CONTACT_CHANNELS: { channel: string; test: (href: string) => boolean }[] = [
  { channel: "whatsapp", test: (href) => href.startsWith("https://wa.me/") },
  { channel: "messenger", test: (href) => href.startsWith("https://m.me/") },
  { channel: "viber", test: (href) => href.startsWith("viber://") },
  { channel: "phone", test: (href) => href.startsWith("tel:") },
];

/**
 * Meta Pixel base code, mounted in the public layout only so admin traffic
 * is never tracked. The initial PageView fires from the base snippet; later
 * client-side navigations are picked up by the pixel's own history.pushState
 * tracking, so there's deliberately no usePathname()-driven PageView here
 * (that would double-count every navigation).
 */
export function MetaPixel() {
  useEffect(() => {
    if (!META_PIXEL_ID) return;

    function handleClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      const match = CONTACT_CHANNELS.find(({ test }) => test(href));
      if (match) trackMetaEvent("Contact", { content_category: match.channel });
    }

    // Capture phase so the event is queued before the browser leaves for
    // the external app (tel:/viber:// can navigate away immediately).
    document.addEventListener("click", handleClick, { capture: true });
    return () =>
      document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(META_PIXEL_ID)});
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element -- 1x1 tracking beacon, not content */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(META_PIXEL_ID)}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
