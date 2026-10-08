import * as FileSystem from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { base64ToBytes } from "./media";
import { getSupabase, requireSupabase } from "./supabase";
import {
  groupStatuses,
  type StatusGroup,
  type StatusKind,
  type StatusUpdate,
} from "./status-grouping";

export { groupStatuses };
export type { StatusGroup, StatusKind, StatusUpdate };

const STATUS_BUCKET = "statuses";

/** Long edge of a status photo. Viewers see it full-screen, but not 4K. */
const STATUS_MAX_EDGE = 1280;

/** Matches the `file_size_limit` on the statuses bucket. */
const STATUS_MAX_BYTES = 8 * 1024 * 1024;

/** How long a status stays up. Matches the column default in the schema. */
const STATUS_TTL_HOURS = 48;

const SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_CACHE_MAX = 200;

type StatusRow = {
  id: string;
  author_id: string;
  kind: StatusKind;
  body: string;
  media_path: string | null;
  expires_at: string;
  created_at: string;
  reply_count?: number | null;
};

function cacheSignedUrl(path: string, url: string, ttl: number): void {
  if (signedUrlCache.size >= SIGNED_URL_CACHE_MAX) {
    const oldest = signedUrlCache.keys().next();
    if (!oldest.done) signedUrlCache.delete(oldest.value);
  }
  signedUrlCache.set(path, { url, expiresAt: Date.now() + ttl * 1000 });
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Signed URL for a status photo. Statuses live in a private bucket. */
export async function statusMediaUrl(
  storagePath: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !storagePath) return null;

  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(STATUS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data) return null;

  cacheSignedUrl(storagePath, data.signedUrl, expiresIn);
  return data.signedUrl;
}

/**
 * Active statuses from people the signed-in user shares a conversation with.
 *
 * RLS already restricts visibility to mutual conversation members, so this is
 * a plain select; expired rows are filtered again client-side because the
 * policy is written in terms of membership, not `expires_at`.
 */
export async function fetchStatuses(): Promise<StatusUpdate[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("status_updates")
    .select(
      "id, author_id, kind, body, media_path, created_at, expires_at, status_replies(count)",
    )
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(60);

  if (error || !data) return [];

  const rows = data as unknown as (StatusRow & {
    status_replies?: { count: number }[] | null;
  })[];

  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const authors = await loadAuthors(authorIds);

  return rows
    .filter((row) => row.expires_at > new Date().toISOString())
    .map((row) => toStatusUpdate(row, authors));
}

type AuthorRecord = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  status: string | null;
};

type StatusViewRow = {
  viewer_id: string;
  last_viewed_at: string;
  viewer:
    | {
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      }
    | null;
};

async function loadAuthors(ids: string[]): Promise<Map<string, AuthorRecord>> {
  const supabase = getSupabase();
  const out = new Map<string, AuthorRecord>();
  if (!supabase || ids.length === 0) return out;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url, status")
    .in("id", ids);
  if (error || !data) return out;

  for (const row of data as AuthorRecord[]) out.set(row.id, row);
  return out;
}

function toStatusUpdate(
  row: StatusRow & { status_replies?: { count: number }[] | null },
  authors: Map<string, AuthorRecord>,
): StatusUpdate {
  const author = authors.get(row.author_id);
  return {
    id: row.id,
    authorId: row.author_id,
    kind: row.kind,
    body: row.body,
    mediaPath: row.media_path,
    mediaUrl: null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    replyCount: row.status_replies?.[0]?.count ?? 0,
    authorName: author?.display_name ?? "Someone",
    authorUsername: author?.username ?? "",
    authorAvatar: author?.avatar_url ?? null,
    authorPresence: author?.status ?? null,
    mine: false,
  };
}

export type PostStatusInput =
  | { kind: "text"; body: string }
  | { kind: "photo"; localUri: string };

/**
 * Post a status. Photos are downscaled and re-encoded as JPEG so we stay
 * inside the bucket's size limit and its allowed mime types.
 */
