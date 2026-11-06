import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { loadSoaFormOptions } from "@/lib/soa/soa-options";
import { soaRowToFormValues } from "@/lib/soa/soa-row";
import { PageHeader } from "@/components/admin/page-header";
import { SoaForm } from "@/components/admin/soa/soa-form";

export const metadata: Metadata = {
  title: "Edit SOA | TravelSentro Admin",
};

export default async function EditSoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const supabase = await createClient();

  const [soaResult, options] = await Promise.all([
    supabase.from("statements").select("*").eq("id", id).maybeSingle(),
    loadSoaFormOptions(supabase),
  ]);

  if (soaResult.error) console.error("Failed to load statement:", soaResult.error.message);
  if (!soaResult.data) notFound();

  const soa = soaResult.data;
  // Throws on malformed stored jsonb -> the admin error boundary, never a
  // half-filled form.
  const defaultValues = soaRowToFormValues(soa);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`SOA ${soa.soa_no}`} description={soa.bill_to_name} />

      <SoaForm
        soaId={soa.id}
        defaultValues={defaultValues}
        contacts={options.contacts}
        vouchers={options.vouchers}
      />
    </div>
  );
}
