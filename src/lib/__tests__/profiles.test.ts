import { fetchPublicProfile, fetchProfileView } from "../profiles";
import { blockUser, isBlocked, unblockUser } from "../blocks";
import { getSupabase } from "../supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.MockedFunction<
  typeof getSupabase
>;

type Chain = Record<string, jest.Mock>;

function createChain(): Chain {
  const target: Record<string, jest.Mock> = {};
  const chain = new Proxy(target, {
    get(t, prop) {
      const key = String(prop);
      if (key === "then") return undefined;
      if (!(key in t)) t[key] = jest.fn(() => chain);
      return t[key];
    },
  });
  return chain as unknown as Chain;
}

function makeSupabase(
  chains: Record<string, Chain> = {},
  rpcResult: unknown = null,
  selfId: string | null = "self",
): SupabaseClient {
  const client = {
    from: jest.fn((table: string) => chains[table] ?? createChain()),
    rpc: jest.fn().mockResolvedValue({ data: rpcResult, error: null }),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: selfId ? { id: selfId } : null },
        error: null,
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

const PROFILE_ROW = {
  id: "peer-1",
  display_name: "Sarah",
  username: "sarah",
  avatar_url: "https://example.com/sarah.jpg",
  bio: "hello",
  interests: ["music"],
  presence: "online",
  last_seen_at: "2026-10-20T10:00:00Z",
  is_verified: true,
  share_last_active: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("fetchPublicProfile", () => {
  it("returns null without a backend", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchPublicProfile("peer-1")).toBeNull();
  });

  it("maps snake_case profile fields", async () => {
    const profiles = createChain();
    profiles.maybeSingle.mockResolvedValue({
      data: PROFILE_ROW,
      error: null,
    });
    mockedGetSupabase.mockReturnValue(
      makeSupabase({ profiles }),
    );

    const profile = await fetchPublicProfile("peer-1");
    expect(profile).toEqual({
      id: "peer-1",
      displayName: "Sarah",
      username: "sarah",
      avatarUrl: "https://example.com/sarah.jpg",
      bio: "hello",
      interests: ["music"],
      presence: "online",
      lastSeenAt: "2026-10-20T10:00:00Z",
      isVerified: true,
    });
  });

  it("falls back to the username when there is no display name", async () => {
    const profiles = createChain();
    profiles.maybeSingle.mockResolvedValue({
      data: { ...PROFILE_ROW, display_name: null },
      error: null,
    });
    mockedGetSupabase.mockReturnValue(makeSupabase({ profiles }));

    expect((await fetchPublicProfile("peer-1"))?.displayName).toBe("sarah");
  });
});

describe("fetchProfileView", () => {
  it("returns null when signed out", async () => {
    mockedGetSupabase.mockReturnValue(makeSupabase({}, null, null));
    expect(await fetchProfileView("peer-1")).toBeNull();
  });

  it("combines the profile with the relationship and counts", async () => {
    const profiles = createChain();
    profiles.maybeSingle.mockResolvedValue({
      data: { ...PROFILE_ROW, share_last_active: true },
      error: null,
    });
    const follows = createChain();
    follows.maybeSingle.mockResolvedValue({
      data: { followee_id: "peer-1" },
      error: null,
    });
    const friendships = createChain();
    friendships.maybeSingle.mockResolvedValue({
      data: { status: "accepted" },
      error: null,
    });
    const blocks = createChain();
    blocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    mockedGetSupabase.mockReturnValue(
      makeSupabase(
        { profiles, follows, friendships, blocks },
        [{ follower_count: 12, following_count: 3 }],
      ),
    );

    const view = await fetchProfileView("peer-1");
    expect(view?.following).toBe(true);
    expect(view?.friends).toBe(true);
    expect(view?.blocked).toBe(false);
    expect(view?.isSelf).toBe(false);
    expect(view?.followerCount).toBe(12);
    expect(view?.followingCount).toBe(3);
    expect(view?.lastActiveAt).toBe("2026-10-20T10:00:00Z");
  });

  it("hides last-active unless the person shares it", async () => {
    const profiles = createChain();
    profiles.maybeSingle.mockResolvedValue({ data: PROFILE_ROW, error: null });
    mockedGetSupabase.mockReturnValue(makeSupabase({ profiles }));

    const view = await fetchProfileView("peer-1");
    expect(view?.lastActiveAt).toBeNull();
    expect(view?.profile.lastSeenAt).toBe("2026-10-20T10:00:00Z");
  });

  it("marks the signed-in user's own profile", async () => {
    const profiles = createChain();
    profiles.maybeSingle.mockResolvedValue({
      data: { ...PROFILE_ROW, id: "self" },
      error: null,
    });
    mockedGetSupabase.mockReturnValue(
      makeSupabase({ profiles }, []),
    );

    const view = await fetchProfileView("self");
    expect(view?.isSelf).toBe(true);
    expect(view?.followerCount).toBe(0);
  });

  it("returns null when the profile row is missing", async () => {
    const profiles = createChain();
    profiles.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockedGetSupabase.mockReturnValue(makeSupabase({ profiles }));

    expect(await fetchProfileView("missing")).toBeNull();
  });
});

describe("blocks", () => {
  it("refuses to block yourself", async () => {
    mockedGetSupabase.mockReturnValue(makeSupabase({}));
    const result = await blockUser("self");
    expect(result.ok).toBe(false);
  });

  it("inserts a block for the signed-in user", async () => {
    const blocks = createChain();
    blocks.upsert.mockResolvedValue({ data: null, error: null });
    const supabase = makeSupabase({ blocks });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await blockUser("peer-1")).toEqual({ ok: true });
    expect(blocks.upsert).toHaveBeenCalledWith(
      { blocker_id: "self", blocked_id: "peer-1" },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );
  });

  it("surfaces an insert failure", async () => {
    const blocks = createChain();
    blocks.upsert.mockResolvedValue({
      data: null,
      error: { message: "nope" },
    });
    mockedGetSupabase.mockReturnValue(makeSupabase({ blocks }));

    expect(await blockUser("peer-1")).toEqual({ ok: false, error: "nope" });
  });

  it("deletes a block", async () => {
    const blocks = createChain();
    blocks.eq.mockReturnValueOnce({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockedGetSupabase.mockReturnValue(makeSupabase({ blocks }));

    expect(await unblockUser("peer-1")).toEqual({ ok: true });
  });

  it("reads the caller's own block row", async () => {
    const blocks = createChain();
    blocks.maybeSingle.mockResolvedValue({
      data: { blocked_id: "peer-1" },
      error: null,
    });
    mockedGetSupabase.mockReturnValue(makeSupabase({ blocks }));

    expect(await isBlocked("peer-1")).toBe(true);
  });
});
