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

/**
 * Public base of the upload Worker. Separate from the read base on purpose:
 * reads come from the R2 bucket, writes go through the Worker that holds the
 * credential, and the client never holds one.
 */
function uploadEndpoint(): string {
  return (process.env.EXPO_PUBLIC_MEME_UPLOAD_URL ?? "").replace(/\/$/, "");
}

export function isMemeUploadConfigured(): boolean {
  return uploadEndpoint().length > 0;
}

export type UploadMemeResult =
  | { ok: true; url: string }
  | { ok: false; error: string; rateLimited?: boolean };

/**
 * Upload an image as a meme.
 *
 * Reads the file and posts the bytes; the Worker verifies who sent them,
 * enforces the daily quota, and decides the key. Quota and file-type errors
 * come back as plain messages rather than a generic failure, because "you
 * have used your 30 for today" and "that is not an image" need different
 * responses from the user.
 */
export async function uploadMeme(
  file: { uri: string; name?: string; type?: string },
  title: string,
): Promise<UploadMemeResult> {
  const endpoint = uploadEndpoint();
  if (!endpoint) {
    return { ok: false, error: "Uploads are not configured." };
  }

  const blob = await (await fetch(file.uri)).blob();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(await getSupabase()?.auth.getSession())?.data.session?.access_token ?? ""}`,
      // The Worker sniffs the bytes; this is only a cheap first pass.
      "Content-Type": file.type ?? blob.type ?? "image/jpeg",
      "x-meme-title": title.slice(0, 140),
    },
    body: blob,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
  };

  if (response.status === 429) {
    return {
      ok: false,
      rateLimited: true,
      error: payload.error ?? "You have used your uploads for today.",
    };
  }
  if (!response.ok) {
    return { ok: false, error: payload.error ?? "Could not upload that." };
  }
  if (!payload.url) {
    return { ok: false, error: "The upload worked but came back unusable." };
  }
  return { ok: true, url: payload.url };
}

/**
 * Save a meme to the device's gallery.
 *
 * Both native modules are imported lazily so they are not pulled in for users
 * who never download anything, and so a missing module surfaces as an error
 * instead of crashing at startup.
 */
export async function downloadMeme(
  meme: Pick<Meme, "id" | "title" | "url" | "storagePath">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!meme.url) return { ok: false, error: "That meme has no file." };

  try {
    const MediaLibrary = await import("expo-media-library");
    const FileSystem = await import("expo-file-system");

    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        error: "BRO needs permission to save to your photos.",
      };
    }

    // downloadAsync rather than hand-rolling a base64 write: it streams, and
    // it does not depend on Blob.arrayBuffer behaving the same way on Hermes
    // as it does in a browser.
    const extension = meme.storagePath.split(".").pop() ?? "jpg";
    const localUri = `${FileSystem.cacheDirectory ?? ""}meme-${meme.id}.${extension}`;

    // The legacy FileSystem API reports an HTTP status, not `ok`.
    const result = await FileSystem.downloadAsync(meme.url, localUri);
    if (result.status < 200 || result.status >= 300) {
      return { ok: false, error: "Could not fetch that meme." };
    }

    await MediaLibrary.saveToLibraryAsync(result.uri);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save that meme.",
    };
  }
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
