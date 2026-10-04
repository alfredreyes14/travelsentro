import type { Metadata } from "next";

import { requirePermissionOrRedirect } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { extractQuoteFromPoster } from "@/actions/quote-poster";
import { PageHeader } from "@/components/admin/page-header";
import { PosterImportProvider } from "@/components/admin/poster-import-context";
import { PosterImportButton } from "@/components/admin/poster-import-button";
import { PosterImportBanner } from "@/components/admin/poster-import-banner";
import { QuoteForm } from "@/components/admin/quote-form";
import { QuotePackagePicker } from "@/components/admin/quote-package-picker";

export const metadata: Metadata = {
  title: "New Quote | TravelSentro Admin",
};

// extractQuoteFromPoster inherits this page's segment config; same 2-minute
// cap as the package edit page (60s client timeout + 1 retry).
export const maxDuration = 120;

export default async function NewQuotePage() {
  await requirePermissionOrRedirect("can_manage_quotes");

  const supabase = await createClient();
  const [contactsResult, packagesResult] = await Promise.all([
    supabase.from("contacts").select("id, name, email").order("name"),
    supabase
      .from("packages")
      .select("id, name, slug")
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  if (contactsResult.error) console.error("Failed to load contacts:", contactsResult.error.message);
  if (packagesResult.error) console.error("Failed to load packages:", packagesResult.error.message);

  return (
    <PosterImportProvider>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="New Quote"
          description="Start blank, import a flyer, or copy a published package — then adjust and save."
        >
          <div className="flex flex-wrap items-center gap-3">
            <QuotePackagePicker packages={packagesResult.data ?? []} />
            <PosterImportButton
              extract={extractQuoteFromPoster}
              noun="flyer"
              label="Import from Flyer"
            />
          </div>
        </PageHeader>

        <PosterImportBanner />

        <QuoteForm contacts={contactsResult.data ?? []} />
      </div>
    </PosterImportProvider>
  );
}
