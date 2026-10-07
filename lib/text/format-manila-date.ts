const MANILA_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * Formats a timestamp as e.g. "October 7, 2026" in Philippine time, so the
 * date doesn't depend on the server's (UTC) or the viewer's timezone.
 */
export function formatManilaDate(value: string | Date): string {
  return MANILA_DATE_FORMAT.format(new Date(value));
}
