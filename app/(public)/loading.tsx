import { ViewTransition } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div>
        <Skeleton className="h-72 w-full rounded-none sm:h-96 lg:h-112" />

        <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 sm:px-8">
          <div className="flex flex-col gap-2 sm:max-w-2xl">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="size-12 rounded-full ring-1 ring-foreground/10" />
                <Skeleton className="h-5 w-3/4 ring-1 ring-foreground/10" />
                <Skeleton className="h-4 w-full ring-1 ring-foreground/10" />
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i} className="gap-0 overflow-hidden p-0">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="gap-0 overflow-hidden p-0">
                <Skeleton className="aspect-square w-full rounded-none" />
                <Skeleton className="m-2 h-4 w-2/3" />
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:px-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i} className="flex flex-col items-start gap-3 p-4">
                <Skeleton className="size-12 rounded-full" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </Card>
            ))}
          </div>
        </section>
      </div>
    </ViewTransition>
  );
}
