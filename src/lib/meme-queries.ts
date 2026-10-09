/**
 * Pure meme-library helpers.
 *
 * Kept apart from memes.ts so they can be unit tested: that module talks to
 * Supabase and reads process.env, which drags the whole client into a test.
 *
 * The path guard matters because the bucket base comes from configuration and
 * the object key comes from a database row. Neither is attacker-controlled
 * today, but a row that could contain `../../` or an absolute URL would turn a
 * CDN base into an arbitrary-request primitive, and that is cheap to prevent
 * here and expensive to notice later.
 */

const MAX_PATH_LENGTH = 200;

/** Rejects traversal, absolute URLs, backslashes and absurd lengths. */
export function isSafeMemePath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.length > MAX_PATH_LENGTH) return false;
  if (path.includes("\\")) return false;
  if (path.startsWith("/")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path)) return false;
  if (path.includes("..")) return false;
  return path.startsWith("memes/");
}

/**
 * Join the bucket base and an object key.
 *
 * Returns null rather than a broken URL when either side is unusable, so the
 * caller renders a placeholder instead of asking the image loader to fail.
 */
export function memeUrl(
  base: string,
  storagePath: string,
): string | null {
  const trimmedBase = (base ?? "").trim().replace(/\/+$/, "");
  if (!trimmedBase) return null;
  if (!isSafeMemePath(storagePath)) return null;
  return `${trimmedBase}/${storagePath}`;
}

/**
 * Append a page, dropping rows already in the feed.
 *
 * Offset paging can repeat a row when something is uploaded mid-scroll, and a
 * feed that shows the same meme twice reads as broken. Deduping by id keeps
 * the list stable without giving up simple paging.
 */
export function mergeMemePage<T extends { id: string }>(
  existing: readonly T[],
  page: readonly T[],
): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const fresh: T[] = [];
  for (const item of page) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    fresh.push(item);
  }
  return fresh.length === 0 ? [...existing] : [...existing, ...fresh];
}

/** Whether another page is worth requesting. */
export function hasMoreMemes(
  rowsInPage: number,
  pageSize: number,
  addedCount: number,
): boolean {
  // A short page means the end. A full page that added nothing new means we
  // are paging inside a region of duplicates, which would loop forever.
  if (rowsInPage < pageSize) return false;
  return addedCount > 0;
}
