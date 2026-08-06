import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { PackageForm } from "@/components/admin/package-form";

export const metadata: Metadata = {
  title: "New Package | TravelSentro Admin",
};

export default async function NewPackagePage() {
  // AUTH-05 — gate independent of D-13's nav hiding; RLS (02-01) is the
  // second independent layer (T-02-18).
  await requirePermissionOrRedirect("can_manage_packages");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-[28px] leading-[1.2] font-semibold">
          New Package
        </h1>
        <p className="text-base leading-[1.5] text-muted-foreground">
          Create a new tour package. It starts as an unpublished draft until
          you publish it from the package list.
        </p>
      </div>

      <PackageForm />
    </div>
  );
}
