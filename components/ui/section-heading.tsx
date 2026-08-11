import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function SectionHeading({
  icon: Icon,
  tone = "secondary",
  children,
}: {
  icon: LucideIcon;
  tone?: "secondary" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone === "destructive"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary/10 text-secondary"
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
        {children}
      </h2>
    </div>
  );
}
