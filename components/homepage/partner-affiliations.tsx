import { FadeImage } from "@/components/motion/fade-image";
import type { LogoFile } from "@/lib/logos/read-logo-folder";

function LogoGroup({ heading, logos }: { heading: string; logos: LogoFile[] }) {
  if (logos.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-8">
      <p className="font-heading text-xl leading-[1.2] font-semibold text-foreground">
        {heading}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-12">
        {logos.map((logo) => (
          <FadeImage
            key={logo.id}
            src={logo.src}
            alt={logo.alt}
            width={280}
            height={140}
            className="h-auto max-h-28 w-auto max-w-64 object-contain"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Homepage Partner Affiliations section -- three independently conditional
 * sub-groups (Airlines, Operators, Brand Partners), each sourced straight
 * from its own public/logos subfolder (see read-logo-folder.ts). Renders a
 * muted placeholder message (rather than disappearing) when no folder has
 * any logos yet, matching CorporateClients' own visibility check.
 */
export function PartnerAffiliations({
  airlines,
  operators,
  brandPartners,
}: {
  airlines: LogoFile[];
  operators: LogoFile[];
  brandPartners: LogoFile[];
}) {
  const hasAny =
    airlines.length > 0 || operators.length > 0 || brandPartners.length > 0;

  if (!hasAny) {
    return (
      <section className="py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-center sm:px-8">
          <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
            Who We Work With
          </span>
          <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
            Partner Affiliations
          </h2>
          <p className="text-base text-muted-foreground">
            Partner logos coming soon.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
            Who We Work With
          </span>
          <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
            Partner Affiliations
          </h2>
        </div>
        <LogoGroup heading="Airlines" logos={airlines} />
        <LogoGroup heading="Operators" logos={operators} />
        <LogoGroup heading="Brand Partners" logos={brandPartners} />
      </div>
    </section>
  );
}
