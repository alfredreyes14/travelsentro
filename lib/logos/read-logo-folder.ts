import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);

export type LogoFile = {
  id: string;
  src: string;
  alt: string;
};

function toAltText(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");
  return nameWithoutExt
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Reads image files directly out of a public/logos subfolder so dropping a
 * new logo file into the folder is enough to make it appear on the site --
 * no DB row, no admin upload step (per user request, replacing the old
 * Supabase-backed partners table for these homepage sections).
 *
 * Next.js's build-time file tracer can't see this dynamic fs.readdir call,
 * so next.config.ts's outputFileTracingIncludes explicitly bundles
 * public/logos/** into the function that renders the homepage -- without
 * that, this would work in dev but silently return [] in production.
 */
export function readLogoFolder(folder: string): LogoFile[] {
  const dirPath = path.join(process.cwd(), "public", "logos", folder);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const encodedPath = [folder, entry.name]
        .map(encodeURIComponent)
        .join("/");

      return {
        id: entry.name,
        src: `/logos/${encodedPath}`,
        alt: toAltText(entry.name),
      };
    });
}
