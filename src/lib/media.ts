export const MAX_IMAGE_BYTES = 5_000_000;

// Uploads are stored with one of THESE types, never the uploader-supplied MIME:
// an attacker setting `text/html` on an upload served same-origin is stored XSS.
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const TYPES_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

export function extensionForType(type: string): string | null {
  return IMAGE_TYPES[type.toLowerCase()] ?? null;
}

export function contentTypeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return TYPES_BY_EXT[ext] ?? "application/octet-stream";
}

export function imageKeyFor(itemId: number, ext: string): string {
  const raw = new Uint8Array(8);
  crypto.getRandomValues(raw);
  const rand = Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("");
  return `items/${itemId}/${rand}.${ext}`;
}
