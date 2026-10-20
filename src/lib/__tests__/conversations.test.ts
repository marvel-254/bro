import {
  MESSAGES_PAGE_SIZE,
  compareMessagesNewestFirst,
  fetchMessages,
  hasMessagesAfter,
  sendMessage,
  markConversationRead,
  fetchConversationSummaries,
  fetchConversationPeer,
  subscribeToConversation,
  subscribeToConversationList,
  CONVERSATION_LIST_DEBOUNCE_MS,
  fetchReactions,
  toggleReaction,
  editMessage,
  deleteMessage,
  fetchReadCursor,
  fetchReadCursors,
  createDirectConversation,
  createGroupConversation,
  fetchProfilesByIds,
  fetchMessageById,
} from "../conversations";
import { getSupabase } from "../supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.MockedFunction<
  typeof getSupabase
>;

/**
 * Chainable Supabase query-builder mock. Every method returns the chain by
 * default so `.select().eq().order().limit()` all chain. Tests override the
 * terminal method (limit / single / maybeSingle / lt / eq / in / neq) to resolve.
 */
type Chain = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  lt: jest.Mock;
  or: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
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
    auth: { getUser: jest.fn() },
    channel: jest.fn(() => createChannel()),
    removeChannel: jest.fn(() => Promise.resolve()),
    rpc: jest.fn(),
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

