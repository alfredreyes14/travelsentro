import Anthropic from "@anthropic-ai/sdk";

/**
 * Classifies a failure from the poster-extraction API call into the message
 * the admin sees and the line written to the server log.
 *
 * Pure and dependency-light on purpose: it lives here rather than inline in
 * actions/package-poster.ts so scripts/verify-poster-extraction.ts can assert
 * every branch against real SDK error instances without a key, a network
 * call, or a Supabase client. Misleading error copy has been this feature's
 * most repeated defect -- a missing key and exhausted credits both used to
 * surface as "try again", which is the one instruction that cannot work in
 * either case -- so the mapping is worth testing rather than eyeballing.
 */
export type PosterErrorDescription = {
  /** Shown to the admin in a toast. */
  message: string;
  /** Written with console.error. Never shown to the admin. */
  log: string;
};

const GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

const OUT_OF_CREDITS_MESSAGE =
  "Poster import has run out of Anthropic API credits. Top up the account at console.anthropic.com, then try again.";

const NOT_CONFIGURED_MESSAGE =
  "Poster import isn't configured yet. Please contact your administrator.";

export function describePosterExtractionError(
  error: unknown
): PosterErrorDescription {
  // Most specific first. Never string-match an SDK error message except in
  // the one documented backstop below.

  // Out of credits. The SDK models this as a first-class error type
  // (`billing_error` in its ErrorType union) exposed on APIError.type, so
  // this is a typed check, not a message match. It must precede the generic
  // APIError branch, which would otherwise swallow it into "try again" --
  // advice that can never succeed until someone tops the account up.
  if (error instanceof Anthropic.APIError && error.type === "billing_error") {
    return {
      message: OUT_OF_CREDITS_MESSAGE,
      log: `Anthropic billing error — poster extraction blocked until the account is topped up. API said: ${error.message}`,
    };
  }

  // Backstop for the same condition arriving as a plain 400 without the
  // typed discriminator. Deliberately narrow -- a BadRequestError whose
  // message names a credit balance -- so every other 400 still falls
  // through. Remove if the typed check above proves sufficient in practice.
  if (
    error instanceof Anthropic.BadRequestError &&
    /credit balance/i.test(error.message)
  ) {
    return {
      message: OUT_OF_CREDITS_MESSAGE,
      log: `Anthropic credit exhaustion reported as an untyped 400. API said: ${error.message}`,
    };
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return {
      message: NOT_CONFIGURED_MESSAGE,
      log: `Anthropic rejected the configured ANTHROPIC_API_KEY. API said: ${error.message}`,
    };
  }

  if (error instanceof Anthropic.RateLimitError) {
    return {
      message: "The extraction service is busy. Please try again in a moment.",
      log: `Anthropic rate limit hit during poster extraction. API said: ${error.message}`,
    };
  }

  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return {
      message:
        "Reading that poster took too long. Try again, or use a smaller image.",
      log: `Poster extraction timed out: ${error.message}`,
    };
  }

  if (error instanceof Anthropic.APIError) {
    // Log status AND type: if a condition deserving its own message ever
    // lands here, the type is what identifies it.
    return {
      message: GENERIC_ERROR_MESSAGE,
      log: `Anthropic API error ${error.status} (type: ${error.type ?? "unknown"}): ${error.message}`,
    };
  }

  return {
    message: GENERIC_ERROR_MESSAGE,
    log: `Poster extraction failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}
