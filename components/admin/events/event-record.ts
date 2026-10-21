import type { Tables } from "@/types/database";
import { isEventType } from "@/lib/events/event-type";
import type { EventRecord } from "./event-form";

/** Maps an events row to the admin's EventRecord shape. */
export function toEventRecord(row: Tables<"events">): EventRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    // The database constrains event_type to the four known values.
    eventType: isEventType(row.event_type) ? row.event_type : "other",
    startDate: row.start_date,
    endDate: row.end_date,
    venue: row.venue,
    summary: row.summary,
    description: row.description,
    coverStoragePath: row.cover_storage_path,
    linkUrl: row.link_url,
    isPublished: row.is_published,
    isFeatured: row.is_featured,
  };
}
