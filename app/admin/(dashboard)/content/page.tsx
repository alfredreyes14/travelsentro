import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { formatPackagePrice } from "@/lib/packages/format-price";
import {
  HeroSlidesList,
  type HeroSlideListItem,
} from "@/components/admin/content/hero-slides-list";
import type {
  HeroSlidePackageOption,
  HeroSlideRecord,
} from "@/components/admin/content/hero-slide-form";
import { TestimonialsList } from "@/components/admin/content/testimonials-list";
import type { TestimonialRecord } from "@/components/admin/content/testimonial-form";
import {
  UpsellItemsList,
  type UpsellItemListItem,
  type UpsellPackageOption,
} from "@/components/admin/content/upsell-items-list";
import { PageHeader } from "@/components/admin/page-header";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Homepage Content | TravelSentro Admin",
};

type PackagePhotoRow = Pick<
  Database["public"]["Tables"]["package_photos"]["Row"],
  "storage_path" | "display_order"
>;

type HeroSlideRow = Database["public"]["Tables"]["hero_slides"]["Row"] & {
  packages:
    | (Pick<Database["public"]["Tables"]["packages"]["Row"], "id" | "name"> & {
        package_photos: PackagePhotoRow[];
      })
    | null;
};

type UpsellItemRow = Database["public"]["Tables"]["upsell_items"]["Row"] & {
  packages:
    | (Pick<
        Database["public"]["Tables"]["packages"]["Row"],
        | "id"
        | "name"
        | "price_per_pax"
        | "discount_amount"
        | "is_published"
        | "deleted_at"
      > & { package_photos: PackagePhotoRow[] })
    | null;
};

export default async function AdminContentPage() {
  // AUTH-05 (T-06-21) -- gate independent of Task 2's nav hiding; RLS is the
  // second, independent enforcement layer.
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  const [
    { data: heroSlideRows, error: heroSlidesError },
    { data: packageOptionRows, error: packagesError },
    { data: testimonialRows, error: testimonialsError },
    { data: upsellItemRows, error: upsellItemsError },
    { data: publishedPackageRows, error: publishedPackagesError },
  ] = await Promise.all([
    supabase
      .from("hero_slides")
      .select("*, packages(id, name, package_photos(storage_path, display_order))")
      .order("sort_order", { ascending: true }),
    // Pitfall 2 -- the ONLY place in the codebase this exact filtered query
    // runs. Only featured, published, non-deleted packages are valid hero
    // slide candidates (T-06-22).
    supabase.from("packages").select("id, name").eq("is_featured", true).eq("is_published", true).is("deleted_at", null).order("name"),
    supabase.from("testimonials").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("upsell_items")
      .select(
        "*, packages(id, name, price_per_pax, discount_amount, is_published, deleted_at, package_photos(storage_path, display_order))"
      )
      .order("created_at", { ascending: true }),
    // Upsell items aren't restricted to featured packages (unlike hero
    // slides above) -- any published, non-deleted package is eligible.
    supabase
      .from("packages")
      .select("id, name")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (heroSlidesError) {
    console.error("Failed to load hero slides:", heroSlidesError.message);
  }
  if (packagesError) {
    console.error(
      "Failed to load package picker options:",
      packagesError.message
    );
  }
  if (testimonialsError) {
    console.error("Failed to load testimonials:", testimonialsError.message);
  }
  if (upsellItemsError) {
    console.error("Failed to load upsell items:", upsellItemsError.message);
  }
  if (publishedPackagesError) {
    console.error(
      "Failed to load published packages:",
      publishedPackagesError.message
    );
  }

  const packages: HeroSlidePackageOption[] = (packageOptionRows ?? []).map(
    (pkg) => ({
      id: pkg.id,
      name: pkg.name,
    })
  );

  const heroSlides: HeroSlideListItem[] = ((heroSlideRows ?? []) as HeroSlideRow[]).map(
    (row) => {
      const record: HeroSlideRecord = {
        id: row.id,
        slideType: row.slide_type as "package" | "promo",
        packageId: row.package_id,
        imageStoragePath: row.image_storage_path,
        headline: row.headline,
        subheading: row.subheading,
        ctaLabel: row.cta_label,
        externalLink: row.external_link,
        sortOrder: row.sort_order,
      };

      let imageUrl: string | null = null;
      if (row.slide_type === "package" && row.packages) {
        const [firstPhoto] = [...row.packages.package_photos].sort(
          (a, b) => a.display_order - b.display_order
        );
        imageUrl = firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null;
      } else if (row.image_storage_path) {
        imageUrl = getPublicImageUrl(row.image_storage_path);
      }

      return {
        ...record,
        packageName: row.packages?.name ?? null,
        imageUrl,
      };
    }
  );

  const testimonials: TestimonialRecord[] = (testimonialRows ?? []).map(
    (row) => ({
      id: row.id,
      customerName: row.customer_name,
      quote: row.quote,
      rating: row.rating,
      photoStoragePath: row.photo_storage_path,
    })
  );

  // Unlike the public anon client, an authenticated can_manage_packages
  // session's `packages` RLS policy ("manage_packages can read all
  // packages") has no is_published/deleted_at condition, so `row.packages`
  // is never null here just because a package was unpublished or
  // soft-deleted -- it's still returned in full. `isHidden` surfaces that
  // state explicitly (rendered as a badge in UpsellItemsList) so an admin
  // can see -- and still remove -- an item the public popup has already
  // silently dropped, rather than this list looking identical to a fully
  // live one and contradicting the page's own "changes go live on the
  // public site immediately" description.
  const upsellItems: UpsellItemListItem[] = ((upsellItemRows ?? []) as UpsellItemRow[])
    .map((row) => {
      const pkg = row.packages;
      if (!pkg) return null;

      const [firstPhoto] = [...pkg.package_photos].sort(
        (a, b) => a.display_order - b.display_order
      );
      const price = formatPackagePrice(pkg.price_per_pax, pkg.discount_amount);

      const item: UpsellItemListItem = {
        id: row.id,
        packageId: pkg.id,
        packageName: pkg.name,
        imageUrl: firstPhoto ? getPublicImageUrl(firstPhoto.storage_path) : null,
        priceLabel: price.final,
        isHidden: !pkg.is_published || pkg.deleted_at !== null,
      };
      return item;
    })
    .filter((item): item is UpsellItemListItem => item !== null);

  const upsellPackageIds = new Set(upsellItems.map((item) => item.packageId));
  const upsellPackageOptions: UpsellPackageOption[] = (publishedPackageRows ?? [])
    .filter((pkg) => !upsellPackageIds.has(pkg.id))
    .map((pkg) => ({ id: pkg.id, name: pkg.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Homepage Content"
        description="Manage the hero carousel and homepage content sections — changes go live on the public site immediately."
      />

      <Tabs defaultValue="hero-slides">
        <TabsList>
          <TabsTrigger value="hero-slides">{"Hero Slides"}</TabsTrigger>
          <TabsTrigger value="testimonials">{"Testimonials"}</TabsTrigger>
          <TabsTrigger value="upsell-popup">{"Upsell Popup"}</TabsTrigger>
        </TabsList>

        <TabsContent value="hero-slides" keepMounted className="pt-4">
          <HeroSlidesList initialSlides={heroSlides} packages={packages} />
        </TabsContent>

        <TabsContent value="testimonials" keepMounted className="pt-4">
          <TestimonialsList initialItems={testimonials} />
        </TabsContent>

        <TabsContent value="upsell-popup" keepMounted className="pt-4">
          <UpsellItemsList
            initialItems={upsellItems}
            packageOptions={upsellPackageOptions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
