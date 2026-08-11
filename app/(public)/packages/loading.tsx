import { ViewTransition } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PackagesLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="aspect-[4/5] gap-0 overflow-hidden p-0">
              <Skeleton className="size-full rounded-none" />
            </Card>
          ))}
        </div>
      </div>
    </ViewTransition>
  );
}
