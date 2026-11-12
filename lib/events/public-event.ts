import type { Tables } from "@/types/database";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { isEventType, type EventType } from "./event-type";

/** What the public pages show for one event. */
export type PublicEvent = {
  id: string;
  slug: string;
  name: string;
  eventType: EventType;
  startDate: string;
  endDate: string | null;
  venue: string;
  summary: string | null;
  coverUrl: string;
};

/**
 * Maps a published events row to its display shape. A published row always
 * has a cover (the database enforces it), so coverUrl is always set.
 */
export function toPublicEvent(row: Tables<"events">): PublicEvent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    eventType: isEventType(row.event_type) ? row.event_type : "other",
    startDate: row.start_date,
    endDate: row.end_date,
    venue: row.venue,
    summary: row.summary,
    coverUrl: getPublicImageUrl(row.cover_storage_path ?? ""),
  };
}
