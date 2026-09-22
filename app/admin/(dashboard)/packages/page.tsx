import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getPublicImageUrl } from "@/lib/storage/image-url";
import { createDraftPackage } from "@/actions/packages";
import { PackageTable } from "@/components/admin/package-table";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Packages | TravelSentro Admin",
};

type PackageWithRelations = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Pick<
    Database["public"]["Tables"]["package_photos"]["Row"],
    "storage_path" | "display_order"
  >[];
  destinations: Pick<
    Database["public"]["Tables"]["destinations"]["Row"],
    "name" | "slug"
  > | null;
  package_travel_dates: Pick<
    Database["public"]["Tables"]["package_travel_dates"]["Row"],
    "travel_date_from" | "travel_date_to"
  >[];
};

export type AdminPackageTravelDate = { from: string; to: string };

export type AdminPackageDestinationOption = { id: string; name: string };

export type AdminPackageListItem = {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  isFeatured: boolean;
  destinationName: string | null;
  /** Sorted ascending by `from`; drives the travel-date range filter. */
  travelDates: AdminPackageTravelDate[];
  /** Pre-formatted summary of `travelDates` for display. */
  travelWindowLabel: string;
  createdAt: string;
  photoUrl: string | null;
};

/** Parses a "YYYY-MM-DD" string as a local date (no UTC offset drift). */
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Renders the earliest travel window (dates arrive pre-sorted by `from`),
 * with a "+N more" suffix when a package has additional dates.
 */
function formatTravelWindow(dates: AdminPackageTravelDate[]): string {
  if (dates.length === 0) return "—";
  const [first] = dates;
  const fmt = (value: string) =>
    parseDateOnly(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const label =
    first.from === first.to
      ? fmt(first.from)
      : `${fmt(first.from)} – ${fmt(first.to)}`;
  return dates.length > 1 ? `${label} +${dates.length - 1} more` : label;
}

export default async function AdminPackagesPage() {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer.
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  // Admin must see drafts too, so no `is_published` filter here — only
  // exclude soft-deleted rows (Pitfall 4 / D-09). The client table handles
  // search / filter / sort / pagination, so this just needs newest-first as
  // a stable default order.
  const { data: packages, error } = await supabase
    .from("packages")
    .select(
      "*, package_photos(storage_path, display_order), destinations(name, slug), package_travel_dates(travel_date_from, travel_date_to)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load packages:", error.message);
  }

  // Every destination in the DB is offered in the filter, not just those
  // currently attached to a package. RLS grants can_manage_packages users
  // read access to all destinations (active or not).
  const { data: destinationRows, error: destinationsError } = await supabase
    .from("destinations")
    .select("id, name")
    .order("name", { ascending: true });

  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
  }

  // Embedded select — `as unknown as` is this codebase's convention for
  // casting PostgREST embed results (see app/(public)/packages/page.tsx).
  const rows = (packages ?? []) as unknown as PackageWithRelations[];

  const items: AdminPackageListItem[] = rows.map((pkg) => {
    const [firstPhoto] = [...pkg.package_photos].sort(
      (a, b) => a.display_order - b.display_order
    );
    const photoUrl = firstPhoto
      ? getPublicImageUrl(firstPhoto.storage_path)
      : null;

    const travelDates: AdminPackageTravelDate[] = pkg.package_travel_dates
      .map((d) => ({ from: d.travel_date_from, to: d.travel_date_to }))
      .sort((a, b) => a.from.localeCompare(b.from));

    return {
      id: pkg.id,
      slug: pkg.slug,
      name: pkg.name,
      isPublished: pkg.is_published,
      isFeatured: pkg.is_featured,
      destinationName: pkg.destinations?.name ?? null,
      travelDates,
      travelWindowLabel: formatTravelWindow(travelDates),
      createdAt: pkg.created_at,
      photoUrl,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Packages"
        description="Toggle Published/Featured — changes go live on the public site immediately."
      >
        <form action={createDraftPackage}>
          <Button type="submit" size="lg">
            Add Package
          </Button>
        </form>
      </PageHeader>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-[20px] leading-[1.2] font-semibold">
            No packages yet
          </h2>
          <p className="text-base leading-[1.5] text-muted-foreground">
            Create your first tour package to get it live on the public site.
          </p>
          <form action={createDraftPackage}>
            <Button type="submit">Add Package</Button>
          </form>
        </div>
      ) : (
        <PackageTable
          items={items}
          destinations={
            (destinationRows ?? []) as AdminPackageDestinationOption[]
          }
        />
      )}
    </div>
  );
}
