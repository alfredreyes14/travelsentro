"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { VoucherFormValues } from "@/components/admin/vouchers/voucher-form-schema";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong saving your changes. Please try again.";
const UNIQUE_VIOLATION = "23505";

function toPatch(values: VoucherFormValues) {
  return {
    type: values.type,
    partner_id: values.partnerId || null,
    title: values.title,
    value_label: values.valueLabel,
    code: values.code || null,
    contact_id: values.contactId || null,
    status: values.status,
    expires_at: values.expiresAt || null,
  };
}

export async function createVoucher(
  values: VoucherFormValues
): Promise<ActionResult & { id?: string }> {
  await requirePermission("can_manage_vouchers");

  const supabase = await createClient();

  const patch = toPatch(values);

  const { data: created, error } = await supabase
    .from("vouchers")
    .insert({
      ...patch,
      // A voucher created directly with status "redeemed" (e.g. backfilling
      // a paper record) should still get a redeemed_at timestamp -- there's
      // no prior row to preserve one from, unlike updateVoucher below.
      redeemed_at: values.status === "redeemed" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "A voucher with that code already exists.",
      };
    }
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/vouchers");
  return { ok: true, id: created.id };
}

/**
 * Read-modify-write (not a blind patch) so editing an already-redeemed
 * voucher's other fields never bumps its redeemed_at -- that timestamp is
 * only ever set the moment status first transitions into "redeemed".
 */
export async function updateVoucher(
  id: string,
  values: VoucherFormValues
): Promise<ActionResult> {
  await requirePermission("can_manage_vouchers");

  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from("vouchers")
    .select("status, redeemed_at")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const patch = toPatch(values);
  const redeemedAt =
    values.status === "redeemed"
      ? (current.redeemed_at ?? new Date().toISOString())
      : current.redeemed_at;

  const { error: updateError } = await supabase
    .from("vouchers")
    .update({ ...patch, redeemed_at: redeemedAt })
    .eq("id", id);

  if (updateError) {
    if (updateError.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "A voucher with that code already exists.",
      };
    }
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  revalidatePath("/admin/vouchers");
  return { ok: true };
}
