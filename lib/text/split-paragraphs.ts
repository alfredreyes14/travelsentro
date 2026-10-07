/**
 * Splits admin-entered plain text into paragraphs on blank lines. Single
 * line breaks stay inside a paragraph (render with `whitespace-pre-line`).
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
