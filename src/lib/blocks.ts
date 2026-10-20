import { getSupabase } from "./supabase";

/**
 * Blocking.
 *
 * The enforcement lives in the database (migrations 015 and the follow/status
 * rules): message reads and inserts are filtered in both directions, new
 * direct conversations are refused, and follows are cleared. This module only
 * writes the row and reads back the caller's own decision — blocks are private,
 * so nobody can query who blocked them.
 */

export type BlockActionResult = { ok: boolean; error?: string };

async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? undefined;
}

/** Whether the signed-in user has blocked this person. */
export async function isBlocked(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !userId) return false;

  const selfId = await currentUserId();
  if (!selfId) return false;

  const { data } = await supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", selfId)
    .eq("blocked_id", userId)
    .maybeSingle();

  return Boolean(data);
}

/** Block someone. Idempotent, so a double tap is not an error. */
export async function blockUser(userId: string): Promise<BlockActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const selfId = await currentUserId();
  if (!selfId) return { ok: false, error: "You need to be signed in." };
  if (selfId === userId) {
    return { ok: false, error: "You cannot block yourself." };
  }

  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_id: selfId, blocked_id: userId },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Remove a block you placed. A no-op if there was none. */
export async function unblockUser(userId: string): Promise<BlockActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const selfId = await currentUserId();
  if (!selfId) return { ok: false, error: "You need to be signed in." };

  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", selfId)
    .eq("blocked_id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
