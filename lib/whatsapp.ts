// D-05: build a per-package wa.me deep link with a pre-filled message
// mentioning the specific package name, rather than a single static link.
// D-03: WhatsApp CTA number, international format, no leading "+" and no
// spaces/dashes, per wa.me's documented link format.
const WHATSAPP_NUMBER = "639205351673";

export function buildWhatsAppLink(packageName?: string): string {
  const message = packageName
    ? `Hi! I'm interested in ${packageName}`
    : "Hi! I'd like to know more about your tour packages";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
