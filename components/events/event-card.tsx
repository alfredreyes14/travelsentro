import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FadeImage } from "@/components/motion/fade-image";
import { EVENT_TYPE_LABELS } from "@/lib/events/event-type";
import { formatEventDates } from "@/lib/events/event-dates";
import type { PublicEvent } from "@/lib/events/public-event";

/**
 * Event card for /events and the homepage section: 16:9 cover with the
 * type tag, then name, dates, venue and the summary when present. The
 * whole card links to the event page through a stretched link on the title.
 */
export function EventCard({ event }: { event: PublicEvent }) {
  return (
    <Card className="group/card relative gap-0 overflow-hidden p-0 transform-gpu transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="relative aspect-video overflow-hidden bg-secondary/10">
        <FadeImage
          src={event.coverUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="transform-gpu object-cover duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:scale-[1.04] motion-reduce:group-hover/card:scale-100"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0 opacity-0 transition-opacity duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:opacity-100"
        />
        <Badge
          variant="secondary"
          className="absolute top-3 left-3 h-auto px-3 py-1 text-xs font-semibold shadow-md"
        >
          {EVENT_TYPE_LABELS[event.eventType]}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-heading text-[18px] leading-[1.25] font-semibold">
          <Link
            href={`/events/${event.slug}`}
            className="transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:text-primary after:absolute after:inset-0 focus-visible:outline-none"
          >
            {event.name}
          </Link>
        </h3>
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
          <CalendarDays className="size-4 shrink-0 text-secondary" aria-hidden="true" />
          {formatEventDates(event)}
        </p>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
          <span className="line-clamp-2 break-words">{event.venue}</span>
        </p>
        {event.summary ? (
          <p className="line-clamp-3 text-sm leading-[1.5] text-muted-foreground">
            {event.summary}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
