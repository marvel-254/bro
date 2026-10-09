import { getSupabase } from "./supabase";
import type { Presence } from "./presence";

/**
 * Follows — the graph the status feed reads through.
 *
 * Deliberately not the same thing as `friendships` (see src/lib/friends.ts).
 * A friendship is request/accept and means something about the relationship;
 * a follow is directional and needs no permission, because it is a
 * subscription to someone's stories rather than a claim about them. Only one
 * of those is appropriate for a status feed.
 *
 * The guarantees live in the database (migration 002): blocks win, so blocking
 * someone removes the follow rows in both directions and re-following across
 * a block is refused, and self-follows are impossible.
 */

export type FollowActionResult = { ok: boolean; error?: string };

export interface FollowSuggestion {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  presence: Presence | null;
  /** True when you already follow them. */
  following: boolean;
  /** How many people follow them, for the "N followers" line. */
  followerCount: number;
}

function requireBackend(): { ok: false; error: string } | null {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };
  return null;
}

/**
 * Follow someone. Idempotent: re-following updates nothing and is not an
 * error, because a double tap should not surface a failure.
 */
export async function followUser(
  followeeId: string,
): Promise<FollowActionResult> {
  const missing = requireBackend();
  if (missing) return missing;
  const supabase = getSupabase()!;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "You need to be signed in to follow." };
  }
  if (userData.user.id === followeeId) {
    return { ok: false, error: "You cannot follow yourself." };
  }

  const { error } = await supabase
    .from("follows")
    .upsert(
      { follower_id: userData.user.id, followee_id: followeeId },
      { onConflict: "follower_id,followee_id", ignoreDuplicates: true },
    );

  if (error) {
    // The blocked-follow trigger raises P0001. Surface that as the plain
    // sentence it means rather than the raw Postgres text.
    if (error.code === "P0001" || /block/i.test(error.message)) {
      return { ok: false, error: "You cannot follow this person." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Unfollow. A no-op if you were not following them. */
export async function unfollowUser(
  followeeId: string,
): Promise<FollowActionResult> {
  const missing = requireBackend();
  if (missing) return missing;
  const supabase = getSupabase()!;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "You need to be signed in to unfollow." };
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", userData.user.id)
    .eq("followee_id", followeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Whether the signed-in user follows this person. */
export async function isFollowing(
  followeeId: string,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !followeeId) return false;

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return false;

  const { data, error } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userData.user.id)
    .eq("followee_id", followeeId)
    .maybeSingle();

  return !error && Boolean(data);
}

/**
 * People worth following: everyone you do not already follow, most-followed
 * first, with who they follow so far.
 *
 * This exists because a follow-based status feed is legitimately empty on day
 * one. Without it the tray would just say "No statuses yet" forever and read as
 * broken. The RLS on `follows` only exposes edges you are an endpoint of, so
 * the "following" flag is computed client-side from the edges we can see.
 */
export async function fetchFollowSuggestions(
  limit = 12,
): Promise<FollowSuggestion[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return [];
  const me = userData.user.id;

  // Both queries are RLS-limited to rows we are an endpoint of, which is what
  // makes this correct without a service-role key.
  const [peopleResult, mineResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, presence")
      .neq("id", me)
      .limit(50),
    supabase.from("follows").select("followee_id").eq("follower_id", me),
  ]);

  if (peopleResult.error || !peopleResult.data) return [];

  const following = new Set(
    ((mineResult.data ?? []) as unknown as { followee_id: string }[]).map(
      (row) => row.followee_id,
    ),
  );

  type PersonRow = {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    presence: Presence | null;
  };

  const rows = peopleResult.data as unknown as PersonRow[];
  const unfollowed = rows.filter((row) => !following.has(row.id));

  // Follower counts need one query per person, which is fine at this size but
  // is the obvious thing to replace with a view if the candidate pool grows.
  const counts = await Promise.all(
    unfollowed.map(async (row) => {
      const { count } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followee_id", row.id);
      return count ?? 0;
    }),
  );

  return unfollowed
    .map((row, index) => ({
      id: row.id,
      name: row.display_name || row.username || "Someone",
      username: row.username ?? "",
      avatarUrl: row.avatar_url,
      presence: row.presence ?? null,
      following: false,
      followerCount: counts[index] ?? 0,
    }))
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, limit);
}
