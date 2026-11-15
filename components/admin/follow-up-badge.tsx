import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FOLLOW_UP_BADGE_CLASSNAME,
  followUpBadge,
  type FollowUpProgress,
} from "@/lib/follow-ups/progress";
import { cn } from "@/lib/utils";

/** "Following up 2 of 4" / "Clicked to chat" next to a contact's stage. */
export function FollowUpBadge({
  progress,
  clientType,
  stage,
  optedOut = false,
}: {
  progress: FollowUpProgress | undefined;
  clientType: string;
  stage: string;
  optedOut?: boolean;
}) {
  const badge = followUpBadge(progress, clientType, stage, optedOut);
  if (!badge) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className={cn("w-fit", FOLLOW_UP_BADGE_CLASSNAME[badge.tone])}
          />
        }
      >
        {badge.label}
      </TooltipTrigger>
      <TooltipContent>{badge.detail}</TooltipContent>
    </Tooltip>
  );
}
