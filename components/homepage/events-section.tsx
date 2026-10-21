import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/events/event-card";
import type { PublicEvent } from "@/lib/events/public-event";

/**
 * Homepage "Events" section: only the events staff switched on for the
 * homepage (already picked and ordered by the page). The page hides the
 * whole section when there are none.
 */
export function EventsSection({ events }: { events: PublicEvent[] }) {
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8">
      <div className="flex flex-col gap-2 sm:max-w-2xl">
        <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
          Find Us There
        </span>
        <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
          Events
        </h2>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Where to find TravelSentro next — and the tournaments, exhibits and fairs we&apos;ve
          been part of.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      <div className="flex justify-center">
        <Button
          render={<Link href="/events" />}
          nativeButton={false}
          variant="default"
          size="lg"
          className="h-12 px-8 text-base font-semibold shadow-md"
        >
          See all events
        </Button>
      </div>
    </section>
  );
}
