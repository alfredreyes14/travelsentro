import Script from "next/script";

import { META_PIXEL_ID } from "@/lib/analytics/meta-pixel";

/**
 * Meta Pixel base code, mounted in the public layout only so admin traffic
 * is never tracked. The initial PageView fires from the base snippet; later
 * client-side navigations are picked up by the pixel's own history.pushState
 * tracking, so there's deliberately no usePathname()-driven PageView here
 * (that would double-count every navigation).
 */
export function MetaPixel() {
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
