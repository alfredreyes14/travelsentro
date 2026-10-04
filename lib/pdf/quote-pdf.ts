import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItineraryPdfData } from "@/lib/pdf/itinerary-pdf";
import { quoteRowToFormValues, toItineraryContent } from "@/lib/quotes/quote-row";
import type { Database, Tables } from "@/types/database";

/**
 * Fetches one quote by id through the caller's client -- RLS
 * (can_manage_quotes) decides visibility, so an unauthorized caller simply
 * gets null.
 */
export async function fetchQuoteForPdf(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<Tables<"quotes"> | null> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("fetchQuoteForPdf failed:", error);
    return null;
  }
  return data;
}

/**
 * Quote row -> the shared itinerary PDF input. Throws (via
 * quoteRowToFormValues) if the stored jsonb is malformed; the route turns
 * that into a logged 500.
 */
export function quoteToPdfData(quote: Tables<"quotes">): ItineraryPdfData {
  const values = quoteRowToFormValues(quote);
  return { title: values.title, content: toItineraryContent(values) };
}
