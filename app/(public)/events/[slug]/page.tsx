import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ViewTransition, cache } from "react";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin } from "lucide-react";

import { createPublicClient } from "@/lib/supabase/public";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { EVENT_TYPE_LABELS } from "@/lib/events/event-type";
import { formatEventDates } from "@/lib/events/event-dates";
import { toPublicEvent } from "@/lib/events/public-event";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { SITE_URL } from "@/lib/constants";
import { EventGallery } from "@/components/events/event-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/types/database";

export const revalidate = 60;

// No paths at build time; each event page is rendered on first visit and
// then revalidated (ISR needs this when the route has a dynamic segment).
export async function generateStaticParams() {
  return [];
}

type EventDetail = Tables<"events"> & {
  event_photos: Pick<
    Tables<"event_photos">,
    "storage_path" | "display_order"
  >[];
};

// Shared by generateMetadata and the page; cache() runs the query once per request.
const getPublishedEvent = cache(async (slug: string) => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select("*, event_photos(storage_path, display_order)")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as EventDetail;
});

function describe(event: EventDetail): string {
  return (
    event.summary ??
    `${EVENT_TYPE_LABELS[toPublicEvent(event).eventType]} · ${formatEventDates({
      startDate: event.start_date,
      endDate: event.end_date,
    })} · ${event.venue}`
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublishedEvent(slug);
  if (!event) return {};

  const metadata = buildPageMetadata({
    title: event.name,
    description: describe(event),
    path: `/events/${event.slug}`,
  });
  const coverUrl = toPublicEvent(event).coverUrl;
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      images: [{ url: coverUrl, alt: event.name }],
    },
    twitter: { ...metadata.twitter, images: [coverUrl] },
  };
}

/** Published events only: an unpublished or unknown slug is a plain 404. */
export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await getPublishedEvent(slug);
  if (!row) notFound();

  const event = toPublicEvent(row);
  const photos = [...row.event_photos]
    .sort((a, b) => a.display_order - b.display_order)
    .map((photo) => ({ url: getPublicImageUrl(photo.storage_path) }));
  // Re-checked at render, like the homepage partner links: only http(s) becomes an href.
  const link =
    row.link_url && /^https?:\/\//i.test(row.link_url) ? row.link_url : null;
  const pageUrl = `${SITE_URL}/events/${event.slug}`;

  // Event structured data (https://schema.org/Event) -- lets Google show
  // this in event results with its dates and venue. No organizer: many
  // events are ones TravelSentro sponsors or joins, not runs.
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: describe(row),
    startDate: event.startDate,
    endDate: event.endDate ?? event.startDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: event.venue, address: event.venue },
    image: [event.coverUrl, ...photos.map((photo) => photo.url)],
    url: pageUrl,
  };

  // Same breadcrumb shape as the package pages: Home › Events › <name>.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Events",
        item: `${SITE_URL}/events`,
      },
      { "@type": "ListItem", position: 3, name: event.name, item: pageUrl },
    ],
  };

  return (
    <ViewTransition enter="slide-up" default="none">
      <article className="mx-auto flex max-w-4xl flex-col gap-8 px-6 pt-8 pb-16 sm:px-8 lg:pt-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(eventJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <Link
          href="/events"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to all events
        </Link>

        <div className="relative aspect-video overflow-hidden rounded-xl bg-secondary/10 shadow-sm">
          <Image
            src={event.coverUrl}
            alt={event.name}
            fill
            priority
            sizes="(min-width: 896px) 832px, 100vw"
            className="object-cover"
          />
        </div>

        <header className="flex flex-col gap-3">
          <Badge
            variant="secondary"
            className="h-auto w-fit px-3 py-1 text-xs font-semibold"
          >
            {EVENT_TYPE_LABELS[event.eventType]}
          </Badge>
          <h1 className="font-heading text-[30px] leading-[1.15] font-semibold break-words sm:text-[36px]">
            {event.name}
          </h1>
          <div className="flex flex-col gap-2 text-base text-foreground/80 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <p className="flex items-center gap-2">
              <CalendarDays
                className="size-4 shrink-0 text-secondary"
                aria-hidden="true"
              />
              {formatEventDates(event)}
            </p>
            <p className="flex items-start gap-2">
              <MapPin
                className="mt-1 size-4 shrink-0 text-secondary"
                aria-hidden="true"
              />
              <span className="break-words">{event.venue}</span>
            </p>
          </div>
          {link ? (
            <Button
              size="lg"
              className="mt-2 w-fit"
              nativeButton={false}
              render={
                <a href={link} target="_blank" rel="noopener noreferrer" />
              }
            >
              Learn more
              <ExternalLink className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </header>

        {row.description ? (
          <p className="text-base leading-[1.7] break-words whitespace-pre-line text-foreground/90">
            {row.description}
          </p>
        ) : null}

        <EventGallery photos={photos} eventName={event.name} />
      </article>
    </ViewTransition>
  );
}
