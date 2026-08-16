import type { Metadata } from "next";
import Image from "next/image";

import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

export const metadata: Metadata = {
  title: "Coming Soon — TravelSentro",
  description:
    "TravelSentro's new site is on its way. Message us on WhatsApp or Facebook and we'll help you plan your next trip.",
};

// Standalone route (outside the (public) group) so it renders without the
// normal SiteHeader/footer — the whole point is that it's the only thing
// visible while COMING_SOON_MODE is on (see proxy.ts).
export default function ComingSoonPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-16 text-center sm:px-8">
      <Image
        src="/logo.png"
        alt="TravelSentro"
        width={873}
        height={241}
        priority
        className="h-16 w-auto sm:h-20"
      />

      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="font-heading text-3xl font-semibold text-primary sm:text-4xl">
          Something new is on the way
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          We&apos;re giving TravelSentro a brand-new look. In the meantime,
          reach out and we&apos;ll help you plan your next trip.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <WhatsAppCta variant="icon-label" />
        <FacebookCta variant="icon-label" />
      </div>

      <p className="text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} TravelSentro. All rights reserved.
      </p>
    </div>
  );
}
