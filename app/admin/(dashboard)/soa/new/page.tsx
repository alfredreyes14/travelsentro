import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { loadSoaFormOptions } from "@/lib/soa/soa-options";
import { PageHeader } from "@/components/admin/page-header";
import { SoaForm } from "@/components/admin/soa/soa-form";
import { emptySoaValues } from "@/components/admin/soa/soa-form-schema";

export const metadata: Metadata = {
  title: "New SOA | TravelSentro Admin",
};

export default async function NewSoaPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  await requirePermissionOrRedirect("can_manage_quotes");
  const { contactId } = await searchParams;

  const supabase = await createClient();
  const { contacts, vouchers } = await loadSoaFormOptions(supabase);

  // Only a contact that really exists is preset.
  const preset = contactId ? contacts.find((c) => c.id === contactId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New Statement of Account"
        description="Add line items, discounts, vouchers and payments — the totals update as you type."
      />

      <SoaForm
        contacts={contacts}
        vouchers={vouchers}
        defaultValues={
          preset
            ? {
                ...emptySoaValues(),
                contactId: preset.id,
                billToName: preset.name,
                billToDetails: [preset.email, preset.phone].filter(Boolean).join("\n"),
              }
            : undefined
        }
      />
    </div>
  );
}
