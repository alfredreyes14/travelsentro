/**
 * Builds a public URL for an R2 object key. Pure and client-safe (no AWS
 * SDK import, no credentials) — components/admin/photo-manager.tsx calls
 * this directly in the browser to build thumbnail preview URLs right after
 * upload, before any server refetch.
 */
export function getPublicImageUrl(key: string): string {
  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;
}
