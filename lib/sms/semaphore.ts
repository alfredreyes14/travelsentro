/**
 * Thin fetch-based Semaphore SMS wrapper (server-only, D-04/D-05 -- no
 * official Node SDK exists). Mirrors lib/resend.ts's "server-only, never
 * imported into a use client module" discipline: SEMAPHORE_API_KEY never
 * reaches the browser.
 *
 * Endpoint base URL per 04-RESEARCH.md's Code Examples (LOW-confidence
 * flag -- verify against a real account during end-of-phase human
 * verification, per this plan's Task 2 human-check).
 */
const SEMAPHORE_ENDPOINT = "https://semaphore.co/api/v4/messages";

type SemaphoreMessage = {
  message_id: string;
  recipient: string;
  message: string;
  sender_name: string;
  network: string;
  status: "Queued" | "Pending" | "Sent" | "Failed" | "Refunded";
  created_at: string;
};

async function callSemaphore(
  numbers: string[],
  message: string
): Promise<SemaphoreMessage[]> {
  const body = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY!,
    number: numbers.join(","),
    message,
    sendername: process.env.SEMAPHORE_SENDER_NAME ?? "",
  });

  const res = await fetch(SEMAPHORE_ENDPOINT, { method: "POST", body });
  if (!res.ok) {
    // Never swallow -- this is the exact failure signal Pitfall 4 requires
    // 04-03's callers to catch and surface to the clicking staff member.
    throw new Error(`Semaphore API error: ${res.status}`);
  }
  return (await res.json()) as SemaphoreMessage[];
}

export async function sendSingleSms(number: string, message: string) {
  const [result] = await callSemaphore([number], message);
  return result;
}

// Semaphore's bulk endpoint sends ONE shared `message` to every number in
// the comma-separated list -- no per-recipient personalization (Pitfall 2).
// Callers must never call applyNameTemplate() before this function.
// Numbers arrays over 1,000 items are the caller's responsibility to chunk.
export async function sendBulkSms(numbers: string[], message: string) {
  return callSemaphore(numbers, message);
}
