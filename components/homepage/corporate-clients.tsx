import Image from "next/image";

export type ClientDisplay = {
  id: string;
  logoUrl: string;
  linkUrl: string | null;
};

/**
 * Homepage Corporate Clients logo band — independently conditional (D-07),
 * structurally separate from BrandPartners' own visibility check
 * (RESEARCH.md Pitfall 3). Renders a muted placeholder message (rather
 * than disappearing) when no client logos exist yet.
 */
export function CorporateClients({ clients }: { clients: ClientDisplay[] }) {
  if (clients.length === 0) {
    return (
      <section className="bg-secondary py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 sm:px-8">
          <p className="text-sm leading-[1.4] text-white/80">Trusted By</p>
          <p className="text-sm text-white/70">Client logos coming soon.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-secondary py-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 sm:px-8">
        <p className="text-sm leading-[1.4] text-white/80">Trusted By</p>
        <div className="flex flex-wrap items-center justify-center gap-8">
          {clients.map((client) =>
            client.linkUrl ? (
              <a
                key={client.id}
                href={client.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  src={client.logoUrl}
                  alt=""
                  width={120}
                  height={60}
                  className="h-12 w-auto object-contain"
                />
              </a>
            ) : (
              <Image
                key={client.id}
                src={client.logoUrl}
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
