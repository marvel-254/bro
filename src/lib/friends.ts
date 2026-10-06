import { getSupabase } from "./supabase";
import type { Presence } from "./presence";

/**
 * Friendships — the real social graph behind Who's Around.
 *
 * Requests need an explicit accept, so nobody lands in your circle without
 * agreeing to be there. "Friends" means an accepted row in EITHER direction;
 * there is no symmetric table to keep in sync.
 *
 * Two invariants live in the database, not here (migration 008):
 *
 *   * Blocks win. A block deletes any friendship rows between the pair, and a
 *     request across a block is rejected outright.
 *   * Only the recipient can accept or decline, and only into
 *     accepted/declined. The requester can only cancel by deleting.
 */

export type FriendshipStatus = "pending" | "accepted" | "declined";

export interface Friend {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  presence: Presence | null;
  /** Which direction the accepted row points. Informational only. */
  direction: "outgoing" | "incoming";
  friendsSince: string;
}

export interface FriendRequest {
  /** The other party: who sent it if incoming, who should get it if outgoing. */
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  direction: "incoming" | "outgoing";
  createdAt: string;
}

export type FriendActionResult = { ok: boolean; error?: string };

async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? undefined;
}

interface ProfileStub {
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  presence: Presence | null;
}

const FALLBACK_PROFILE: ProfileStub = {
  display_name: "Someone",
  username: null,
  avatar_url: null,
  presence: null,
};

/** Everyone you are friends with, regardless of who requested first. */
export async function fetchFriends(): Promise<Friend[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return [];
  }

  const { data, error } = await supabase
    .from("friendships")
    .select(
      "requester_id, addressee_id, created_at, requester:profiles!friendships_requester_id_fkey (display_name, username, avatar_url, presence), addressee:profiles!friendships_addressee_id_fkey (display_name, username, avatar_url, presence)",
    )
    .eq("status", "accepted")
    .or(`requester_id.eq.${selfId},addressee_id.eq.${selfId}`)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []) as unknown as Array<{
      requester_id: string;
      addressee_id: string;
      created_at: string;
      requester: ProfileStub | null;
      addressee: ProfileStub | null;
    }>
  ).map((row) => {
    const outgoing = row.requester_id === selfId;
    const profile = outgoing ? row.addressee : row.requester;
    const otherId = outgoing ? row.addressee_id : row.requester_id;
    const person = profile ?? FALLBACK_PROFILE;
    return {
      userId: otherId,
      displayName: person.display_name,
      username: person.username,
      avatarUrl: person.avatar_url,
      presence: person.presence,
      direction: outgoing ? "outgoing" : "incoming",
      friendsSince: row.created_at,
    } as Friend;
  });
}

/** Pending requests in both directions, incoming first. */
export async function fetchFriendRequests(): Promise<FriendRequest[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return [];
  }

  const { data, error } = await supabase
    .from("friendships")
    .select(
      "requester_id, addressee_id, created_at, requester:profiles!friendships_requester_id_fkey (display_name, username, avatar_url), addressee:profiles!friendships_addressee_id_fkey (display_name, username, avatar_url)",
    )
    .eq("status", "pending")
    .or(`requester_id.eq.${selfId},addressee_id.eq.${selfId}`)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []) as unknown as Array<{
      requester_id: string;
      addressee_id: string;
      created_at: string;
      requester: Omit<ProfileStub, "presence"> | null;
      addressee: Omit<ProfileStub, "presence"> | null;
    }>
  ).map((row) => {
    const incoming = row.addressee_id === selfId;
    const raw = incoming ? row.requester : row.addressee;
    const person = raw ?? {
      display_name: "Someone",
      username: null,
      avatar_url: null,
    };
    return {
      userId: incoming ? row.requester_id : row.addressee_id,
      displayName: person.display_name,
      username: person.username,
      avatarUrl: person.avatar_url,
      direction: incoming ? "incoming" : "outgoing",
      createdAt: row.created_at,
    } as FriendRequest;
  });
}

function requireBackend(): { ok: false; error: string } | null {
  if (!getSupabase()) {
    return { ok: false, error: "Backend not configured" };
  }
  return null;
}

/** Ask to be friends. A repeat request while one is pending is a quiet success. */
export async function sendFriendRequest(
  addresseeId: string,
): Promise<FriendActionResult> {
  const missing = requireBackend();
  if (missing) return missing;

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }
  if (addresseeId === selfId) {
    return { ok: false, error: "That is you" };
  }

  // An existing row in either direction settles this: pending stays pending,
  // accepted stays accepted, declined gets a fresh request.
  const { data: existing, error: lookupError } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${selfId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${selfId})`,
    )
    .maybeSingle();

  if (lookupError) {
    return { ok: false, error: lookupError.message };
  }

  const row = existing as { status: FriendshipStatus } | null;
  if (row && (row.status === "pending" || row.status === "accepted")) {
    return { ok: true };
  }

  const { error } = await supabase.from("friendships").insert({
    requester_id: selfId,
    addressee_id: addresseeId,
    status: "pending",
  });

  // A declined row still occupies the ordered pair. RLS forbids updating a row
  // back to pending (the update check only allows accepted/declined), but the
  // requester may delete and re-insert, so do exactly that.
  if (error && error.code === "23505") {
    const { error: deleteError } = await supabase
      .from("friendships")
      .delete()
      .eq("requester_id", selfId)
      .eq("addressee_id", addresseeId);
    if (deleteError) {
      return { ok: false, error: deleteError.message };
    }

    const { error: retryError } = await supabase.from("friendships").insert({
      requester_id: selfId,
      addressee_id: addresseeId,
      status: "pending",
    });
    if (retryError) {
      return { ok: false, error: retryError.message };
    }
    return { ok: true };
  }

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Accept a request sent to you. */
export async function acceptFriendRequest(
  requesterId: string,
): Promise<FriendActionResult> {
  const missing = requireBackend();
  if (missing) return missing;

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("requester_id", requesterId)
    .eq("addressee_id", selfId)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Decline a request sent to you. */
export async function declineFriendRequest(
  requesterId: string,
): Promise<FriendActionResult> {
  const missing = requireBackend();
  if (missing) return missing;

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", requesterId)
    .eq("addressee_id", selfId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** End a friendship or cancel an outgoing request. Either side may do this. */
export async function removeFriend(
  otherId: string,
): Promise<FriendActionResult> {
  const missing = requireBackend();
  if (missing) return missing;

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  // Deleting needs both directions covered, so this is two statements. Either
  // may match zero rows; that is fine.
  const first = await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", selfId)
    .eq("addressee_id", otherId);

  if (first.error) {
    return { ok: false, error: first.error.message };
  }

  const second = await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", otherId)
    .eq("addressee_id", selfId);

  if (second.error) {
    return { ok: false, error: second.error.message };
  }
  return { ok: true };
}

/**
 * Whether two users are friends, for gating joinable UI. Cheap single-row
 * check in both directions. Anything but accepted reads as not friends.
 */
export async function areFriends(otherId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    return false;
  }

  const selfId = await currentUserId();
  if (!selfId || otherId === selfId) {
    return false;
  }

  const { data } = await supabase
    .from("friendships")
    .select("requester_id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${selfId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${selfId})`,
    )
    .maybeSingle();

  return data !== null;
}

/** Live updates so request badges do not go stale. */
export function subscribeToFriendships(handlers: {
  onChange: () => void;
}): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel("friendships")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
