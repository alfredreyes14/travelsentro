// Verified against Formspree's own client library contract
// (github.com/formspree/formspree-js — packages/formspree-core/src/core.ts, submission.ts).
// D-06: rebuild the inquiry form natively, POSTing directly to this same endpoint.

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xojpkjbr";

export type InquiryPayload = {
  name: string;
  email: string;
  phone: string;
  message: string;
  /** Present for per-package context (D-07), omitted for the general Contact Us form. */
  package?: string;
  /** Honeypot — must stay empty. See Pitfall 6 in 01-RESEARCH.md. */
  _gotcha?: string;
};

export type FormspreeFieldError = {
  field?: string;
  message: string;
};

export type FormspreeResult =
  | { ok: true }
  | { ok: false; errors: FormspreeFieldError[] };

export async function submitToFormspree(
  data: InquiryPayload
): Promise<FormspreeResult> {
  const res = await fetch(FORMSPREE_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const body = await res.json();

  if (res.ok && "next" in body) {
    return { ok: true };
  }

  // Formspree error shape: { error: string } or { errors: [{ field, message, code }] }
  const errors: FormspreeFieldError[] = Array.isArray(body?.errors)
    ? body.errors
    : [{ field: undefined, message: body?.error ?? "Submission failed" }];

  return { ok: false, errors };
}
