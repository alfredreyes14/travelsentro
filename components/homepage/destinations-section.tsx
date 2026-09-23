import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeImage } from "@/components/motion/fade-image";

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
      className="group flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/60 bg-primary/10 shadow-sm">
        {destination.photoUrl ? (
          // next/image, not a plain <img> -- these grids render a dozen+
          // tiles at once from full-resolution originals (multi-MB camera
          // photos); without resizing to the actual ~150px tile size,
          // mobile Safari's per-page image-decode memory budget gets
          // exceeded and some tiles silently fail to paint (fetch succeeds,
          // decode doesn't -- no broken-image icon, just nothing rendered).
          // next/image's sizes prop lets the optimizer serve a thumbnail
          // instead of the original.
          <FadeImage
            src={destination.photoUrl}
            alt={destination.name}
            fill
            sizes="(min-width: 640px) 25vw, 50vw"
            className="transform-gpu object-cover duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:scale-105"
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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0 opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:opacity-100"
        />
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
      <div className="flex flex-col gap-2 sm:max-w-2xl">
        <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
          Where To Next
        </span>
        <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
          Explore Destinations
        </h2>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Browse local and international spots to find your next trip.
        </p>
      </div>
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
