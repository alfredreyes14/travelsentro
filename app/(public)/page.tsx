import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 sm:px-8">
      <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
        Discover the Philippines with TravelSentro
      </h1>
      <p className="max-w-xl text-base leading-[1.5] text-foreground">
        Browse our tour packages, find the trip that fits you, and reach out
        in under a minute — no checkout, no hassle. We&apos;ll take it from
        there over WhatsApp, Facebook, or a quick inquiry form.
      </p>
      <div>
        <Button render={<Link href="/packages" />} nativeButton={false} size="lg">
          Browse Packages
        </Button>
      </div>
    </div>
  );
}
