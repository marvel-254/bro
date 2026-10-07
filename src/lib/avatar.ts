import * as FileSystem from "expo-file-system";
import { base64ToBytes, MAX_IMAGE_BYTES } from "./media";
import { getSupabase } from "./supabase";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_EDGE = 512;

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
  const size = typeof info.size === "number" ? info.size : 0;
  if (size > MAX_IMAGE_BYTES) {
    throw new Error("That picture is over 10MB. Pick a smaller one.");
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  const extension = localUri.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeExt = /^[a-z0-9]{2,5}$/.test(extension) ? extension : "jpg";
  const path = `${userId}/avatar.${safeExt}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, {
      contentType: `image/${safeExt === "jpg" ? "jpeg" : safeExt}`,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}`, bytes: bytes.length };
}

export { AVATAR_MAX_EDGE };
