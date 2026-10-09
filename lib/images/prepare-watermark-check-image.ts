import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import { shrinkImageToFit, type ShrinkAttempt } from "@/lib/images/shrink-image";
import {
  MAX_API_IMAGE_BYTES,
  isAcceptedMimeType,
} from "@/lib/packages/poster-upload-limits";

/**
 * Browser-only (canvas) helper for components/admin/photo-manager.tsx --
 * keep it out of any module a Server Action pulls in.
 */

// The vision API resamples anything past ~1568px on the long edge, so a
// larger check copy only adds request bytes.
const ATTEMPTS: ReadonlyArray<ShrinkAttempt> = [
  { maxEdge: 1568, quality: 0.85 },
  { maxEdge: 1568, quality: 0.7 },
  { maxEdge: 1200, quality: 0.7 },
];

/**
 * Returns a downscaled copy of `file` for the server-side watermark check,
 * or undefined when the original can be checked as-is (an accepted type
 * already under the API's inline-image ceiling) -- so small photos aren't
 * sent twice.
 *
 * Also returns undefined if the browser can't re-encode the image; the
 * server then logs and skips the check rather than blocking the upload.
 */
export async function prepareWatermarkCheckImage(
  file: File
): Promise<{ type: string; base64: string } | undefined> {
  if (isAcceptedMimeType(file.type) && file.size <= MAX_API_IMAGE_BYTES) {
    return undefined;
  }

  try {
    const blob = await shrinkImageToFit(file, MAX_API_IMAGE_BYTES, ATTEMPTS);
    return {
      type: blob.type === "image/webp" ? "image/webp" : "image/jpeg",
      base64: await readFileAsBase64(blob),
    };
  } catch {
    return undefined;
  }
}
