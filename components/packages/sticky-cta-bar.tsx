"use client";

import { useEffect, useState } from "react";

import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

/**
 * Mobile-only sticky action bar so the WhatsApp/Facebook inquiry actions
 * stay reachable while scrolling the gallery/itinerary/trip-facts sections,
 * instead of requiring a scroll back to the top CTA card. Hidden at sm+
 * where the inline CTA card is already within easy reach.
 *
 * Icon-only (not icon-label): two full "Message us on WhatsApp/Facebook"
 * labels don't fit side by side on a narrow phone without wrapping/
 * overflowing. The full-label CTA card above already establishes what
 * these icons mean; aria-label (set in each *Cta component) covers screen
 * readers here.
 *
 * Retracts once the on-page inquiry form (id="inquire") scrolls into view:
 * that form is itself a way to reach out, and the fixed bar would otherwise
 * sit permanently on top of it and the site footer below. The 120px bottom
 * rootMargin hides the bar slightly before the form is on screen, roughly
 * matching the bar's own height, so it never visibly overlaps.
 */
export function StickyCtaBar({
  packageName,
  packageSlug,
}: {
  packageName: string;
  packageSlug: string;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById("inquire");
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => setHidden(entry.isIntersecting),
      { rootMargin: "0px 0px 120px 0px" }
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, []);

  if (hidden) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-foreground/10 bg-background/95 p-3 backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <WhatsAppCta packageName={packageName} className="flex-1" />
      <FacebookCta
        packageName={packageName}
        packageSlug={packageSlug}
        className="flex-1"
      />
    </div>
  );
}
