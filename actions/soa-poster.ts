"use server";

import { requireModule } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/action-result";
import { extractPosterData } from "@/lib/packages/extract-poster";
import { mapPosterToSoaLineItems, type SoaPosterLineItem } from "@/lib/soa/poster-mapping";

export type SoaPosterResult = ActionResult & { lineItems?: SoaPosterLineItem[] };

/**
 * Reads a flyer image into SOA line items. Writes nothing -- the items are
 * added to the in-memory form and saved through createSoa / updateSoa.
 */
export async function extractSoaLineItemsFromPoster(input: {
  base64: string;
  mimeType: string;
}): Promise<SoaPosterResult> {
  await requireModule("soa", ["create", "update"]);

  const extracted = await extractPosterData({ ...input, destinationNames: [] });
  if (!extracted.ok) return extracted;

  return { ok: true, lineItems: mapPosterToSoaLineItems(extracted.data) };
}
