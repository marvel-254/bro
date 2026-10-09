import {
  contribute,
  createDiscussion,
  DISCUSSION_BODY_MAX,
  DISCUSSION_TITLE_MAX,
  withdrawContribution,
} from "../discussions";
import { getSupabase } from "../supabase";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));

const mockedGetSupabase = getSupabase as jest.MockedFunction<
  typeof getSupabase
>;

function makeSupabase(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
    "in",
    "single",
    "maybeSingle",
    "order",
    "range",
    "limit",
  ]) {
    chain[method] = jest.fn(() => chain);
  }
  const auth = { getUser: jest.fn() };
  const supabase = {
    auth,
    from: jest.fn(() => chain),
    ...overrides,
  };
  return { supabase, chain, auth };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createDiscussion", () => {
  it("returns a friendly error when Supabase is not configured", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await createDiscussion({ title: "Tacos" })).toEqual({
      ok: false,
      error: "Backend not configured",
    });
  });

  it("asks for a sign-in before writing anything", async () => {
    const { supabase } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await createDiscussion({ title: "Tacos" })).toEqual({
      ok: false,
      error: "You need to be signed in.",
    });
    // Nothing was attempted: an unauthenticated call must not even try.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an empty title before touching the network", async () => {
    const { supabase } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await createDiscussion({ title: "   " })).toEqual({
      ok: false,
      error: "Give it a title.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("accepts a title with no body, because some threads are one line", async () => {
    const { supabase, chain } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    chain.select.mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: { id: "d-1" },
        error: null,
      }),
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await createDiscussion({ title: "  Best chip shop?  " })).toEqual({
      ok: true,
      id: "d-1",
    });
    expect(chain.insert).toHaveBeenCalledWith({
      creator_id: "me",
      title: "Best chip shop?",
      body: "",
    });
  });

  it("trims the opening post too", async () => {
    const { supabase, chain } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    chain.select.mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: { id: "d-2" },
        error: null,
      }),
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    await createDiscussion({ title: "Chip shop", body: "\n  vote now \n" });
    expect(chain.insert).toHaveBeenCalledWith({
      creator_id: "me",
      title: "Chip shop",
      body: "vote now",
    });
  });

  it("caps the opening post at the same bound the database enforces", async () => {
    const { supabase } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    const result = await createDiscussion({
      title: "Long one",
      body: "x".repeat(DISCUSSION_BODY_MAX + 1),
    });
    expect(result.ok).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces a database error rather than claiming success", async () => {
    const { supabase, chain } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    chain.select.mockReturnValue({
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "boom" },
      }),
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await createDiscussion({ title: "Tacos" })).toEqual({
      ok: false,
      error: "boom",
    });
  });

  it("keeps the title limit in step with the schema", () => {
    // The CHECK is char_length(title) between 1 and 140.
    expect(DISCUSSION_TITLE_MAX).toBe(140);
  });
});

describe("contribute", () => {
  it("upserts rather than inserts", async () => {
    // One contribution per person per discussion: a plain insert would fail
    // with a duplicate key the second time somebody edited their own reply.
    const { supabase, chain } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    chain.upsert.mockResolvedValue({ data: null, error: null });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await contribute("d-1", "  have some  ")).toEqual({ ok: true });
    expect(chain.upsert).toHaveBeenCalledWith(
      {
        discussion_id: "d-1",
        author_id: "me",
        body: "have some",
      },
      { onConflict: "discussion_id,author_id" },
    );
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it("refuses an empty contribution", async () => {
    const { supabase } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await contribute("d-1", "   \n ")).toEqual({
      ok: false,
      error: "Say something first.",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("reports a failure instead of pretending it worked", async () => {
    const { supabase, chain } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    chain.upsert.mockResolvedValue({
      data: null,
      error: { message: "thread is closed" },
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await contribute("d-1", "hello")).toEqual({
      ok: false,
      error: "thread is closed",
    });
  });
});

describe("withdrawContribution", () => {
  it("deletes only your own contribution", async () => {
    // `eq` is a passthrough here, so both predicates land on the same mock.
    // Asserting the pair matters: a delete with only `discussion_id` would
    // remove everyone else's contributions too if RLS were ever wrong.
    const { supabase, chain } = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "me" } },
    });
    mockedGetSupabase.mockReturnValue(supabase as never);

    expect(await withdrawContribution("d-1")).toEqual({ ok: true });
    expect(chain.eq).toHaveBeenCalledWith("discussion_id", "d-1");
    expect(chain.eq).toHaveBeenCalledWith("author_id", "me");
  });
});
