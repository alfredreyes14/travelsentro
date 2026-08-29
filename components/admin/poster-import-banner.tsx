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
 * Lists everything the poster couldn't supply after an import. Uses the
 * neutral card treatment (bg-card + ring-foreground/10) already used by the
 * packages empty state rather than the destructive palette -- an incomplete
 * import is a to-do list, not an error. The brand accent (--secondary) is
 * reserved for CTAs and badges, so it is deliberately not used here.
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
      className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base leading-[1.3] font-semibold">
              {count} item{count === 1 ? "" : "s"} need{count === 1 ? "s" : ""} your
              attention
            </h2>
            <p className="text-sm leading-[1.5] text-muted-foreground">
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
          <li key={entry.field} className="text-sm leading-[1.5]">
            <span className="font-medium">{entry.label}</span>
            <span className="text-muted-foreground">
              {" "}
              ({TAB_LABELS[entry.tab] ?? entry.tab} tab) — {entry.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
