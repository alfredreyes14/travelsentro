import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type DestinationTile = {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
};

function DestinationCard({ destination }: { destination: DestinationTile }) {
  return (
    <Link
      href={`/packages?destination=${encodeURIComponent(destination.slug)}`}
      className="group flex flex-col gap-2"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-primary/10">
        {destination.photoUrl ? (
          // Plain <img>, not next/image -- site-content isn't in
          // next.config.ts's Image Optimizer remotePatterns.
          <img
            src={destination.photoUrl}
            alt={destination.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <MapPin
              className="size-8 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
        )}
      </div>
      <p className="font-heading text-base font-semibold text-secondary">
        {destination.name}
      </p>
    </Link>
  );
}

function DestinationGroup({
  title,
  destinations,
  emptyMessage,
}: {
  title: string;
  destinations: DestinationTile[];
  emptyMessage: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
        {title}
      </h3>
      {destinations.length === 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="gap-0 overflow-hidden p-0">
                <Skeleton className="aspect-square w-full rounded-none" />
                <Skeleton className="m-2 h-4 w-2/3" />
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {destinations.map((destination) => (
            <DestinationCard key={destination.id} destination={destination} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Homepage "Destinations" section -- pure prop-driven, zero Supabase
 * awareness. Splits admin-managed destinations into Local/International
 * groups; each empty group renders the same skeleton/"coming soon" pattern
 * as FeaturedPackagesGrid/TestimonialsSection instead of disappearing.
 */
export function DestinationsSection({
  local,
  international,
}: {
  local: DestinationTile[];
  international: DestinationTile[];
}) {
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8">
      <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
        Explore Destinations
      </h2>
      <DestinationGroup
        title="Local Spots"
        destinations={local}
        emptyMessage="Local destinations coming soon."
      />
      <DestinationGroup
        title="International"
        destinations={international}
        emptyMessage="International destinations coming soon."
      />
    </section>
  );
}
