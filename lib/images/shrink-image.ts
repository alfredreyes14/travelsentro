/**
 * Browser-only (canvas) image downscale/re-encode helper, shared by the
 * poster importer (lib/packages/compress-poster-image.ts) and the
 * testimonial photo uploader. Only client components may import it -- keep
 * it out of any module a Server Action pulls in.
 */

export type ShrinkAttempt = { maxEdge: number; quality: number };

/**
 * Re-encodes `file` -- WebP where the browser can, JPEG otherwise -- trying
 * each attempt in order until one lands at or under `maxBytes`, and returns
 * that blob.
 *
 * Throws if no attempt gets under the ceiling or the browser can't
 * decode/encode the image (e.g. HEIC in a browser without HEIC support).
 */
export async function shrinkImageToFit(
  file: File,
  maxBytes: number,
  attempts: ReadonlyArray<ShrinkAttempt>
): Promise<Blob> {
  const source = await decodeImage(file);
  try {
    for (const attempt of attempts) {
      const blob = await reencode(source, attempt.maxEdge, attempt.quality);
      if (blob && blob.size <= maxBytes) return blob;
    }
  } finally {
    if (source instanceof ImageBitmap) source.close();
  }

  throw new Error("IMAGE_SHRINK_FAILED");
}

type DecodedImage = ImageBitmap | HTMLImageElement;

/**
 * `createImageBitmap` honours EXIF orientation (phone photos can carry a
 * rotation flag) and decodes off the main thread. Fall back to an <img>
 * element for the rare browser that rejects the options bag.
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
  // A white ground keeps PNG->JPEG (no alpha) from turning transparent
  // margins black.
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
