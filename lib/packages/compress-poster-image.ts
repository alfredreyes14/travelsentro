import { readFileAsBase64 } from "@/lib/read-file-as-base64";
import {
  ACCEPTED_POSTER_MIME_TYPES,
  MAX_API_IMAGE_BYTES,
  type AcceptedMimeType,
} from "./poster-upload-limits";

/**
 * Browser-only (canvas) helper. Only components/admin/poster-import-button.tsx
 * imports it, so it never lands in a server bundle -- keep it out of any
 * module the Server Action pulls in.
 */

// The Anthropic vision API resamples anything past ~1568px on the long edge,
// so sending more than this is wasted bytes; 2000 leaves a margin for text
// legibility before that resample kicks in.
const MAX_EDGE = 2000;

// Tried in order until one re-encode lands under MAX_API_IMAGE_BYTES. Quality
// first (cheap, keeps detail), then a smaller canvas as a last resort for a
// very dense poster.
const ATTEMPTS: ReadonlyArray<{ maxEdge: number; quality: number }> = [
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

  const source = await decodeImage(file);
  try {
    for (const attempt of ATTEMPTS) {
      const blob = await reencode(source, attempt.maxEdge, attempt.quality);
      if (blob && blob.size <= MAX_API_IMAGE_BYTES) {
        return {
          base64: await readFileAsBase64(blob),
          mimeType: blob.type === "image/webp" ? "image/webp" : "image/jpeg",
        };
      }
    }
  } finally {
    if (source instanceof ImageBitmap) source.close();
  }

  throw new Error("POSTER_PREP_FAILED");
}

type DecodedImage = ImageBitmap | HTMLImageElement;

/**
 * `createImageBitmap` honours EXIF orientation (phone photos of a poster can
 * carry a rotation flag) and decodes off the main thread. Fall back to an
 * <img> element for the rare browser that rejects the options bag.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function reencode(
  source: DecodedImage,
  maxEdge: number,
  quality: number
): Promise<Blob | null> {
  const sourceWidth =
    source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sourceHeight =
    source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) return Promise.resolve(null);

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // Posters are opaque; a white ground keeps PNG->JPEG (no alpha) from
  // turning transparent margins black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") {
          resolve(webp);
          return;
        }
        canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", quality);
      },
      "image/webp",
      quality
    );
  });
}
