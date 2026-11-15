import type { SupabaseClient } from "@supabase/supabase-js";

/** Resend's free tier: 100 emails per rolling 24 hours, across all sends. */
export const DAILY_EMAIL_LIMIT = 100;

/**
 * Emails left in the rolling 24h window (Resend enforces a rolling window,
 * not a calendar day). Counts every logged email message, sent or failed.
 */
export async function remainingEmailQuota(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return Math.max(0, DAILY_EMAIL_LIMIT - (count ?? 0));
}
