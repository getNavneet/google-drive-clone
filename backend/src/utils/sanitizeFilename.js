export function sanitizeFilename(filename) {
  if (!filename) return "file";

  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_") // remove weird chars
    .replace(/_{2,}/g, "_")       // collapse ___
    .replace(/^_+|_+$/g, "");     // trim edges
}