describe("conversations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("MESSAGES_PAGE_SIZE", () => {
    it("is 50", () => {
      expect(MESSAGES_PAGE_SIZE).toBe(50);
    });
  });

  describe("fetchMessages", () => {
    it("returns an empty array when Supabase is not configured", async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchMessages("conv-1")).toEqual([]);
    });

    it("returns messages reversed (newest-last)", async () => {
      const raw = [
        { id: "m3", created_at: "2026-10-03T12:00:00Z", content: "third" },
        { id: "m2", created_at: "2026-10-03T11:00:00Z", content: "second" },
        { id: "m1", created_at: "2026-10-03T10:00:00Z", content: "first" },
      ];
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED(raw));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchMessages("conv-1");
      expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    });

    it("throws when the query returns an error", async () => {
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED(null, { message: "boom" }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchMessages("conv-1")).rejects.toThrow("boom");
    });

    it("adds a keyset cursor when provided", async () => {
      const chain = createChain();
      chain.or.mockReturnValue(RESOLVED([]));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await fetchMessages("conv-1", 20, {
        createdAt: "2026-10-03T12:00:00Z",
        id: "m1",
      });
      // (created_at, id) keyset: strictly older than the cursor pair.
      expect(chain.or).toHaveBeenCalledWith(
        "created_at.lt.2026-10-03T12:00:00Z,and(created_at.eq.2026-10-03T12:00:00Z,id.lt.m1)",
      );
      expect(chain.limit).toHaveBeenCalledWith(20);
    });

    it("orders by created_at then id so ties cannot loop a page", async () => {
      const chain = createChain();
      const orderSpy = jest.fn().mockReturnValue(chain);
      chain.order = orderSpy;
      chain.limit.mockReturnValue(RESOLVED([]));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await fetchMessages("conv-1");

      expect(orderSpy).toHaveBeenNthCalledWith(1, "created_at", {
        ascending: false,
      });
      expect(orderSpy).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    });
  });

  describe("hasMessagesAfter", () => {
    it("returns false when Supabase is not configured", async () => {
      mockedGetSupabase.mockReturnValue(null);
      await expect(
        hasMessagesAfter("conv-1", {
          createdAt: "2026-10-03T12:00:00Z",
          id: "m1",
        }),
      ).resolves.toBe(false);
    });

    it("asks for anything strictly newer than the cursor pair", async () => {
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED([{ id: "m2" }]));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(
        hasMessagesAfter("conv-1", {
          createdAt: "2026-10-03T12:00:00Z",
          id: "m1",
        }),
      ).resolves.toBe(true);
      expect(chain.or).toHaveBeenCalledWith(
        "created_at.gt.2026-10-03T12:00:00Z,and(created_at.eq.2026-10-03T12:00:00Z,id.gt.m1)",
      );
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it("returns false when the probe errors instead of breaking the thread", async () => {
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED(null, { message: "boom" }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(
        hasMessagesAfter("conv-1", {
          createdAt: "2026-10-03T12:00:00Z",
          id: "m1",
        }),
      ).resolves.toBe(false);
    });
  });

  describe("sendMessage", () => {
    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await sendMessage("conv-1", "hello");
      expect(result).toEqual({ ok: false, error: "Backend not configured" });
    });

    it('returns "Message cannot be empty" for blank content', async () => {
      const supabase = makeSupabase();
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await sendMessage("conv-1", "   ");
      expect(result).toEqual({ ok: false, error: "Message cannot be empty" });
    });

    it('returns "Not signed in" when getUser fails', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await sendMessage("conv-1", "hello");
      expect(result).toEqual({ ok: false, error: "Not signed in" });
    });

    it("returns ok with message on success", async () => {
      const saved = {
        id: "msg-1",
        conversation_id: "conv-1",
        sender_id: "user-1",
        content: "hello",
        type: "text",
        status: "sent",
        reply_to_message_id: null,
        branch_id: null,
        created_at: "2026-10-03T12:00:00Z",
        updated_at: "2026-10-03T12:00:00Z",
      };
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED(saved));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await sendMessage("conv-1", "hello");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.message.id).toBe("msg-1");
        expect(result.message.content).toBe("hello");
      }
    });

    it("sets expires_at when expiresInSeconds is provided", async () => {
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED({ id: "msg-1" }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await sendMessage("conv-1", "hello", { expiresInSeconds: 60 });
      const insertArg = chain.insert.mock.calls[0][0];
      expect(insertArg.expires_at).toBeTruthy();
    });

    it("passes replyToMessageId and branchId to insert", async () => {
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED({ id: "msg-1" }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await sendMessage("conv-1", "reply", {
        replyToMessageId: "parent-1",
        branchId: "br-1",
      });
      const insertArg = chain.insert.mock.calls[0][0];
      expect(insertArg.reply_to_message_id).toBe("parent-1");
      expect(insertArg.branch_id).toBe("br-1");
    });

    it("sends the idempotency key with the insert", async () => {
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED({ id: "msg-1" }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await sendMessage("conv-1", "hello", { clientId: "local-1" });

      expect(chain.insert.mock.calls[0][0].client_id).toBe("local-1");
    });

    it("returns the existing row when a retry hits the client_id unique key", async () => {
      const saved = {
        id: "msg-1",
        conversation_id: "conv-1",
        sender_id: "user-1",
        content: "hello",
        type: "text",
        gif_id: null,
        status: "sent",
        reply_to_message_id: null,
        branch_id: null,
        client_id: "local-1",
        created_at: "2026-10-03T12:00:00Z",
        updated_at: "2026-10-03T12:00:00Z",
      };

      const insertChain = createChain();
      insertChain.single.mockReturnValue(
        Promise.resolve({
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        }),
      );
      const lookupChain = createChain();
      lookupChain.maybeSingle.mockReturnValue(RESOLVED({ id: "msg-1" }));
      const rowChain = createChain();
      rowChain.maybeSingle.mockReturnValue(RESOLVED(saved));

      const supabase = makeSupabase();
      (supabase.from as jest.Mock)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(lookupChain)
        .mockReturnValueOnce(rowChain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await sendMessage("conv-1", "hello", {
        clientId: "local-1",
      });

      // The retry must look like a success, not an error the user cannot act on.
      expect(result).toEqual({ ok: true, message: saved });
      expect(lookupChain.eq).toHaveBeenCalledWith("client_id", "local-1");
      expect(lookupChain.eq).toHaveBeenCalledWith("conversation_id", "conv-1");
    });

    it("still reports a unique violation that is not the retry key", async () => {
      const chain = createChain();
      chain.single.mockReturnValue(
        Promise.resolve({
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        }),
      );
      const lookupChain = createChain();
      lookupChain.maybeSingle.mockReturnValue(RESOLVED(null));

      const supabase = makeSupabase();
      (supabase.from as jest.Mock)
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(lookupChain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await sendMessage("conv-1", "hello", {
        clientId: "local-1",
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("markConversationRead", () => {
    it("does nothing when Supabase is null", async () => {
      mockedGetSupabase.mockReturnValue(null);
      await expect(
        markConversationRead("conv-1", "2026-10-20T10:00:00Z"),
      ).resolves.toBeUndefined();
    });

    it("does nothing without a usable timestamp", async () => {
      const supabase = makeSupabase();
      mockedGetSupabase.mockReturnValue(supabase);
      await markConversationRead("conv-1", "");
      await markConversationRead("conv-1", "not-a-date");
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it("advances the cursor through the monotonic RPC", async () => {
      // The cursor must be a server timestamp from the message, never the
      // device clock: a phone running behind would otherwise never mark a
      // newer message read.
      const supabase = makeSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: "2026-10-20T10:00:00Z",
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await markConversationRead("conv-1", "2026-10-20T10:00:00Z");

      expect(supabase.rpc).toHaveBeenCalledWith("mark_conversation_read", {
        p_conversation_id: "conv-1",
        p_read_at: "2026-10-20T10:00:00Z",
      });
    });

    it("swallows RPC failures so a receipt cannot break the thread", async () => {
      const supabase = makeSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: "boom" },
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(
        markConversationRead("conv-1", "2026-10-20T10:00:00Z"),
      ).resolves.toBeUndefined();
    });
  });

  describe("fetchConversationSummaries", () => {
    it("returns an empty array when Supabase is null", async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchConversationSummaries()).toEqual([]);
    });

    it("computes unread count and attaches peers", async () => {
      const convRows = [
        {
          id: "conv-1",
          type: "direct",
          name: null,
          avatar_url: null,
          created_at: "2026-10-03T10:00:00Z",
          conversation_members: [
            { user_id: "self", last_read_at: "2026-10-03T11:00:00Z" },
            { user_id: "peer-1", last_read_at: null },
          ],

        },
      ];
      const peerRows = [
        {
          conversation_id: "conv-1",
          user_id: "peer-1",
          profile: {
            id: "peer-1",
            display_name: "Peer",
            avatar_url: null,
            presence: "online",
            presence_text: null,
            presence_emoji: null,
          },
        },
      ];

      const convChain = createChain();
      convChain.limit.mockReturnValue(RESOLVED(convRows));

      const peerChain = createChain();
      peerChain.neq.mockReturnValue(RESOLVED(peerRows));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? convChain : peerChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "self" } },
        error: null,
      });
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            conversation_id: "conv-1",
            message_id: "m2",
            content: "yo",
            sender_id: "peer-1",
            created_at: "2026-10-03T12:00:00Z",
            unread_count: 2,
          },
        ],
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchConversationSummaries();
      expect(result).toHaveLength(1);
      expect(result[0].unread_count).toBe(2);
      expect(result[0].last_message_preview).toBe("yo");
      expect(result[0].last_message_sender).toBe("peer-1");
      expect(result[0].peers).toHaveLength(1);
      expect(result[0].peers[0].user_id).toBe("peer-1");
    });

    it("throws when the query errors", async () => {
      const chain = createChain();
      chain.limit.mockReturnValue(RESOLVED(null, { message: "db error" }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "self" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchConversationSummaries()).rejects.toThrow("db error");
    });
  });

  describe("subscribeToConversation", () => {
    it("returns a no-op when Supabase is null", () => {
      mockedGetSupabase.mockReturnValue(null);
      const unsub = subscribeToConversation("conv-1", {
        onInsert: jest.fn(),
        onUpdate: jest.fn(),
        onReactionChange: jest.fn(),
      });
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("subscribes and removes the channel on cleanup", () => {
      const channel = createChannel();
      const supabase = makeSupabase();
      (supabase.channel as jest.Mock).mockReturnValue(channel);
      mockedGetSupabase.mockReturnValue(supabase);

      const unsub = subscribeToConversation("conv-1", {
        onInsert: jest.fn(),
        onUpdate: jest.fn(),
        onReactionChange: jest.fn(),
      });

      expect(channel.subscribe).toHaveBeenCalledTimes(1);
      // messages INSERT/UPDATE, message_reactions, conversation_members UPDATE
      expect(channel.on).toHaveBeenCalledTimes(4);
      unsub();
      expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });
  });

  describe("subscribeToConversationList", () => {
    it("returns a no-op when Supabase is null", () => {
      mockedGetSupabase.mockReturnValue(null);
      const unsub = subscribeToConversationList({ onChange: jest.fn() });
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("subscribes to INSERT and UPDATE on messages", () => {
      const channel = createChannel();
      const supabase = makeSupabase();
      (supabase.channel as jest.Mock).mockReturnValue(channel);
      mockedGetSupabase.mockReturnValue(supabase);

      subscribeToConversationList({ onChange: jest.fn() });
      expect(channel.subscribe).toHaveBeenCalledTimes(1);
      expect(channel.on).toHaveBeenCalledTimes(2);
    });

    it("coalesces a burst of events into one refetch", () => {
      jest.useFakeTimers();
      try {
        const channel = createChannel();
        const supabase = makeSupabase();
        (supabase.channel as jest.Mock).mockReturnValue(channel);
        mockedGetSupabase.mockReturnValue(supabase);

        const onChange = jest.fn();
        subscribeToConversationList({ onChange });

        // Grab the handler registered for the message INSERT event and fire a
        // burst, as if several messages land at once.
        const insertCall = channel.on.mock.calls.find(
          (call) => (call[1] as { event?: string }).event === "INSERT",
        );
        const handler = insertCall?.[2] as () => void;
        handler();
        handler();
        handler();

        expect(onChange).not.toHaveBeenCalled();
        jest.advanceTimersByTime(CONVERSATION_LIST_DEBOUNCE_MS);
        expect(onChange).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it("cancels a pending refetch on unsubscribe", () => {
      jest.useFakeTimers();
      try {
        const channel = createChannel();
        const supabase = makeSupabase();
        (supabase.channel as jest.Mock).mockReturnValue(channel);
        mockedGetSupabase.mockReturnValue(supabase);

        const onChange = jest.fn();
        const unsub = subscribeToConversationList({ onChange });

        const insertCall = channel.on.mock.calls.find(
          (call) => (call[1] as { event?: string }).event === "INSERT",
        );
        (insertCall?.[2] as () => void)();

        unsub();
        jest.advanceTimersByTime(CONVERSATION_LIST_DEBOUNCE_MS * 2);
        expect(onChange).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("fetchReactions", () => {
    it("returns an empty object for an empty message id list", async () => {
      const supabase = makeSupabase();
      mockedGetSupabase.mockReturnValue(supabase);
      expect(await fetchReactions([])).toEqual({});
    });

    it("returns an empty object when Supabase is null", async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchReactions(["msg-1"])).toEqual({});
    });

    it("groups reactions by message_id", async () => {
      const reactions = [
        {
          id: "r1",
          message_id: "msg-1",
          user_id: "u1",
          emoji: "❤️",
          created_at: "2026-10-03T12:00:00Z",
        },
        {
          id: "r2",
          message_id: "msg-1",
          user_id: "u2",
          emoji: "❤️",
          created_at: "2026-10-03T12:01:00Z",
        },
        {
          id: "r3",
          message_id: "msg-2",
          user_id: "u1",
          emoji: "👍",
          created_at: "2026-10-03T12:02:00Z",
        },
      ];
      const chain = createChain();
      chain.in.mockReturnValue(RESOLVED(reactions));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchReactions(["msg-1", "msg-2"]);
      expect(Object.keys(result)).toHaveLength(2);
      expect(result["msg-1"]).toHaveLength(2);
      expect(result["msg-2"]).toHaveLength(1);
    });

    it("throws on query error", async () => {
      const chain = createChain();
      chain.in.mockReturnValue(RESOLVED(null, { message: "query failed" }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      await expect(fetchReactions(["msg-1"])).rejects.toThrow("query failed");
    });
  });

  describe("toggleReaction", () => {
    it("does nothing when Supabase is null", async () => {
      mockedGetSupabase.mockReturnValue(null);
      await expect(toggleReaction("msg-1", "❤️")).resolves.toBeUndefined();
    });

    it("does nothing when not signed in", async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);
      await expect(toggleReaction("msg-1", "❤️")).resolves.toBeUndefined();
    });

    it("inserts a new reaction when none exists", async () => {
      const selectChain = createChain();
      selectChain.maybeSingle.mockReturnValue(RESOLVED(null));
      const insertChain = createChain();
      insertChain.insert.mockReturnValue(RESOLVED(null));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : insertChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await toggleReaction("msg-1", "❤️");
      expect(insertChain.insert).toHaveBeenCalledWith({
        message_id: "msg-1",
        user_id: "user-1",
        emoji: "❤️",
      });
    });

    it("removes the reaction when it already exists", async () => {
      const selectChain = createChain();
      selectChain.maybeSingle.mockReturnValue(RESOLVED({ id: "react-1" }));
      const deleteChain = createChain();
      deleteChain.eq.mockReturnValue(RESOLVED(null));

      const supabase = makeSupabase();
      let callCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectChain : deleteChain;
      });
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      await toggleReaction("msg-1", "❤️");
      expect(deleteChain.delete).toHaveBeenCalled();
      expect(deleteChain.eq).toHaveBeenCalledWith("id", "react-1");
    });
  });

  describe("editMessage", () => {
    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await editMessage("msg-1", "edited");
      expect(result).toEqual({ ok: false, error: "Backend not configured" });
    });

    it('returns "Message cannot be empty" for blank content', async () => {
      const supabase = makeSupabase();
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await editMessage("msg-1", "  ");
      expect(result).toEqual({ ok: false, error: "Message cannot be empty" });
    });

    it("returns ok with updated message on success", async () => {
      const updated = {
        id: "msg-1",
        content: "edited",
        edited_at: "2026-10-03T12:00:00Z",
      };
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED(updated));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await editMessage("msg-1", "edited");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.message.id).toBe("msg-1");
      }
    });
  });

  describe("deleteMessage", () => {
    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await deleteMessage("msg-1");
      expect(result).toEqual({ ok: false, error: "Backend not configured" });
    });

    it("returns ok on successful soft delete", async () => {
      const deleted = { id: "msg-1", deleted_for_everyone: true, content: "" };
      const chain = createChain();
      chain.single.mockReturnValue(RESOLVED(deleted));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await deleteMessage("msg-1");
      expect(result.ok).toBe(true);
    });
  });

  describe("fetchReadCursor", () => {
    it("returns null when Supabase is null", async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchReadCursor("conv-1")).toBeNull();
    });

    it("returns null when not signed in", async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);
      expect(await fetchReadCursor("conv-1")).toBeNull();
    });

    it("returns last_read_at when present", async () => {
      const chain = createChain();
      chain.maybeSingle.mockReturnValue(
        RESOLVED({ last_read_at: "2026-10-03T12:00:00Z" }),
      );
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchReadCursor("conv-1")).toBe("2026-10-03T12:00:00Z");
    });

    it("returns null when last_read_at is null", async () => {
      const chain = createChain();
      chain.maybeSingle.mockReturnValue(RESOLVED({ last_read_at: null }));
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockReturnValue(chain);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      expect(await fetchReadCursor("conv-1")).toBeNull();
    });
  });

  describe("fetchReadCursors", () => {
    it("returns an empty object when Supabase is null", async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchReadCursors("conv-1")).toEqual({});
    });

    it("returns a map of user_id to last_read_at", async () => {
      const rows = [
        { user_id: "user-1", last_read_at: "2026-10-03T12:00:00Z" },
        { user_id: "user-2", last_read_at: null },
      ];
      const supabase = makeSupabase();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: rows,
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);

      const result = await fetchReadCursors("conv-1");
      expect(supabase.rpc).toHaveBeenCalledWith("conversation_read_cursors", {
        p_conversation_id: "conv-1",
      });
      expect(result).toEqual({
        "user-1": "2026-10-03T12:00:00Z",
        "user-2": null,
      });
    });
  });

  describe("createDirectConversation", () => {
    function authed() {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);
      return supabase;
    }

    it('returns "Backend not configured" when Supabase is null', async () => {
      mockedGetSupabase.mockReturnValue(null);
      const result = await createDirectConversation("peer-1");
      expect(result).toEqual({ ok: false, error: "Backend not configured" });
    });

    it('returns "Not signed in" when getUser fails', async () => {
      const supabase = makeSupabase();
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: null },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);
      const result = await createDirectConversation("peer-1");
      expect(result).toEqual({ ok: false, error: "Not signed in" });
    });

    it("calls the RPC with the peer id and returns its conversation", async () => {
      const supabase = authed();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: "new-conv",
        error: null,
      });

      const result = await createDirectConversation("peer-1");

      expect(result).toEqual({ ok: true, conversationId: "new-conv" });
      expect(supabase.rpc).toHaveBeenCalledWith("create_direct_conversation", {
        peer_id: "peer-1",
      });
      // Peer addition happens server-side now: no membership inserts from here.
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("returns the existing conversation id when the RPC finds one", async () => {
      const supabase = authed();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: "existing-conv",
        error: null,
      });

      expect(await createDirectConversation("peer-1")).toEqual({
        ok: true,
        conversationId: "existing-conv",
      });
    });

    it("surfaces an RPC failure, e.g. a blocked peer", async () => {
      const supabase = authed();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: "cannot converse: a block exists" },
      });

      expect(await createDirectConversation("peer-1")).toEqual({
        ok: false,
        error: "cannot converse: a block exists",
      });
    });

    it("rejects an empty RPC result", async () => {
      const supabase = authed();
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

      expect(await createDirectConversation("peer-1")).toEqual({
        ok: false,
        error: "Could not create conversation",
      });
    });
  });

  describe("compareMessagesNewestFirst", () => {
    const at = (created_at: string, id: string) => ({ created_at, id });

    it("orders newer first", () => {
      expect(
        compareMessagesNewestFirst(
          at("2026-10-03T12:00:00Z", "m2"),
          at("2026-10-03T11:00:00Z", "m1"),
        ),
      ).toBeLessThan(0);
    });

    it("breaks created_at ties by id so pages cannot loop", () => {
      expect(compareMessagesNewestFirst(at("2026-10-03T12:00:00Z", "b"), at("2026-10-03T12:00:00Z", "a"))).toBeLessThan(0);
      expect(compareMessagesNewestFirst(at("2026-10-03T12:00:00Z", "a"), at("2026-10-03T12:00:00Z", "a"))).toBe(0);
    });
  });

  describe("fetchConversationPeer", () => {
    function byTable(tables: Record<string, ReturnType<typeof createChain>>) {
      const supabase = makeSupabase();
      (supabase.from as jest.Mock).mockImplementation((table: string) => tables[table]);
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "self" } },
        error: null,
      });
      mockedGetSupabase.mockReturnValue(supabase);
    }

    it("returns null without a backend", async () => {
      mockedGetSupabase.mockReturnValue(null);
      expect(await fetchConversationPeer("c1")).toBeNull();
    });

    it("returns no peer for group conversations, without reading members", async () => {
      const convChain = createChain();
      convChain.eq.mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: "c1", type: "group" },
          error: null,
        }),
      });
      const members = createChain();
      byTable({ conversations: convChain, conversation_members: members });

      expect(await fetchConversationPeer("c1")).toEqual({
        type: "group",
        peerId: null,
        peerName: null,
      });
      expect(members.eq).not.toHaveBeenCalled();
    });

    it("resolves the single peer of a direct conversation", async () => {
      const convChain = createChain();
      convChain.eq.mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: "c1", type: "direct" },
          error: null,
        }),
      });

      const memberChain = createChain();
      memberChain.eq.mockReturnValue({
        neq: jest.fn().mockResolvedValue({
          data: [{ user_id: "peer", profile: { display_name: "Sarah" } }],
          error: null,
        }),
      });

      byTable({ conversations: convChain, conversation_members: memberChain });

      expect(await fetchConversationPeer("c1")).toEqual({
        type: "direct",
        peerId: "peer",
        peerName: "Sarah",
      });
    });

    it("returns no peer when the member count is not exactly one", async () => {
      const convChain = createChain();
      convChain.eq.mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: "c1", type: "direct" },
          error: null,
        }),
      });

      const memberChain = createChain();
      memberChain.eq.mockReturnValue({
        neq: jest.fn().mockResolvedValue({ data: [], error: null }),
      });

      byTable({ conversations: convChain, conversation_members: memberChain });

      expect(await fetchConversationPeer("c1")).toEqual({
        type: "direct",
        peerId: null,
        peerName: null,
      });
    });
  });
});

