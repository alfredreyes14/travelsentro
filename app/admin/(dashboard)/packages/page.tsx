import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createDraftPackage } from "@/actions/packages";
import { SortablePackageList } from "@/components/admin/sortable-package-list";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Packages | TravelSentro Admin",
};

type PackageWithPhotos = Database["public"]["Tables"]["packages"]["Row"] & {
  package_photos: Pick<
    Database["public"]["Tables"]["package_photos"]["Row"],
    "storage_path" | "display_order"
  >[];
};

export type AdminPackageListItem = {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
  photoUrl: string | null;
};

export default async function AdminPackagesPage() {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer.
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  // Admin must see drafts too, so no `is_published` filter here — only
  // exclude soft-deleted rows (Pitfall 4 / D-09).
  const { data: packages, error } = await supabase
    .from("packages")
    .select("*, package_photos(storage_path, display_order)")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load packages:", error.message);
  }

  const rows = (packages ?? []) as PackageWithPhotos[];

  const items: AdminPackageListItem[] = rows.map((pkg) => {
    const [firstPhoto] = [...pkg.package_photos].sort(
      (a, b) => a.display_order - b.display_order
    );
    const photoUrl = firstPhoto
      ? supabase.storage
          .from("package-photos")
          .getPublicUrl(firstPhoto.storage_path).data.publicUrl
      : null;

    return {
      id: pkg.id,
      slug: pkg.slug,
      name: pkg.name,
      isPublished: pkg.is_published,
      isFeatured: pkg.is_featured,
      sortOrder: pkg.sort_order,
      photoUrl,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Packages"
        description="Drag to reorder, and toggle Published/Featured — changes go live on the public site immediately."
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
        <SortablePackageList initialItems={items} />
      )}
    </div>
  );
}
