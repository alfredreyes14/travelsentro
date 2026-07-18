import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PackageForm } from "@/components/admin/package-form";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import type { Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Edit Package | TravelSentro Admin",
};

type FaqFactsRow = Database["public"]["Tables"]["faq_facts"]["Row"];

type PackageDetail = Database["public"]["Tables"]["packages"]["Row"] & {
  itinerary_days: Database["public"]["Tables"]["itinerary_days"]["Row"][];
  package_inclusions: Database["public"]["Tables"]["package_inclusions"]["Row"][];
  // faq_facts is a to-one relation (isOneToOne: true), but defensively
  // handle either shape, same as app/(public)/packages/[slug]/page.tsx.
  faq_facts: FaqFactsRow | FaqFactsRow[] | null;
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
  await requirePermission("can_manage_packages");

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("packages")
    .select(
      `*,
      itinerary_days(id, day_number, title, description),
      package_inclusions(id, kind, label, sort_order),
      faq_facts(best_time_to_go, group_size)`
    )
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const pkg = data as PackageDetail;
  const faqFacts = Array.isArray(pkg.faq_facts)
    ? pkg.faq_facts[0]
    : pkg.faq_facts;

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

  const defaultValues: Partial<PackageFormValues> = {
    name: pkg.name,
    slug: pkg.slug,
    fromPrice: pkg.from_price,
    durationDays: pkg.duration_days,
    durationLabel: pkg.duration_label ?? "",
    itinerary,
    inclusions,
    exclusions,
    bringItems,
    bestTimeToGo: faqFacts?.best_time_to_go ?? "",
    groupSize: faqFacts?.group_size ?? "",
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          Edit Package
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          {pkg.name}
        </p>
      </div>

      <PackageForm packageId={pkg.id} defaultValues={defaultValues} />
    </div>
  );
}
