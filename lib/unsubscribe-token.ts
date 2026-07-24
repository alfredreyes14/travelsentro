import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless HMAC-signed unsubscribe token pair (server-only). Mirrors
 * lib/resend.ts's "server-only, never imported into a use client module,
 * placeholder-fallback-so-build-never-crashes" doc-comment discipline --
 * a missing UNSUBSCRIBE_TOKEN_SECRET degrades to a safely-failing
 * verification at request time, never a next build crash.
 *
 * No expiry is applied deliberately -- an unsubscribe link that goes stale
 * after N days is worse UX/compliance than the negligible risk of an
 * indefinitely-valid opt-out link (04-RESEARCH.md Pattern 2).
 */
const SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || "unconfigured-placeholder-secret";

export function signContactId(contactId: string): string {
  return createHmac("sha256", SECRET).update(contactId).digest("base64url");
}

export function verifyContactId(contactId: string, sig: string): boolean {
  const expected = signContactId(contactId);
  // Byte-length check first, then a constant-time comparison -- never a
  // plain `===` string comparison, which leaks timing information
  // proportional to how many leading characters match (ASVS V6).
  if (expected.length !== sig.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
