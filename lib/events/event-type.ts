export const EVENT_TYPES = ["sponsorship", "exhibit", "booth", "other"] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  sponsorship: "Sponsorship",
  exhibit: "Exhibit",
  booth: "Booth",
  other: "Other",
};

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}
