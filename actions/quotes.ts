"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import {
  quoteFormSchema,
  type QuoteFormValues,
} from "@/components/admin/quote-form-schema";
import { quoteValuesToRow, type QuoteSource } from "@/lib/quotes/quote-row";
import { packageRowToContentValues } from "@/lib/packages/package-content";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
const INVALID_MESSAGE =
  "Some fields are invalid. Please review the form and try again.";

/**
 * Inserts a new quote. quote_no and created_by are assigned by the
 * database (trigger / auth.uid() default), never sent from here.
 */
export async function createQuote(
  values: QuoteFormValues,
  origin: { source: QuoteSource; sourcePackageId: string | null }
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_quotes");

  const parsed = quoteFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      ...quoteValuesToRow(parsed.data),
      source: origin.source,
      source_package_id:
        origin.source === "package" ? origin.sourcePackageId : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createQuote failed:", error?.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/quotes");
  return { ok: true, id: data.id };
}

/** Overwrites a quote's form-owned columns; source/quote_no never change. */
export async function updateQuote(
  id: string,
  values: QuoteFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const parsed = quoteFormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({
      ...quoteValuesToRow(parsed.data),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("updateQuote failed:", error.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "That quote no longer exists." };
  }

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${id}`);
  return { ok: true };
}

export async function deleteQuote(id: string): Promise<ActionResult> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id);

  if (error) {
    console.error("deleteQuote failed:", error.message);
    return { ok: false, error: "Something went wrong deleting that quote. Please try again." };
  }

  revalidatePath("/admin/quotes");
  return { ok: true };
}

/**
 * A published package's content as quote form values, for "Copy from a
 * package". Reads through the caller's client: published packages and their
 * child rows are publicly readable, so this works for staff who have
 * can_manage_quotes but not can_manage_packages.
 */
export async function getPackageQuoteValues(
  packageId: string
): Promise<ActionResult & { values?: Partial<QuoteFormValues> }> {
  await requirePermission("can_manage_quotes");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .select(
      `name, price_per_pax, discount_amount, duration_label, remarks,
      itinerary_days(day_number, title, description),
      package_inclusions(kind, label, sort_order),
      package_travel_dates(travel_date_from, travel_date_to, additional_fee)`
    )
    .eq("id", packageId)
    .eq("is_published", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("getPackageQuoteValues failed:", error.message);
    return { ok: false, error: "Couldn't load that package. Please try again." };
  }
  if (!data) {
    return { ok: false, error: "That package isn't available anymore." };
  }

  return {
    ok: true,
    values: { title: data.name, ...packageRowToContentValues(data) },
  };
}
