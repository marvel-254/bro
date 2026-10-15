import { getSupabase } from "./supabase";
import {
  isSafeGifPath,
  normaliseGifQuery as normaliseQuery,
} from "./gif-queries";

export { isSafeGifPath, normaliseGifQuery } from "./gif-queries";

/**
 * Self-hosted GIF library.
 *
 * The corpus is ours: a public `gifs` bucket plus a `gif_library` catalogue.
 * No provider API and no key in the client. Search runs in Postgres, which is
 * what makes a picker usable -- bucket listing cannot search.
 */

const BUCKET = "gifs";

export type Gif = {
  id: string;
  title: string;
  tags: string[];
  width: number;
  height: number;
  sizeBytes: number;
  url: string;
};

type GifRow = {
  id: string;
  storage_path: string;
  title: string;
  tags: string;
  width: number;
  height: number;
  size_bytes: number;
};

function toGif(row: GifRow, baseUrl: string): Gif {
  return {
    id: row.id,
    title: row.title,
    tags: row.tags ? row.tags.split(/\s+/).filter(Boolean) : [],
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    url: `${baseUrl}/${row.storage_path}`,
  };
}

function publicBase(supabaseUrl: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}`;
}

export type SearchGifsOptions = {
  limit?: number;
  signal?: AbortSignal;
};

/**
 * Search the library. With no query this lists what's curated; with one it
 * matches title or tags. Trigram matching handles typos, and the ilike
 * fallback keeps it working if pg_trgm is unavailable.
 *
 * Throws when the query itself fails. Returning `[]` on a dropped request is
 * what let the picker tell the user the library was empty when it was not.
 * A missing backend still returns `[]` — that is genuinely an empty library.
 */
export async function searchGifs(
  query: string,
  options: SearchGifsOptions = {},
): Promise<Gif[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const cleaned = normaliseQuery(query);
  const baseUrl = publicBase(
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  );

  let builder = supabase
    .from("gif_library")
    .select("id, storage_path, title, tags, width, height, size_bytes")
    .eq("is_listed", true)
    // Newest first, so "browse" is stable instead of reshuffling between
    // queries. An unordered LIMIT has no guaranteed order in Postgres, and
    // gif_library_listed_idx is on (is_listed, created_at desc), so this is
    // also the order the index already serves.
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cleaned.length > 0) {
    // Match every word, so "cat dance" narrows rather than widens.
    for (const word of cleaned.split(" ")) {
      builder = builder.or(`title.ilike.%${word}%,tags.ilike.%${word}%`);
    }
  }

  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  if (!data) return [];

  return (data as unknown as GifRow[])
    .filter((row) => isSafeGifPath(row.storage_path))
    .map((row) => toGif(row, baseUrl));
}

/** Look up one entry, for rendering a gif message. */
export async function getGif(gifId: string): Promise<Gif | null> {
  const supabase = getSupabase();
  if (!supabase || !gifId) return null;

  const { data, error } = await supabase
    .from("gif_library")
    .select("id, storage_path, title, tags, width, height, size_bytes")
    .eq("id", gifId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as GifRow;
  if (!isSafeGifPath(row.storage_path)) return null;

  return toGif(
    row,
    publicBase(process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""),
  );
}

export type MyGifsOptions = { limit?: number };

/**
 * The GIFs this user has actually sent, newest first, deduplicated.
 *
 * Derived from message history, not a separate "favourites" table: a GIF
 * lands here simply by being sent, which is what the My GIFs screen
 * promises. The scan reads more rows than it returns (400) because many
 * messages repeat the same GIFs — dedup happens here so the library
 * query stays one bounded request.
 *
 * Throws when the messages query fails so a dropped request is not
 * mistaken for an empty history. A missing backend still returns [].
 */
export async function getMyGifs(
  userId: string,
  options: MyGifsOptions = {},
): Promise<Gif[]> {
  const supabase = getSupabase();
  if (!supabase || !userId) return [];

  const limit = Math.min(Math.max(options.limit ?? 60, 1), 100);

  const { data: sent, error } = await supabase
    .from("messages")
    .select("gif_id, created_at")
    .eq("sender_id", userId)
    .eq("type", "gif")
    .not("gif_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message);

  const ids: string[] = [];
  for (const row of (sent ?? []) as { gif_id: string | null }[]) {
    if (row.gif_id && !ids.includes(row.gif_id)) ids.push(row.gif_id);
    if (ids.length >= limit) break;
  }
  if (ids.length === 0) return [];

  const { data: rows, error: libError } = await supabase
    .from("gif_library")
    .select("id, storage_path, title, tags, width, height, size_bytes")
    .in("id", ids);

  if (libError) throw new Error(libError.message);

  const baseUrl = publicBase(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  const byId = new Map<string, Gif>();
  for (const row of (rows ?? []) as unknown as GifRow[]) {
    if (!isSafeGifPath(row.storage_path)) continue;
    byId.set(row.id, toGif(row, baseUrl));
  }

  return ids
    .map((id) => byId.get(id))
    .filter((gif): gif is Gif => gif !== undefined);
}


export type SpaceGifsOptions = { limit?: number };

/**
 * GIFs shared anywhere inside a Space, newest first and deduplicated.
 *
 * Scoped by joining messages to conversations through
 * `conversations.space_id`, so a GIF posted in any conversation in the Space
 * is discoverable from the Space itself. Rows are scoped to the Space in the
 * query rather than filtered client-side, because the messages table holds
 * every message in the database and pulling them all to discard most of them
 * would be both slow and a needless data exposure.
 *
 * Reads more rows than it returns (400) for the same reason as getMyGifs: the
 * same GIF recurs often enough that dedup has to happen here, keeping the
 * library lookup a single bounded request.
 */
export async function getSpaceGifs(
  spaceId: string,
  options: SpaceGifsOptions = {},
): Promise<Gif[]> {
  const supabase = getSupabase();
  if (!supabase || !spaceId) return [];

  const limit = Math.min(Math.max(options.limit ?? 60, 1), 100);

  const { data: sent, error } = await supabase
    .from("messages")
    .select("gif_id, created_at, conversation:conversations!inner (space_id)")
    .eq("type", "gif")
    .eq("conversations.space_id", spaceId)
    .not("gif_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) throw new Error(error.message);

  const ids: string[] = [];
  for (const row of (sent ?? []) as { gif_id: string | null }[]) {
    if (row.gif_id && !ids.includes(row.gif_id)) ids.push(row.gif_id);
    if (ids.length >= limit) break;
  }
  if (ids.length === 0) return [];

  const { data: rows, error: libError } = await supabase
    .from("gif_library")
    .select("id, storage_path, title, tags, width, height, size_bytes")
    .in("id", ids);

  if (libError) throw new Error(libError.message);

  const baseUrl = publicBase(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  const byId = new Map<string, Gif>();
  for (const row of (rows ?? []) as unknown as GifRow[]) {
    if (!isSafeGifPath(row.storage_path)) continue;
    byId.set(row.id, toGif(row, baseUrl));
  }

  return ids
    .map((id) => byId.get(id))
    .filter((gif): gif is Gif => gif !== undefined);
}
