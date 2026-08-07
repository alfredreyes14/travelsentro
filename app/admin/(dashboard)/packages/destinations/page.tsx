import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  DestinationsList,
  type DestinationListItem,
} from "@/components/admin/content/destinations-list";
import { PageHeader } from "@/components/admin/page-header";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Destinations | TravelSentro Admin",
};

type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];

export default async function AdminDestinationsPage() {
  // AUTH-05 — gate independent of nav hiding; RLS is the second,
  // independent enforcement layer (mirrors every other admin page).
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  // Admin must see inactive destinations too, unlike the public homepage
  // query (is_active = true) -- no filter here, "manage_packages can read
  // all destinations" RLS policy covers it.
  const { data: destinationRows, error } = await supabase
    .from("destinations")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load destinations:", error.message);
  }

  const destinations: DestinationListItem[] = (
    (destinationRows ?? []) as DestinationRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    region: row.region as "local" | "international",
    photoStoragePath: row.photo_storage_path,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    photoUrl: row.photo_storage_path
      ? supabase.storage
          .from("site-content")
          .getPublicUrl(row.photo_storage_path).data.publicUrl
      : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Destinations"
        description="Manage the Local/International destinations shown on the homepage and available when linking a package. A destination can't be disabled or deleted while an active package still uses it."
      />

      <DestinationsList initialDestinations={destinations} />
    </div>
  );
}
