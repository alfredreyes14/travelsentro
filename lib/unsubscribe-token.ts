import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless HMAC-signed unsubscribe token pair (server-only).
 *
 * Unlike lib/resend.ts's RESEND_API_KEY placeholder-fallback (which only
 * degrades a non-security-critical feature when unset), this secret gates
 * an unauthenticated opt-out RPC -- a source-visible fallback here would be
 * an authorization bypass, not a safe degradation (04-REVIEW.md CR-01).
 * getSecret() is therefore called at invocation time (never a module-level
 * constant), so `next build`'s route-data collection -- which only imports
 * this module, never invokes signContactId()/verifyContactId() -- is
 * unaffected by whether the env var is set at build time: it throws only
 * when actually called in a production runtime with no secret configured.
 *
 * No expiry is applied deliberately -- an unsubscribe link that goes stale
 * after N days is worse UX/compliance than the negligible risk of an
 * indefinitely-valid opt-out link (04-RESEARCH.md Pattern 2).
 */
function getSecret(): string {
  const configuredSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET;

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UNSUBSCRIBE_TOKEN_SECRET must be set in production -- refusing to sign/verify an unsubscribe token with an insecure fallback secret."
    );
  }

  // Development-only fallback -- distinct from any value that has ever
  // appeared in this file before (the previous hardcoded fallback is a
  // known-compromised secret and must never be reused).
  return "dev-only-unsubscribe-secret-do-not-use-in-production-2026";
}

export function signContactId(contactId: string): string {
  return createHmac("sha256", getSecret()).update(contactId).digest("base64url");
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
