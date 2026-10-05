import {
  SEARCH_MIN_QUERY,
  EMPTY_RESULTS,
  isSearchable,
  totalResults,
  searchPeople,
  searchSpaces,
  searchConversations,
  searchMessages,
  searchEverything,
} from "../search";
import { getSupabase } from "../supabase";
import { fetchConversationSummaries } from "../conversations";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));
jest.mock("../conversations", () => ({
  fetchConversationSummaries: jest.fn(),
}));

const mockedGetSupabase = getSupabase as jest.MockedFunction<
  typeof getSupabase
>;
const mockedSummaries = fetchConversationSummaries as jest.MockedFunction<
  typeof fetchConversationSummaries
>;

type Chain = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  gte: jest.Mock;
  gt: jest.Mock;
  lt: jest.Mock;
  or: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
  rpc: jest.Mock;
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
    rpc: jest.fn(),
    ...overrides,
  };
  return client as unknown as SupabaseClient;
}

const RESOLVED = (data: unknown, error: unknown = null) =>
  Promise.resolve({ data, error });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("search helpers", () => {
  it("requires at least two characters", () => {
    expect(SEARCH_MIN_QUERY).toBe(2);
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable("")).toBe(false);
    expect(isSearchable("  ")).toBe(false);
    expect(isSearchable("ts")).toBe(true);
  });

  it("counts results across categories", () => {
    expect(
      totalResults({
        people: [
          {
            id: "1",
            username: null,
            displayName: "A",
            avatarUrl: null,
            presence: null,
          },
        ],
        spaces: [],
        conversations: [],
        messages: [],
      }),
    ).toBe(1);
    expect(totalResults(EMPTY_RESULTS)).toBe(0);
  });
});

describe("searchPeople", () => {
  it("returns an empty array when Supabase is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await searchPeople("sarah")).toEqual([]);
  });

  it("returns an empty array for a too-short query without hitting the db", async () => {
    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await searchPeople("a")).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("maps rows and drops the caller", async () => {
    const chain = createChain();
    chain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: "peer",
              username: "sarah",
              display_name: "Sarah",
              avatar_url: null,
              presence: "online",
            },
            {
              id: "self",
              username: "me",
              display_name: "Me",
              avatar_url: null,
              presence: "online",
            },
          ],
          error: null,
        }),
      }),
    });
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await searchPeople("sarah");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "peer",
      username: "sarah",
      displayName: "Sarah",
      avatarUrl: null,
      presence: "online",
    });
  });

  it("escapes LIKE wildcards in the query", async () => {
    const chain = createChain();
    chain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    await searchPeople("100%");
    const pattern = chain.or.mock.calls[0][0] as string;
    // The % must be escaped so it cannot match everything.
    expect(pattern).toContain("\\%");
    expect(pattern).not.toMatch(/100%[^_]/);
  });

  it("throws when the query fails", async () => {
    const chain = createChain();
    chain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: "people boom" } }),
      }),
    });
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(searchPeople("sarah")).rejects.toThrow("people boom");
  });
});

describe("searchSpaces", () => {
  it("returns an empty array when Supabase is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await searchSpaces("crew")).toEqual([]);
  });

  it("reads the embedded member count array", async () => {
    const chain = createChain();
    chain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: "space-1",
              name: "The Crew",
              slug: "the-crew",
              description: "bravos",
              avatar_url: null,
              is_public: false,
              space_members: [{ count: 5 }],
            },
          ],
          error: null,
        }),
      }),
    });
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await searchSpaces("crew");
    expect(result[0].memberCount).toBe(5);
    expect(result[0].isPublic).toBe(false);
  });

  it("defaults memberCount to zero when there are no members", async () => {
    const chain = createChain();
    chain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: "space-1",
              name: "Empty",
              slug: "empty",
              description: null,
              avatar_url: null,
              is_public: true,
              space_members: [],
            },
          ],
          error: null,
        }),
      }),
    });
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    expect((await searchSpaces("empty"))[0].memberCount).toBe(0);
  });
});

describe("searchConversations", () => {
  it("returns an empty array for a too-short query without loading summaries", async () => {
    expect(await searchConversations("a")).toEqual([]);
    expect(mockedSummaries).not.toHaveBeenCalled();
  });

  it("derives a title from peers when the conversation has no name", async () => {
    mockedSummaries.mockResolvedValue([
      {
        id: "conv-1",
        type: "direct",
        name: null,
        avatar_url: null,
        last_message_at: "2026-10-03T12:00:00Z",
        last_message_preview: "uko wapi",
        last_message_sender: "peer",
        unread_count: 1,
        peers: [
          {
            user_id: "p1",
            display_name: "Sarah",
            avatar_url: null,
            presence: null,
            presence_text: null,
            presence_emoji: null,
          },
        ],
      },
    ]);

    const result = await searchConversations("sarah");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Sarah");
  });

  it("matches on the last message preview", async () => {
    mockedSummaries.mockResolvedValue([
      {
        id: "conv-1",
        type: "group",
        name: null,
        avatar_url: null,
        last_message_at: "2026-10-03T12:00:00Z",
        last_message_preview: "tacos at 7?",
        last_message_sender: "peer",
        unread_count: 0,
        peers: [],
      },
    ]);

    const result = await searchConversations("tacos");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("conv-1");
  });

  it("drops non-matching conversations and strips the internal haystack", async () => {
    mockedSummaries.mockResolvedValue([
      {
        id: "conv-1",
        type: "group",
        name: "Run Club",
        avatar_url: null,
        last_message_at: "2026-10-03T12:00:00Z",
        last_message_preview: "see you there",
        last_message_sender: "peer",
        unread_count: 0,
        peers: [],
      },
    ]);

    const result = await searchConversations("tacos");
    expect(result).toEqual([]);
  });
});

