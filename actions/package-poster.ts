"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { requirePermission } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { PackageFormValues } from "@/components/admin/package-form-schema";
import {
  PosterExtractionSchema,
  buildPosterSystemPrompt,
} from "@/lib/packages/poster-prompt";
import {
  mapPosterToFormValues,
  type UnmappedField,
} from "@/lib/packages/poster-mapping";
import { describePosterExtractionError } from "@/lib/packages/poster-error";
import {
  MAX_POSTER_BYTES,
  isAcceptedMimeType,
  OVERSIZED_POSTER_MESSAGE,
  UNSUPPORTED_POSTER_MESSAGE,
} from "@/lib/packages/poster-upload-limits";

const GENERIC_ERROR_MESSAGE =
  "Something went wrong reading that poster. Please try again.";

// Only async functions may be exported from a "use server" module. A type
// alias is erased at compile time, so this one is fine.
export type PosterExtractionResult = ActionResult & {
  values?: Partial<PackageFormValues>;
  unmapped?: UnmappedField[];
};

/**
 * Reads a marketing poster image and returns package form values plus the
 * fields the poster didn't supply. Writes nothing -- the caller fills the
 * in-memory form and the admin still saves through updatePackage.
 *
 * The Anthropic client is constructed per call rather than at module scope
 * (same reasoning as lib/storage/r2-client.ts): a missing ANTHROPIC_API_KEY
 * then surfaces as a handled request-time error instead of breaking the
 * build for every page that transitively imports this module.
 */
export async function extractPackageFromPoster(input: {
  base64: string;
  mimeType: string;
}): Promise<PosterExtractionResult> {
  // AUTH-05 — same gate as every other package write path.
  await requirePermission("can_manage_packages");

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

  if (decodedBytes > MAX_POSTER_BYTES) {
    return { ok: false, error: OVERSIZED_POSTER_MESSAGE };
  }

  const supabase = await createClient();
  const { data: destinationRows, error: destinationsError } = await supabase
    .from("destinations")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (destinationsError) {
    console.error("Failed to load destinations:", destinationsError.message);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }

  const destinations = destinationRows ?? [];

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
      system: buildPosterSystemPrompt(destinations.map((d) => d.name)),
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

    const { values, unmapped } = mapPosterToFormValues(
      response.parsed_output,
      destinations
    );

    return { ok: true, values, unmapped };
  } catch (error) {
    // Branch selection and copy live in describePosterExtractionError so
    // every case is verifiable offline (scripts/verify-poster-extraction.ts).
    const { message, log } = describePosterExtractionError(error);
    console.error(log);
    return { ok: false, error: message };
  }
}
