import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { packageRowToContentValues } from "@/lib/packages/package-content";
import { PackageForm } from "@/components/admin/package-form";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/page-header";
import { PosterImportProvider } from "@/components/admin/poster-import-context";
import { PosterImportButton } from "@/components/admin/poster-import-button";
import { PosterImportBanner } from "@/components/admin/poster-import-banner";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Edit Package | TravelSentro Admin",
};

// A Server Action inherits the route segment config of the page it's
// invoked from. extractPackageFromPoster (actions/package-poster.ts) calls
// the Anthropic API with a 60s client timeout and up to 1 retry, so this
// caps the whole request at 2 minutes instead of the platform default.
export const maxDuration = 120;

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
          package_travel_dates(id, travel_date_from, travel_date_to, additional_fee),
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

  // createDraftPackage inserts with destination_id unset, and updatePackage
  // can't succeed without one (packageFormSchema requires destinationId).
  // So a null destination means this package has never been saved -- i.e.
  // the admin is still adding it, which is the only time poster import is
  // offered.
  const isUnsavedDraft = pkg.destination_id === null;

  const defaultValues: Partial<PackageFormValues> = {
    ...packageRowToContentValues(pkg),
    name: pkg.name,
    destinationId: pkg.destination_id ?? "",
    // An unsaved draft can't be published/featured (the form disables both
    // switches until the first save), so always start it from off --
    // otherwise a draft flagged before this rule existed would show a
    // locked-on switch and its first save would be rejected.
    isPublished: isUnsavedDraft ? false : pkg.is_published,
    isFeatured: isUnsavedDraft ? false : pkg.is_featured,
  };

  return (
    <PosterImportProvider>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={isUnsavedDraft ? "Add Package" : "Edit Package"}
          description={`${pkg.name} · ${pkg.slug}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            {isUnsavedDraft ? <PosterImportButton /> : null}
            <Button
              variant="outline"
              size="lg"
              render={<a href={`/admin/packages/${pkg.id}/pdf`} download />}
            >
              Download Full Itinerary
            </Button>
          </div>
        </PageHeader>

        <PosterImportBanner />

        <PackageForm
          packageId={pkg.id}
          defaultValues={defaultValues}
          initialPhotos={photos}
          destinations={destinationOptions}
          isUnsavedDraft={isUnsavedDraft}
        />
      </div>
    </PosterImportProvider>
  );
}
