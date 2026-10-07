import type { Metadata } from "next";
import { ViewTransition } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GetInTouchSection } from "@/components/inquiry/get-in-touch-section";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = buildPageMetadata({
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about TravelSentro tour packages, bookings, and payments.",
  path: "/faq",
});

// FAQs are admin-managed and identical for every visitor -- same ISR +
// cookie-free public client pairing as the homepage. Admin edits also call
// revalidatePath("/faq") (actions/faqs.ts), so changes show up immediately.
export const revalidate = 60;

export default async function FaqPage() {
  const supabase = createPublicClient();

  // Public read RLS already scopes this to is_published = true; the
  // query-layer filter is kept too, matching the homepage's
  // belt-and-suspenders pattern.
  const { data, error } = await supabase
    .from("faqs")
    .select("id, question, answer")
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load FAQs:", error.message);
  }

  const faqs = data ?? [];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <ViewTransition enter="slide-up" default="none">
      <div>
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pt-12 sm:px-8 lg:pt-16">
          {faqs.length > 0 && (
            <script
              type="application/ld+json"
              // FAQ text is admin-entered, so escape "<" to keep a stray
              // "</script>" from closing the tag early.
              dangerouslySetInnerHTML={{
                __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
              }}
            />
          )}

          <div className="flex flex-col gap-2">
            <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
              Got Questions?
            </span>
            <h1 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
              Frequently Asked Questions
            </h1>
            <p className="text-base leading-[1.5] text-muted-foreground">
              Quick answers about our tour packages, bookings, and payments.
            </p>
          </div>

          {faqs.length === 0 ? (
            <p className="rounded-xl bg-card p-8 text-base leading-[1.5] text-muted-foreground ring-1 ring-foreground/10">
              We&apos;re still putting our FAQs together. In the meantime, send
              us your question below and we&apos;ll get back to you soon.
            </p>
          ) : (
            <Accordion className="rounded-xl bg-card px-5 ring-1 ring-foreground/10 sm:px-6">
              {faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="py-4 text-base font-semibold text-secondary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <p className="text-base leading-[1.6] whitespace-pre-line text-muted-foreground">
                      {faq.answer}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
        <Reveal>
          <GetInTouchSection />
        </Reveal>
      </div>
    </ViewTransition>
  );
}
