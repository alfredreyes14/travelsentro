import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { shrinkImageToFit, type ShrinkAttempt } from "@/lib/images/shrink-image";
import {
  ACCEPTED_POSTER_MIME_TYPES,
  MAX_API_IMAGE_BYTES,
  type AcceptedMimeType,
} from "./poster-upload-limits";

/**
 * Browser-only (canvas) helper -- the decode/re-encode loop lives in the
 * shared lib/images/shrink-image.ts. Only
 * components/admin/poster-import-button.tsx imports it, so it never lands in
 * a server bundle -- keep it out of any module the Server Action pulls in.
 */

// The Anthropic vision API resamples anything past ~1568px on the long edge,
// so sending more than this is wasted bytes; 2000 leaves a margin for text
// legibility before that resample kicks in.
const MAX_EDGE = 2000;

// Tried in order until one re-encode lands under MAX_API_IMAGE_BYTES. Quality
// first (cheap, keeps detail), then a smaller canvas as a last resort for a
// very dense poster.
const ATTEMPTS: ReadonlyArray<ShrinkAttempt> = [
  { maxEdge: MAX_EDGE, quality: 0.85 },
  { maxEdge: MAX_EDGE, quality: 0.7 },
  { maxEdge: 1600, quality: 0.7 },
  { maxEdge: 1400, quality: 0.6 },
];

export type PreparedPoster = { base64: string; mimeType: AcceptedMimeType };

/**
 * Returns a base64 image small enough to send inline to the extraction API.
 *
 * A poster that is already an accepted type AND already under the API's
 * inline-image ceiling is passed through untouched (no quality loss). A
 * larger one is downscaled and re-encoded in the browser -- WebP where the
 * browser can, JPEG otherwise -- so the admin can upload a full-resolution
 * poster without running into the 5 MB inline-image limit.
 *
 * Throws "POSTER_PREP_FAILED" if no attempt gets under the ceiling or the
 * browser can't decode/encode the image.
 */
export async function preparePosterForUpload(
  file: File
): Promise<PreparedPoster> {
  const alreadySmallEnough =
    (ACCEPTED_POSTER_MIME_TYPES as readonly string[]).includes(file.type) &&
    file.size <= MAX_API_IMAGE_BYTES;
  if (alreadySmallEnough) {
    return {
      base64: await readFileAsBase64(file),
      mimeType: file.type as AcceptedMimeType,
    };
  }

  let blob: Blob;
  try {
    blob = await shrinkImageToFit(file, MAX_API_IMAGE_BYTES, ATTEMPTS);
  } catch {
    throw new Error("POSTER_PREP_FAILED");
  }

  return {
    base64: await readFileAsBase64(blob),
    mimeType: blob.type === "image/webp" ? "image/webp" : "image/jpeg",
  };
}
