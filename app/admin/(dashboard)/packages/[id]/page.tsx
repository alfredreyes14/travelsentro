import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "@/components/admin/package-form";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Edit Package | TravelSentro Admin",
};

type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Database["public"]["Tables"]["package_photos"]["Row"][];
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  package_travel_dates: Database["public"]["Tables"]["package_travel_dates"]["Row"][];
  destinations: Pick<
    Database["public"]["Tables"]["destinations"]["Row"],
    "id" | "name"
  > | null;
};

/**
 * Admin edit page (PKG-01/02). Fetches by id, NOT slug, and with no
 * published filter — an Admin/Staff with can_manage_packages must be able
 * to open and edit an unpublished draft, unlike the public detail page.
 */
export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-18).
  await requirePermissionOrRedirect("can_manage_packages");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data, error }, { data: activeDestinationRows, error: destinationsError }] =
    await Promise.all([
      supabase
        .from("packages")
        .select(
          `*,
          package_photos(id, storage_path, display_order, alt_text),
          itinerary_days(id, day_number, title, description),
          package_inclusions(id, kind, label, sort_order),
          package_travel_dates(id, travel_date, additional_fee),
          destinations(id, name)`
        )
        .eq("id", id)
        .single(),
      supabase
        .from("destinations")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  if (error || !data) notFound();
  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
  }

  const pkg = data as PackageDetail;

  const itinerary = [...pkg.itinerary_days]
    .sort((a, b) => a.day_number - b.day_number)
    .map((day) => ({ title: day.title, description: day.description }));

  const inclusions = pkg.package_inclusions
    .filter((item) => item.kind === "included")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));
  const exclusions = pkg.package_inclusions
    .filter((item) => item.kind === "excluded")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));
  const bringItems = pkg.package_inclusions
    .filter((item) => item.kind === "bring")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({ label: item.label }));

  const travelDates = [...pkg.package_travel_dates]
    .sort((a, b) => a.travel_date.localeCompare(b.travel_date))
    .map((date) => ({
      date: date.travel_date,
      additionalFee: date.additional_fee ?? undefined,
    }));

  const photos = pkg.package_photos.map((photo) => ({
    id: photo.id,
    storagePath: photo.storage_path,
    displayOrder: photo.display_order,
    altText: photo.alt_text,
  }));

  // A package's previously-assigned destination may have since been
  // disabled -- if so it won't be in activeDestinationRows, and the Select
  // would silently show blank instead of the actual saved value. Add it
  // back in so the form always shows what's really saved.
  const activeDestinations = activeDestinationRows ?? [];
  const currentDestination = pkg.destinations;
  const destinationOptions =
    currentDestination &&
    !activeDestinations.some((d) => d.id === currentDestination.id)
      ? [...activeDestinations, currentDestination]
      : activeDestinations;

  const defaultValues: Partial<PackageFormValues> = {
    name: pkg.name,
    pricePerPax: pkg.price_per_pax,
    discountAmount: pkg.discount_amount ?? undefined,
    durationLabel: pkg.duration_label ?? "",
    destinationId: pkg.destination_id ?? "",
    remarks: pkg.remarks ?? "",
    travelDates,
    itinerary,
    inclusions,
    exclusions,
    bringItems,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Edit Package
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          {pkg.name} · {pkg.slug}
        </p>
      </div>

      <PackageForm
        packageId={pkg.id}
        defaultValues={defaultValues}
        initialPhotos={photos}
        destinations={destinationOptions}
      />
    </div>
  );
}
