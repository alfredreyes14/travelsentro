"use server";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import {
  extractPosterData,
  POSTER_GENERIC_ERROR_MESSAGE,
} from "@/lib/packages/extract-poster";
import {
  mapPosterToFormValues,
  type UnmappedField,
} from "@/lib/packages/poster-mapping";

// Only async functions may be exported from a "use server" module. A type
// alias is erased at compile time, so this one is fine.
export type PosterExtractionResult = ActionResult & {
  values?: Partial<PackageFormValues>;
  unmapped?: UnmappedField[];
};

/**
 * Reads a marketing poster image and returns package form values plus the
 * fields the poster didn't supply. Writes nothing -- the caller fills the
 * in-memory form and the admin still saves through updatePackage.
 */
export async function extractPackageFromPoster(input: {
  base64: string;
  mimeType: string;
}): Promise<PosterExtractionResult> {
  // AUTH-05 — same gate as every other package write path.
  await requirePermission("can_manage_packages");

  const supabase = await createClient();
  const { data: destinationRows, error: destinationsError } = await supabase
    .from("destinations")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
    return { ok: false, error: POSTER_GENERIC_ERROR_MESSAGE };
  }

  const destinations = destinationRows ?? [];

  const extracted = await extractPosterData({
    ...input,
    destinationNames: destinations.map((d) => d.name),
  });
  if (!extracted.ok) return extracted;

  const { values, unmapped } = mapPosterToFormValues(extracted.data, destinations);
  return { ok: true, values, unmapped };
}
