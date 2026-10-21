/**
 * Event image limits, shared by the admin form and the upload actions.
 * One file is sent per Server Action call; 6 MB plus ~33% base64 overhead
 * stays under the 10 MB Server Action body limit in next.config.ts.
 */
export const EVENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const EVENT_IMAGE_MAX_BYTES = 6 * 1024 * 1024;

export const EVENT_IMAGE_ACCEPT = EVENT_IMAGE_TYPES.join(",");

export const EVENT_IMAGE_LIMIT_MESSAGE = "Photos must be JPG, PNG or WebP and 6 MB or smaller.";

export function isAcceptedEventImage(type: string, bytes: number): boolean {
  return (EVENT_IMAGE_TYPES as readonly string[]).includes(type) && bytes <= EVENT_IMAGE_MAX_BYTES;
}
