import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { PackageCard } from "@/components/packages/package-card";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Tour Packages | TravelSentro",
  description:
    "Browse TravelSentro's tour packages across the Philippines and reach out on WhatsApp or Facebook to start planning your trip.",
};

type PackageWithPhotos = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Pick<
    Database["public"]["Tables"]["package_photos"]["Row"],
    "storage_path" | "display_order"
  >[];
};

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const { destination: destinationSlug } = await searchParams;
  const supabase = await createClient();

  // Looked up separately (not derived from the packages join below) so the
  // heading still shows a real destination name even when zero packages
  // match -- an inner-joined query returns zero rows in that case, which
  // would otherwise leave destinationName with nothing to read from.
  let destinationName: string | null = null;
  if (destinationSlug) {
    const { data: destinationRow } = await supabase
      .from("destinations")
      .select("name")
      .eq("slug", destinationSlug)
      .eq("is_active", true)
      .maybeSingle();
    destinationName = destinationRow?.name ?? destinationSlug;
  }

  // destinations!inner is required, not the default to-one embed --
  // PostgREST only restricts which *parent* rows come back when the
  // embedded relation is an inner join; without !inner, .eq() on the
  // embedded column just nulls out non-matching embeds instead of
  // filtering the packages themselves.
  //
  // .eq("destinations.is_active", true) is kept here even though RLS also
  // scopes anonymous visitors to is_active = true destinations, because RLS
  // grants authenticated can_manage_packages users read access to ALL
  // destinations -- without this query-layer filter, an admin browsing this
  // nominally public page would see packages for an inactive destination
  // that an anonymous visitor cannot, diverging from the destinationName
  // lookup above (which already filters is_active = true). Same
  // belt-and-suspenders reasoning as app/(public)/page.tsx's destinations
  // query.
  const { data: packages, error } = destinationSlug
    ? await supabase
        .from("packages")
        .select(
          "*, package_photos(storage_path, display_order), destinations!inner(slug, name)"
        )
        .eq("is_published", true)
        .eq("destinations.slug", destinationSlug)
        .eq("destinations.is_active", true)
        .order("sort_order", { ascending: true })
    : await supabase
        .from("packages")
        .select("*, package_photos(storage_path, display_order)")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });

  if (error) {
    // Surfaced server-side only — the page still renders the empty state
    // below rather than crashing the whole route on a transient DB error.
    console.error("Failed to load packages:", error.message);
  }

  const rows = (packages ?? []) as PackageWithPhotos[];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          {destinationName ? `Packages in ${destinationName}` : "Tour Packages"}
        </h1>
        <p className="max-w-xl text-base leading-[1.5] text-muted-foreground">
          Browse our tour packages and reach out on WhatsApp or Facebook to
          start planning your trip.
        </p>
        {destinationName ? (
          <Link
            href="/packages"
            className="w-fit text-sm text-primary underline underline-offset-2"
          >
            Clear filter
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No packages available right now
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Check back soon, or reach out to us directly on WhatsApp or
            Facebook — we&apos;re happy to help you plan your trip.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((pkg) => {
            const [firstPhoto] = [...pkg.package_photos].sort(
              (a, b) => a.display_order - b.display_order
            );
            const photoUrl = firstPhoto
              ? getPublicImageUrl(firstPhoto.storage_path)
              : null;

            return <PackageCard key={pkg.id} pkg={pkg} photoUrl={photoUrl} />;
          })}
        </div>
      )}
    </div>
  );
}
