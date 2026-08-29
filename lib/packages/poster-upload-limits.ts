/**
 * Shared between the poster Server Action and the client-side upload button.
 * Deliberately NOT in actions/package-poster.ts: a "use server" module may
 * only export async functions, so a const exported from there fails the
 * build.
 */

/**
 * The API's cap is 5 MB on the BASE64-ENCODED image, and base64 inflates a
 * payload by roughly a third -- so the raw file has to stay under ~3.75 MB.
 * 3.5 MB leaves headroom for the rest of the request.
 */
export const MAX_POSTER_BYTES = 3.5 * 1024 * 1024;

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
  "That poster is larger than 3.5 MB. Please resize it and try again.";

export const UNSUPPORTED_POSTER_MESSAGE =
  "Please upload a PNG, JPG, or WebP image.";
