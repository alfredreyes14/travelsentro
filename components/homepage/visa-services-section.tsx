import Link from "next/link";
import { ArrowRight, Clock, FileCheck, Stamp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FadeImage } from "@/components/motion/fade-image";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import {
  type PublicVisaService,
  visaServicePath,
} from "@/lib/visa/public-visa";

export type VisaServiceCardData = PublicVisaService;

/**
 * The whole card links to the visa details page through a stretched link on
 * the title. The WhatsApp/Messenger buttons sit above it (relative z-10), so
 * they still open the chat instead of the details page. The full requirement
 * list lives on the details page, which keeps every card the same height.
 */
function VisaServiceCard({ service }: { service: VisaServiceCardData }) {
  // Rides along in the WhatsApp prefill ("Hi! I'm interested in Japan visa
  // assistance") and the Messenger CTA's aria-label. Messenger gets no slug,
  // so it falls back to the general greeting ref.
  const inquiryLabel = `${service.country} visa assistance`;

  return (
    <Card className="group/card relative gap-0 overflow-hidden p-0 transform-gpu transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-secondary/10">
        {service.photoUrl ? (
          <FadeImage
            src={service.photoUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="transform-gpu object-cover duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:scale-[1.04] motion-reduce:group-hover/card:scale-100"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Stamp
              className="size-10 text-secondary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-[20px] leading-[1.2] font-semibold">
            <Link
              href={visaServicePath(service)}
              className="transition-colors duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover/card:text-primary after:absolute after:inset-0 focus-visible:outline-none"
            >
              {service.country}
            </Link>
          </h3>
          {service.description && (
            <p className="line-clamp-3 text-sm leading-[1.5] whitespace-pre-line text-muted-foreground">
              {service.description}
            </p>
          )}
        </div>

        {(service.processingTime || service.price) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {service.processingTime && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-4" aria-hidden="true" />
                {service.processingTime}
              </span>
            )}
            {service.price && (
              <span className="text-muted-foreground">
                Starts at{" "}
                <span className="font-semibold text-foreground">
                  ₱{service.price.toLocaleString("en-PH")}
                </span>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-sm">
          {service.requirements.length > 0 ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <FileCheck className="size-4" aria-hidden="true" />
              {service.requirements.length} requirements
            </span>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1 font-medium text-primary">
            View details
            <ArrowRight
              className="size-4 transition-transform duration-300 group-hover/card:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <WhatsAppCta
            packageName={inquiryLabel}
            variant="icon-label"
            className="flex-1"
          />
          <FacebookCta packageName={inquiryLabel} variant="icon-only" />
        </div>
      </div>
    </Card>
  );
}

/**
 * Homepage "Visa Assistance" section -- pure prop-driven, zero Supabase
 * awareness. Unlike FeaturedPackagesGrid/DestinationsSection it renders
 * nothing when empty instead of a "coming soon" skeleton: visa services are
 * an optional offering the admin turns on, not a core section that's
 * merely awaiting content.
 */
export function VisaServicesSection({
  services,
}: {
  services: VisaServiceCardData[];
}) {
  if (services.length === 0) return null;

  return (
    <section
      id="visa-assistance"
      className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8"
    >
      <div className="flex flex-col gap-2 sm:max-w-2xl">
        <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
          Travel Documents
        </span>
        <h2 className="font-heading text-[28px] leading-[1.2] font-semibold text-secondary">
          Visa Assistance
        </h2>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Let us handle the paperwork. Message us and we&apos;ll guide you
          through your visa application from start to finish.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <VisaServiceCard key={service.id} service={service} />
        ))}
      </div>
    </section>
  );
}
