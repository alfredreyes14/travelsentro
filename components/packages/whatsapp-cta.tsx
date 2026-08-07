import { MessageCircle } from "lucide-react";

import { buildWhatsAppLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * Outbound-only link to a WhatsApp chat, pre-filled with a message that
 * mentions the specific package when one is given (D-05), or a generic
 * greeting for non-package contexts (homepage, contact page). Plain anchor,
 * not a client-side click handler — there's no app state to manage, just
 * navigation.
 *
 * Background is WhatsApp's own brand green (#25D366), an explicit
 * third-party exception to the 60/30/10 palette (UI-SPEC.md Color) — never
 * pulled from a Tailwind theme token so the brand color can't drift if the
 * site's theme tokens change.
 */
export function WhatsAppCta({
  packageName,
  variant = "icon-only",
  className,
}: {
  packageName?: string;
  variant?: "icon-only" | "icon-label";
  className?: string;
}) {
  return (
    <a
      href={buildWhatsAppLink(packageName)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Message us on WhatsApp"
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-[#25D366]/50 focus-visible:outline-none",
        className
      )}
    >
      <MessageCircle className="size-5" aria-hidden="true" />
      {variant === "icon-label" && <span>Message us on WhatsApp</span>}
    </a>
  );
}
