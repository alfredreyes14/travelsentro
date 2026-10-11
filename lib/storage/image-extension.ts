/**
 * File extension for an uploaded image's MIME type. The "+xml" suffix is
 * dropped so image/svg+xml yields "svg" -- next/image only skips its
 * optimizer (which rejects SVGs) when the src ends in ".svg".
 */
export function extensionFromMimeType(type: string): string {
  const subtype = type.split("/")[1]?.split("+")[0];
  return subtype ? subtype.replace("jpeg", "jpg") : "jpg";
}
