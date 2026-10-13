import { isValid, parseISO, startOfDay, subMonths } from "date-fns";

export type ContractEndTone = "none" | "warning" | "danger" | "expired";

/**
 * How urgently a contract end date should read: yellow ("warning") from 3
 * calendar months before, red ("danger") from 1 calendar month before, and
 * "expired" once the end date has passed. `end` is a "YYYY-MM-DD" date;
 * `today`'s time of day is ignored.
 */
export function contractEndTone(
  end: string | null,
  today: Date
): ContractEndTone {
  if (!end) return "none";
  const endDate = parseISO(end);
  if (!isValid(endDate)) return "none";

  const day = startOfDay(today);
  if (day > endDate) return "expired";
  if (day >= subMonths(endDate, 1)) return "danger";
  if (day >= subMonths(endDate, 3)) return "warning";
  return "none";
}

/**
 * Today's calendar date in the Philippines, as a local-midnight Date. Used
 * instead of the machine's own date so the server render (UTC on Vercel)
 * and the browser agree, and the colour follows the business's day.
 */
export function todayInManila(now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(now);
  return parseISO(ymd);
}

export const CONTRACT_END_CLASSNAME: Record<ContractEndTone, string> = {
  none: "",
  warning: "border-yellow-300 bg-yellow-100 text-yellow-900",
  danger: "border-red-300 bg-red-100 text-red-800",
  expired: "border-red-300 bg-red-100 text-red-800",
};
