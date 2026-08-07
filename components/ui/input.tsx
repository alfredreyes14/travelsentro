import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

const INPUT_BASE_CLASSES =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

function Input({
  className,
  type,
  prefix,
  suffix,
  ...props
}: React.ComponentProps<"input"> & {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}) {
  if (prefix || suffix) {
    return (
      <div
        data-slot="input-wrapper"
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:bg-input/30",
          className
        )}
      >
        {prefix ? (
          <span className="pl-2.5 text-base text-muted-foreground select-none md:text-sm">
            {prefix}
          </span>
        ) : null}
        <InputPrimitive
          type={type}
          data-slot="input"
          className="h-full w-full min-w-0 border-0 bg-transparent px-2.5 py-1 text-base outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          {...props}
        />
        {suffix ? (
          <span className="pr-2.5 text-base text-muted-foreground select-none md:text-sm">
            {suffix}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(INPUT_BASE_CLASSES, className)}
      {...props}
    />
  )
}

export { Input }
