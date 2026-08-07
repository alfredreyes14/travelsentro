import { FileDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Outbound-only link to a package's PDF download route, same shape
 * as WhatsAppCta/FacebookCta -- plain anchor, no client JS, since
 * Content-Disposition: attachment on the response already makes the
 * browser download the file without navigating away. Uses bg-primary
 * (theme token) rather than a hardcoded brand hex, since this isn't a
 * third-party brand CTA like WhatsApp/Facebook.
 */
export function PackagePdfCta({
  slug,
  variant = "icon-only",
  className,
}: {
  slug: string;
  variant?: "icon-only" | "icon-label";
  className?: string;
}) {
  return (
    <a
      href={`/packages/${slug}/pdf`}
      download
      aria-label="Download PDF itinerary"
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-primary/50 focus-visible:outline-none",
        className
      )}
    >
      <FileDown className="size-5" aria-hidden="true" />
      {variant === "icon-label" && <span>Download PDF</span>}
    </a>
  );
}
