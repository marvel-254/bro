import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { getSupabase } from "./supabase";
import { fetchMessageIdByClientId, sendMessage } from "./conversations";

/**
 * Media pipeline: pick -> compress -> upload -> attach -> send.
 *
 * What this file enforces vs. what it merely checks, stated plainly:
 *
 *   * CLIENT CHECKS (UX only): extension allowlist, the picker's declared
 *     mimeType, and the byte size read from disk. These exist so the user gets
 *     "too big, pick something smaller" in milliseconds instead of waiting for a
 *     failed upload. They prove nothing about the file.
 *   * SERVER ENFORCEMENT (the real thing): the bucket MIME allowlist and the
 *     byte limit in migration 007. Verified with scripts/verify-media-storage.sh:
 *     an executable uploads as image/png gets HTTP 400, anon cannot list
 *     chat-media, and anon reads no attachment rows. The per-file magic-byte
 *     sniffing the deep spec asks for is deliberately NOT here — it belongs in
 *     an Edge Function validator, which does not exist yet.
 *
 * Storage layout: `chat-media/<conversationId>/<sender>-<timestamp>.jpg` plus
 * a `.thumb.jpg` sibling. The first path portion is the conversation id so the
 * Storage RLS can resolve membership straight from the path.
 *
 * Failure semantics: pick -> compress -> upload -> insert attachment
 * (message_id null) -> send message -> link attachment. If the send fails after
 * the upload, an orphan row+object is left behind and `sweep_orphan_media()`
 * removes the row after 24h. That window is intentional: dying between upload
 * and link must never lose the user's photo.
 */

/** Matches the bucket `file_size_limit` in migration 007. Client pre-check only. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Long-edge cap for the full image, per the deep spec. */
export const FULL_MAX_EDGE = 1920;

/** Long-edge cap for the thumbnail. */
export const THUMB_EDGE = 400;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const FULL_QUALITY = 0.8;
const THUMB_QUALITY = 0.6;

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
}

export interface CompressedPair {
  full: { uri: string; width: number; height: number };
  thumb: { uri: string };
}

export interface AttachmentRef {
  viewOnce?: boolean;
  /** When a recipient consumed a view-once attachment; null until then. */
  viewedAt?: string | null;
  id: string;
  storagePath: string;
  thumbPath: string | null;
  mime: string;
  bytes: number;
  /** Attachment category, e.g. "image", "voice". Defaults to "image". */
  kind?: string;
}

export type SendImageResult =
  // `attachmentId` is null when the send was deduplicated: the row already
  // existed, so this attempt created no new attachment.
  | { ok: true; messageId: string; attachmentId: string | null }
  | {
      ok: false;
      error: string;
      stage: "pick" | "compress" | "upload" | "send" | "link";
    };

export type SendVoiceResult =
  | { ok: true; messageId: string; attachmentId: string | null }
  | { ok: false; error: string };

/** Long-edge resize that preserves the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge || longEdge <= 0) {
    return { width, height };
  }
  const scale = maxEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function extensionOf(fileName: string | null | undefined): string {
  if (!fileName) return "";
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Pure base64 -> bytes, no dependency. Covered by unit tests. */
export function base64ToBytes(base64: string): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const lookup = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) lookup.set(alphabet[i], i);

  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const out = new Uint8Array(((clean.length / 4) | 0) * 3 - padding);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup.get(clean[i]) ?? 0;
    const b = lookup.get(clean[i + 1]) ?? 0;
    const c = lookup.get(clean[i + 2]) ?? 0;
    const d = lookup.get(clean[i + 3]) ?? 0;
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (triple >> 16) & 0xff;
    if (o < out.length) out[o++] = (triple >> 8) & 0xff;
    if (o < out.length) out[o++] = triple & 0xff;
  }
  return out;
}

