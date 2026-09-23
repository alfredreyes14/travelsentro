import { FadeImage } from "@/components/motion/fade-image";
import type { LogoFile } from "@/lib/logos/read-logo-folder";

const MIN_DURATION_SECONDS = 20;
const SECONDS_PER_LOGO = 3;

function LogoStrip({
  logos,
  duplicate,
}: {
  logos: LogoFile[];
  duplicate?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-12"
      aria-hidden={duplicate ? true : undefined}
      data-marquee-duplicate={duplicate ? "" : undefined}
    >
      {logos.map((logo) => (
        <FadeImage
          key={logo.id}
          src={logo.src}
          alt={logo.alt}
          width={280}
          height={140}
          className="h-auto max-h-20 w-auto max-w-48 object-contain"
        />
      ))}
    </div>
  );
}

/**
 * Continuously scrolling logo strip (see app/globals.css's `.marquee-track`
 * for the CSS-only animation and its prefers-reduced-motion fallback).
 * Contained to the parent's width (the same centered max-w-6xl column the
 * section heading sits in) rather than breaking out full-bleed, with a
 * background-color gradient mask fading logos in and out at both edges.
 */
export function LogoMarquee({ logos }: { logos: LogoFile[] }) {
  const duration = Math.max(
    MIN_DURATION_SECONDS,
    logos.length * SECONDS_PER_LOGO
  );

  return (
    <div className="relative w-full overflow-hidden">
      <div
        className="marquee-track flex items-center gap-12"
        style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
      >
        <LogoStrip logos={logos} />
        <LogoStrip logos={logos} duplicate />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent sm:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent sm:w-24" />
    </div>
  );
}
