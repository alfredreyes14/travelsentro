import { FadeImage } from "@/components/motion/fade-image";
import type { LogoFile } from "@/lib/logos/read-logo-folder";

/**
 * One Brand Partner / Corporate Client logo. When the partner has a
 * website link (set in /admin/partners) the logo is a link to it, opened
 * in a new tab so the visitor keeps their place on this site; without one
 * it renders as a plain image.
 */
export function PartnerLogo({ logo }: { logo: LogoFile }) {
  const image = (
    <FadeImage
      src={logo.src}
      alt={logo.alt}
      width={280}
      height={140}
      className="h-auto max-h-28 w-auto max-w-64 object-contain"
    />
  );

  if (!logo.href) return image;

  return (
    <a
      href={logo.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visit ${logo.alt}'s website (opens in a new tab)`}
      className="rounded-md transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {image}
    </a>
  );
}
