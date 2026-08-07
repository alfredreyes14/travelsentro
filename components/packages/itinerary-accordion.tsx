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
      {sortedDays.map((day) => (
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
            <p className="text-base leading-[1.5] text-muted-foreground">
              {day.description}
            </p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
