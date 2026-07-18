import { FACEBOOK_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Outbound-only link to TravelSentro's Facebook page (D-04). Plain anchor,
 * same shape as WhatsAppCta.
 *
 * Background is Facebook's own brand blue (#1877F2), an explicit
 * third-party exception to the 60/30/10 palette (UI-SPEC.md Color).
 *
 * The installed lucide-react version (v1.25) ships no brand/logo icons
 * (Facebook, WhatsApp, etc. were dropped from the icon set), so the
 * Facebook "f" mark is hand-authored as an inline SVG here rather than
 * imported from lucide-react.
 */
export function FacebookCta({
  variant = "icon-only",
}: {
  variant?: "icon-only" | "icon-label";
}) {
  return (
    <a
      href={FACEBOOK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Message us on Facebook"
      className={cn(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-[#1877F2]/50 focus-visible:outline-none"
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.459h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.438-4.92 8.438-9.94Z" />
      </svg>
      {variant === "icon-label" && <span>Message us on Facebook</span>}
    </a>
  );
}
