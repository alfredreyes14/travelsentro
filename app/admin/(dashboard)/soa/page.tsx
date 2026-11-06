import type { Metadata } from "next";
import Link from "next/link";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { soaRowToFormValues } from "@/lib/soa/soa-row";
import { computeSoaTotals } from "@/lib/soa/totals";
import { PageHeader } from "@/components/admin/page-header";
import { SoaTable, type SoaListItem } from "@/components/admin/soa/soa-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Statements of Account | TravelSentro Admin",
};

export default async function AdminSoaPage() {
  // Gate independent of nav hiding; RLS is the second layer.
  await requirePermissionOrRedirect("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("statements")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) console.error("Failed to load statements:", error.message);

  const statements: SoaListItem[] = (data ?? []).flatMap((row) => {
    try {
      const totals = computeSoaTotals(soaRowToFormValues(row));
      return [
        {
          id: row.id,
          soaNo: row.soa_no,
          billToName: row.bill_to_name,
          issueDate: row.issue_date,
          total: totals.total,
          balance: totals.balance,
        },
      ];
    } catch (err) {
      // One malformed row shouldn't take down the whole list.
      console.error(`Statement ${row.soa_no} has malformed content:`, err);
      return [];
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Statements of Account"
        description="Bill a customer with any line items, discounts, vouchers and payments, then download it as a PDF."
      >
        <Button size="lg" render={<Link href="/admin/soa/new" />}>
          New SOA
        </Button>
      </PageHeader>

      <SoaTable statements={statements} />
    </div>
  );
}
