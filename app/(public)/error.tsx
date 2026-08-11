"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

export default function PublicError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center sm:px-8">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[24px] leading-[1.2] font-semibold">
          Something went wrong
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          We hit a snag loading this page. Try again, or reach out to us
          directly and we&apos;ll help you out.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={() => unstable_retry()}>
          Try again
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

      <div className="flex flex-wrap items-center justify-center gap-3">
        <WhatsAppCta variant="icon-label" />
        <FacebookCta variant="icon-label" />
      </div>
    </div>
  );
}
