import { getSupabase } from "./supabase";
import { fetchConversationPreviews } from "./conversations";
import type { Presence } from "./presence";

/**
 * Data access for Spaces — communities that organise conversations.
 *
 * Authorization notes that shape this file:
 *
 *   * `spaces` is readable when public, when you are a member, or when you own
 *     it. Discoverable public spaces are therefore readable before you join.
 *   * `space_members` is readable ONLY for spaces you are already a member of.
 *     That means a member count cannot be read for a public space you have not
 *     joined — the honest answer is `null`, not 0. Callers must render that
 *     as unknown rather than inventing a number.
 *   * Joining is allowed for yourself only (or by the owner); leaving is allowed
 *     for your own row. Neither trusts a client-supplied user id: the policies
 *     compare against auth.uid() server-side.
 */

export interface SpaceSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  ownerId: string;
  /** Your role, or null when you are not a member. */
  myRole: "owner" | "admin" | "member" | null;
  /**
   * Member count. `null` means "not readable" — RLS hides space_members for
   * spaces you have not joined. Never coerce this to 0.
   */
  memberCount: number | null;
  joinedAt: string | null;
}

export interface CreateSpaceInput {
  name: string;
  description?: string | null;
  isPublic?: boolean;
}

export type CreateSpaceResult =
  | { ok: true; space: SpaceSummary }
  | { ok: false; error: string };

export const SPACE_NAME_MAX = 60;
export const SPACE_DESCRIPTION_MAX = 280;

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "space";
}

interface RawSpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  is_public: boolean;
  owner_id: string;
  space_members?: Array<{
    user_id: string;
    role: "owner" | "admin" | "member";
    joined_at: string;
  }> | null;
}

function toSummary(space: RawSpace, selfId: string | undefined): SpaceSummary {
  // PostgREST embeds the caller's own membership row here (RLS exposes only
  // that), so a single element is expected when you are a member.
  const memberships = space.space_members ?? [];
  const mine = selfId
    ? memberships.find((row) => row.user_id === selfId)
    : undefined;

  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description,
    avatarUrl: space.avatar_url,
    isPublic: space.is_public,
    ownerId: space.owner_id,
    myRole: mine?.role ?? null,
    memberCount: mine ? memberships.length : null,
    joinedAt: mine?.joined_at ?? null,
  };
}

const SPACE_SELECT =
  "id, name, slug, description, avatar_url, is_public, owner_id, space_members(user_id, role, joined_at)";

export interface SpaceMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  presence: Presence | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface SpaceConversation {
  id: string;
  type: "direct" | "group" | "space" | "live";
  name: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

/** One space by id. Null when it does not exist or RLS hides it. */
export async function fetchSpace(
  spaceId: string,
): Promise<SpaceSummary | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const selfId = await currentUserId();

