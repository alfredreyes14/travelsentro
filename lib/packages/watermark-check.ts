import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  MAX_API_IMAGE_BYTES,
  isAcceptedMimeType,
} from "@/lib/packages/poster-upload-limits";

const WatermarkCheckSchema = z.object({
  hasThirdPartyWatermark: z.boolean(),
  /** Short human-readable description, e.g. "Shutterstock logo tiled across the image". */
  description: z.string().nullable(),
});

const WATERMARK_SYSTEM_PROMPT = `You inspect photos that a travel agency, TravelSentro, is about to publish on its tour package pages. Decide whether the photo carries a third-party watermark.

Count as a third-party watermark any mark overlaid on the photo that identifies another owner or source, including:
- stock-photo marks (Shutterstock, Getty Images, iStock, Adobe Stock, Dreamstime, 123RF, Alamy, Depositphotos, and similar), including faint tiled or semi-transparent patterns
- photographer signatures, copyright notices ("©", "Photo by ..."), or photographer logos
- logos, names, page names, websites, or social media handles of other travel agencies, tour operators, resorts, or social media accounts

Do NOT count:
- TravelSentro's own logo, name, or watermark
- text that is physically part of the scene (signs, boat names, shop fronts, clothing)
- camera date stamps

Look carefully at corners, edges, and the center for faint or low-contrast marks. If there is a third-party watermark, describe it in a few words (what it says or shows and where); otherwise set description to null.`;

export type WatermarkCheckResult =
  | { status: "clean" }
  | { status: "watermarked"; description: string | null }
  /** The check could not run; the caller lets the upload through. */
  | { status: "unchecked" };

/**
 * Asks Claude whether a package photo carries a third-party watermark.
 *
 * Fails open: any condition that prevents a verdict (missing key, oversized
 * image, API error, refusal) returns "unchecked" and is logged, so an
 * Anthropic outage or exhausted credits never blocks photo uploads. The
 * check is a quality gate for admins, not a security boundary.
 *
 * Client constructed per call for the same reason as extract-poster.ts: a
 * missing ANTHROPIC_API_KEY stays a request-time condition, not a build
 * failure.
 */
export async function checkImageForWatermark(input: {
  base64: string;
  mimeType: string;
}): Promise<WatermarkCheckResult> {
  if (!isAcceptedMimeType(input.mimeType)) {
    console.error(
      `Watermark check skipped: unsupported image type ${input.mimeType}`
    );
    return { status: "unchecked" };
  }

  const padding = input.base64.endsWith("==")
    ? 2
    : input.base64.endsWith("=")
      ? 1
      : 0;
  const decodedBytes = Math.floor((input.base64.length * 3) / 4) - padding;
  if (decodedBytes <= 0 || decodedBytes > MAX_API_IMAGE_BYTES) {
    console.error(
      `Watermark check skipped: image is ${decodedBytes} bytes (limit ${MAX_API_IMAGE_BYTES})`
    );
    return { status: "unchecked" };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Watermark check skipped: no ANTHROPIC_API_KEY configured."
    );
    return { status: "unchecked" };
  }

  try {
    const client = new Anthropic({
      // Runs once per uploaded photo while the admin waits, so keep the
      // worst case well under the page's maxDuration.
      timeout: 30_000,
      maxRetries: 1,
    });

    // effort "low": a yes/no visual check doesn't need deep reasoning, and
    // the admin waits on it per photo. Note that claude-haiku-4-5 rejects
    // `effort`, so WATERMARK_CHECK_MODEL must name a model that accepts it.
    const response = await client.messages.parse({
      model: process.env.WATERMARK_CHECK_MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      system: WATERMARK_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mimeType,
                data: input.base64,
              },
            },
            {
              type: "text",
              text: "Does this photo have a third-party watermark?",
            },
          ],
        },
      ],
      output_config: {
        effort: "low",
        format: zodOutputFormat(WatermarkCheckSchema),
      },
    });

    if (!response.parsed_output) {
      console.error(
        `Watermark check produced no parsed_output (stop_reason: ${response.stop_reason})`
      );
      return { status: "unchecked" };
    }

    return response.parsed_output.hasThirdPartyWatermark
      ? { status: "watermarked", description: response.parsed_output.description }
      : { status: "clean" };
  } catch (error) {
    const detail =
      error instanceof Anthropic.APIError
        ? `Anthropic API error ${error.status} (type: ${error.type ?? "unknown"}): ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`Watermark check failed, allowing upload: ${detail}`);
    return { status: "unchecked" };
  }
}
