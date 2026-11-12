/**
 * Where an SOA's attached file lives in the private R2 bucket. Files use
 * the same type/size rules as contact documents (lib/crm/documents.ts).
 */
export const SOA_FILE_PREFIX = "statements/";

/** True only for `statements/{uuid}.{ext}` -- nothing nested. */
export function isSoaFileKey(key: string): boolean {
  return (
    key.startsWith(SOA_FILE_PREFIX) &&
    /^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(key.slice(SOA_FILE_PREFIX.length))
  );
}

/** What the SOA form asks the server to do with the attached file. */
export type SoaFileChange =
  | { action: "keep" }
  | { action: "remove" }
  | { action: "replace"; key: string; fileName: string };
