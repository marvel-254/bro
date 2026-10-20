import { getSupabase } from "./supabase";
import type { Presence } from "./presence";

/**
 * Public profiles.
 *
 * A profile is the identity behind a conversation, not a social-media page:
 * who they are, whether you can message them, and the two controls BRO exposes
 * from a direct chat — follow and block. Presence is included here but callers
 * must render it only when the person allows it (see privacy settings).
 */

export interface PublicProfile {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  interests: string[];
  presence: Presence | null;
  lastSeenAt: string | null;
  isVerified: boolean;
}

export interface ProfileView {
  profile: PublicProfile;
  /** Last-seen timestamp, but only when the person shares it. */
  lastActiveAt: string | null;
  /** Whether the signed-in user follows this person. */
  following: boolean;
  /** Whether an accepted friendship exists in either direction. */
  friends: boolean;
  /** Whether the signed-in user has blocked this person. */
  blocked: boolean;
  followerCount: number;
  followingCount: number;
  isSelf: boolean;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  interests: string[] | null;
  presence: Presence | null;
  last_seen_at: string | null;
  is_verified: boolean | null;
  share_last_active?: boolean | null;
}

function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    displayName: row.display_name?.trim() || row.username || "Someone",
    username: row.username,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    interests: Array.isArray(row.interests) ? row.interests : [],
    presence: row.presence ?? null,
    lastSeenAt: row.last_seen_at,
    isVerified: Boolean(row.is_verified),
  };
}

/** One profile, without any relationship information. */
export async function fetchPublicProfile(
  userId: string,
): Promise<PublicProfile | null> {
  const supabase = getSupabase();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, avatar_url, bio, interests, presence, last_seen_at, is_verified",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toPublicProfile(data as unknown as ProfileRow);
}

/**
 * Everything the profile screen needs in one call: the person, your
 * relationship to them, and their public counts.
 */
export async function fetchProfileView(
  userId: string,
): Promise<ProfileView | null> {
  const supabase = getSupabase();
  if (!supabase || !userId) return null;

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  if (!selfId) return null;

  const profilePromise = supabase
    .from("profiles")
    .select(
      "id, display_name, username, avatar_url, bio, interests, presence, last_seen_at, is_verified, share_last_active",
    )
    .eq("id", userId)
    .maybeSingle();

  const followPromise = supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", selfId)
    .eq("followee_id", userId)
    .maybeSingle();

  const friendshipPromise = supabase
    .from("friendships")
    .select("status")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${selfId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${selfId})`,
    )
    .maybeSingle();

  const blockPromise = supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", selfId)
    .eq("blocked_id", userId)
    .maybeSingle();

  const countsPromise = supabase.rpc("profile_social_summary", {
    p_user_id: userId,
  });

  const [profileResult, followResult, friendshipResult, blockResult, countsResult] =
    await Promise.all([
      profilePromise,
      followPromise,
      friendshipPromise,
      blockPromise,
      countsPromise,
    ]);

  if (profileResult.error || !profileResult.data) return null;

  const counts = (countsResult.data ?? []) as unknown as Array<{
    follower_count: number | null;
    following_count: number | null;
  }>;
  const first = counts[0];
  const row = profileResult.data as unknown as ProfileRow;

  return {
    profile: toPublicProfile(row),
    lastActiveAt: row.share_last_active ? row.last_seen_at : null,
    following: Boolean(followResult.data),
    friends: Boolean(friendshipResult.data),
    blocked: Boolean(blockResult.data),
    followerCount: first?.follower_count ?? 0,
    followingCount: first?.following_count ?? 0,
    isSelf: selfId === userId,
  };
}
