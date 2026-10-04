import type { Metadata } from "next";
import Link from "next/link";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/page-header";
import { QuoteTable, type QuoteListItem } from "@/components/admin/quote-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Quotes | TravelSentro Admin",
};

export default async function AdminQuotesPage() {
  // AUTH-05 — gate independent of nav hiding; RLS is the second layer.
  await requirePermissionOrRedirect("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_no, title, customer_name, updated_at, contacts(name)")
    .order("updated_at", { ascending: false });

  if (error) console.error("Failed to load quotes:", error.message);

  // The embedded contact is a to-one join; the generated types model it as an
  // array, so cast (same approach as the vouchers page).
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    quote_no: string;
    title: string;
    customer_name: string | null;
    updated_at: string;
    contacts: { name: string } | null;
  }>;
  const quotes: QuoteListItem[] = rows.map((row) => ({
    id: row.id,
    quoteNo: row.quote_no,
    title: row.title,
    customerLabel: row.customer_name ?? row.contacts?.name ?? null,
    updatedAt: row.updated_at,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quotes"
        description="Build a customer quote by hand, from a flyer, or by copying a package, then download it as a PDF."
      >
        <Button size="lg" render={<Link href="/admin/quotes/new" />}>
          New Quote
        </Button>
      </PageHeader>

      <QuoteTable quotes={quotes} />
    </div>
  );
}
