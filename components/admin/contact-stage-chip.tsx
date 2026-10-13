import { Badge } from "@/components/ui/badge";
import {
  STAGE_CHIP_CLASSNAME,
  STAGE_LABELS,
  type ContactStage,
} from "@/lib/crm/stage";
import { cn } from "@/lib/utils";

/** A contact's stage as a coloured chip. */
export function ContactStageChip({
  stage,
  className,
}: {
  stage: ContactStage;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(STAGE_CHIP_CLASSNAME[stage], className)}
    >
      {STAGE_LABELS[stage]}
    </Badge>
  );
}
