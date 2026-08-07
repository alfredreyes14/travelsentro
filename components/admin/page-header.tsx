import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  title: string;
  description: string;
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-4",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {title}
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
