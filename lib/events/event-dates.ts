/**
 * Pure date logic for events. Dates are ISO "YYYY-MM-DD" strings and are
 * compared as strings: building Date objects from them would bring back
 * timezone drift. "Today" is the calendar date in Asia/Manila.
 */

export type EventDateRange = { startDate: string; endDate: string | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Manila as "YYYY-MM-DD". */
export function manilaToday(now: Date = new Date()): string {
  return manilaFormatter.format(now);
}

function lastDay(event: EventDateRange): string {
  return event.endDate ?? event.startDate;
}

/** Upcoming while today is on or before the event's last day. */
export function isUpcoming(event: EventDateRange, today: string): boolean {
  return today <= lastDay(event);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Upcoming soonest first; past newest first (by end date, or start date). */
export function splitEvents<T extends EventDateRange>(
  events: T[],
  today: string
): { upcoming: T[]; past: T[] } {
  const upcoming = events
    .filter((e) => isUpcoming(e, today))
    .sort((a, b) => compare(a.startDate, b.startDate));
  const past = events
    .filter((e) => !isUpcoming(e, today))
    .sort((a, b) => compare(lastDay(b), lastDay(a)));
  return { upcoming, past };
}

/** Homepage pick from already-featured events: upcoming first, then past. */
export function pickHomepageEvents<T extends EventDateRange>(
  events: T[],
  today: string,
  limit = 4
): T[] {
  const { upcoming, past } = splitEvents(events, today);
  return [...upcoming, ...past].slice(0, limit);
}

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: MONTHS[month - 1], day };
}

/** "Nov 12, 2026", "Nov 12–14, 2026", "Nov 30 – Dec 2, 2026", "Dec 30, 2026 – Jan 2, 2027". */
export function formatEventDates(event: EventDateRange): string {
  const start = parts(event.startDate);
  if (!event.endDate || event.endDate === event.startDate) {
    return `${start.month} ${start.day}, ${start.year}`;
  }
  const end = parts(event.endDate);
  if (start.year !== end.year) {
    return `${start.month} ${start.day}, ${start.year} – ${end.month} ${end.day}, ${end.year}`;
  }
  if (start.month !== end.month) {
    return `${start.month} ${start.day} – ${end.month} ${end.day}, ${end.year}`;
  }
  return `${start.month} ${start.day}–${end.day}, ${end.year}`;
}
