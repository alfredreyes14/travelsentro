/**
 * Rules for B2B contact documents, shared by the upload card, the server
 * actions and the download route. SVG and HTML are deliberately absent:
 * documents open inline in the browser.
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const TYPE_TO_EXTENSION: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const EXTENSION_TO_TYPE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(TYPE_TO_EXTENSION).map(([type, ext]) => [ext, type])
  ),
  jpeg: "image/jpeg",
};

// The lookups below take untrusted strings, so they must not read through
// the prototype chain ("constructor", "toString").
function lookup(
  table: Readonly<Record<string, string>>,
  key: string
): string | undefined {
  return Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : undefined;
}

export const DOCUMENT_ACCEPT = [
  ...Object.keys(TYPE_TO_EXTENSION),
  ...Object.keys(EXTENSION_TO_TYPE).map((ext) => `.${ext}`),
].join(",");

const TYPE_ERROR =
  "Documents must be a PDF, an image (JPG, PNG, WebP), or a Word or Excel file.";
const SIZE_ERROR = "Documents must be 20 MB or smaller.";
const EMPTY_ERROR = "That file is empty.";

export type DocumentCheck =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; error: string };

/**
 * Validates a file's type and size. Browsers report an empty type for
 * Office files on machines without Office installed, so a blank type (and
 * only a blank one) falls back to the file name's extension.
 */
export function checkDocument(file: {
  name: string;
  type: string;
  size: number;
}): DocumentCheck {
  let contentType = file.type;
  if (!contentType) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    contentType = lookup(EXTENSION_TO_TYPE, ext) ?? "";
  }
  const extension = lookup(TYPE_TO_EXTENSION, contentType);
  if (!extension) return { ok: false, error: TYPE_ERROR };
  if (file.size <= 0) return { ok: false, error: EMPTY_ERROR };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: SIZE_ERROR };
  return { ok: true, contentType, extension };
}

/** True when a content type read back from storage is one we accept. */
export function isAllowedDocumentType(contentType: string): boolean {
  return lookup(TYPE_TO_EXTENSION, contentType) !== undefined;
}

// Half of a surrogate pair on its own, which encodeURIComponent throws on.
// Cutting a name at 200 characters can leave one behind.
const LONE_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** The display name stored for a document: no path, no control characters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .replace(LONE_SURROGATE, "")
    .trim();
  return clean || "document";
}

export function documentKeyPrefix(contactId: string): string {
  return `contacts/${contactId}/`;
}

/** True only for `contacts/{contactId}/{uuid}.{ext}` -- nothing nested. */
export function isDocumentKeyForContact(
  key: string,
  contactId: string
): boolean {
  const prefix = documentKeyPrefix(contactId);
  return (
    key.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(key.slice(prefix.length))
  );
}

/**
 * An inline Content-Disposition header value for a stored file name: an
 * ASCII-only quoted fallback plus the RFC 5987 UTF-8 form.
 */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName.replace(LONE_SURROGATE, ""));
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
