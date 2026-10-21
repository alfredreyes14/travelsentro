import type { Metadata } from "next";
import { CalendarClock, History } from "lucide-react";
import { ViewTransition } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import { manilaToday, splitEvents } from "@/lib/events/event-dates";
import { toPublicEvent } from "@/lib/events/public-event";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { EventCard } from "@/components/events/event-card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Tables } from "@/types/database";

// Upcoming vs past is decided by today's Manila date at render time, so
// the page re-renders at most a minute after midnight once a request comes in.
export const revalidate = 60;

export const metadata: Metadata = buildPageMetadata({
  title: "Events",
  description:
    "Tournaments, exhibits and travel fairs TravelSentro has sponsored, organized or joined — and where to find us next.",
  path: "/events",
});

const GRID = "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3";

export default async function EventsPage() {
  const supabase = createPublicClient();
  // RLS also limits anonymous reads to published events.
  const { data, error } = await supabase.from("events").select("*").eq("is_published", true);
  if (error) {
    console.error("Failed to load events:", error.message);
  }

  const events = ((data ?? []) as Tables<"events">[]).map(toPublicEvent);
  const { upcoming, past } = splitEvents(events, manilaToday());

  return (
    <ViewTransition enter="slide-up" default="none">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-[30px] leading-[1.15] font-semibold sm:text-[36px]">
            Events
          </h1>
          <p className="max-w-2xl text-base leading-[1.5] text-muted-foreground">
            Tournaments we sponsor, exhibits we organize and travel fairs where you can visit our
            booth.
          </p>
        </div>

        {events.length === 0 ? (
          <p className="rounded-xl border border-foreground/10 bg-card p-8 text-center text-base text-muted-foreground shadow-sm">
            Events will appear here soon.
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-6" aria-labelledby="upcoming-events">
              <div id="upcoming-events">
                <SectionHeading icon={CalendarClock}>Upcoming Events</SectionHeading>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  No upcoming events right now — check back soon.
                </p>
              ) : (
                <div className={GRID}>
                  {upcoming.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 ? (
              <section className="flex flex-col gap-6" aria-labelledby="past-events">
                <div id="past-events">
                  <SectionHeading icon={History}>Past Events</SectionHeading>
                </div>
                <div className={GRID}>
                  {past.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </ViewTransition>
  );
}
