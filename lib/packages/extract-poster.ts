import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  PosterExtractionSchema,
  buildPosterSystemPrompt,
  type PosterExtraction,
} from "@/lib/packages/poster-prompt";
import { describePosterExtractionError } from "@/lib/packages/poster-error";
import {
  MAX_API_IMAGE_BYTES,
  isAcceptedMimeType,
  POSTER_PREP_FAILED_MESSAGE,
  UNSUPPORTED_POSTER_MESSAGE,
} from "@/lib/packages/poster-upload-limits";

export const POSTER_GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

export type ExtractPosterResult =
  | { ok: true; data: PosterExtraction }
  | { ok: false; error: string };

/**
 * Validates a poster/flyer image and transcribes it with Claude. Shared by
 * extractPackageFromPoster (actions/package-poster.ts) and
 * extractQuoteFromPoster (actions/quote-poster.ts); callers own the
 * permission check and the mapping onto their form.
 *
 * The Anthropic client is constructed per call rather than at module scope
 * (same reasoning as lib/storage/r2-client.ts): a missing ANTHROPIC_API_KEY
 * then surfaces as a handled request-time error instead of breaking the
 * build for every page that transitively imports this module.
 */
export async function extractPosterData(input: {
  base64: string;
  mimeType: string;
  destinationNames: string[];
}): Promise<ExtractPosterResult> {
  const mimeType = input.mimeType;
  if (!isAcceptedMimeType(mimeType)) {
    return { ok: false, error: UNSUPPORTED_POSTER_MESSAGE };
  }

  // base64 length -> decoded byte count, without allocating the buffer.
  const padding = input.base64.endsWith("==")
    ? 2
    : input.base64.endsWith("=")
      ? 1
      : 0;
  const decodedBytes = Math.floor((input.base64.length * 3) / 4) - padding;

  if (decodedBytes <= 0) {
    return { ok: false, error: "That file looks empty. Please pick another." };
  }

  // The browser compresses large posters under this ceiling before sending
  // (compress-poster-image.ts). Re-checked here as defense in depth: the
  // Messages API rejects an inline image whose base64 payload tops 5 MB, and
  // that 400 would otherwise surface as a misleading "try again".
  if (decodedBytes > MAX_API_IMAGE_BYTES) {
    return { ok: false, error: POSTER_PREP_FAILED_MESSAGE };
  }

  // `new Anthropic()` with no key doesn't throw at construction, and the
  // SDK's request-time failure is a plain Error (neither AuthenticationError
  // nor APIError), so it would otherwise fall through to the generic catch
  // branch below and produce a misleading "try again" message. Check first
  // so a missing key on a fresh deploy (the single most likely first-deploy
  // failure) surfaces the real cause.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Poster extraction attempted with no ANTHROPIC_API_KEY configured."
    );
    return {
      ok: false,
      error:
        "Poster import isn't configured yet. Please contact your administrator.",
    };
  }

  try {
    const client = new Anthropic({
      // Bound wall-clock time: the SDK's default is a 10-minute timeout with
      // maxRetries: 2, i.e. worst case ~30 minutes with the button stuck on
      // "Reading poster..." and no cancel. Paired with maxDuration on the
      // page this Server Action is invoked from.
      timeout: 60_000,
      maxRetries: 1,
    });

    // No `thinking` and no `output_config.effort`: both are rejected by
    // claude-haiku-4-5, which POSTER_EXTRACTION_MODEL must stay able to
    // select. Opus 5 runs adaptive thinking by default when omitted.
    const response = await client.messages.parse({
      model: process.env.POSTER_EXTRACTION_MODEL || "claude-opus-5",
      max_tokens: 16000,
      system: buildPosterSystemPrompt(input.destinationNames),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: input.base64,
              },
            },
            {
              type: "text",
              text: "Transcribe this tour package poster into the required structure.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(PosterExtractionSchema) },
    });

    if (!response.parsed_output) {
      // Genuinely reachable: e.g. a response whose only block is `thinking`
      // (adaptive thinking hitting max_tokens: 16000). Without this
      // breadcrumb, the "try a clearer image" copy misdirects an admin
      // toward image quality when the real cause is a token cap.
      console.error(
        `Poster extraction produced no parsed_output (stop_reason: ${response.stop_reason})`
      );
      return {
        ok: false,
        error:
          "Couldn't read this poster. Try a clearer image, or fill the form in manually.",
      };
    }

    return { ok: true, data: response.parsed_output };
  } catch (error) {
    // Branch selection and copy live in describePosterExtractionError so
    // every case is verifiable offline (scripts/verify-poster-extraction.ts).
    const { message, log } = describePosterExtractionError(error);
    console.error(log);
    return { ok: false, error: message };
  }
}
