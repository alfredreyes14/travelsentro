import Image from "next/image";

export type PartnerDisplay = {
  id: string;
  logoUrl: string;
  linkUrl: string | null;
};

/**
 * Homepage Brand Partners logo band — independently conditional (D-07),
 * structurally separate from CorporateClients' own visibility check
 * (RESEARCH.md Pitfall 3). Renders a muted placeholder message (rather
 * than disappearing) when no partner logos exist yet.
 */
export function BrandPartners({ partners }: { partners: PartnerDisplay[] }) {
  if (partners.length === 0) {
    return (
      <section className="bg-secondary py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 sm:px-8">
          <p className="text-sm leading-[1.4] text-white/80">Our Partners</p>
          <p className="text-sm text-white/70">Partner logos coming soon.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-secondary py-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 sm:px-8">
        <p className="text-sm leading-[1.4] text-white/80">Our Partners</p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {partners.map((partner) =>
            partner.linkUrl ? (
              <a
                key={partner.id}
                href={partner.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src={partner.logoUrl}
                  alt=""
                  width={120}
                  height={60}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <Image
                key={partner.id}
                src={partner.logoUrl}
                alt=""
                width={120}
                height={60}
                className="h-12 w-auto object-contain"
              />
            )
          )}
        </div>
      </div>
    </section>
  );
}
