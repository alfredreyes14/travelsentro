import type { ReactElement } from "react";

import { Resend } from "resend";

/**
 * Resend client factory singleton (server-only). Mirrors
 * lib/supabase/server.ts's "one exported factory wrapping an SDK client
 * constructor" convention -- simpler here since Resend needs no
 * cookie/session wiring, just the API key.
 *
 * Safe because this module is never imported into a "use client" module
 * (same discipline actions/users.ts applies to its inline service-role
 * client) -- RESEND_API_KEY never reaches the browser.
 *
 * The Resend constructor throws synchronously when its key is empty, which
 * would otherwise crash `next build`'s route-data collection for
 * app/api/inquiries/route.ts in any environment without RESEND_API_KEY set
 * (e.g. CI, or before this plan's user_setup step is completed). A
 * placeholder string keeps module evaluation safe; every actual send is
 * already wrapped in a try/catch that logs on failure (best-effort,
 * non-blocking per D-02), so an unset key degrades to a logged auth error
 * at send time instead of a build-time crash.
 */
export const resend = new Resend(
  process.env.RESEND_API_KEY || "re_unconfigured_placeholder"
);

// Falls back to Resend's own shared test domain (delivers only to the
// account owner's verified email) until a real sending domain is verified
// -- see this plan's user_setup for the go-live blocker.
export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "TravelSentro <onboarding@resend.dev>";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * One email's outcome from sendBatchEmails(), aligned 1:1 by array index
 * with the `items` argument passed in -- never a single call-wide flag
 * (04-REVIEW.md CR-02).
 */
export type BatchEmailResult = { id: string | null; error: string | null };

/**
 * Sends a set of personalized emails via Resend's Batch API
 * (resend.com/docs/api-reference/emails/send-batch-emails), chunked to
 * Resend's documented 100-item-per-call limit (04-RESEARCH.md Pattern 3).
 *
 * Requests permissive batch validation so a per-recipient rejection (e.g. a
 * suppressed/invalid address) is reported back as an `errors` entry instead
 * of being silently indistinguishable from a fully successful call under
 * Resend's default "strict" mode (04-REVIEW.md CR-02). Returns a flat
 * per-item result array aligned by position with `items`, so the caller
 * (actions/messages.ts) can attribute status/provider_message_id per
 * contact instead of applying one status to the whole batch.
 *
 * A genuine whole-call exception (e.g. a React-Email render failure) is
 * allowed to propagate naturally to the caller, which already wraps its own
 * call to this function in try/catch.
 */
export async function sendBatchEmails(
  items: { to: string; subject: string; react: ReactElement }[]
): Promise<BatchEmailResult[]> {
  const results: { id: string | null; error: string | null }[] = [];

  for (const chunk of chunkArray(items, 100)) {
    const response = await resend.batch.send(
      chunk.map((item) => ({ from: FROM_EMAIL, ...item })),
      { batchValidation: "permissive" }
    );

    if (response.error) {
      for (let i = 0; i < chunk.length; i++) {
        results.push({ id: null, error: response.error.message });
      }
      continue;
    }

    const rejectedByIndex = new Map(
      (response.data.errors ?? []).map((e) => [e.index, e.message])
    );
    let dataIndex = 0;

    for (let i = 0; i < chunk.length; i++) {
      const rejectionMessage = rejectedByIndex.get(i);
      if (rejectionMessage !== undefined) {
        results.push({ id: null, error: rejectionMessage });
        continue;
      }

      const queued = response.data.data[dataIndex];
      dataIndex++;
      results.push({ id: queued?.id ?? null, error: null });
    }
  }

  return results;
}
