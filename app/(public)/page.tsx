import type { Metadata } from "next";
import { ViewTransition } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { HeroCarousel, type HeroSlideDisplay } from "@/components/homepage/hero-carousel";
import { HeroSearchBar } from "@/components/homepage/hero-search-bar";
import { WhyChooseUs } from "@/components/homepage/why-choose-us";
import { FeaturedPackagesGrid } from "@/components/homepage/featured-packages-grid";
import { DestinationsSection } from "@/components/homepage/destinations-section";
import { TestimonialsSection } from "@/components/homepage/testimonials-section";
import { BrandPartners } from "@/components/homepage/brand-partners";
import { CorporateClients } from "@/components/homepage/corporate-clients";
import { Reveal } from "@/components/motion/reveal";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { WhatsAppCta } from "@/components/packages/whatsapp-cta";
import { FacebookCta } from "@/components/packages/facebook-cta";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "TravelSentro | Philippines Tour Packages",
  description:
    "Discover the Philippines with TravelSentro -- browse tour packages and reach out on WhatsApp, Facebook, or our inquiry form in under a minute.",
};

// Homepage content (hero slides, featured packages, testimonials,
// destinations, partners) is identical for every visitor and admin-managed,
// not per-request -- ISR lets it serve from cache instead of re-querying
// Supabase 6x on every single request. Paired with lib/supabase/public.ts
// (no cookies() call) so this route is actually eligible for static
// rendering rather than being forced dynamic.
export const revalidate = 60;

type PackagePhotoRef = Pick<
  Database["public"]["Tables"]["package_photos"]["Row"],
  "storage_path" | "display_order"
>;

type PackageWithPhotos = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: PackagePhotoRef[];
};

// Supabase's untyped client (no <Database> generic passed to createClient(),
// matching this project's existing convention in app/(public)/packages/page.tsx)
// returns joined/embedded rows as `any` -- this manual shape mirrors the exact
// select() below and is cast onto the raw result, same pattern as
// PackageWithPhotos above.
type HeroSlideRow = Database["public"]["Tables"]["hero_slides"]["Row"] & {
  packages:
    | (Pick<
        Database["public"]["Tables"]["packages"]["Row"],
        "id" | "slug" | "name" | "is_published" | "deleted_at"
      > & { package_photos: PackagePhotoRef[] })
    | null;
};

/** Resolves the first photo (by display_order) to a public image URL. */
function firstPhotoUrl(photos: PackagePhotoRef[]): string | null {
  const [firstPhoto] = [...photos].sort(
    (a, b) => a.display_order - b.display_order
  );
  return firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null;
}

