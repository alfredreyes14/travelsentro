import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PackageCard } from "@/components/packages/package-card";
import type { Database } from "@/types/database";

type PackageRow = Database["public"]["Tables"]["packages"]["Row"];

/**
 * Homepage "Featured Packages" grid — pure prop-driven, zero Supabase
 * awareness. Reuses the existing PackageCard component unchanged (zero
 * new card markup, zero new curation mechanism beyond the already-shaped
 * `items` prop). Returns null on an empty array per UI-SPEC's public
 * homepage empty-state rule.
 */
export function FeaturedPackagesGrid({
  items,
}: {
  items: { pkg: PackageRow; photoUrl: string | null }[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:px-8">
      <h2 className="font-heading text-[28px] leading-[1.2] font-semibold">
        Featured Packages
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <PackageCard key={item.pkg.id} pkg={item.pkg} photoUrl={item.photoUrl} />
        ))}
      </div>
      <div>
        <Button
          render={<Link href="/packages" />}
          nativeButton={false}
          variant="outline"
          size="lg"
        >
          View All Packages
        </Button>
      </div>
    </section>
  );
}
