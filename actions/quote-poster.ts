"use server";

import { requirePermission } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/action-result";
import type { QuoteFormValues } from "@/components/admin/quote-form-schema";
import { extractPosterData } from "@/lib/packages/extract-poster";
import type { UnmappedField } from "@/lib/packages/poster-mapping";
import { mapPosterToQuoteValues } from "@/lib/quotes/poster-mapping";

export type QuotePosterResult = ActionResult & {
  values?: Partial<QuoteFormValues>;
  unmapped?: UnmappedField[];
};

/**
 * Reads a flyer image into quote form values. Writes nothing -- the admin
 * reviews the in-memory form and saves through createQuote. Quotes have no
 * destination, so no destination list is sent to the model.
 */
export async function extractQuoteFromPoster(input: {
  base64: string;
  mimeType: string;
}): Promise<QuotePosterResult> {
  await requirePermission("can_manage_quotes");

  const extracted = await extractPosterData({ ...input, destinationNames: [] });
  if (!extracted.ok) return extracted;

  const { values, unmapped } = mapPosterToQuoteValues(extracted.data);
  return { ok: true, values, unmapped };
}