/** Pick one image from the library. Null means the user cancelled. */
export async function pickImage(): Promise<PickedImage | null> {
  const permission =
    await ImagePicker.requestMediaLibraryPermissionsAsync(false);
  if (!permission.granted) {
    throw new Error("Photo access is off. Turn it on to send a picture.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    exif: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const ext = extensionOf(asset.fileName);
  const mime =
    asset.mimeType ??
    (ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg");
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: mime,
  };
}

/** Compress to a 1920px JPEG plus a 400px thumb, in parallel. */
export async function compressImage(
  source: PickedImage,
): Promise<CompressedPair> {
  const fullTarget = fitWithin(source.width, source.height, FULL_MAX_EDGE);
  const thumbTarget = fitWithin(source.width, source.height, THUMB_EDGE);

  const [full, thumb] = await Promise.all([
    manipulateAsync(source.uri, [{ resize: { width: fullTarget.width } }], {
      compress: FULL_QUALITY,
      format: SaveFormat.JPEG,
    }),
    manipulateAsync(source.uri, [{ resize: { width: thumbTarget.width } }], {
      compress: THUMB_QUALITY,
      format: SaveFormat.JPEG,
    }),
  ]);

  return {
    full: { uri: full.uri, width: full.width, height: full.height },
    thumb: { uri: thumb.uri },
  };
}

function storageName(
  conversationId: string,
  senderId: string,
  suffix: string,
): string {
  return `${conversationId}/${senderId}-${Date.now()}${suffix}.jpg`;
}

/**
 * Upload one local file to chat-media. Reads the file as base64 and uploads
 * the decoded bytes, because supabase-js accepts ArrayBufferView as FileBody
 * (typed, no `as any`) while a bare `{uri}` object is not in the type union and
 * its behaviour differs across storage-js versions.
 */
export async function uploadChatFile(
  conversationId: string,
  senderId: string,
  localUri: string,
  suffix: string,
): Promise<{ path: string; bytes: number }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Backend not configured");
  }

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error("That photo is gone. Pick it again.");
  }
  const size = info.size ?? 0;
  if (size > MAX_IMAGE_BYTES) {
    throw new Error("That photo is over 10MB. Pick a smaller one.");
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  const path = storageName(conversationId, senderId, suffix);

  const { error } = await supabase.storage
    .from("chat-media")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });

  if (error) {
    throw new Error(error.message);
  }
  return { path, bytes: bytes.length };
}

async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? undefined;
}

export async function uploadAudioFile(
  conversationId: string,
  senderId: string,
  localUri: string,
  suffix: string,
): Promise<{ path: string; bytes: number }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Backend not configured");
  }

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error("That audio is gone. Pick it again.");
  }
  const size = info.size ?? 0;
  if (size > MAX_AUDIO_BYTES) {
    throw new Error("That audio is over 10MB. Pick a shorter one.");
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  const path = `${conversationId}/${senderId}-${Date.now()}${suffix}.m4a`;

  const { error } = await supabase.storage
    .from("chat-media")
    .upload(path, bytes, { contentType: "audio/m4a", upsert: false });

  if (error) {
    throw new Error(error.message);
  }
  return { path, bytes: bytes.length };
}
export async function insertAttachment(
  input: Omit<AttachmentRef, "id"> & { messageId: string | null; kind?: string },
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Backend not configured");
  }

  const selfId = await currentUserId();
  if (!selfId) {
    throw new Error("Not signed in");
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      message_id: input.messageId,
      uploader: selfId,
      bucket: "chat-media",
      storage_path: input.storagePath,
      thumb_path: input.thumbPath,
      mime_type: input.mime,
      size_bytes: input.bytes,
      kind: input.kind ?? "image",
      view_once: input.viewOnce ?? false,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not save the photo");
  }
  return (data as { id: string }).id;
}

/** Attachments for a page of messages, keyed by message id. */
export async function fetchMessageAttachments(
  messageIds: string[],
): Promise<Record<string, AttachmentRef>> {
  const supabase = getSupabase();
  if (!supabase || messageIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("attachments")
    .select(
      "id, message_id, storage_path, thumb_path, mime_type, size_bytes, view_once, viewed_at",
    )
    .in("message_id", messageIds);

  if (error) {
    // A missing thumbnail must not break the chat screen.
    return {};
  }

  const byMessage: Record<string, AttachmentRef> = {};
  for (const row of (data ?? []) as Array<{
    id: string;
    message_id: string;
    storage_path: string;
    thumb_path: string | null;
    mime_type: string;
    size_bytes: number;
    view_once: boolean;
    viewed_at: string | null;
  }>) {
    if (!byMessage[row.message_id]) {
      byMessage[row.message_id] = {
        id: row.id,
        storagePath: row.storage_path,
        thumbPath: row.thumb_path,
        viewOnce: row.view_once,
        viewedAt: row.viewed_at,
        mime: row.mime_type,
        bytes: row.size_bytes,
      };
    }
  }
  return byMessage;
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Bounded so a long session cannot grow it without limit. Oldest out first. */
const SIGNED_URL_CACHE_MAX = 200;

function cacheSignedUrl(path: string, url: string, expiresInSeconds: number): void {
  if (signedUrlCache.size >= SIGNED_URL_CACHE_MAX) {
    const oldest = signedUrlCache.keys().next();
    if (!oldest.done) {
      signedUrlCache.delete(oldest.value);
    }
  }
  signedUrlCache.set(path, {
    url,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  });
}

/** Signed URL for a private object, cached until just before expiry. */
/**
 * Fetch the attachment for a freshly received message, retrying briefly.
 *
 * The upload links the attachment row after inserting the message, so the
 * realtime INSERT can arrive first. A single fetch then returns nothing and the
 * bubble stays permanently blank until the thread is reopened.
 */
export async function fetchMessageAttachmentWithRetry(
  messageId: string,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<AttachmentRef | null> {
  const attempts = options.attempts ?? 4;
  const delayMs = options.delayMs ?? 400;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
    const found = await fetchMessageAttachments([messageId]);
    if (found[messageId]) {
      return found[messageId];
    }
  }

  return null;
}

export async function signedChatUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!storagePath) return null;

  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from("chat-media")
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    return null;
  }

  cacheSignedUrl(storagePath, data.signedUrl, expiresIn);
  return data.signedUrl;
}

