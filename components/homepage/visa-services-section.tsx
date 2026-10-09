import { ChevronDown, Clock, Stamp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FadeImage } from "@/components/motion/fade-image";
import { Checklist } from "@/components/packages/checklist";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";

export type VisaServiceCardData = {
  id: string;
  country: string;
  description: string | null;
  processingTime: string | null;
  price: number | null;
  requirements: string[];
  photoUrl: string | null;
};

function VisaServiceCard({ service }: { service: VisaServiceCardData }) {
  // Rides along in the WhatsApp prefill ("Hi! I'm interested in Japan visa
  // assistance") and the Messenger CTA's aria-label. Messenger gets no slug,
  // so it falls back to the general greeting ref.
  const inquiryLabel = `${service.country} visa assistance`;

  return (
    <Card className="gap-0 p-0">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-secondary/10">
        {service.photoUrl ? (
          <FadeImage
            src={service.photoUrl}
            alt={service.country}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
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
            {service.country}
          </h3>
          {service.description && (
            <p className="text-sm leading-[1.5] whitespace-pre-line text-muted-foreground">
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
                Starting at{" "}
                <span className="font-semibold text-foreground">
                  ₱{service.price.toLocaleString("en-PH")}
                </span>
              </span>
            )}
          </div>
        )}

        {service.requirements.length > 0 && (
          // Native <details> keeps this a Server Component -- no client JS
          // just to expand a list.
          <details className="group rounded-lg border border-border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Requirements ({service.requirements.length})
              <ChevronDown
                className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="px-3 pb-3">
              <Checklist
                kind="included"
                items={service.requirements.map((label) => ({ label }))}
              />
            </div>
          </details>
        )}

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
    <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8">
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
