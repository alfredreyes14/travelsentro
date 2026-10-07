"use client";

import { useEffect } from "react";

import { trackContact } from "@/lib/analytics/events";

// Outbound chat links that count as a "Contact" conversion. Matched by
// href rather than wired into each CTA so WhatsAppCta/FacebookCta and the
// footer icons can stay plain server-rendered anchors.
const CONTACT_CHANNELS: { channel: string; test: (href: string) => boolean }[] = [
  { channel: "whatsapp", test: (href) => href.startsWith("https://wa.me/") },
  { channel: "messenger", test: (href) => href.startsWith("https://m.me/") },
  { channel: "viber", test: (href) => href.startsWith("viber://") },
  { channel: "phone", test: (href) => href.startsWith("tel:") },
];

/** Reports clicks on contact-channel links to every analytics provider. */
export function ContactClickTracker() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      const match = CONTACT_CHANNELS.find(({ test }) => test(href));
      if (match) trackContact(match.channel);
    }

    // Capture phase so the event is queued before the browser leaves for
    // the external app (tel:/viber:// can navigate away immediately).
    document.addEventListener("click", handleClick, { capture: true });
    return () =>
      document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}
