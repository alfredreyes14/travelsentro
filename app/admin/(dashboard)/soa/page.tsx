import type { Metadata } from "next";
import Link from "next/link";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { toSoaKind } from "@/lib/soa/soa-row";
import { formatPeso } from "@/lib/soa/totals";
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
    .select(
      "id, soa_no, kind, original_no, bill_to_name, issue_date, total_amount, amount_paid, balance, contacts(id, name, client_type)"
    )
    .order("issue_date", { ascending: false })
    .order("soa_no", { ascending: false });

  if (error) console.error("Failed to load statements:", error.message);

  // The embedded contact is a to-one join; the generated types model it as
  // an array, so cast (same approach as the quotes page).
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    soa_no: string;
    kind: string;
    original_no: string | null;
    bill_to_name: string;
    issue_date: string;
    total_amount: number;
    amount_paid: number;
    balance: number;
    contacts: { id: string; name: string; client_type: string } | null;
  }>;

  const statements: SoaListItem[] = rows.map((row) => ({
    id: row.id,
    soaNo: row.soa_no,
    kind: toSoaKind(row.kind),
    originalNo: row.original_no,
    billToName: row.bill_to_name,
    contact: row.contacts
      ? { id: row.contacts.id, name: row.contacts.name, clientType: row.contacts.client_type }
      : null,
    issueDate: row.issue_date,
    total: Number(row.total_amount),
    paid: Number(row.amount_paid),
    balance: Number(row.balance),
  }));

  const billed = statements.reduce((sum, s) => sum + s.total, 0);
  const collected = statements.reduce((sum, s) => sum + s.paid, 0);
  const outstanding = statements.reduce((sum, s) => sum + Math.max(s.balance, 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Statements of Account"
        description="Bill a customer with any line items, discounts, vouchers and payments — or record an SOA issued before this system."
      >
        <div className="flex flex-wrap gap-3">
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/admin/soa/new?kind=previous" />}>
            Add Previous SOA
          </Button>
          <Button size="lg" nativeButton={false} render={<Link href="/admin/soa/new" />}>
            New SOA
          </Button>
        </div>
      </PageHeader>

      {statements.length > 0 ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["Total billed", billed],
            ["Collected", collected],
            ["Outstanding", outstanding],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-heading text-[22px] font-semibold tabular-nums">
                {formatPeso(value as number)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <SoaTable statements={statements} />
    </div>
  );
}
