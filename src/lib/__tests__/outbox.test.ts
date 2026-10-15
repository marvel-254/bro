import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  appendEntry,
  backoffDelayMs,
  bumpAttempts,
  entriesFor,
  findEntry,
  flushConversation,
  OutboxEntry,
  parseOutbox,
  pruneExpired,
  queueMessage,
  readOutbox,
  removeEntry,
} from "../outbox";

// Minimal in-memory stand-in. The package ships its own jest mock, but it
// pulls in globals this environment does not define; the outbox only ever
// calls getItem/setItem/removeItem, so a few lines are enough and keep the
// test independent of that file.
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({
  clientId: "local-1",
  conversationId: "conv-1",
  content: "hello",
  replyToMessageId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  attempts: 0,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("parseOutbox", () => {
  it("returns empty for null, empty, and malformed input", () => {
    expect(parseOutbox(null)).toEqual([]);
    expect(parseOutbox("")).toEqual([]);
    expect(parseOutbox("{not json")).toEqual([]);
    expect(parseOutbox('{"a":1}')).toEqual([]);
  });

  it("round-trips a valid entry", () => {
    const original = entry({ replyToMessageId: "msg-9", attempts: 3 });
    const parsed = parseOutbox(JSON.stringify([original]));
    expect(parsed).toEqual([original]);
  });

  it("drops malformed entries but keeps valid siblings", () => {
    const raw = JSON.stringify([
      entry({ clientId: "good" }),
      { clientId: 42, conversationId: "c", content: "x", createdAt: "d" },
      null,
      "garbage",
      { conversationId: "c", content: "x", createdAt: "d" },
    ]);
    expect(parseOutbox(raw).map((item) => item.clientId)).toEqual(["good"]);
  });

  it("normalises a missing replyToMessageId to null", () => {
    const raw = JSON.stringify([
      {
        clientId: "a",
        conversationId: "c",
        content: "x",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(parseOutbox(raw)[0].replyToMessageId).toBeNull();
  });

  it("treats a negative or non-numeric attempt count as zero", () => {
    const raw = JSON.stringify([
      entry({ clientId: "a", attempts: -5 }),
      entry({ clientId: "b", attempts: "many" as unknown as number }),
    ]);
    expect(parseOutbox(raw).map((item) => item.attempts)).toEqual([0, 0]);
  });
});

describe("entry collection helpers", () => {
  it("appends without duplicating an existing clientId", () => {
    const first = appendEntry([], entry({ clientId: "a", content: "one" }));
    const second = appendEntry(first, entry({ clientId: "a", content: "two" }));
    expect(second).toHaveLength(1);
    expect(second[0].content).toBe("two");
  });

  it("removes by clientId", () => {
    const list = [entry({ clientId: "a" }), entry({ clientId: "b" })];
    expect(removeEntry(list, "a").map((item) => item.clientId)).toEqual(["b"]);
  });

  it("finds an entry by clientId", () => {
    const list = [entry({ clientId: "a" }), entry({ clientId: "b" })];
    expect(findEntry(list, "b")?.clientId).toBe("b");
    expect(findEntry(list, "missing")).toBeUndefined();
  });

  it("bumps attempts only for the matching entry", () => {
    const list = [entry({ clientId: "a", attempts: 1 }), entry({ clientId: "b" })];
    const bumped = bumpAttempts(list, "a");
    expect(findEntry(bumped, "a")?.attempts).toBe(2);
    expect(findEntry(bumped, "b")?.attempts).toBe(0);
  });

  it("orders conversation entries oldest first", () => {
    const list = [
      entry({ clientId: "late", createdAt: "2026-01-03T00:00:00.000Z" }),
      entry({ clientId: "early", createdAt: "2026-01-01T00:00:00.000Z" }),
      entry({ clientId: "other", conversationId: "conv-2" }),
    ];
    expect(entriesFor(list, "conv-1").map((item) => item.clientId)).toEqual([
      "early",
      "late",
    ]);
  });
});

describe("pruneExpired", () => {
  it("drops entries older than the retention window and unparseable dates", () => {
    const now = Date.parse("2026-02-01T00:00:00.000Z");
    const list = [
      entry({ clientId: "fresh", createdAt: "2026-01-31T00:00:00.000Z" }),
      entry({ clientId: "ancient", createdAt: "2020-01-01T00:00:00.000Z" }),
      entry({ clientId: "broken", createdAt: "not-a-date" }),
    ];
    expect(pruneExpired(list, now).map((item) => item.clientId)).toEqual(["fresh"]);
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially and stays capped", () => {
    expect(backoffDelayMs(0)).toBe(1000);
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(2)).toBe(4000);
    expect(backoffDelayMs(30)).toBe(5 * 60 * 1000);
  });

  it("treats negative attempts as the first attempt", () => {
    expect(backoffDelayMs(-3)).toBe(1000);
  });
});

describe("persistence", () => {
  it("queues a message and reads it back", async () => {
    const queued = await queueMessage({
      conversationId: "conv-1",
      content: "sent while offline",
    });
    const stored = await readOutbox();
    expect(stored).toHaveLength(1);
    expect(stored[0].clientId).toBe(queued.clientId);
    expect(stored[0].content).toBe("sent while offline");
  });

  it("preserves a supplied clientId so a retry reuses the same identity", async () => {
    const queued = await queueMessage({
      conversationId: "conv-1",
      content: "x",
      clientId: "stable-id",
    });
    expect(queued.clientId).toBe("stable-id");
    expect((await readOutbox())[0].clientId).toBe("stable-id");
  });
});

describe("flushConversation", () => {
  it("sends queued entries oldest-first and removes them on success", async () => {
    await queueMessage({
      conversationId: "conv-1",
      content: "first",
      clientId: "c1",
    });
    await queueMessage({
      conversationId: "conv-1",
      content: "second",
      clientId: "c2",
    });

    const sent: string[] = [];
    const result = await flushConversation({
      conversationId: "conv-1",
      send: async (item) => {
        sent.push(item.content);
        return { ok: true, messageId: `srv-${item.clientId}` };
      },
    });

    expect(sent).toEqual(["first", "second"]);
    expect(result).toEqual({ sent: 2, failed: 0, remaining: 0 });
    expect(await readOutbox()).toHaveLength(0);
  });

  it("reports the server id back for each sent message", async () => {
    await queueMessage({ conversationId: "conv-1", content: "x", clientId: "c1" });
    const onSent = jest.fn();
    await flushConversation({
      conversationId: "conv-1",
      send: async () => ({ ok: true, messageId: "srv-1" }),
      onSent,
    });
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1" }), "srv-1");
  });

  it("stops at the first failure and keeps the unsent entries queued", async () => {
    await queueMessage({ conversationId: "conv-1", content: "first", clientId: "c1" });
    await queueMessage({ conversationId: "conv-1", content: "second", clientId: "c2" });

    const onFailure = jest.fn();
    let calls = 0;
    const result = await flushConversation({
      conversationId: "conv-1",
      send: async () => {
        calls += 1;
        return { ok: false };
      },
      onFailure,
    });

    // One attempt only: pushing on while the network is down would burn every
    // attempt counter and make the real backoff useless.
    expect(calls).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(2);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(await readOutbox()).toHaveLength(2);
  });

  it("records an attempt when send throws", async () => {
    await queueMessage({ conversationId: "conv-1", content: "x", clientId: "c1" });
    const onFailure = jest.fn();
    const result = await flushConversation({
      conversationId: "conv-1",
      send: async () => {
        throw new Error("network down");
      },
      onFailure,
    });
    expect(result.failed).toBe(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect((await readOutbox())[0].attempts).toBe(1);
  });

  it("grows the attempt counter across repeated failures", async () => {
    await queueMessage({ conversationId: "conv-1", content: "x", clientId: "c1" });
    for (let i = 1; i <= 3; i += 1) {
      await flushConversation({
        conversationId: "conv-1",
        send: async () => ({ ok: false }),
      });
      expect((await readOutbox())[0].attempts).toBe(i);
    }
  });

  it("does not touch entries belonging to another conversation", async () => {
    await queueMessage({ conversationId: "conv-1", content: "mine", clientId: "c1" });
    await queueMessage({ conversationId: "conv-2", content: "theirs", clientId: "c2" });

    const result = await flushConversation({
      conversationId: "conv-1",
      send: async () => ({ ok: true, messageId: "srv-1" }),
    });

    expect(result.sent).toBe(1);
    const left = await readOutbox();
    expect(left).toHaveLength(1);
    expect(left[0].conversationId).toBe("conv-2");
  });

  it("is a no-op when nothing is queued", async () => {
    const result = await flushConversation({
      conversationId: "conv-1",
      send: async () => ({ ok: true }),
    });
    expect(result).toEqual({ sent: 0, failed: 0, remaining: 0 });
  });

  it("recovers even when storage was corrupted", async () => {
    await AsyncStorage.setItem("bro:outbox:v1", "}{not json");
    const result = await flushConversation({
      conversationId: "conv-1",
      send: async () => ({ ok: true }),
    });
    expect(result).toEqual({ sent: 0, failed: 0, remaining: 0 });
  });
});