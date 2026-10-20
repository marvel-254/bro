import {
  DEFAULT_PRIVACY_SETTINGS,
  fetchPrivacySettings,
  privacyFromRow,
  savePrivacySettings,
} from "../privacy";
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
  props: Record<string, unknown> = {},
  selfId: string | null = "self",
): SupabaseClient {
  const client = {
    from: jest.fn(() => createChain()),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: selfId ? { id: selfId } : null },
        error: null,
      }),
    },
    ...props,
  };
  return client as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("privacyFromRow", () => {
  it("uses privacy-safe defaults for missing values", () => {
    expect(privacyFromRow(null)).toEqual(DEFAULT_PRIVACY_SETTINGS);
    expect(DEFAULT_PRIVACY_SETTINGS.shareLastActive).toBe(false);
  });

  it("maps stored columns", () => {
    expect(
      privacyFromRow({
        share_presence: false,
        share_last_active: true,
        share_typing: false,
        share_read_receipts: false,
      }),
    ).toEqual({
      sharePresence: false,
      shareLastActive: true,
      shareTyping: false,
      shareReadReceipts: false,
    });
  });
});

describe("fetchPrivacySettings", () => {
  it("returns defaults without a backend", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchPrivacySettings()).toEqual(DEFAULT_PRIVACY_SETTINGS);
  });

  it("returns defaults when signed out", async () => {
    mockedGetSupabase.mockReturnValue(makeSupabase({}, null));
    expect(await fetchPrivacySettings()).toEqual(DEFAULT_PRIVACY_SETTINGS);
  });

  it("returns the stored switches", async () => {
    const profiles = createChain();
    profiles.maybeSingle.mockResolvedValue({
      data: {
        share_presence: false,
        share_last_active: true,
        share_typing: true,
        share_read_receipts: false,
      },
      error: null,
    });
    mockedGetSupabase.mockReturnValue(
      makeSupabase({ from: jest.fn(() => profiles) }),
    );

    expect(await fetchPrivacySettings()).toEqual({
      sharePresence: false,
      shareLastActive: true,
      shareTyping: true,
      shareReadReceipts: false,
    });
  });
});

describe("savePrivacySettings", () => {
  it("refuses without a backend", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await savePrivacySettings({ shareTyping: false })).toEqual({
      ok: false,
      error: "Backend not configured",
    });
  });

  it("updates only the supplied switches", async () => {
    const profiles = createChain();
    profiles.eq.mockResolvedValue({ data: null, error: null });
    const supabase = makeSupabase({ from: jest.fn(() => profiles) });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await savePrivacySettings({ shareTyping: false })).toEqual({
      ok: true,
    });
    expect(profiles.update).toHaveBeenCalledWith({ share_typing: false });
  });

  it("surfaces the server error", async () => {
    const profiles = createChain();
    profiles.eq.mockResolvedValue({
      data: null,
      error: { message: "denied" },
    });
    mockedGetSupabase.mockReturnValue(
      makeSupabase({ from: jest.fn(() => profiles) }),
    );

    expect(await savePrivacySettings({ sharePresence: false })).toEqual({
      ok: false,
      error: "denied",
    });
  });
});
