import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ViewTransition, cache } from "react";
import {
  ArrowLeft,
  Clock,
  FileCheck,
  Mail,
  Send,
  Stamp,
  Wallet,
} from "lucide-react";

import { createPublicClient } from "@/lib/supabase/public";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { SITE_URL } from "@/lib/constants";
import { toPublicVisaService, visaServicePath } from "@/lib/visa/public-visa";
import { groupRequirements } from "@/lib/visa/requirement-groups";
import { SectionHeading } from "@/components/ui/section-heading";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import type { Tables } from "@/types/database";

export const revalidate = 60;

// No paths at build time; each page renders on first visit, then revalidates.
export async function generateStaticParams() {
  return [];
}

const SECTION_CARD =
  "flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-6 shadow-sm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared by generateMetadata and the page; cache() runs the query once per request.
const getPublishedVisaService = cache(async (id: string) => {
  // A non-UUID id would make Postgres throw; treat it as not found.
  if (!UUID.test(id)) return null;
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("visa_services")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (error || !data) return null;
  return toPublicVisaService(data as Tables<"visa_services">);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const service = await getPublishedVisaService(id);
  if (!service) return {};

  const metadata = buildPageMetadata({
    title: `${service.country} Visa Assistance`,
    description:
      service.description ??
      `Requirements, processing time and fees for ${service.country}. Message us and we'll guide you through your application.`,
    path: visaServicePath(service),
  });
  if (!service.photoUrl) return metadata;
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      images: [{ url: service.photoUrl, alt: service.country }],
    },
    twitter: { ...metadata.twitter, images: [service.photoUrl] },
  };
}

/** Published visa services only: an unpublished or unknown id is a plain 404. */
export default async function VisaServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = await getPublishedVisaService(id);
  if (!service) notFound();

  const inquiryLabel = `${service.country} visa assistance`;
  const requirements = groupRequirements(service.requirements);
  const pageUrl = `${SITE_URL}${visaServicePath(service)}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Visa Assistance",
        item: `${SITE_URL}/#visa-assistance`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: service.country,
        item: pageUrl,
      },
    ],
  };

  return (
    <ViewTransition enter="slide-up" default="none">
      <article className="mx-auto flex max-w-4xl flex-col gap-8 px-6 pt-8 pb-16 sm:px-8 lg:pt-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <Link
          href="/#visa-assistance"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to visa assistance
        </Link>

        <div className="relative aspect-video overflow-hidden rounded-xl bg-secondary/10 shadow-sm">
          {service.photoUrl ? (
            <Image
              src={service.photoUrl}
              alt={service.country}
              fill
              priority
              sizes="(min-width: 896px) 832px, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Stamp
                className="size-14 text-secondary"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        <header className="flex flex-col gap-3">
          <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
            Visa Assistance
          </span>
          <h1 className="font-heading text-[30px] leading-[1.15] font-semibold break-words sm:text-[36px]">
            {service.country}
          </h1>
          {service.description && (
            <p className="text-base leading-[1.6] whitespace-pre-line text-foreground/80">
              {service.description}
            </p>
          )}
          {(service.processingTime || service.price) && (
            <div className="flex flex-col gap-2 text-base text-foreground/80 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {service.processingTime && (
                <p className="flex items-center gap-2">
                  <Clock
                    className="size-4 shrink-0 text-secondary"
                    aria-hidden="true"
                  />
                  Processing time: {service.processingTime}
                </p>
              )}
              {service.price && (
                <p className="flex items-center gap-2">
                  <Wallet
                    className="size-4 shrink-0 text-secondary"
                    aria-hidden="true"
                  />
                  Starts at{" "}
                  <span className="font-semibold text-foreground">
                    ₱{service.price.toLocaleString("en-PH")}
                  </span>
                </p>
              )}
            </div>
          )}
        </header>

        <section className="flex flex-col gap-6 rounded-xl bg-primary p-6 text-primary-foreground shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                <Send className="size-4" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
                Ready to Apply?
              </h2>
            </div>
            <p className="max-w-sm text-[14px] leading-[1.5] text-primary-foreground/70">
              Message us on WhatsApp or Facebook about your {service.country}{" "}
              application — we usually reply within minutes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <WhatsAppCta packageName={inquiryLabel} variant="icon-label" />
            <FacebookCta packageName={inquiryLabel} variant="icon-label" />
          </div>
        </section>

        {requirements.length > 0 && (
          <section className={SECTION_CARD}>
            <SectionHeading icon={FileCheck}>
              Requirements ({requirements.length})
            </SectionHeading>
            <ol className="flex flex-col gap-4">
              {requirements.map((req, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-xs font-semibold text-secondary">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <p className="text-[15px] leading-[1.4] font-medium text-foreground">
                      {req.title}
                    </p>
                    {req.notes.length > 0 && (
                      <ul className="flex list-disc flex-col gap-1 pl-4 text-sm leading-[1.5] text-muted-foreground marker:text-secondary">
                        {req.notes.map((note, noteIndex) => (
                          <li key={noteIndex}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div id="inquire" className="flex flex-col gap-4">
          <SectionHeading icon={Mail}>
            Inquire About {service.country}
          </SectionHeading>
          <InquiryForm packageName={inquiryLabel} />
        </div>
      </article>
    </ViewTransition>
  );
}
