/**
 * Self-hosted meme library.
 *
 * Metadata lives in Postgres (`memes`), files live in Cloudflare R2, and the
 * client only ever reads a public URL. This replaces an imgflip.com feed,
 * which meant the home screen depended on a third party being up and shipped
 * an external dependency we did not control.
 *
 * Paging is offset-based with a total order on (created_at desc, id desc).
 * The `id` tiebreak is what makes it safe: created_at alone is not unique, and
 * without a total order two pages can return the same row twice. New uploads
 * can still shift a page boundary, so the feed dedupes by id rather than
 * trusting the boundary to be stable.
 */

import { getSupabase } from "./supabase";
import { memeUrl } from "./meme-queries";

export type Meme = {
  id: string;
  title: string;
  tags: string;
  /** Public URL, or null when the bucket base is not configured. */
  url: string | null;
  storagePath: string;
  width: number;
  height: number;
};

export type MemePage = {
  memes: Meme[];
  /** False when the page came back short, i.e. there is nothing more. */
  hasMore: boolean;
};

export const MEME_PAGE_SIZE = 12;

/** Why this is a URL and not a signed one: memes are public, crowd-sourced
 *  content that anyone in the app is meant to be able to read. */
function mediaBase(): string {
  return (process.env.EXPO_PUBLIC_R2_MEDIA_URL ?? "").replace(/\/$/, "");
}

type MemeRow = {
  id: string;
  storage_path: string;
  title: string | null;
  tags: string | null;
  width: number;
  height: number;
};

function toMeme(row: MemeRow): Meme {
  return {
    id: row.id,
    title: row.title ?? "",
    tags: row.tags ?? "",
    storagePath: row.storage_path,
    url: memeUrl(mediaBase(), row.storage_path),
    width: row.width,
    height: row.height,
  };
}

/** The library is not configured if the bucket base is missing. */
export function isMemeLibraryConfigured(): boolean {
  return mediaBase().length > 0;
}

/**
 * One page of the feed, oldest-to-newest within the page but newest-first
 * overall. `offset` is the number of rows already loaded.
 *
 * Throws on a failed query rather than returning an empty page: an empty feed
 * is a legitimate state the UI has its own copy for, and returning [] here is
 * what previously made a network drop indistinguishable from "no memes".
 */
export async function fetchMemesPage(
  offset = 0,
  limit = MEME_PAGE_SIZE,
  query = "",
): Promise<MemePage> {
  const supabase = getSupabase();
  if (!supabase) return { memes: [], hasMore: false };

  const cleaned = query.trim().toLowerCase();
  let builder = supabase
    .from("memes")
    .select("id, storage_path, title, tags, width, height", { count: "exact" })
    // RLS already hides reported memes, but asking explicitly keeps the query
    // on the partial index `memes_feed_idx`.
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (cleaned.length > 0) {
    builder = builder.or(`title.ilike.%${cleaned}%,tags.ilike.%${cleaned}%`);
  }

  const { data, error } = await builder;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as MemeRow[];
  return { memes: rows.map(toMeme), hasMore: rows.length === limit };
}

export type ReportReason =
  | "spam"
  | "abusive"
  | "nsfw"
  | "copyright"
  | "other";

/**
 * Report a meme. Three distinct reports hide it automatically, so this is the
 * safety valve that makes open uploads survivable — do not make it decorative.
 */
export async function reportMeme(
  memeId: string,
  reason: ReportReason,
  detail?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "You need to be signed in to report." };
  }

  const { error } = await supabase.from("meme_reports").insert({
    meme_id: memeId,
    reporter_id: userData.user.id,
    reason,
    detail: detail?.slice(0, 500) ?? null,
  });

  if (error) {
    // Already reported by this person. Not a failure worth surfacing as one.
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
