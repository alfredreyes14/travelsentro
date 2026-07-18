import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
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

export default async function PackagesPage() {
  const supabase = await createClient();

  const { data: packages, error } = await supabase
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
          Tour Packages
        </h1>
        <p className="max-w-xl text-base leading-[1.5] text-muted-foreground">
          Browse our tour packages and reach out on WhatsApp or Facebook to
          start planning your trip.
        </p>
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
              ? supabase.storage
                  .from("package-photos")
                  .getPublicUrl(firstPhoto.storage_path).data.publicUrl
              : null;

            return <PackageCard key={pkg.id} pkg={pkg} photoUrl={photoUrl} />;
          })}
        </div>
      )}
    </div>
  );
}
