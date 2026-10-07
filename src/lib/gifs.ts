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
    .limit(limit);

  if (cleaned.length > 0) {
    // Match every word, so "cat dance" narrows rather than widens.
    for (const word of cleaned.split(" ")) {
      builder = builder.or(`title.ilike.%${word}%,tags.ilike.%${word}%`);
    }
  }

  const { data, error } = await builder;
  if (error || !data) return [];

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

