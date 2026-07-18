import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Checklist } from "@/components/packages/checklist";
import { ItineraryAccordion } from "@/components/packages/itinerary-accordion";
import { TripFacts } from "@/components/packages/trip-facts";
import { PackageGallery } from "@/components/packages/package-gallery";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import type { Database } from "@/types/database";

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
    <div className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {pkg.name}
        </h1>
        <p className="text-[14px] leading-[1.4] text-muted-foreground">
          {pkg.duration_label ?? `${pkg.duration_days} days`} &middot; From
          &#8369;{pkg.from_price.toLocaleString("en-PH")}
        </p>
      </div>

      <PackageGallery photos={photos} />

      <section className="flex flex-col gap-6">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
          What&apos;s Included
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Checklist items={inclusions} kind="included" />
          <Checklist items={exclusions} kind="excluded" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
          Itinerary
        </h2>
        <ItineraryAccordion days={pkg.itinerary_days} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
          Trip Facts
        </h2>
        <TripFacts
          bestTimeToGo={faqFacts?.best_time_to_go ?? ""}
          groupSize={faqFacts?.group_size ?? ""}
          bringItems={bringItems}
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <WhatsAppCta packageName={pkg.name} variant="icon-label" />
        <FacebookCta variant="icon-label" />
      </div>

      <section className="flex flex-col gap-4 border-t border-foreground/10 pt-8">
        <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
          Send an Inquiry
        </h2>
        <InquiryForm packageName={pkg.name} />
      </section>
    </div>
  );
}
