import { Backpack, Check, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ChecklistKind = "included" | "excluded" | "bring";

const ICONS: Record<ChecklistKind, LucideIcon> = {
  included: Check,
  excluded: X,
  bring: Backpack,
};

const ICON_CHIP_STYLES: Record<ChecklistKind, string> = {
  included: "bg-secondary/10 text-secondary",
  excluded: "bg-destructive/10 text-destructive",
  bring: "bg-secondary/10 text-secondary",
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
          className="flex items-center gap-2.5 text-[14px] leading-[1.4] text-foreground"
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full",
              ICON_CHIP_STYLES[kind]
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
