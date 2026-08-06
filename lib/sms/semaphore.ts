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

// Semaphore's documented validation-error response shape: a plain object
// keyed by field name, values are arrays of error strings (never an array
// itself). Confirmed live in .planning/debug/sms-send-fails.md -- Semaphore
// returns this shape with HTTP 200, not a 4xx/5xx.
type SemaphoreErrorResponse = Record<string, string[]>;

function isSemaphoreErrorResponse(
  body: unknown
): body is SemaphoreErrorResponse {
  return (
    typeof body === "object" && body !== null && !Array.isArray(body)
  );
}

function describeSemaphoreError(body: SemaphoreErrorResponse): string {
  const [field, messages] = Object.entries(body)[0] ?? [
    "unknown",
    ["Unknown error"],
  ];
  return `${field}: ${messages[0]}`;
}

async function callSemaphore(
  numbers: string[],
  message: string
): Promise<SemaphoreMessage[]> {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) {
    throw new Error("Semaphore is not configured: SEMAPHORE_API_KEY is unset.");
  }

  const body = new URLSearchParams({
    apikey: apiKey,
    number: numbers.join(","),
    message,
    sendername: process.env.SEMAPHORE_SENDER_NAME ?? "",
  });

  const res = await fetch(SEMAPHORE_ENDPOINT, { method: "POST", body });
  const parsedBody: unknown = await res.json();

  if (!res.ok || isSemaphoreErrorResponse(parsedBody)) {
    // Never swallow -- this is the exact failure signal Pitfall 4 requires
    // 04-03's callers to catch and surface to the clicking staff member.
    // Semaphore can return its validation-error shape with HTTP 200 (not
    // 4xx/5xx), so !res.ok alone is insufficient -- explicitly check the
    // parsed body's shape too (.planning/debug/sms-send-fails.md).
    const detail = isSemaphoreErrorResponse(parsedBody)
      ? describeSemaphoreError(parsedBody)
      : `${res.status}`;
    throw new Error(`Semaphore API error: ${detail}`);
  }

  return parsedBody as SemaphoreMessage[];
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
