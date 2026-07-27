import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { HeroCarousel, type HeroSlideDisplay } from "@/components/homepage/hero-carousel";
import { WhyChooseUs } from "@/components/homepage/why-choose-us";
import { FeaturedPackagesGrid } from "@/components/homepage/featured-packages-grid";
import { TestimonialsSection } from "@/components/homepage/testimonials-section";
import { BrandPartners } from "@/components/homepage/brand-partners";
import { CorporateClients } from "@/components/homepage/corporate-clients";
import { InquiryForm } from "@/components/inquiry/inquiry-form";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "TravelSentro | Philippines Tour Packages",
  description:
    "Discover the Philippines with TravelSentro -- browse tour packages and reach out on WhatsApp, Facebook, or our inquiry form in under a minute.",
};

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

/** Resolves the first photo (by display_order) to a public Storage URL. */
function firstPhotoUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  photos: PackagePhotoRef[]
): string | null {
  const [firstPhoto] = [...photos].sort(
    (a, b) => a.display_order - b.display_order
  );
  return firstPhoto
    ? supabase.storage.from(bucket).getPublicUrl(firstPhoto.storage_path).data
        .publicUrl
    : null;
}

export default async function HomePage() {
  const supabase = await createClient();

  // (1) Hero slides -- package-linked or promo. hero_slides has
  // unconditional public-read RLS but packages does not, so a package-type
  // slide whose linked package has since been unpublished/soft-deleted
  // comes back with `packages: null` under RLS -- filtered out below
  // before render, never rendered broken (RESEARCH.md Pitfall 1).
  const { data: rawSlides, error: slidesError } = await supabase
    .from("hero_slides")
    .select(
      "*, packages(id, slug, name, is_published, deleted_at, package_photos(storage_path, display_order))"
    )
    .order("sort_order", { ascending: true });

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
          imageUrl: firstPhotoUrl(
            supabase,
            "package-photos",
            slide.packages.package_photos
          ),
          headline: slide.packages.name,
          subheading: slide.subheading,
          ctaLabel: "View Package",
          ctaHref: `/packages/${slide.packages.slug}`,
        };
      }

      const imageUrl = slide.image_storage_path
        ? supabase.storage
            .from("site-content")
            .getPublicUrl(slide.image_storage_path).data.publicUrl
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

  // (2) Value props
  const { data: valuePropsData, error: valuePropsError } = await supabase
    .from("value_props")
    .select("*")
    .order("sort_order", { ascending: true });

  if (valuePropsError) {
    console.error("Failed to load value props:", valuePropsError.message);
  }

  const valueProps = (valuePropsData ?? []).map(
    (valueProp: Database["public"]["Tables"]["value_props"]["Row"]) => ({
      id: valueProp.id,
      title: valueProp.title,
      description: valueProp.description,
    })
  );

  // (3) Featured packages -- byte-identical query shape to
  // app/(public)/packages/page.tsx, reusing the existing is_featured flag
  // (D-04) as the only addition. Zero new curation mechanism.
  const { data: featuredData, error: featuredError } = await supabase
    .from("packages")
    .select("*, package_photos(storage_path, display_order)")
    .eq("is_published", true)
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .limit(6);

  if (featuredError) {
    console.error("Failed to load featured packages:", featuredError.message);
  }

  const featuredItems = ((featuredData ?? []) as PackageWithPhotos[]).map(
    (pkg) => ({
      pkg,
      photoUrl: firstPhotoUrl(supabase, "package-photos", pkg.package_photos),
    })
  );

  // (4) Testimonials
  const { data: testimonialsData, error: testimonialsError } = await supabase
    .from("testimonials")
    .select("*")
    .order("sort_order", { ascending: true });

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
        ? supabase.storage
            .from("site-content")
            .getPublicUrl(testimonial.photo_storage_path).data.publicUrl
        : null,
    })
  );

  // (5) Brand partners and (6) corporate clients -- two fully independent
  // queries/counts, one per partner_type, never a combined "any partner
  // exists" check (RESEARCH.md Pitfall 3 / D-07).
  const { data: brandPartnersData, error: brandPartnersError } = await supabase
    .from("partners").select("*")
    .eq("partner_type", "brand_partner")
    .order("sort_order", { ascending: true });

  if (brandPartnersError) {
    console.error("Failed to load brand partners:", brandPartnersError.message);
  }

  const brandPartners = (brandPartnersData ?? []).map(
    (partner: Database["public"]["Tables"]["partners"]["Row"]) => ({
      id: partner.id,
      logoUrl: supabase.storage
        .from("site-content")
        .getPublicUrl(partner.logo_storage_path).data.publicUrl,
      linkUrl: partner.link_url,
    })
  );

  const { data: corporateClientsData, error: corporateClientsError } =
    await supabase
      .from("partners").select("*")
      .eq("partner_type", "corporate_client")
      .order("sort_order", { ascending: true });

  if (corporateClientsError) {
    console.error(
      "Failed to load corporate clients:",
      corporateClientsError.message
    );
  }

  const corporateClients = (corporateClientsData ?? []).map(
    (client: Database["public"]["Tables"]["partners"]["Row"]) => ({
      id: client.id,
      logoUrl: supabase.storage
        .from("site-content")
        .getPublicUrl(client.logo_storage_path).data.publicUrl,
      linkUrl: client.link_url,
    })
  );

  // TODO(Task 2): compose <HeroCarousel>, <WhyChooseUs>,
  // <FeaturedPackagesGrid>, <TestimonialsSection>, <InquiryForm />,
  // <BrandPartners>, <CorporateClients> in UI-SPEC's exact order.
  void slides;
  void valueProps;
  void featuredItems;
  void testimonials;
  void brandPartners;
  void corporateClients;
  return null;
}
