import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { quoteRowToFormValues } from "@/lib/quotes/quote-row";
import { PageHeader } from "@/components/admin/page-header";
import { PosterImportProvider } from "@/components/admin/poster-import-context";
import { QuoteForm } from "@/components/admin/quote-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Edit Quote | TravelSentro Admin",
};

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionOrRedirect("can_manage_quotes");

  const { id } = await params;
  const supabase = await createClient();

  const [quoteResult, contactsResult] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).maybeSingle(),
    supabase.from("contacts").select("id, name, email").order("name"),
  ]);

  if (quoteResult.error) console.error("Failed to load quote:", quoteResult.error.message);
  if (!quoteResult.data) notFound();
  if (contactsResult.error) console.error("Failed to load contacts:", contactsResult.error.message);

  const quote = quoteResult.data;
  // Throws on malformed stored jsonb -> the admin error boundary, never a
  // half-filled form (Review Focus #2).
  const defaultValues = quoteRowToFormValues(quote);

  return (
    // QuoteForm's useFormImport needs the provider even though nothing on
    // this page imports.
    <PosterImportProvider>
      <div className="flex flex-col gap-6">
        <PageHeader title={`Quote ${quote.quote_no}`} description={quote.title}>
          <Button
            variant="outline"
            size="lg"
            render={<a href={`/admin/quotes/${quote.id}/pdf`} download />}
          >
            Download PDF
          </Button>
        </PageHeader>

        <QuoteForm
          quoteId={quote.id}
          defaultValues={defaultValues}
          contacts={contactsResult.data ?? []}
        />
      </div>
    </PosterImportProvider>
  );
}
