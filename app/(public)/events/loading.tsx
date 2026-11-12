import { ViewTransition } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventsLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="gap-0 overflow-hidden p-0">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </ViewTransition>
  );
}