describe("fetchProfilesByIds", () => {
  it("returns {} without a backend or ids", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchProfilesByIds(["u1"])).toEqual({});

    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await fetchProfilesByIds([])).toEqual({});
    expect(await fetchProfilesByIds(["", ""])).toEqual({});
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("keys profiles by id and dedupes the request", async () => {
    const chain = createChain();
    chain.in.mockReturnValue(
      RESOLVED([
        { id: "u1", username: "sarah", display_name: "Sarah", avatar_url: null, status: "online" },
      ]),
    );
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchProfilesByIds(["u1", "u1", "u2"]);

    expect(chain.in).toHaveBeenCalledWith("id", ["u1", "u2"]);
    expect(result).toEqual({
      u1: {
        id: "u1",
        username: "sarah",
        display_name: "Sarah",
        avatar_url: null,
        status: "online",
      },
    });
  });

  it("returns {} when the query errors", async () => {
    const chain = createChain();
    chain.in.mockReturnValue(RESOLVED(null, { message: "down" }));
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchProfilesByIds(["u1"])).toEqual({});
  });
});

describe("createGroupConversation", () => {
  it("rejects a blank or overlong name before touching the backend", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await createGroupConversation("   ", ["u1"])).toEqual({
      ok: false,
      error: "Give the group a name (1-80 characters)",
    });
    expect(await createGroupConversation("x".repeat(81), ["u1"])).toEqual({
      ok: false,
      error: "Give the group a name (1-80 characters)",
    });
  });

  it("requires at least one other member", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await createGroupConversation("Squad", [])).toEqual({
      ok: false,
      error: "Pick at least one other bro",
    });
    expect(await createGroupConversation("Squad", ["", ""])).toEqual({
      ok: false,
      error: "Pick at least one other bro",
    });
  });

  it('returns "Backend not configured" without a client', async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await createGroupConversation("Squad", ["u1"])).toEqual({
      ok: false,
      error: "Backend not configured",
    });
  });

  it("calls the RPC with a trimmed title and deduped members", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: "conv-9", error: null });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await createGroupConversation("  Squad  ", ["u1", "u1", "u2"]);

    expect(result).toEqual({ ok: true, conversationId: "conv-9" });
    expect(supabase.rpc).toHaveBeenCalledWith("create_group_conversation", {
      group_title: "Squad",
      member_ids: ["u1", "u2"],
    });
  });

  it("surfaces an RPC failure", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "not allowed" },
    });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await createGroupConversation("Squad", ["u1"])).toEqual({
      ok: false,
      error: "not allowed",
    });
  });

  it("rejects an empty RPC result", async () => {
    const supabase = makeSupabase();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await createGroupConversation("Squad", ["u1"])).toEqual({
      ok: false,
      error: "Could not create the group",
    });
  });
});

describe("fetchMessageById", () => {
  it("returns null without a backend or id", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchMessageById("m1")).toBeNull();

    const supabase = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await fetchMessageById("")).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns the row with its sender", async () => {
    const chain = createChain();
    chain.maybeSingle.mockReturnValue(
      RESOLVED({ id: "m1", conversation_id: "c1", content: "hi" }),
    );
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchMessageById("m1")).toEqual({
      id: "m1",
      conversation_id: "c1",
      content: "hi",
    });
    expect(chain.eq).toHaveBeenCalledWith("id", "m1");
  });

  it("returns null when the row is hidden or gone", async () => {
    const chain = createChain();
    chain.maybeSingle.mockReturnValue(RESOLVED(null, { message: "nope" }));
    const supabase = makeSupabase();
    (supabase.from as jest.Mock).mockReturnValue(chain);
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchMessageById("m1")).toBeNull();
  });
});
