"use client";

import { cn } from "@/lib/utils";

export function DataTableToolbar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="data-table-toolbar"
      className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}
      {...props}
    />
  );
}
