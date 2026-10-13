export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/**
 * Trims tags, drops blanks and removes case-insensitive duplicates (the
 * first spelling wins). A tag that matches one already in use, ignoring
 * case, takes the existing spelling so "vip" and "VIP" never both exist.
 * Limits are enforced by contactFormSchema, not here.
 */
export function normalizeTags(
  input: readonly string[],
  existing: readonly string[] = []
): string[] {
  const canonical = new Map<string, string>();
  for (const tag of existing) {
    const key = tag.trim().toLowerCase();
    if (key && !canonical.has(key)) canonical.set(key, tag.trim());
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical.get(key) ?? tag);
  }
  return result;
}
