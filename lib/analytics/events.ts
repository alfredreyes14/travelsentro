import { trackGaEvent } from "@/lib/analytics/google-analytics";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";

// Conversion events, fanned out to every analytics provider so call sites
// don't need to know which ones are installed. Each tracker is a no-op when
// its provider is disabled.

/** Outbound click to a chat/call channel (WhatsApp, Messenger, Viber, phone). */
export function trackContact(channel: string) {
  trackMetaEvent("Contact", { content_category: channel });
  // GA4 has no standard "contact" event; `method` mirrors the param name
  // GA's own recommended events (login, share) use for the channel.
  trackGaEvent("contact", { method: channel });
}

/** Inquiry form submitted successfully. */
export function trackLead(packageName?: string) {
  trackMetaEvent("Lead", packageName ? { content_name: packageName } : undefined);
  trackGaEvent("generate_lead", {
    lead_source: "inquiry_form",
    ...(packageName && { package_name: packageName }),
  });
}
