import * as FileSystem from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { base64ToBytes } from "./media";
import { getSupabase } from "./supabase";

const AVATAR_BUCKET = "avatars";

/** Long edge of the stored picture. Avatars are displayed small; 512 is ample. */
const AVATAR_MAX_EDGE = 512;

/**
 * Matches the `file_size_limit` on the `avatars` bucket. Uploading anything
 * larger is rejected by storage, so we downscale first and keep the client
 * ceiling aligned with the bucket.
 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Signed-in user id, or undefined when the session is gone. */
async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? undefined;
}

export type AvatarUpload = {
  /** Public URL to store on the profile. */
  url: string;
  bytes: number;
};

/**
 * Upload a picked image as the current user's avatar.
 *
 * Writes to the public `avatars` bucket under a per-user path so re-uploading
 * replaces the previous avatar instead of accumulating orphans. The path is
 * keyed on the user id rather than a random name to keep the bucket
 * predictable and let us upsert.
 */
export async function uploadAvatar(localUri: string): Promise<AvatarUpload> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Backend not configured");
  }
  const userId = await currentUserId();
  if (!userId) {
    throw new Error("You need to be signed in to change your picture.");
  }

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error("That picture is gone. Pick it again.");
  }

  // Downscale and re-encode as JPEG: keeps us inside the bucket's size limit
  // and its allowed mime types in one step, whatever the source format was.
  const prepared = await manipulateAsync(localUri, [{ resize: { width: AVATAR_MAX_EDGE } }], {
    compress: 0.85,
    format: SaveFormat.JPEG,
  });

  const preparedInfo = await FileSystem.getInfoAsync(prepared.uri);
  // FileInfo narrows on `exists`; the size field only exists on the true case.
  if (!preparedInfo.exists) {
    throw new Error("Could not prepare that picture. Pick it again.");
  }
  if (preparedInfo.size > AVATAR_MAX_BYTES) {
    throw new Error(
      "That picture is over 2MB even after resizing. Pick a smaller one.",
    );
  }

  const base64 = await FileSystem.readAsStringAsync(prepared.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  const path = `${userId}/avatar.jpg`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}`, bytes: bytes.length };
}

export { AVATAR_MAX_EDGE };
