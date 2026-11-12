import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EventCard } from "@/components/events/event-card";
import { FadeImage } from "@/components/motion/fade-image";
import { EVENT_TYPE_LABELS } from "@/lib/events/event-type";
import { formatEventDates, isUpcoming } from "@/lib/events/event-dates";
import type { PublicEvent } from "@/lib/events/public-event";
import { cn } from "@/lib/utils";

// Columns match the number of events so a short list never leaves empty slots.
const GRID_COLUMNS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * A lone featured event: wide card with the cover beside the details, so
 * one event fills the row instead of sitting in a mostly empty grid.
 */
function EventSpotlight({ event, today }: { event: PublicEvent; today: string }) {
  const upcoming = isUpcoming(event, today);

  return (
    <Card className="group/card relative gap-0 overflow-hidden p-0 transform-gpu transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 md:grid md:grid-cols-2">
      <div className="relative aspect-video overflow-hidden bg-secondary/10 md:aspect-auto md:min-h-72">
        <FadeImage
          src={event.coverUrl}
          alt=""
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="transform-gpu object-cover duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:scale-[1.04] motion-reduce:group-hover/card:scale-100"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0 opacity-0 transition-opacity duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:opacity-100"
        />
      </div>

      <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="h-auto px-3 py-1 text-xs font-semibold">
            {EVENT_TYPE_LABELS[event.eventType]}
          </Badge>
          {upcoming ? (
            <Badge
              variant="outline"
              className="h-auto border-primary/40 px-3 py-1 text-xs font-semibold text-primary"
            >
              Upcoming
            </Badge>
          ) : null}
        </div>

        <h3 className="font-heading text-[24px] leading-[1.2] font-semibold sm:text-[28px]">
          <Link
            href={`/events/${event.slug}`}
            className="transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:text-primary after:absolute after:inset-0 focus-visible:outline-none"
          >
            {event.name}
          </Link>
        </h3>

        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-base font-medium text-foreground/80">
            <CalendarDays className="size-5 shrink-0 text-secondary" aria-hidden="true" />
            {formatEventDates(event)}
          </p>
          <p className="flex items-start gap-2 text-base text-muted-foreground">
            <MapPin className="mt-0.5 size-5 shrink-0 text-secondary" aria-hidden="true" />
            <span className="break-words">{event.venue}</span>
          </p>
        </div>

        {event.summary ? (
          <p className="line-clamp-4 text-base leading-[1.6] text-muted-foreground">
            {event.summary}
          </p>
        ) : null}

        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          View event details
          <ArrowRight className="size-4 transition-transform duration-200 group-hover/card:translate-x-1" />
        </span>
      </div>
    </Card>
  );
}

/**
 * Homepage "Events" section: only the events staff switched on for the
 * homepage (already picked and ordered by the page). The page hides the
 * whole section when there are none.
 */
export function EventsSection({ events, today }: { events: PublicEvent[]; today: string }) {
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
      {events.length === 1 ? (
        <EventSpotlight event={events[0]} today={today} />
      ) : (
        <div className={cn("grid grid-cols-1 gap-6", GRID_COLUMNS[events.length] ?? GRID_COLUMNS[4])}>
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
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
