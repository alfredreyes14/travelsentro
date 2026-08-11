import { ViewTransition } from "react";

import { Skeleton } from "@/components/ui/skeleton";

const SECTION_SKELETON =
  "flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-6 shadow-sm";

export default function PackageDetailLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pt-8 pb-28 sm:px-8 sm:pb-12 lg:pt-12 lg:pb-16">
        <Skeleton className="h-5 w-32" />

        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-3/4" />
          <div className="flex items-center justify-between gap-2.5">
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Skeleton className="col-span-2 row-span-2 aspect-[4/3] rounded-lg" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>

        <Skeleton className="h-40 w-full rounded-xl" />

        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={SECTION_SKELETON}>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ))}
      </div>
    </ViewTransition>
  );
}
