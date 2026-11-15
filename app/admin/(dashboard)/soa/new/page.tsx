import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { loadSoaFormOptions } from "@/lib/soa/soa-options";
import { PageHeader } from "@/components/admin/page-header";
import { PreviousSoaForm } from "@/components/admin/soa/previous-soa-form";
import { SoaForm } from "@/components/admin/soa/soa-form";
import {
  emptyPreviousSoaValues,
  emptySoaValues,
} from "@/components/admin/soa/soa-form-schema";

export const metadata: Metadata = {
  title: "New SOA | TravelSentro Admin",
};

/**
 * ?kind=previous opens the "previous SOA" form; ?contactId= presets the
 * linked contact (used by the contact page's buttons).
 */
export default async function NewSoaPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string; kind?: string }>;
}) {
  const profile = await requirePermissionOrRedirect("can_manage_quotes");
  const { contactId, kind } = await searchParams;
  const isPrevious = kind === "previous";

  const supabase = await createClient();
  const { contacts, vouchers, quotes, existingTags } = await loadSoaFormOptions(supabase);
  const canCreateContact = profile.role === "admin" || profile.can_edit_crm;

  // Only a contact that really exists is preset.
  const preset = contactId ? contacts.find((c) => c.id === contactId) : undefined;
  const presetFields = preset
    ? {
        contactId: preset.id,
        billToName: preset.name,
        billToDetails: [preset.email, preset.phone].filter(Boolean).join("\n"),
      }
    : {};

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isPrevious ? "Add Previous SOA" : "New Statement of Account"}
        description={
          isPrevious
            ? "Record an SOA issued before this system so its amount is on file. Attach the original if you have it."
            : "Add line items, discounts, vouchers and payments — the totals update as you type."
        }
      />

      {isPrevious ? (
        <PreviousSoaForm
          contacts={contacts}
          quotes={quotes}
          existingTags={existingTags}
          canCreateContact={canCreateContact}
          defaultValues={{ ...emptyPreviousSoaValues(), ...presetFields }}
        />
      ) : (
        <SoaForm
          contacts={contacts}
          quotes={quotes}
          vouchers={vouchers}
          existingTags={existingTags}
          canCreateContact={canCreateContact}
          defaultValues={{ ...emptySoaValues(), ...presetFields }}
        />
      )}
    </div>
  );
}