describe("searchMessages", () => {
  it("returns an empty array when Supabase is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await searchMessages("tsup")).toEqual([]);
  });

  it("calls the membership-scoped RPC and resolves sender names", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockReturnValue(
      RESOLVED([
        {
          message_id: "m1",
          conversation_id: "c1",
          sender_id: "p1",
          content: "tsup bruv",
          created_at: "2026-10-03T12:00:00Z",
        },
        {
          message_id: "m2",
          conversation_id: "c1",
          sender_id: "p2",
          content: "say less",
          created_at: "2026-10-03T11:00:00Z",
        },
      ]),
    );

    const profileChain = createChain();
    profileChain.in.mockReturnValue(
      RESOLVED([
        { id: "p1", display_name: "Sarah" },
        { id: "p2", display_name: "Tariq" },
      ]),
    );
    // Only one from() call happens here — the message rows come from rpc().
    (supabase.from as jest.Mock).mockReturnValue(profileChain);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await searchMessages("tsup");

    expect(supabase.rpc).toHaveBeenCalledWith("search_messages", {
      query: "tsup",
      result_limit: 25,
    });
    expect(result).toHaveLength(2);
    expect(result[0].senderName).toBe("Sarah");
    expect(result[1].senderName).toBe("Tariq");
  });

  it("skips the profile lookup when there are no rows", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockReturnValue(RESOLVED([]));
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await searchMessages("tsup");
    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("throws when the RPC fails", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockReturnValue(
      RESOLVED(null, { message: "rpc boom" }),
    );
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(searchMessages("tsup")).rejects.toThrow("rpc boom");
  });
});

describe("searchEverything", () => {
  it("returns the empty shape for a too-short query", async () => {
    expect(await searchEverything("a")).toEqual(EMPTY_RESULTS);
  });

  it("merges every category", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockReturnValue(RESOLVED([]));
    mockedGetSupabase.mockReturnValue(supabase);

    const peopleChain = createChain();
    peopleChain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: "p",
              username: null,
              display_name: "Sarah",
              avatar_url: null,
              presence: "online",
            },
          ],
          error: null,
        }),
      }),
    });
    const spacesChain = createChain();
    spacesChain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: "s",
              name: "Crew",
              slug: "crew",
              description: null,
              avatar_url: null,
              is_public: true,
              space_members: [{ count: 2 }],
            },
          ],
          error: null,
        }),
      }),
    });
    let call = 0;
    (supabase.from as jest.Mock).mockImplementation(() => {
      call += 1;
      return call === 1 ? peopleChain : spacesChain;
    });
    mockedSummaries.mockResolvedValue([]);

    const result = await searchEverything("cr");
    expect(result.people).toHaveLength(1);
    expect(result.spaces).toHaveLength(1);
    expect(result.conversations).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(totalResults(result)).toBe(2);
  });

  it("keeps other categories when one fails", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockReturnValue(RESOLVED([]));
    mockedGetSupabase.mockReturnValue(supabase);

    const peopleChain = createChain();
    peopleChain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: "people boom" } }),
      }),
    });
    const spacesChain = createChain();
    spacesChain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: "s",
              name: "Crew",
              slug: "crew",
              description: null,
              avatar_url: null,
              is_public: true,
              space_members: [],
            },
          ],
          error: null,
        }),
      }),
    });
    let call = 0;
    (supabase.from as jest.Mock).mockImplementation(() => {
      call += 1;
      return call === 1 ? peopleChain : spacesChain;
    });
    mockedSummaries.mockResolvedValue([]);

    const result = await searchEverything("crew");
    expect(result.people).toEqual([]);
    expect(result.spaces).toHaveLength(1);
  });

  it("throws only when every category fails", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockReturnValue(
      RESOLVED(null, { message: "rpc boom" }),
    );
    mockedGetSupabase.mockReturnValue(supabase);

    const failingChain = createChain();
    failingChain.or.mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest
          .fn()
          .mockResolvedValue({ data: null, error: { message: "boom" } }),
      }),
    });
    (supabase.from as jest.Mock).mockReturnValue(failingChain);
    mockedSummaries.mockRejectedValue(new Error("summaries boom"));

    await expect(searchEverything("crew")).rejects.toThrow();
  });
});