/**
 * Full send-an-image flow. The returned `stage` tells the caller exactly where
 * a failure happened so the UI can say something useful instead of "error".
 */
/**
 * Whether a message already has media linked to it.
 *
 * A retry must distinguish "the send fully succeeded and only the response was
 * lost" from "the message row landed but the link step failed". In the first
 * case re-uploading would attach a second copy of the same photo; in the second
 * the retry is the only way to repair the message, so it has to proceed.
 */
async function messageHasAttachment(messageId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("attachments")
    .select("id")
    .eq("message_id", messageId)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function sendImageMessage(
  conversationId: string,
  caption: string,
  viewOnce = false,
  onCompressed?: (compressed: CompressedPair) => void,
  clientId?: string,
): Promise<SendImageResult> {
  if (!getSupabase()) {
    return { ok: false, error: "Backend not configured", stage: "pick" };
  }
  if (!(await currentUserId())) {
    return { ok: false, error: "Not signed in", stage: "pick" };
  }

  let picked: PickedImage | null;
  try {
    picked = await pickImage();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not open photos",
      stage: "pick",
    };
  }
  if (!picked) {
    return { ok: false, error: "cancelled", stage: "pick" };
  }

  let compressed: CompressedPair;
  try {
    compressed = await compressImage(picked);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not prepare the photo",
      stage: "compress",
    };
  }

  // Hand the compressed pair back before the network work starts, so a caller
  // can hold the local files and retry a failed upload from the outbox.
  onCompressed?.(compressed);

  return sendStoredImage(
    conversationId,
    compressed.full.uri,
    compressed.thumb.uri,
    caption,
    viewOnce,
    clientId,
  );
}

/**
 * Uploads and sends an already-compressed image pair.
 *
 * Separate from `sendImageMessage` so a failed send can be replayed from the
 * outbox without re-opening the picker. `fullUri`/`thumbUri` are local files.
 */
export async function sendStoredImage(
  conversationId: string,
  fullUri: string,
  thumbUri: string,
  caption: string,
  viewOnce = false,
  clientId?: string,
): Promise<SendImageResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured", stage: "upload" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in", stage: "upload" };
  }

  // The previous attempt may have committed even though its response was lost.
  // If its media is linked, report that as the send. If the row exists but the
  // link failed, fall through: sendMessage returns the existing row (duplicate
  // key) and this upload is linked to it, repairing the message.
  if (clientId) {
    const existing = await fetchMessageIdByClientId(conversationId, clientId);
    if (existing && (await messageHasAttachment(existing))) {
      return { ok: true, messageId: existing, attachmentId: null };
    }
  }

  let fullPath: string;
  let thumbPath: string;
  let byteCount: number;
  try {
    const [full, thumb] = await Promise.all([
      uploadChatFile(conversationId, selfId, fullUri, ""),
      uploadChatFile(conversationId, selfId, thumbUri, "-thumb"),
    ]);
    fullPath = full.path;
    thumbPath = thumb.path;
    byteCount = full.bytes;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed",
      stage: "upload",
    };
  }

  let attachmentId: string;
  try {
    attachmentId = await insertAttachment({
      viewOnce: viewOnce,
      storagePath: fullPath,
      thumbPath,
      mime: "image/jpeg",
      bytes: byteCount,
      messageId: null,
    });
  } catch (err) {
    // The objects are now orphans; the 24h sweeper cleans the row, and the
    // bucket holds nothing sensitive beyond an unreachable photo.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save the photo",
      stage: "upload",
    };
  }

  const sent = await sendMessage(conversationId, caption, {
    messageType: "image",
    clientId,
  });
  if (!sent.ok) {
    return { ok: false, error: sent.error, stage: "send" };
  }

  try {
    // `.select()` makes PostgREST return the affected rows. Without it a
    // zero-row update (e.g. an RLS policy filtering the row out) reports
    // success, which is how every photo silently ended up unlinked before
    // 20261019000100_attachment_link_policy.sql.
    const { data: linked, error } = await supabase
      .from("attachments")
      .update({ message_id: sent.message.id })
      .eq("id", attachmentId)
      .select("id");
    if (error) {
      throw new Error(error.message);
    }
    if (!linked || linked.length === 0) {
      throw new Error("Could not link the photo");
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not link the photo",
      stage: "link",
    };
  }

  return { ok: true, messageId: sent.message.id, attachmentId };
}


