/**
 * Shared client-side helper: reads a File as a base64 string (stripping the
 * "data:<mime>;base64," prefix) for handoff to a Server Action that decodes
 * it server-side. Extracted from components/admin/photo-manager.tsx's
 * inline readFileAsBase64 (byte-for-byte identical logic) so 06-05/06-06's
 * upload-capable forms import one shared helper instead of each duplicating
 * it.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      // Strip the "data:<mime>;base64," prefix -- only the raw payload is
      // sent to the Server Action, which decodes it server-side.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
