import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { PartnersList } from "@/components/admin/partners/partners-list";
import type { PartnerRecord } from "@/components/admin/partners/partner-form";
import {
  PARTNER_TYPE_LABELS,
  type PartnerType,
} from "@/lib/partners/partner-type";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export const metadata: Metadata = {
  title: "Partners | TravelSentro Admin",
};

export default async function AdminPartnersPage() {
  // AUTH-05 -- gate independent of nav hiding; RLS is the second,
  // independent enforcement layer (mirrors every other admin page). Reuses
  // can_manage_packages, the same permission that gates /admin/content.
  await requirePermissionOrRedirect("can_manage_packages");

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("partners")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to load partners:", error.message);
  }

  function recordsOf(partnerType: PartnerType): PartnerRecord[] {
    return (rows ?? [])
      .filter((row) => row.partner_type === partnerType)
      .map((row) => ({
        id: row.id,
        name: row.name,
        logoStoragePath: row.logo_storage_path,
        linkUrl: row.link_url,
        isPublished: row.is_published,
      }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Partners"
        description="Manage the Brand Partners and Corporate Clients logos shown on the homepage, and where each one links."
      />

      <Tabs defaultValue="brand_partner">
        <TabsList>
          <TabsTrigger value="brand_partner">
            {PARTNER_TYPE_LABELS.brand_partner.plural}
          </TabsTrigger>
          <TabsTrigger value="corporate_client">
            {PARTNER_TYPE_LABELS.corporate_client.plural}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brand_partner" keepMounted className="pt-4">
          <PartnersList
            partnerType="brand_partner"
            initialItems={recordsOf("brand_partner")}
          />
        </TabsContent>

        <TabsContent value="corporate_client" keepMounted className="pt-4">
          <PartnersList
            partnerType="corporate_client"
            initialItems={recordsOf("corporate_client")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
