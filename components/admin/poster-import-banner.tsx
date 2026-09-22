"use client";

import { TriangleAlertIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePosterImport } from "./poster-import-context";

const TAB_LABELS: Record<string, string> = {
  details: "Details",
  "travel-dates": "Travel Dates",
  itinerary: "Itinerary",
  inclusions: "Inclusions",
};

/**
 * Lists everything the poster couldn't supply after an import. Uses an amber
 * "needs attention" treatment (amber ring + left accent bar + tinted
 * background) so the admin can see at a glance which fields the import left
 * for them to fill. This is deliberately louder than a neutral card, but it
 * stays clear of the --destructive palette: an incomplete import is a to-do
 * list, not a form error. The brand accent (--secondary) is reserved for CTAs
 * and badges, so amber-* utilities are used directly rather than a token.
 *
 * The copy says "need your attention" rather than "couldn't be read":
 * an entry can also mean a field was PARTLY read (2 of 3 travel dates
 * imported), which "couldn't be read" would misdescribe.
 */
export function PosterImportBanner() {
  const { extraction, isDismissed, dismiss } = usePosterImport();

  if (extraction === null || isDismissed) return null;
  if (extraction.unmapped.length === 0) return null;

  const count = extraction.unmapped.length;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 p-5 ring-1 ring-amber-500/30 dark:bg-amber-950/30 dark:ring-amber-500/25"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 fill-amber-500/20 text-amber-600 dark:text-amber-400" />
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base leading-[1.3] font-semibold text-amber-900 dark:text-amber-100">
              {count} item{count === 1 ? "" : "s"} need{count === 1 ? "s" : ""} your
              attention
            </h2>
            <p className="text-sm leading-[1.5] text-amber-800 dark:text-amber-200/90">
              Everything the poster did supply has been filled in below. Review
              it, then handle the items listed here before saving.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <XIcon />
        </Button>
      </div>

      <ul className="flex flex-col gap-2 pl-6.5">
        {extraction.unmapped.map((entry) => (
          <li
            key={entry.field}
            className="flex items-start gap-2.5 text-sm leading-[1.5]"
          >
            <span
              aria-hidden="true"
              className="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-amber-500"
            />
            <span>
              <span className="font-semibold text-foreground">
                {entry.label}
              </span>
              <span className="text-muted-foreground">
                {" "}
                ({TAB_LABELS[entry.tab] ?? entry.tab} tab) — {entry.reason}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
