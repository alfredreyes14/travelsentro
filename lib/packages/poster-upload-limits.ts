/**
 * Shared between the poster Server Action and the client-side upload button.
 * Deliberately NOT in actions/package-poster.ts: a "use server" module may
 * only export async functions, so a const exported from there fails the
 * build.
 */

/**
 * Largest source file the admin may pick. Anything up to this is accepted --
 * a poster image whose bytes exceed MAX_API_IMAGE_BYTES is downscaled and
 * re-encoded in the browser before upload (see compress-poster-image.ts), so
 * the admin can hand us a full-resolution export without thinking about API
 * limits. The cap only exists to keep the browser from decoding an
 * absurdly large file into a canvas.
 */
export const MAX_POSTER_BYTES = 15 * 1024 * 1024;

/**
 * Ceiling for the image bytes actually sent to the extraction API. The
 * Messages API caps a single inline image at 5 MB on the BASE64-ENCODED
 * payload, and base64 inflates a file by roughly a third -- so the decoded
 * image has to stay under ~3.75 MB. 3.5 MB leaves headroom for the rest of
 * the request. The browser-side compressor targets this value; the Server
 * Action re-checks the decoded payload against it as defense in depth.
 */
export const MAX_API_IMAGE_BYTES = 3.5 * 1024 * 1024;

export const ACCEPTED_POSTER_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_POSTER_MIME_TYPES)[number];

export function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return (ACCEPTED_POSTER_MIME_TYPES as readonly string[]).includes(value);
}

export const OVERSIZED_POSTER_MESSAGE =
  "That poster is larger than 15 MB. Please resize it and try again.";

export const UNSUPPORTED_POSTER_MESSAGE =
  "Please upload a PNG, JPG, or WebP image.";

export const POSTER_PREP_FAILED_MESSAGE =
  "Couldn't prepare that poster for import. Try a smaller or less detailed image.";
