import { getSpaceGifs } from "../gifs";
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

function libRow(id: string, storagePath: string) {
  return {
    id,
    storage_path: storagePath,
    title: `gif ${id}`,
    tags: "fun",
    width: 480,
    height: 480,
    size_bytes: 1234,
  };
}

/** messages resolves on .limit(), gif_library on .in(). */
function makeClient(
  sentRows: unknown[],
  libRows: unknown[],
  opts: { sentError?: string; libError?: string } = {},
) {
  const messages = createChain();
  messages.limit = jest.fn(() =>
    Promise.resolve(
      opts.sentError
        ? { data: null, error: { message: opts.sentError } }
        : { data: sentRows, error: null },
    ),
  );
  const library = createChain();
  library.in = jest.fn(() =>
    Promise.resolve(
      opts.libError
        ? { data: null, error: { message: opts.libError } }
        : { data: libRows, error: null },
    ),
  );
  const chains: Record<string, Chain> = { messages, gif_library: library };
  const client = {
    from: jest.fn((table: string) => chains[table] ?? createChain()),
  };
  return { client: client as unknown as SupabaseClient, messages, library };
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://bro.example";
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getSpaceGifs", () => {
  it("returns gifs used in the space, newest first and deduplicated", async () => {
    const { client } = makeClient(
      [{ gif_id: "g3" }, { gif_id: "g1" }, { gif_id: "g3" }],
      [libRow("g3", "c.gif"), libRow("g1", "a.gif")],
    );
    mockedGetSupabase.mockReturnValue(client);

    const gifs = await getSpaceGifs("space-1");

    expect(gifs.map((gif) => gif.id)).toEqual(["g3", "g1"]);
    expect(gifs[0]?.url).toBe(
      "https://bro.example/storage/v1/object/public/gifs/c.gif",
    );
  });

  it("scopes the query to the space rather than filtering client-side", async () => {
    const { client, messages } = makeClient([], []);
    mockedGetSupabase.mockReturnValue(client);

    await getSpaceGifs("space-42");

    // Pulling every gif message in the database and discarding most of them
    // would be slow and a needless data exposure, so the filter is pushed
    // into the query.
    expect(messages.eq).toHaveBeenCalledWith("conversations.space_id", "space-42");
    expect(messages.eq).toHaveBeenCalledWith("type", "gif");
  });

  it("excludes deleted and non-gif messages", async () => {
    const { client, messages } = makeClient([], []);
    mockedGetSupabase.mockReturnValue(client);

    await getSpaceGifs("space-1");

    expect(messages.eq).toHaveBeenCalledWith("type", "gif");
    expect(messages.is).toHaveBeenCalledWith("deleted_at", null);
    expect(messages.not).toHaveBeenCalledWith("gif_id", "is", null);
  });

  it("returns [] without a backend instead of throwing", async () => {
    mockedGetSupabase.mockReturnValue(null);
    await expect(getSpaceGifs("space-1")).resolves.toEqual([]);
  });

  it("returns [] for a blank space id", async () => {
    const { client } = makeClient([], []);
    mockedGetSupabase.mockReturnValue(client);
    await expect(getSpaceGifs("")).resolves.toEqual([]);
  });

  it("returns [] when the space has no gifs and skips the library query", async () => {
    const { client, library } = makeClient([], []);
    mockedGetSupabase.mockReturnValue(client);

    await expect(getSpaceGifs("space-1")).resolves.toEqual([]);
    expect(library.in).not.toHaveBeenCalled();
  });

  it("drops unsafe storage paths", async () => {
    const { client } = makeClient(
      [{ gif_id: "g1" }, { gif_id: "g2" }],
      [libRow("g1", "../secrets.gif"), libRow("g2", "ok.gif")],
    );
    mockedGetSupabase.mockReturnValue(client);

    const gifs = await getSpaceGifs("space-1");
    expect(gifs.map((gif) => gif.id)).toEqual(["g2"]);
  });

  it("throws when the messages query fails, so a dropped request is not read as an empty space", async () => {
    const { client } = makeClient([], [], { sentError: "network down" });
    mockedGetSupabase.mockReturnValue(client);

    await expect(getSpaceGifs("space-1")).rejects.toThrow("network down");
  });

  it("throws when the library lookup fails", async () => {
    const { client } = makeClient([{ gif_id: "g1" }], [], { libError: "boom" });
    mockedGetSupabase.mockReturnValue(client);

    await expect(getSpaceGifs("space-1")).rejects.toThrow("boom");
  });

  it("honours the limit", async () => {
    const { client } = makeClient(
      [{ gif_id: "g1" }, { gif_id: "g2" }, { gif_id: "g3" }],
      [libRow("g1", "a.gif"), libRow("g2", "b.gif"), libRow("g3", "c.gif")],
    );
    mockedGetSupabase.mockReturnValue(client);

    const gifs = await getSpaceGifs("space-1", { limit: 2 });
    expect(gifs.map((gif) => gif.id)).toEqual(["g1", "g2"]);
  });
});