// D-05: build a per-package wa.me deep link with a pre-filled message
// mentioning the specific package name, rather than a single static link.
// D-03: WhatsApp CTA number, international format, no leading "+" and no
// spaces/dashes, per wa.me's documented link format. Exported (was
// previously private) so the package PDF export's footer can reformat the
// same number for display instead of duplicating it as a new literal.
export const WHATSAPP_NUMBER = "639205351673";

export function buildWhatsAppLink(packageName?: string): string {
  const message = packageName
    ? `Hi! I'm interested in ${packageName}`
    : "Hi! I'd like to know more about your tour packages";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Package PDF export's footer wants the business phone number in
// human-readable form ("+63-920-535-1673", matching the official letterhead
// template), not wa.me's dash/space-free international format.
export function formatWhatsAppNumberForDisplay(): string {
  const digits = WHATSAPP_NUMBER;
  return `+${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`;
}
