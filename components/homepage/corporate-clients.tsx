import { FadeImage } from "@/components/motion/fade-image";
import type { LogoFile } from "@/lib/logos/read-logo-folder";

/**
 * Homepage Corporate Clients logo band -- sourced straight from
 * public/logos/corporate partners (see read-logo-folder.ts), independently
 * conditional from PartnerAffiliations' own visibility check. Renders a
 * muted placeholder message (rather than disappearing) when the folder has
 * no logos yet.
 */
export function CorporateClients({ logos }: { logos: LogoFile[] }) {
  if (logos.length === 0) {
    return (
      <section className="py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-center sm:px-8">
          <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
            Trusted By
          </span>
          <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
            Corporate Clients
          </h2>
          <p className="text-base text-muted-foreground">
            Client logos coming soon.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
            Trusted By
          </span>
          <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
            Corporate Clients
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-12">
          {logos.map((logo) => (
            <FadeImage
              key={logo.id}
              src={logo.src}
              alt={logo.alt}
              width={280}
              height={140}
              className="h-auto max-h-32 w-auto max-w-80 object-contain"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
