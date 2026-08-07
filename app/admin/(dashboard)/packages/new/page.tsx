import { redirect } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createDraftPackage } from "@/actions/packages";

/**
 * Creates a minimal draft package immediately and redirects straight to its
 * edit page — there is no standalone create form anymore. Every package
 * gets a real id (and a usable Photos tab) from the moment "Add Package" is
 * clicked, so the rest of the flow lives entirely in
 * app/admin/(dashboard)/packages/[id]/page.tsx.
 */
export default async function NewPackagePage() {
  await requirePermissionOrRedirect("can_manage_packages");

  const result = await createDraftPackage();
  if (!result.ok || !result.id) {
    throw new Error(result.ok ? "Missing package id" : result.error);
  }

  redirect(`/admin/packages/${result.id}`);
}
