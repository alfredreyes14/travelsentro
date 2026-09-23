/**
 * Fisher-Yates shuffle -- returns a new array in random order, never
 * mutates `items`. Used by the upsell popup to show a fresh random order
 * on every appearance (client-side only -- see
 * docs/superpowers/specs/2026-09-23-upsell-popup-design.md's Data fetching
 * section for why this can't happen in the ISR-cached server query).
 */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
