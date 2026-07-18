import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checklist } from "@/components/packages/checklist";

/**
 * FAQ/trip-facts section (PUBL-08) — three fixed structured fields
 * (D-08: best-time-to-go, group-size, what-to-bring), not a freeform FAQ
 * list. "What to Bring" reuses the shared Checklist component (D-09).
 */
export function TripFacts({
  bestTimeToGo,
  groupSize,
  bringItems,
}: {
  bestTimeToGo: string;
  groupSize: string;
  bringItems: { label: string }[];
}) {
  return (
    <Accordion>
      <AccordionItem value="best-time-to-go">
        <AccordionTrigger>Best Time to Go</AccordionTrigger>
        <AccordionContent>
          <p className="text-base leading-[1.5] text-muted-foreground">
            {bestTimeToGo}
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="group-size">
        <AccordionTrigger>Group Size</AccordionTrigger>
        <AccordionContent>
          <p className="text-base leading-[1.5] text-muted-foreground">
            {groupSize}
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="what-to-bring">
        <AccordionTrigger>What to Bring</AccordionTrigger>
        <AccordionContent>
          <Checklist items={bringItems} kind="bring" />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
