import { Backpack, Check, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ChecklistKind = "included" | "excluded" | "bring";

const ICONS: Record<ChecklistKind, LucideIcon> = {
  included: Check,
  excluded: X,
  bring: Backpack,
};

const ICON_COLORS: Record<ChecklistKind, string> = {
  included: "text-secondary",
  excluded: "text-muted-foreground",
  bring: "text-secondary",
};

/**
 * Shared list-item component for inclusions, exclusions, and what-to-bring
 * (D-09) — a single implementation driven by a `kind` discriminator instead
 * of three bespoke `InclusionsList`/`ExclusionsList`/`BringList` components.
 */
export function Checklist({
  items,
  kind,
}: {
  items: { label: string }[];
  kind: ChecklistKind;
}) {
  const Icon = ICONS[kind];

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-2 text-[14px] leading-[1.4] text-foreground"
        >
          <Icon
            className={cn("mt-0.5 size-4 shrink-0", ICON_COLORS[kind])}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
