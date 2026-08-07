import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Info,
  ListChecks,
  ListX,
  Mail,
  Route,
  Send,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checklist } from "@/components/packages/checklist";
import { ItineraryAccordion } from "@/components/packages/itinerary-accordion";
import { TripFacts } from "@/components/packages/trip-facts";
import { PackageGallery } from "@/components/packages/package-gallery";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import { StickyCtaBar } from "@/components/packages/sticky-cta-bar";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import type { Database } from "@/types/database";

const SECTION_CARD =
  "flex flex-col gap-4 rounded-xl border border-foreground/10 bg-card p-6 shadow-sm";

function SectionHeading({
  icon: Icon,
  tone = "secondary",
  children,
}: {
  icon: LucideIcon;
  tone?: "secondary" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone === "destructive"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary/10 text-secondary"
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
        {children}
      </h2>
    </div>
  );
}

type FaqFactsRow = Database["public"]["Tables"]["faq_facts"]["Row"];

type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Database["public"]["Tables"]["package_photos"]["Row"][];
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  // faq_facts is a to-one relation (isOneToOne: true in types/database.ts),
  // but defensively handle either shape in case the query builder ever
  // returns it as a single-element array.
  faq_facts: FaqFactsRow | FaqFactsRow[] | null;
};

/**
 * Package detail page (PUBL-02/03/04/08, plus PUBL-05/06/07 wiring). Full
 * RSC query with joins, same `.eq('is_published', true)` server-side filter
 * as the list page (T-01-15) — an unpublished slug is indistinguishable
 * from a nonexistent one, both 404 identically via notFound().
 */
export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("packages")
    .select(
      `*,
      package_photos(storage_path, display_order, alt_text),
      itinerary_days(day_number, title, description),
      package_inclusions(kind, label, sort_order),
      faq_facts(best_time_to_go, group_size)`
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (error || !data) notFound();

  const pkg = data as PackageDetail;
  const faqFacts = Array.isArray(pkg.faq_facts)
    ? pkg.faq_facts[0]
    : pkg.faq_facts;

  const photos = [...pkg.package_photos]
    .sort((a, b) => a.display_order - b.display_order)
    .map((photo) => ({
      url: supabase.storage
        .from("package-photos")
        .getPublicUrl(photo.storage_path).data.publicUrl,
      alt: photo.alt_text ?? pkg.name,
    }));

  const inclusions = pkg.package_inclusions
    .filter((item) => item.kind === "included")
    .sort((a, b) => a.sort_order - b.sort_order);
  const exclusions = pkg.package_inclusions
    .filter((item) => item.kind === "excluded")
    .sort((a, b) => a.sort_order - b.sort_order);
  const bringItems = pkg.package_inclusions
    .filter((item) => item.kind === "bring")
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pt-8 pb-28 sm:px-8 sm:pb-12 lg:pt-12 lg:pb-16">
      <Link
        href="/packages"
        className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Packages
      </Link>

      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-[30px] leading-[1.15] font-semibold sm:text-[36px]">
          {pkg.name}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-foreground/10 bg-card py-1 pr-3.5 pl-1 text-[13px] font-medium text-foreground shadow-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
              <Clock className="size-3.5" aria-hidden="true" />
            </span>
            {pkg.duration_label ?? `${pkg.duration_days} days`}
          </span>
          <Badge className="h-9 rounded-full px-4 text-[15px] font-bold tabular-nums shadow-sm">
            From &#8369;{pkg.from_price.toLocaleString("en-PH")}
          </Badge>
        </div>
      </div>

      <PackageGallery photos={photos} />

      <section className="flex flex-col gap-6 rounded-xl bg-secondary p-6 text-secondary-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Send className="size-4" aria-hidden="true" />
            </span>
            <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
              Ready to Book This Trip?
            </h2>
          </div>
          <p className="max-w-sm text-[14px] leading-[1.5] text-secondary-foreground/70">
            Message us on WhatsApp or Facebook about the {pkg.name} — we
            usually reply within minutes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
          <WhatsAppCta packageName={pkg.name} variant="icon-label" />
          <FacebookCta packageName={pkg.name} variant="icon-label" />
        </div>
      </section>

      <section className={SECTION_CARD}>
        <SectionHeading icon={ListChecks}>What&apos;s Included</SectionHeading>
        <Checklist items={inclusions} kind="included" />
      </section>

      <section className={SECTION_CARD}>
        <SectionHeading icon={ListX} tone="destructive">
          What&apos;s Not Included
        </SectionHeading>
        <Checklist items={exclusions} kind="excluded" />
      </section>

      <section className={SECTION_CARD}>
        <SectionHeading icon={Route}>Itinerary</SectionHeading>
        <ItineraryAccordion days={pkg.itinerary_days} />
      </section>

      <section className={SECTION_CARD}>
        <SectionHeading icon={Info}>Trip Facts</SectionHeading>
        <TripFacts
          bestTimeToGo={faqFacts?.best_time_to_go ?? ""}
          groupSize={faqFacts?.group_size ?? ""}
          bringItems={bringItems}
        />
      </section>

      <div className="flex flex-col gap-4">
        <SectionHeading icon={Mail}>Inquire About {pkg.name}</SectionHeading>
        <InquiryForm packageName={pkg.name} packageId={pkg.id} />
      </div>

      <StickyCtaBar packageName={pkg.name} />
    </div>
  );
}
