import {
  ACTIVITY_PAGE_SIZE,
  fetchActivity,
  fetchUnreadActivityCount,
  markActivityRead,
  markAllActivityRead,
  subscribeToActivity,
  describeActivity,
  relativeTime,
} from "../activity";
import { getSupabase } from "../supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.MockedFunction<
  typeof getSupabase
>;

type Chain = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  lt: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
};

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

function makeSupabase(overrides: Record<string, unknown> = {}): SupabaseClient {
  const client = {
    from: jest.fn((_table: string) => createChain()),
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: "self" } }, error: null }),
    },
    channel: jest.fn(() => createChannel()),
    removeChannel: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
  return client as unknown as SupabaseClient;
}

function createChannel() {
  const channel: Record<string, jest.Mock> = {
    on: jest.fn(() => channel),
    subscribe: jest.fn(() => channel),
  };
  return channel;
}

const RESOLVED = (data: unknown, error: unknown = null) =>
  Promise.resolve({ data, error });

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "n1",
    activity_id: "a1",
    is_read: false,
    deep_link: "/chat",
    created_at: "2026-10-03T12:00:00Z",
    activity: {
      id: "a1",
      type: "reply",
      actor_id: "peer",
      target_id: "m1",
      target_type: "message",
      actor: {
        id: "peer",
        display_name: "Sarah",
        avatar_url: null,
        presence: "online",
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("describeActivity", () => {
  it("describes each type in plain English", () => {
    expect(describeActivity("reply", "Sarah", "message")).toBe(
      "Sarah replied to you",
    );
    expect(describeActivity("mention", "Nia", "user")).toBe(
      "Nia mentioned you",
    );
    expect(describeActivity("reaction", "Tariq", "message")).toBe(
      "Tariq reacted to your message",
    );
    expect(describeActivity("follow", "Brian", "user")).toBe(
      "Brian followed you",
    );
  });

  it("mentions the space when the target is a space", () => {
    expect(describeActivity("join", "Alex", "space")).toBe(
      "Alex joined your space",
    );
  });

  it("falls back to a generic join line without a space target", () => {
    expect(describeActivity("join", "Alex", null)).toBe("Alex joined");
  });
});

describe("relativeTime", () => {
  it("labels recent times coarsely", () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 5_000).toISOString())).toBe("now");
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe("5m");
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe(
      "3h",
    );
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe(
      "2d",
    );
  });

  it("falls back to a date beyond a week", () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect(relativeTime(old)).toMatch(/[A-Za-z]{3}/);
  });
});

describe("fetchActivity", () => {
  it("uses a cursor page size", () => {
    expect(ACTIVITY_PAGE_SIZE).toBe(30);
  });

  it("returns an empty array when Supabase is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchActivity()).toEqual([]);
  });

  it("maps notification rows with their joined actor", async () => {
    const chain = createChain();
    chain.limit.mockReturnValue(RESOLVED([notificationRow()]));
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchActivity();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      notificationId: "n1",
      activityId: "a1",
      type: "reply",
      actorId: "peer",
      actorName: "Sarah",
      actorAvatarUrl: null,
      actorPresence: "online",
      targetId: "m1",
      targetType: "message",
      deepLink: "/chat",
      isRead: false,
      createdAt: "2026-10-03T12:00:00Z",
    });
  });

  it("drops rows whose activity join came back empty", async () => {
    const chain = createChain();
    chain.limit.mockReturnValue(
      RESOLVED([notificationRow({ activity: null }), notificationRow()]),
    );
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchActivity()).toHaveLength(1);
  });

  it("never renders a blank actor name", async () => {
    const chain = createChain();
    chain.limit.mockReturnValue(
      RESOLVED([
        notificationRow({
          activity: {
            id: "a1",
            type: "mention",
            actor_id: "ghost",
            target_id: "self",
            target_type: "user",
            actor: null,
          },
        }),
      ]),
    );
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchActivity();
    expect(result[0].actorName).toBe("Someone");
  });

  it("adds a before cursor when paginating", async () => {
    const chain = createChain();
    // limit() returns the chain, then the cursor is applied with lt().
    chain.limit.mockReturnValue(chain);
    chain.lt.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    await fetchActivity("2026-10-03T12:00:00Z");
    expect(chain.lt).toHaveBeenCalledWith("created_at", "2026-10-03T12:00:00Z");
  });

  it("throws when the query fails", async () => {
    const chain = createChain();
    chain.limit.mockReturnValue(RESOLVED(null, { message: "activity boom" }));
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(fetchActivity()).rejects.toThrow("activity boom");
  });
});

describe("fetchUnreadActivityCount", () => {
  it("returns 0 when Supabase is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchUnreadActivityCount()).toBe(0);
  });

  it("counts only unread rows", async () => {
    const chain = createChain();
    chain.eq.mockReturnValue(Promise.resolve({ count: 4, error: null }));
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchUnreadActivityCount()).toBe(4);
    expect(chain.eq).toHaveBeenCalledWith("is_read", false);
  });

  it("swallows errors because a badge is not worth an error state", async () => {
    const chain = createChain();
    chain.eq.mockReturnValue(
      Promise.resolve({ count: null, error: { message: "boom" } }),
    );
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchUnreadActivityCount()).toBe(0);
  });
});

describe("markActivityRead", () => {
  it("does nothing without a backend", async () => {
    mockedGetSupabase.mockReturnValue(null);
    await expect(markActivityRead(["n1"])).resolves.toBeUndefined();
  });

  it("does nothing for an empty id list", async () => {
    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    await markActivityRead([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("updates only the given ids", async () => {
    const chain = createChain();
    chain.in.mockReturnValue(Promise.resolve({ data: null, error: null }));
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    await markActivityRead(["n1", "n2"]);
    expect(chain.update).toHaveBeenCalledWith({ is_read: true });
    expect(chain.in).toHaveBeenCalledWith("id", ["n1", "n2"]);
  });
});

describe("markAllActivityRead", () => {
  it("does nothing without a backend", async () => {
    mockedGetSupabase.mockReturnValue(null);
    await expect(markAllActivityRead()).resolves.toBeUndefined();
  });

  it("clears every unread row", async () => {
    const chain = createChain();
    chain.eq.mockReturnValue(Promise.resolve({ data: null, error: null }));
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    await markAllActivityRead();
    expect(chain.update).toHaveBeenCalledWith({ is_read: true });
    expect(chain.eq).toHaveBeenCalledWith("is_read", false);
  });
});

describe("subscribeToActivity", () => {
  it("returns a no-op when Supabase is not configured", () => {
    mockedGetSupabase.mockReturnValue(null);
    const unsub = subscribeToActivity({ onChange: jest.fn() });
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("watches notifications and cleans up the channel", () => {
    const channel = createChannel();
    const supabase = makeSupabase();
    (supabase.channel as jest.Mock).mockReturnValue(channel);
    mockedGetSupabase.mockReturnValue(supabase);

    const unsub = subscribeToActivity({ onChange: jest.fn() });

    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    unsub();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });
});