export default async function HomePage() {
  const supabase = createPublicClient();

  // All six sections are independent reads (no query depends on another's
  // result), so they run concurrently instead of as a 6-request waterfall.
  const [
    { data: rawSlides, error: slidesError },
    { data: featuredData, error: featuredError },
    { data: testimonialsData, error: testimonialsError },
    { data: destinationsData, error: destinationsError },
    { data: brandPartnersData, error: brandPartnersError },
    { data: corporateClientsData, error: corporateClientsError },
  ] = await Promise.all([
    // (1) Hero slides -- package-linked or promo. hero_slides has
    // unconditional public-read RLS but packages does not, so a
    // package-type slide whose linked package has since been
    // unpublished/soft-deleted comes back with `packages: null` under
    // RLS -- filtered out below before render, never rendered broken
    // (RESEARCH.md Pitfall 1).
    supabase
      .from("hero_slides")
      .select(
        "*, packages(id, slug, name, is_published, deleted_at, package_photos(storage_path, display_order))"
      )
      .order("sort_order", { ascending: true }),
    // (3) Featured packages -- byte-identical query shape to
    // app/(public)/packages/page.tsx, reusing the existing is_featured
    // flag (D-04) as the only addition. Zero new curation mechanism.
    supabase
      .from("packages")
      .select("*, package_photos(storage_path, display_order)")
      .eq("is_published", true)
      .eq("is_featured", true)
      .order("sort_order", { ascending: true })
      .limit(6),
    // (4) Testimonials
    supabase.from("testimonials").select("*").order("sort_order", { ascending: true }),
    // (4.5) Destinations -- admin-managed, split into Local/International
    // groups. Public read RLS already scopes this to is_active = true,
    // but the query-layer filter is kept too, matching every other
    // homepage section's belt-and-suspenders pattern (e.g. packages'
    // is_published).
    supabase
      .from("destinations")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    // (5) Brand partners and (6) corporate clients -- two fully
    // independent queries/counts, one per partner_type, never a combined
    // "any partner exists" check (RESEARCH.md Pitfall 3 / D-07).
    supabase
      .from("partners")
      .select("*")
      .eq("partner_type", "brand_partner")
      .order("sort_order", { ascending: true }),
    supabase
      .from("partners")
      .select("*")
      .eq("partner_type", "corporate_client")
      .order("sort_order", { ascending: true }),
  ]);

  if (slidesError) {
    console.error("Failed to load hero slides:", slidesError.message);
  }

  const slides: HeroSlideDisplay[] = ((rawSlides ?? []) as HeroSlideRow[])
    .filter((slide) => slide.slide_type === "promo" || slide.packages !== null)
    .map((slide): HeroSlideDisplay => {
      if (slide.slide_type === "package" && slide.packages) {
        return {
          id: slide.id,
          slideType: "package",
          imageUrl: firstPhotoUrl(slide.packages.package_photos),
          headline: slide.packages.name,
          subheading: slide.subheading,
          ctaLabel: "View Package",
          ctaHref: `/packages/${slide.packages.slug}`,
        };
      }

      const imageUrl = slide.image_storage_path
        ? getPublicImageUrl(slide.image_storage_path)
        : null;

      return {
        id: slide.id,
        slideType: "promo",
        imageUrl,
        headline: slide.headline ?? "",
        subheading: slide.subheading,
        ctaLabel: slide.cta_label || null,
        ctaHref: slide.cta_label ? (slide.external_link ?? null) : null,
      };
    });

  if (featuredError) {
    console.error("Failed to load featured packages:", featuredError.message);
  }

  const featuredItems = ((featuredData ?? []) as PackageWithPhotos[]).map(
    (pkg) => ({
      pkg,
      photoUrl: firstPhotoUrl(pkg.package_photos),
    })
  );

  if (testimonialsError) {
    console.error("Failed to load testimonials:", testimonialsError.message);
  }

  const testimonials = (testimonialsData ?? []).map(
    (testimonial: Database["public"]["Tables"]["testimonials"]["Row"]) => ({
      id: testimonial.id,
      customerName: testimonial.customer_name,
      quote: testimonial.quote,
      rating: testimonial.rating,
      photoUrl: testimonial.photo_storage_path
        ? getPublicImageUrl(testimonial.photo_storage_path)
        : null,
    })
  );

  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
  }

  const destinationTiles = (destinationsData ?? []).map(
    (d: Database["public"]["Tables"]["destinations"]["Row"]) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      region: d.region,
      photoUrl: d.photo_storage_path
        ? getPublicImageUrl(d.photo_storage_path)
        : null,
    })
  );
  const localDestinations = destinationTiles.filter(
    (d) => d.region === "local"
  );
  const internationalDestinations = destinationTiles.filter(
    (d) => d.region === "international"
  );

  if (brandPartnersError) {
    console.error("Failed to load brand partners:", brandPartnersError.message);
  }

  const brandPartners = (brandPartnersData ?? []).map(
    (partner: Database["public"]["Tables"]["partners"]["Row"]) => ({
      id: partner.id,
      logoUrl: getPublicImageUrl(partner.logo_storage_path),
      linkUrl: partner.link_url,
    })
  );

  if (corporateClientsError) {
    console.error(
      "Failed to load corporate clients:",
      corporateClientsError.message
    );
  }

  const corporateClients = (corporateClientsData ?? []).map(
    (client: Database["public"]["Tables"]["partners"]["Row"]) => ({
      id: client.id,
      logoUrl: getPublicImageUrl(client.logo_storage_path),
      linkUrl: client.link_url,
    })
  );

  return (
    <ViewTransition enter="slide-up" default="none">
      <div>
        <div className="relative">
          <HeroCarousel slides={slides} />
          {/* Below md, the hero is a tall aspect-[4/5] image and the search
              card stacks into a taller column — centering it as an overlay
              covers the bottom-anchored headline. So it flows in normal
              document order on mobile and only becomes an absolute overlay
              once the hero switches to the short aspect-video layout. */}
          <div className="px-4 py-4 sm:px-8 sm:py-6 md:pointer-events-none md:absolute md:inset-0 md:z-20 md:flex md:items-center md:justify-center md:p-8">
            <div className="mx-auto w-full max-w-4xl md:pointer-events-auto">
              <HeroSearchBar
                local={localDestinations}
                international={internationalDestinations}
              />
            </div>
          </div>
        </div>
        <Reveal>
          <WhyChooseUs />
        </Reveal>
        <Reveal>
          <FeaturedPackagesGrid items={featuredItems} />
        </Reveal>
        <Reveal>
          <DestinationsSection
            local={localDestinations}
            international={internationalDestinations}
          />
        </Reveal>
        <Reveal>
          <TestimonialsSection testimonials={testimonials} />
        </Reveal>

        <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 sm:px-8">
          <div className="flex flex-col gap-2">
            <span className="font-heading text-sm font-semibold tracking-wide text-primary uppercase">
              We&apos;d Love to Hear From You
            </span>
            <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
              Get in Touch
            </h2>
            <p className="text-base leading-[1.5] text-muted-foreground">
              Message us directly for a fast reply, or send the details
              below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <WhatsAppCta variant="icon-label" />
            <FacebookCta variant="icon-label" />
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or send us a message
            <div className="h-px flex-1 bg-border" />
          </div>

          <InquiryForm />
        </section>

        <Reveal>
          <BrandPartners partners={brandPartners} />
        </Reveal>
        <Reveal>
          <CorporateClients clients={corporateClients} />
        </Reveal>
      </div>
    </ViewTransition>
  );
}
