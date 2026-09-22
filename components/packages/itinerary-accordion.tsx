import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Database } from "@/types/database";

type ItineraryDay = Database["public"]["Tables"]["itinerary_days"]["Row"];

/**
 * Day-by-day itinerary (PUBL-02), one expand/collapse AccordionItem per day,
 * sorted by `day_number`. Note: the installed shadcn preset uses
 * @base-ui/react's Accordion primitive (not Radix), which has no
 * `type="single" collapsible` prop — items are independently
 * expandable/collapsible by default, which still satisfies the day-by-day
 * expand/collapse requirement.
 */
export function ItineraryAccordion({ days }: { days: ItineraryDay[] }) {
  const sortedDays = [...days].sort((a, b) => a.day_number - b.day_number);

  return (
    <Accordion>
      {sortedDays.map((day) => {
        // Descriptions are stored as newline-separated activity lines -- the
        // poster importer and the manual form both follow that convention,
        // and the PDF renders them the same way. Show one bullet per line,
        // falling back to a plain paragraph for a single-line description.
        const lines = day.description
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        return (
          <AccordionItem key={day.id} value={day.id}>
            <AccordionTrigger>
              <span className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold text-secondary-foreground">
                  {day.day_number}
                </span>
                <span>{day.title}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pl-10">
              {lines.length > 1 ? (
                <ul className="flex flex-col gap-1.5 text-base leading-[1.5] text-muted-foreground">
                  {lines.map((line, index) => (
                    <li key={index} className="flex gap-2">
                      <span aria-hidden="true" className="text-secondary">
                        &bull;
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base leading-[1.5] text-muted-foreground">
                  {lines[0] ?? ""}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
