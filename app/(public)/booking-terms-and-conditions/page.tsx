import type { Metadata } from "next";

import { createPublicClient } from "@/lib/supabase/public";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { splitParagraphs } from "@/lib/text/split-paragraphs";
import { formatManilaDate } from "@/lib/text/format-manila-date";

export const metadata: Metadata = buildPageMetadata({
  title: "Booking Terms and Conditions",
  description:
    "The terms and conditions that apply when you book a TravelSentro tour package.",
  path: "/booking-terms",
});

// Admin-managed and identical for every visitor -- same ISR + cookie-free
// public client pairing as /faq. Admin saves also call
// revalidatePath("/booking-terms") (actions/booking-terms.ts).
export const revalidate = 60;

export default async function BookingTermsPage() {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("booking_terms")
    .select("content, updated_at")
    .maybeSingle();

  if (error) {
    console.error("Failed to load booking terms:", error.message);
  }

  const paragraphs = splitParagraphs(data?.content ?? "");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Booking Terms and Conditions
        </h1>
        {paragraphs.length > 0 && data?.updated_at && (
          <p className="text-sm text-muted-foreground">
            Last updated: {formatManilaDate(data.updated_at)}
          </p>
        )}
      </div>

      {paragraphs.length === 0 ? (
        <p className="rounded-xl bg-card p-8 text-base leading-[1.5] text-muted-foreground ring-1 ring-foreground/10">
          Our booking terms are being updated. Please message us for the
          current terms before booking.
        </p>
      ) : (
        <div className="flex flex-col gap-4 text-base leading-[1.6] text-muted-foreground">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