  const { data, error } = await supabase
    .from("spaces")
    .select(SPACE_SELECT)
    .eq("id", spaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  return toSummary(data as unknown as RawSpace, selfId);
}

/**
 * Members with their profiles. Only callable for spaces you belong to — RLS
 * hides space_members otherwise, so a non-member gets an empty list rather
 * than someone else's roster.
 */
export async function fetchSpaceMembers(
  spaceId: string,
): Promise<SpaceMember[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("space_members")
    .select(
      "user_id, role, joined_at, profile:profiles!space_members_user_id_fkey (display_name, avatar_url, presence)",
    )
    .eq("space_id", spaceId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (
    (data ?? []) as unknown as Array<{
      user_id: string;
      role: SpaceMember["role"];
      joined_at: string;
      profile: {
        display_name: string;
        avatar_url: string | null;
        presence: Presence | null;
      } | null;
    }>
  ).map((row) => ({
    userId: row.user_id,
    displayName: row.profile?.display_name ?? "Someone",
    avatarUrl: row.profile?.avatar_url ?? null,
    presence: row.profile?.presence ?? null,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

/**
 * Conversations that live inside a space, newest activity first. Reuses the
 * caller's own summaries logic but scoped to one space_id, because
 * fetchConversationSummaries does not return space membership.
 */
export async function fetchSpaceConversations(
  spaceId: string,
): Promise<SpaceConversation[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return [];
  }

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, type, name, created_at",
    )
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    type: SpaceConversation["type"];
    name: string | null;
    created_at: string;
  }>;

  // Latest message + unread per conversation, one bounded row each. See
  // fetchConversationPreviews: the embedded-select approach this replaces
  // returned every message of every conversation on each render.
  const previews = await fetchConversationPreviews(rows.map((row) => row.id));

  return rows.map((row) => {
    const preview = previews.get(row.id);

    return {
      id: row.id,
      type: row.type,
      name: row.name,
      lastMessageAt: preview?.createdAt ?? row.created_at,
      lastMessagePreview: preview?.content ?? null,
      unreadCount: preview?.unreadCount ?? 0,
    };
  });
}

async function currentUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? undefined;
}

/**
 * Spaces the caller belongs to, most recently joined first. Empty is a normal
 * state for a brand-new account.
 */
export async function fetchMySpaces(): Promise<SpaceSummary[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return [];
  }

  const { data: membershipRows, error: memberError } = await supabase
    .from("space_members")
    .select("space_id, joined_at")
    .eq("user_id", selfId);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const memberships = (membershipRows ?? []) as Array<{
    space_id: string;
    joined_at: string;
  }>;
  if (memberships.length === 0) {
    return [];
  }

  const ids = memberships.map((row) => row.space_id);
  const { data, error } = await supabase
    .from("spaces")
    .select(SPACE_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as RawSpace[])
    .map((space) => toSummary(space, selfId))
    .sort(
      (a, b) => Date.parse(b.joinedAt ?? "") - Date.parse(a.joinedAt ?? ""),
    );
}

/**
 * Public spaces the caller has NOT joined, for discovery. Spaces already joined
 * are excluded so this list is purely "somewhere new to go".
 */
export async function fetchDiscoverableSpaces(
  limit: number = 20,
): Promise<SpaceSummary[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const selfId = await currentUserId();

  const { data: mine, error: memberError } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", selfId ?? "");

  if (memberError) {
    throw new Error(memberError.message);
  }

  const joinedIds = (mine ?? []).map(
    (row: { space_id: string }) => row.space_id,
  );

  let query = supabase
    .from("spaces")
    .select(SPACE_SELECT)
    .eq("is_public", true);
  if (joinedIds.length > 0) {
    query = query.not("id", "in", `(${joinedIds.join(",")})`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  // No membership rows come back for spaces you have not joined, so memberCount
  // is null and the UI shows it as unknown.
  return ((data ?? []) as unknown as RawSpace[]).map((space) =>
    toSummary(space, selfId),
  );
}

/** Join a space as yourself. RLS requires user_id = auth.uid(), so nothing else is sent. */
export async function joinSpace(
  spaceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  // Joining twice is not an error from the caller's point of view.
  const { data: existing } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("space_id", spaceId)
    .eq("user_id", selfId)
    .maybeSingle();

  if (existing) {
    return { ok: true };
  }

  const { error } = await supabase
    .from("space_members")
    .insert({ space_id: spaceId, user_id: selfId, role: "member" });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Leave a space by removing your own membership row. Owners cannot be removed here. */
export async function leaveSpace(
  spaceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const { error } = await supabase
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", selfId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Slug candidates: base, then base-2, base-3... The unique index picks the winner. */
function slugCandidates(name: string): string[] {
  const base = slugify(name);
  return [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-5`];
}

/**
 * Create a space owned by the caller, plus their own owner membership row.
 * Both writes are attempted; if the membership write fails the space is
 * deleted again so a half-created space is never left behind.
 */
export async function createSpace(
  input: CreateSpaceInput,
): Promise<CreateSpaceResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Space needs a name" };
  }
  if (name.length > SPACE_NAME_MAX) {
    return {
      ok: false,
      error: `Keep the name under ${SPACE_NAME_MAX} characters`,
    };
  }

  const description = input.description?.trim() ?? null;
  if (description && description.length > SPACE_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Keep the description under ${SPACE_DESCRIPTION_MAX} characters`,
    };
  }

  const selfId = await currentUserId();
  if (!selfId) {
    return { ok: false, error: "Not signed in" };
  }

  const isPublic = input.isPublic ?? true;

  let lastError = "Could not create space";
  for (const slug of slugCandidates(name)) {
    const { data, error } = await supabase
      .from("spaces")
      .insert({
        name,
        slug,
        description,
        is_public: isPublic,
        owner_id: selfId,
      })
      .select(SPACE_SELECT)
      .single();

    if (error) {
      // A unique-slug collision is expected and worth retrying; anything else
      // is a real failure and should surface immediately.
      if (error.code === "23505" || error.message.includes("duplicate")) {
        lastError = error.message;
        continue;
      }
      return { ok: false, error: error.message };
    }

    const created = data as unknown as RawSpace;

    const { error: memberError } = await supabase.from("space_members").insert({
      space_id: created.id,
      user_id: selfId,
      role: "owner",
    });

    if (memberError) {
      // Roll back so we never leave an ownerless space behind.
      await supabase.from("spaces").delete().eq("id", created.id);
      return { ok: false, error: memberError.message };
    }

    return {
      ok: true,
      space: {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        avatarUrl: created.avatar_url,
        isPublic: created.is_public,
        ownerId: created.owner_id,
        myRole: "owner",
        memberCount: 1,
        joinedAt: new Date().toISOString(),
      },
    };
  }

  return { ok: false, error: lastError };
}

/** Watch membership changes so the Spaces screen stays current. */
export function subscribeToSpaces(handlers: {
  onChange: () => void;
}): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel("spaces")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "spaces" },
      () => handlers.onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "space_members" },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
