import { getGifsByIds, getMyGifs } from "../gifs";
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

/** Two-table client: messages resolves on .limit(), gif_library on .in(). */
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
  const chains: Record<string, Chain> = {
    messages,
    gif_library: library,
  };
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

describe("getMyGifs", () => {
  it("returns sent gifs newest first, deduplicated, in send order", async () => {
    const { client } = makeClient(
      [{ gif_id: "g2" }, { gif_id: "g1" }, { gif_id: "g2" }],
      [libRow("g2", "b.gif"), libRow("g1", "a.gif")],
    );
    mockedGetSupabase.mockReturnValue(client);

    const gifs = await getMyGifs("user-1");

    expect(gifs.map((gif) => gif.id)).toEqual(["g2", "g1"]);
    expect(gifs[0]?.url).toBe(
      "https://bro.example/storage/v1/object/public/gifs/b.gif",
    );
  });

  it("filters out unsafe storage paths", async () => {
    const { client } = makeClient(
      [{ gif_id: "g1" }, { gif_id: "g2" }],
      [libRow("g1", "../secrets.gif"), libRow("g2", "ok.gif")],
    );
    mockedGetSupabase.mockReturnValue(client);

    const gifs = await getMyGifs("user-1");

    expect(gifs.map((gif) => gif.id)).toEqual(["g2"]);
  });

  it("returns [] without querying the library when nothing was sent", async () => {
    const { client, library } = makeClient([], []);
    mockedGetSupabase.mockReturnValue(client);

    await expect(getMyGifs("user-1")).resolves.toEqual([]);
    expect(library.in).not.toHaveBeenCalled();
  });

  it("throws when the messages query fails", async () => {
    const { client } = makeClient([], [], { sentError: "boom" });
    mockedGetSupabase.mockReturnValue(client);

    await expect(getMyGifs("user-1")).rejects.toThrow("boom");
  });

  it("throws when the library query fails", async () => {
    const { client } = makeClient([{ gif_id: "g1" }], [], { libError: "down" });
    mockedGetSupabase.mockReturnValue(client);

    await expect(getMyGifs("user-1")).rejects.toThrow("down");
  });

  it("returns [] when supabase is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);

    await expect(getMyGifs("user-1")).resolves.toEqual([]);
  });
});

describe("getGifsByIds", () => {
  function singleTable(rows: unknown[], opts: { error?: string } = {}) {
    const library = createChain();
    library.in = jest.fn(() =>
      Promise.resolve(
        opts.error
          ? { data: null, error: { message: opts.error } }
          : { data: rows, error: null },
      ),
    );
    const client = {
      from: jest.fn(() => library),
    } as unknown as SupabaseClient;
    return { client, library };
  }

  it("returns [] without a backend or ids", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await getGifsByIds(["g1"])).toEqual({});

    mockedGetSupabase.mockReturnValue(singleTable([]).client);
    expect(await getGifsByIds([])).toEqual({});
    expect(await getGifsByIds(["", ""])).toEqual({});
  });

  it("maps rows by id and dedupes the requested ids", async () => {
    const { client, library } = singleTable([libRow("g1", "cats/x.gif")]);
    mockedGetSupabase.mockReturnValue(client);

    const result = await getGifsByIds(["g1", "g1", "g2"]);

    expect(library.in).toHaveBeenCalledWith("id", ["g1", "g2"]);
    expect(Object.keys(result)).toEqual(["g1"]);
    expect(result.g1.url).toBe(
      "https://bro.example/storage/v1/object/public/gifs/cats/x.gif",
    );
    expect(result.g1.tags).toEqual(["fun"]);
  });

  it("drops rows with an unsafe storage path", async () => {
    const { client } = singleTable([
      libRow("g1", "cats/x.gif"),
      libRow("g2", "../etc/passwd"),
    ]);
    mockedGetSupabase.mockReturnValue(client);

    expect(Object.keys(await getGifsByIds(["g1", "g2"]))).toEqual(["g1"]);
  });

  it("returns {} when the query errors", async () => {
    const { client } = singleTable([], { error: "down" });
    mockedGetSupabase.mockReturnValue(client);

    expect(await getGifsByIds(["g1"])).toEqual({});
  });
});