/** Image types a keyboard/share source may hand us. */
export const SHARED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const SHARED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sharedStorageName(
  conversationId: string,
  senderId: string,
  extension: string,
): string {
  return `${conversationId}/${senderId}-${Date.now()}-shared.${extension}`;
}

/**
 * Send an image that arrived from outside the picker (Android keyboard rich
 * content or a share target).
 *
 * Unlike `sendImageMessage` this keeps the original bytes and MIME type, so a
 * GIF stays animated and a WebP stays a WebP. The content URI has already
 * been copied to the app cache by the native receiver, which is why uploading
 * from a local `file://` URI is safe here.
 */
export async function sendSharedImageMessage(
  conversationId: string,
  localUri: string,
  mimeType: string,
  caption = "",
  clientId?: string,
): Promise<SendImageResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured", stage: "pick" };
  }

  const mime = mimeType.toLowerCase();
  const extension = SHARED_EXTENSIONS[mime];
  if (!extension) {
    return {
      ok: false,
      error: "That attachment type is not supported.",
      stage: "pick",
    };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in", stage: "upload" };
  }

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    return {
      ok: false,
      error: "That attachment is gone. Try again.",
      stage: "pick",
    };
  }
  if ((info.size ?? 0) > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: "That attachment is over 10MB.",
      stage: "upload",
    };
  }

  let path: string;
  let byteCount: number;
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);
    path = sharedStorageName(conversationId, selfId, extension);
    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    byteCount = bytes.length;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed",
      stage: "upload",
    };
  }

  let attachmentId: string;
  try {
    attachmentId = await insertAttachment({
      storagePath: path,
      thumbPath: null,
      mime,
      bytes: byteCount,
      messageId: null,
      kind: "image",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save the image",
      stage: "upload",
    };
  }

  const sent = await sendMessage(conversationId, caption, {
    messageType: "image",
    clientId,
  });
  if (!sent.ok) {
    return { ok: false, error: sent.error, stage: "send" };
  }

  try {
    const { data: linked, error } = await supabase
      .from("attachments")
      .update({ message_id: sent.message.id })
      .eq("id", attachmentId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!linked || linked.length === 0) {
      throw new Error("Could not link the image");
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not link the image",
      stage: "link",
    };
  }

  return { ok: true, messageId: sent.message.id, attachmentId };
}

/**
 * Uploads and sends a voice note from a local file.
 *
 * `VoiceRecorder` owns recording and playback; this is the send half, factored
 * out so a queued voice note can be replayed after a failed send.
 */
export async function sendStoredVoice(
  conversationId: string,
  localUri: string,
  clientId?: string,
): Promise<SendVoiceResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const selfId = await currentUserId();
  if (!selfId) return { ok: false, error: "Not signed in" };

  // Same idempotency rule as images, including the link-stage repair case.
  if (clientId) {
    const existing = await fetchMessageIdByClientId(conversationId, clientId);
    if (existing && (await messageHasAttachment(existing))) {
      return { ok: true, messageId: existing, attachmentId: null };
    }
  }

  try {
    const { path, bytes } = await uploadAudioFile(
      conversationId,
      selfId,
      localUri,
      "-voice",
    );

    const attachmentId = await insertAttachment({
      storagePath: path,
      thumbPath: null,
      mime: "audio/m4a",
      bytes,
      kind: "voice",
      messageId: null,
    });

    const sent = await sendMessage(conversationId, "", {
      messageType: "voice",
      clientId,
    });
    if (!sent.ok) throw new Error(sent.error);

    const { data: linked, error: linkError } = await supabase
      .from("attachments")
      .update({ message_id: sent.message.id })
      .eq("id", attachmentId)
      .select("id");
    if (linkError) throw new Error(linkError.message);
    if (!linked || linked.length === 0) {
      throw new Error("Could not link that voice note");
    }

    return { ok: true, messageId: sent.message.id, attachmentId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not send that voice note",
    };
  }
}
