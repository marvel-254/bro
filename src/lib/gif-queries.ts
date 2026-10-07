/**
 * Pure GIF helpers.
 *
 * Split out of gifs.ts so they can be unit tested: that module imports
 * supabase.ts, which pulls in expo-secure-store (ESM), and a test suite cannot
 * load it without native mocks.
 */

/** Strip anything that could turn a catalogue value into markup or a query. */
export function normaliseGifQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/**
 * True when a catalogue row can actually be rendered.
 *
 * The URL is derived from a path we wrote, but the path still comes from the
 * database, so it is treated as untrusted: it has to be a plain relative path
 * inside the bucket, not an absolute URL or a traversal.
 */
export function isSafeGifPath(path: string): boolean {
  if (!path || path.length > 200) return false;
  if (path.startsWith("/") || path.includes("..")) return false;
  if (path.includes("//") || path.includes("\\")) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(path);
}

