import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function PublicNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center sm:px-8">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Compass className="size-7" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[24px] leading-[1.2] font-semibold">
          Page not found
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have
          moved.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          render={<Link href="/packages" />}
          nativeButton={false}
          size="lg"
        >
          Browse Packages
        </Button>
        <Button
          render={<Link href="/" />}
          nativeButton={false}
          variant="outline"
          size="lg"
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
