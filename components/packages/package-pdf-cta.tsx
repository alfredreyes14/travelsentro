import { FileDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Outbound-only link to a package's PDF download route, same shape
 * as WhatsAppCta/FacebookCta -- plain anchor, no client JS, since
 * Content-Disposition: attachment on the response already makes the
 * browser download the file without navigating away. Uses bg-secondary
 * (theme accent token) rather than a hardcoded brand hex, since this isn't
 * a third-party brand CTA like WhatsApp/Facebook -- it also needs to
 * contrast against the bg-primary "Ready to Book" card it renders inside.
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
      aria-label="Download Full Itinerary"
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-secondary px-2.5 text-sm font-medium text-secondary-foreground transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-secondary/50 focus-visible:outline-none",
        className
      )}
    >
      <FileDown className="size-5" aria-hidden="true" />
      {variant === "icon-label" && <span>Download Full Itinerary</span>}
    </a>
  );
}
