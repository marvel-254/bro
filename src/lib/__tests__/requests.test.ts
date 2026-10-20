import {
  REPORT_REASONS,
  acceptMessageRequest,
  declineMessageRequest,
  fetchMessageRequests,
  reportUser,
  subscribeToMessageRequests,
} from "../requests";
import { fetchConversationPreviews } from "../conversations";
import { getSupabase } from "../supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));
jest.mock("../conversations", () => ({
  fetchConversationPreviews: jest.fn(),
}));

const mockedGetSupabase = getSupabase as jest.MockedFunction<
  typeof getSupabase
>;
const mockedPreviews = fetchConversationPreviews as jest.MockedFunction<
  typeof fetchConversationPreviews
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

function makeSupabase(overrides: Record<string, unknown> = {}) {
  return {
    from: jest.fn(() => createChain()),
    auth: { getUser: jest.fn() },
    channel: jest.fn(() => ({
      on: jest.fn(function (this: unknown) {
        return this;
      }),
      subscribe: jest.fn(() => ({})),
    })),
    removeChannel: jest.fn(() => Promise.resolve()),
    rpc: jest.fn(),
    ...overrides,
  } as unknown as SupabaseClient;
}

describe("fetchMessageRequests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPreviews.mockResolvedValue(new Map());
  });

  it("maps incoming requests with the peer profile and preview", async () => {
    const chain = createChain();
    chain.order.mockReturnValue(chain);
    chain.limit.mockResolvedValue({
      data: [
        {
          id: "conv-1",
          created_at: "2026-10-20T10:00:00Z",
          conversation_members: [
            {
              user_id: "peer-1",
              profile: {
                id: "peer-1",
                display_name: "  Sarah  ",
                username: "sarah",
                avatar_url: "https://example.com/a.png",
              },
            },
            { user_id: "self", profile: null },
          ],
        },
      ],
      error: null,
    });
    const supabase = makeSupabase({
      from: jest.fn(() => chain),
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "self" } } }) },
    });
    mockedGetSupabase.mockReturnValue(supabase);
    mockedPreviews.mockResolvedValue(
      new Map([
        [
          "conv-1",
          {
            conversationId: "conv-1",
            messageId: "m1",
            content: "hey there",
            senderId: "peer-1",
            createdAt: "2026-10-20T10:00:00Z",
            unreadCount: 1,
          },
        ],
      ]),
    );

    const requests = await fetchMessageRequests();

    expect(requests).toEqual([
      {
        conversationId: "conv-1",
        peerId: "peer-1",
        peerName: "Sarah",
        peerUsername: "sarah",
        peerAvatar: "https://example.com/a.png",
        preview: "hey there",
        createdAt: "2026-10-20T10:00:00Z",
      },
    ]);
    expect(mockedPreviews).toHaveBeenCalledWith(["conv-1"]);
  });

  it("excludes requests this user sent and only selects pending ones", async () => {
    const chain = createChain();
    chain.order.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: [], error: null });
    const supabase = makeSupabase({
      from: jest.fn(() => chain),
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "self" } } }) },
    });
    mockedGetSupabase.mockReturnValue(supabase);

    await fetchMessageRequests();

    expect(chain.eq).toHaveBeenCalledWith("status", "requested");
    expect(chain.neq).toHaveBeenCalledWith("requested_by", "self");
  });

  it("returns an empty list without a signed-in user", async () => {
    const supabase = makeSupabase({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchMessageRequests()).toEqual([]);
  });

  it("surfaces database errors instead of showing an empty inbox", async () => {
    const chain = createChain();
    chain.order.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: null, error: { message: "denied" } });
    const supabase = makeSupabase({
      from: jest.fn(() => chain),
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "self" } } }) },
    });
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(fetchMessageRequests()).rejects.toThrow("denied");
  });
});

describe("acceptMessageRequest / declineMessageRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls the accept RPC with the conversation id", async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    mockedGetSupabase.mockReturnValue(makeSupabase({ rpc }));

    expect(await acceptMessageRequest("conv-1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("accept_message_request", {
      p_conversation_id: "conv-1",
    });
  });

  it("calls the decline RPC with the conversation id", async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });
    mockedGetSupabase.mockReturnValue(makeSupabase({ rpc }));

    expect(await declineMessageRequest("conv-1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("decline_message_request", {
      p_conversation_id: "conv-1",
    });
  });

  it("returns the RPC error to the caller", async () => {
    const rpc = jest.fn().mockResolvedValue({ error: { message: "not yours" } });
    mockedGetSupabase.mockReturnValue(makeSupabase({ rpc }));

    expect(await acceptMessageRequest("conv-1")).toEqual({
      ok: false,
      error: "not yours",
    });
  });

  it("refuses when the backend is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);

    expect(await acceptMessageRequest("conv-1")).toEqual({
      ok: false,
      error: "Backend not configured",
    });
  });
});

describe("reportUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("records a report with an optional conversation", async () => {
    const chain = createChain();
    chain.insert.mockResolvedValue({ error: null });
    const supabase = makeSupabase({
      from: jest.fn(() => chain),
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "self" } } }) },
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await reportUser("peer", REPORT_REASONS[0], "conv-1")).toEqual({
      ok: true,
    });
    expect(chain.insert).toHaveBeenCalledWith({
      reporter_id: "self",
      reported_user_id: "peer",
      conversation_id: "conv-1",
      reason: "Spam",
    });
  });

  it("rejects reporting yourself", async () => {
    const supabase = makeSupabase({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "self" } } }) },
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await reportUser("self", "Spam")).toEqual({
      ok: false,
      error: "You cannot report yourself.",
    });
  });
});

describe("subscribeToMessageRequests", () => {
  it("watches conversations and incoming messages, and cleans up", () => {
    const channel: { on: jest.Mock; subscribe: jest.Mock } = {
      on: jest.fn(),
      subscribe: jest.fn(),
    };
    channel.on.mockReturnValue(channel);
    const on = channel.on;
    const removeChannel = jest.fn();
    mockedGetSupabase.mockReturnValue(
      makeSupabase({ channel: jest.fn(() => channel), removeChannel }),
    );

    const unsubscribe = subscribeToMessageRequests(() => {});
    unsubscribe();

    expect(on).toHaveBeenCalledTimes(2);
    expect(removeChannel).toHaveBeenCalled();
  });
});
