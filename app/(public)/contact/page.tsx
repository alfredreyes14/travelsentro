import type { Metadata } from "next";

import { InquiryForm } from "@/components/inquiry/inquiry-form";

export const metadata: Metadata = {
  title: "Contact Us | TravelSentro",
  description:
    "Get in touch with TravelSentro — ask a question, plan a trip, or say hello.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Contact Us
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Have a question that isn&apos;t about a specific package? Send us a
          message and we&apos;ll get back to you soon — or reach out directly
          on WhatsApp or Facebook.
        </p>
      </div>

      <InquiryForm />
    </div>
  );
}
