import type { Metadata } from "next";
import { ViewTransition } from "react";

import { createPublicClient } from "@/lib/supabase/public";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { HeroCarousel, type HeroSlideDisplay } from "@/components/homepage/hero-carousel";
import { HeroSearchBar } from "@/components/homepage/hero-search-bar";import { WhyChooseUs } from "@/components/homepage/why-choose-us";
import { FeaturedPackagesGrid } from "@/components/homepage/featured-packages-grid";
import { DestinationsSection } from "@/components/homepage/destinations-section";
import { TestimonialsSection } from "@/components/homepage/testimonials-section";
import { PartnerAffiliations } from "@/components/homepage/partner-affiliations";
import { CorporateClients } from "@/components/homepage/corporate-clients";
import { Reveal } from "@/components/motion/reveal";
import { GetInTouchSection } from "@/components/inquiry/get-in-touch-section";
import { readLogoFolder } from "@/lib/logos/read-logo-folder";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import type { Database } from "@/types/database";

export const metadata: Metadata = buildPageMetadata({
  title: "TravelSentro | Philippines Tour Packages",
  absoluteTitle: true,
  description:
    "Discover the Philippines with TravelSentro -- browse tour packages and reach out on WhatsApp, Facebook, or our inquiry form in under a minute.",
  path: "/",
});

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

/** Resolves the first photo (by display_order) to a public image URL. */
function firstPhotoUrl(photos: PackagePhotoRef[]): string | null {
  const [firstPhoto] = [...photos].sort(
    (a, b) => a.display_order - b.display_order
  );
  return firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null;
}

export default async function HomePage() {
  const supabase = createPublicClient();

  // All four sections are independent reads (no query depends on another's
  // result), so they run concurrently instead of as a 4-request waterfall.
  // Partner/client logos are no longer part of this -- they're read
  // synchronously from public/logos/** below, not queried from Supabase.
  const [
    { data: rawSlides, error: slidesError },
    { data: featuredData, error: featuredError },
    { data: testimonialsData, error: testimonialsError },
    { data: destinationsData, error: destinationsError },
  ] = await Promise.all([
    // (1) Hero slides -- plain admin-uploaded images, in carousel order.
    supabase
      .from("hero_slides")
      .select("id, image_storage_path")
      .order("sort_order", { ascending: true }),
    // (3) Featured packages -- same query shape as
    // app/(public)/packages/page.tsx, reusing the existing is_featured
    // flag (D-04) as the only addition. Zero new curation mechanism.
    // Newest first, since `sort_order` is no longer authored in the admin.
    supabase
      .from("packages")
      .select("*, package_photos(storage_path, display_order)")
      .eq("is_published", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
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
  ]);

  if (slidesError) {
    console.error("Failed to load hero slides:", slidesError.message);
  }

  const slides: HeroSlideDisplay[] = (rawSlides ?? []).map(
    (
      slide: Pick<
        Database["public"]["Tables"]["hero_slides"]["Row"],
        "id" | "image_storage_path"
      >
    ) => ({
      id: slide.id,
      imageUrl: getPublicImageUrl(slide.image_storage_path),
    })
  );

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
      photoUrls: (testimonial.photo_storage_paths ?? []).map(
        getPublicImageUrl
      ),
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

  // Partner/client logos come straight from public/logos/** -- dropping a
  // new file into one of these folders is enough to make it appear, no DB
  // row or admin upload step involved.
  const airlineLogos = readLogoFolder("airlines");
  const operatorLogos = readLogoFolder("operators");
  const brandPartnerLogos = readLogoFolder("brand-partners");
  const corporateClientLogos = readLogoFolder("corporate partners");

  return (
    <ViewTransition enter="slide-up" default="none">
      <div>
        {/* The hero is an image carousel with no visible headline, so the
            page's main heading is screen-reader-only -- still gives search
            engines and assistive tech a top-level description of the page. */}
        <h1 className="sr-only">
          TravelSentro — Philippine and International Tour Packages
        </h1>
        <div className="relative">
          <HeroCarousel slides={slides} />
          {/* Below md, the wide banner hero is too short to hold the search card,
              which stacks into a taller column there — so it flows in normal
              document order under the image on mobile and only becomes a
              centered overlay from md up. */}
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

        <Reveal>
          <PartnerAffiliations
            airlines={airlineLogos}
            operators={operatorLogos}
            brandPartners={brandPartnerLogos}
          />
        </Reveal>
        <Reveal>
          <CorporateClients logos={corporateClientLogos} />
        </Reveal>

        <Reveal>
          <GetInTouchSection />
        </Reveal>
      </div>
    </ViewTransition>
  );
}
