import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import {
  CONTRACT_END_CLASSNAME,
  contractEndTone,
  todayInManila,
} from "@/lib/crm/contract";

/**
 * A contract end date, yellow from 3 months before, red from 1 month
 * before, and red with "Expired" once it has passed.
 */
export function ContractEndChip({ end }: { end: string | null }) {
  if (!end) return <span className="text-muted-foreground">—</span>;

  const tone = contractEndTone(end, todayInManila());

  return (
    <Badge variant="outline" className={CONTRACT_END_CLASSNAME[tone]}>
      {format(parseISO(end), "MMM d, yyyy")}
      {tone === "expired" ? " · Expired" : null}
    </Badge>
  );
}
