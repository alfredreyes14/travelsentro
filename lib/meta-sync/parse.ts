/**
 * Pulls emails and phone numbers out of a Messenger message, so a chat can
 * be matched to its CRM contact. The Meta lead form's first Messenger
 * message lists both ("Email: ...", "Phone number: 0917 ...").
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Digits with optional spaces, dashes, dots or parentheses; 10-16 chars.
const PHONE = /\+?\d[\d\s().-]{8,16}\d/g;

export function extractEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
}

/**
 * The last 10 digits of each Philippine mobile number in the text (the
 * same key record_meta_lead() matches phones on): 09XX..., 639XX...,
 * +63 9XX... or a bare 9XX... .
 */
export function extractPhoneKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.match(PHONE) ?? []) {
    const digits = match.replace(/\D/g, "");
    const isPh =
      (digits.length === 11 && digits.startsWith("09")) ||
      (digits.length === 12 && digits.startsWith("639")) ||
      (digits.length === 10 && digits.startsWith("9"));
    if (isPh) keys.add(digits.slice(-10));
  }
  return [...keys];
}