export async function postStatus(input: PostStatusInput): Promise<void> {
  const supabase = requireSupabase();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("You need to be signed in to post a status.");
  }
  const userId = userData.user.id;

  let mediaPath: string | null = null;
  let body = "";

  if (input.kind === "text") {
    body = input.body.trim();
    if (!body) throw new Error("Say something first.");
    if (body.length > 300) throw new Error("Keep it under 300 characters.");
  } else {
    const info = await FileSystem.getInfoAsync(input.localUri);
    if (!info.exists) throw new Error("That photo is gone. Pick it again.");

    const prepared = await manipulateAsync(
      input.localUri,
      [{ resize: { width: STATUS_MAX_EDGE } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    );

    const preparedInfo = await FileSystem.getInfoAsync(prepared.uri);
    if (!preparedInfo.exists) {
      throw new Error("Could not prepare that photo. Pick it again.");
    }
    if (preparedInfo.size > STATUS_MAX_BYTES) {
      throw new Error("That photo is too big even after resizing.");
    }

    const base64 = await FileSystem.readAsStringAsync(prepared.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);

    mediaPath = `${userId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(STATUS_BUCKET)
      .upload(mediaPath, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);
  }

  const { error } = await supabase.from("status_updates").insert({
    author_id: userId,
    kind: input.kind,
    body,
    media_path: mediaPath,
    expires_at: new Date(
      Date.now() + STATUS_TTL_HOURS * 3600_000,
    ).toISOString(),
  });

  if (error) throw new Error(error.message);
}

export async function deleteStatus(statusId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("status_updates")
    .delete()
    .eq("id", statusId);
  if (error) throw new Error(error.message);
}

/** Replies land on a status; the schema owns the visibility rules. */
export async function replyToStatus(
  statusId: string,
  body: string,
): Promise<void> {
  const supabase = requireSupabase();
  const trimmed = body.trim();
  if (!trimmed) return;
  if (trimmed.length > 300) throw new Error("Keep it under 300 characters.");

  const { error } = await supabase
    .from("status_replies")
    .insert({ status_id: statusId, body: trimmed });
  if (error) throw new Error(error.message);
}

export async function fetchStatusReplies(
  statusId: string,
): Promise<{ body: string; createdAt: string }[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("status_replies")
    .select("body, created_at")
    .eq("status_id", statusId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error || !data) return [];

  return (data as unknown as { body: string; created_at: string }[]).map(
    (row) => ({ body: row.body, createdAt: row.created_at }),
  );
}

export interface StatusView {
  viewerId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  viewedAt: string;
}

/**
 * Record that the signed-in user opened this status.
 *
 * Best effort by design: a failed view write must never interrupt the story,
 * so this resolves rather than throws. Re-opening updates the timestamp
 * instead of adding a row, so the count stays "people", not "opens".
 */
export async function recordStatusView(statusId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !statusId) return;

  const { error } = await supabase
    .from("status_views")
    .upsert({ status_id: statusId }, { onConflict: "status_id,viewer_id" });
  if (error) return;
}

/**
 * Who has opened a status, newest first.
 *
 * Returns `[]` rather than throwing for the same reason `searchGifs` throws
 * and this does not: a viewer list is an extra, and failing to load it should
 * leave the story readable rather than blank it.
 */
export async function fetchStatusViews(
  statusId: string,
): Promise<StatusView[]> {
  const supabase = getSupabase();
  if (!supabase || !statusId) return [];

  const { data, error } = await supabase
    .from("status_views")
    .select(
      "viewer_id, last_viewed_at, viewer:profiles!status_views_viewer_id_fkey (display_name, username, avatar_url)",
    )
    .eq("status_id", statusId)
    .order("last_viewed_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];

  return (data as unknown as StatusViewRow[])
    .filter((row) => row.viewer !== null && row.viewer !== undefined)
    .map((row) => ({
      viewerId: row.viewer_id,
      name: row.viewer?.display_name || row.viewer?.username || "Someone",
      username: row.viewer?.username ?? "",
      avatarUrl: row.viewer?.avatar_url ?? null,
      viewedAt: row.last_viewed_at,
    }));
}

export { STATUS_TTL_HOURS };
