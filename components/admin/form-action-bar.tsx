"use client";

import { cn } from "@/lib/utils";

export function FormActionBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-action-bar"
      className={cn(
        "sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className
      )}
      {...props}
    />
  );
}
