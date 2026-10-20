import {
  MAX_IMAGE_BYTES,
  FULL_MAX_EDGE,
  THUMB_EDGE,
  fitWithin,
  extensionOf,
  base64ToBytes,
  pickImage,
  compressImage,
  uploadChatFile,
  insertAttachment,
  fetchMessageAttachments,
  fetchMessageAttachmentWithRetry,
  signedChatUrl,
  sendImageMessage,
  sendStoredImage,
  sendSharedImageMessage,
} from "../media";
import { getSupabase } from "../supabase";
import { fetchMessageIdByClientId, sendMessage } from "../conversations";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("../supabase", () => ({ getSupabase: jest.fn() }));
jest.mock("../conversations", () => ({
  sendMessage: jest.fn(),
  fetchMessageIdByClientId: jest.fn(),
}));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));
jest.mock("expo-file-system", () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64", UTF8: "utf8" },
}));

const mockedGetSupabase = getSupabase as jest.MockedFunction<
  typeof getSupabase
>;
const mockedSendMessage = sendMessage as jest.MockedFunction<
  typeof sendMessage
>;
const mockedFetchByClientId =
  fetchMessageIdByClientId as jest.MockedFunction<
    typeof fetchMessageIdByClientId
  >;
const mockedPick =
  ImagePicker.requestMediaLibraryPermissionsAsync as unknown as jest.Mock;
const mockedLaunch =
  ImagePicker.launchImageLibraryAsync as unknown as jest.Mock;
const mockedManipulate = manipulateAsync as unknown as jest.Mock;
const mockedInfo = FileSystem.getInfoAsync as unknown as jest.Mock;
const mockedRead = FileSystem.readAsStringAsync as unknown as jest.Mock;

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

function makeStorage() {
  return { upload: jest.fn(), createSignedUrl: jest.fn() };
}

function makeSupabase(
  chains: Record<string, Chain> = {},
  selfId: string | null = "self",
): {
  supabase: SupabaseClient;
  storage: { upload: jest.Mock; createSignedUrl: jest.Mock };
} {
  const storage = makeStorage();
  const client = {
    from: jest.fn((table: string) => chains[table] ?? createChain()),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: selfId ? { id: selfId } : null },
        error: null,
      }),
    },
    storage: { from: jest.fn(() => storage) },
  };
  return {
    supabase: client as unknown as SupabaseClient,
    storage: storage as unknown as {
      upload: jest.Mock;
      createSignedUrl: jest.Mock;
    },
  };
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    uri: "file:///photo.jpg",
    width: 4000,
    height: 3000,
    mimeType: "image/jpeg",
    fileName: "photo.jpg",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("constants", () => {
  it("caps images at the 10MB bucket limit", () => {
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });

  it("compresses to the spec dimensions", () => {
    expect(FULL_MAX_EDGE).toBe(1920);
    expect(THUMB_EDGE).toBe(400);
  });
});

describe("fitWithin", () => {
  it("scales a landscape image down to the long edge", () => {
    expect(fitWithin(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
  });

  it("scales a portrait image down to the long edge", () => {
    expect(fitWithin(3000, 4000, 1920)).toEqual({ width: 1440, height: 1920 });
  });

  it("leaves small images alone", () => {
    expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 });
  });

  it("leaves exact-size images alone", () => {
    expect(fitWithin(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
  });
});

describe("extensionOf", () => {
  it("lowercases the extension", () => {
    expect(extensionOf("PHOTO.JPG")).toBe("jpg");
  });

  it("returns empty for missing or absent names", () => {
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf(null)).toBe("");
    expect(extensionOf(undefined)).toBe("");
  });
});

describe("base64ToBytes", () => {
  it("decodes Man from TWFu", () => {
    expect(Array.from(base64ToBytes("TWFu"))).toEqual([77, 97, 110]);
  });

  it("handles single and double padding", () => {
    // 'Ma' -> TWE=, 'M' -> TQ==
    expect(Array.from(base64ToBytes("TWE="))).toEqual([77, 97]);
    expect(Array.from(base64ToBytes("TQ=="))).toEqual([77]);
  });

  it("ignores whitespace and line breaks", () => {
    expect(Array.from(base64ToBytes("TW\nFu\r\n"))).toEqual([77, 97, 110]);
  });

  it("round-trips against Node Buffer", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 16, 32]);
    const encoded = Buffer.from(bytes).toString("base64");
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it("decodes an empty string to empty bytes", () => {
    expect(base64ToBytes("").length).toBe(0);
  });
});

describe("pickImage", () => {
  it("throws a helpful error when permission is denied", async () => {
    mockedPick.mockResolvedValue({ granted: false });
    await expect(pickImage()).rejects.toThrow("Photo access is off");
  });

  it("returns null when the user cancels", async () => {
    mockedPick.mockResolvedValue({ granted: true });
    mockedLaunch.mockResolvedValue({ canceled: true });
    expect(await pickImage()).toBeNull();
  });

  it("returns null for an empty asset list", async () => {
    mockedPick.mockResolvedValue({ granted: true });
    mockedLaunch.mockResolvedValue({ canceled: false, assets: [] });
    expect(await pickImage()).toBeNull();
  });

  it("maps the asset and its declared mime", async () => {
    mockedPick.mockResolvedValue({ granted: true });
    mockedLaunch.mockResolvedValue({ canceled: false, assets: [asset()] });
    expect(await pickImage()).toEqual({
      uri: "file:///photo.jpg",
      width: 4000,
      height: 3000,
      mimeType: "image/jpeg",
    });
  });

  it("falls back to the extension when the picker reports no mime", async () => {
    mockedPick.mockResolvedValue({ granted: true });
    mockedLaunch.mockResolvedValue({
      canceled: false,
      assets: [asset({ mimeType: undefined, fileName: "pic.PNG" })],
    });
    expect((await pickImage())?.mimeType).toBe("image/png");
  });
});

describe("compressImage", () => {
  it("resizes the full image and thumb in parallel, preserving ratio", async () => {
    mockedManipulate
      .mockResolvedValueOnce({
        uri: "file:///full.jpg",
        width: 1920,
        height: 1440,
      })
      .mockResolvedValueOnce({
        uri: "file:///thumb.jpg",
        width: 400,
        height: 300,
      });

    const result = await compressImage({
      uri: "file:///src.jpg",
      width: 4000,
      height: 3000,
      mimeType: "image/jpeg",
    });

    expect(mockedManipulate).toHaveBeenCalledTimes(2);
    // Full uses the 1920 long edge on a landscape source (width only).
    expect(mockedManipulate.mock.calls[0][1]).toEqual([
      { resize: { width: 1920 } },
    ]);
    // Thumb uses the 400 long edge.
    expect(mockedManipulate.mock.calls[1][1]).toEqual([
      { resize: { width: 400 } },
    ]);
    expect(result).toEqual({
      full: { uri: "file:///full.jpg", width: 1920, height: 1440 },
      thumb: { uri: "file:///thumb.jpg" },
    });
  });
});

describe("uploadChatFile", () => {
  it("throws when the backend is missing", async () => {
    mockedGetSupabase.mockReturnValue(null);
    await expect(
      uploadChatFile("c1", "self", "file:///a.jpg", ""),
    ).rejects.toThrow("Backend not configured");
  });

  it("throws when the local file is gone", async () => {
    const { supabase } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    mockedInfo.mockResolvedValue({ exists: false });
    await expect(
      uploadChatFile("c1", "self", "file:///gone.jpg", ""),
    ).rejects.toThrow("gone");
  });

  it("rejects oversize files before uploading", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    mockedInfo.mockResolvedValue({ exists: true, size: MAX_IMAGE_BYTES + 1 });
    await expect(
      uploadChatFile("c1", "self", "file:///big.jpg", ""),
    ).rejects.toThrow("over 10MB");
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("uploads decoded bytes with the jpeg content type", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    mockedInfo.mockResolvedValue({ exists: true, size: 100 });
    mockedRead.mockResolvedValue(Buffer.from([1, 2, 3]).toString("base64"));
    storage.upload.mockResolvedValue({ data: { path: "x" }, error: null });

    const result = await uploadChatFile(
      "c1",
      "self",
      "file:///a.jpg",
      "-thumb",
    );

    expect(storage.upload).toHaveBeenCalledTimes(1);
    const [path, body, options] = storage.upload.mock.calls[0];
    expect(path).toMatch(/^c1\/self-\d+-thumb\.jpg$/);
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Array.from(body as Uint8Array)).toEqual([1, 2, 3]);
    expect(options).toEqual({ contentType: "image/jpeg", upsert: false });
    expect(result.bytes).toBe(3);
  });

  it("surfaces storage errors", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    mockedInfo.mockResolvedValue({ exists: true, size: 100 });
    mockedRead.mockResolvedValue("QUJD");
    storage.upload.mockResolvedValue({
      data: null,
      error: { message: "bucket full" },
    });

    await expect(
      uploadChatFile("c1", "self", "file:///a.jpg", ""),
    ).rejects.toThrow("bucket full");
  });
});

describe("insertAttachment", () => {
  it("throws when the backend is missing", async () => {
    mockedGetSupabase.mockReturnValue(null);
    await expect(
      insertAttachment({
        storagePath: "p",
        thumbPath: null,
        mime: "image/jpeg",
        bytes: 1,
        messageId: null,
      }),
    ).rejects.toThrow("Backend not configured");
  });

  it("throws when signed out", async () => {
    const { supabase } = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    await expect(
      insertAttachment({
        storagePath: "p",
        thumbPath: null,
        mime: "image/jpeg",
        bytes: 1,
        messageId: null,
      }),
    ).rejects.toThrow("Not signed in");
  });

  it("stores the row with the session user as uploader", async () => {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { id: "att-1" }, error: null });
    const { supabase } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const id = await insertAttachment({
      storagePath: "c1/self-1.jpg",
      thumbPath: "c1/self-1-thumb.jpg",
      mime: "image/jpeg",
      bytes: 42,
      messageId: null,
    });

    expect(id).toBe("att-1");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        uploader: "self",
        bucket: "chat-media",
        kind: "image",
        message_id: null,
      }),
    );
  });
});

describe("fetchMessageAttachments", () => {
  it("returns empty without a backend or ids", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await fetchMessageAttachments(["m1"])).toEqual({});
    const { supabase } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    expect(await fetchMessageAttachments([])).toEqual({});
  });

  it("keys attachments by message, first row wins", async () => {
    const chain = createChain();
    chain.in.mockReturnValue(
      Promise.resolve({
        data: [
          {
            id: "a1",
            message_id: "m1",
            storage_path: "p1",
            thumb_path: "t1",
            mime_type: "image/jpeg",
            size_bytes: 10,
            view_once: false,
            viewed_at: null,
          },
          {
            id: "a2",
            message_id: "m1",
            storage_path: "p2",
            thumb_path: null,
            mime_type: "image/jpeg",
            size_bytes: 11,
            view_once: false,
            viewed_at: null,
          },
        ],
        error: null,
      }),
    );
    const { supabase } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchMessageAttachments(["m1"]);
    expect(result.m1.id).toBe("a1");
  });

  it("carries view-once state so the bubble can burn the thumbnail", async () => {
    const chain = createChain();
    chain.in.mockReturnValue(
      Promise.resolve({
        data: [
          {
            id: "a1",
            message_id: "m1",
            storage_path: "p1",
            thumb_path: "t1",
            mime_type: "image/jpeg",
            size_bytes: 10,
            view_once: true,
            viewed_at: "2026-10-20T10:00:00Z",
          },
        ],
        error: null,
      }),
    );
    const { supabase } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchMessageAttachments(["m1"]);
    expect(result.m1.viewOnce).toBe(true);
    expect(result.m1.viewedAt).toBe("2026-10-20T10:00:00Z");
  });

  it("swallows errors so a missing thumb never breaks chat", async () => {
    const chain = createChain();
    chain.in.mockReturnValue(
      Promise.resolve({ data: null, error: { message: "boom" } }),
    );
    const { supabase } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    expect(await fetchMessageAttachments(["m1"])).toEqual({});
  });
});

describe("fetchMessageAttachmentWithRetry", () => {
  const row = {
    id: "a1",
    message_id: "m1",
    storage_path: "p1",
    thumb_path: "t1",
    mime_type: "image/jpeg",
    size_bytes: 10,
  };

  it("finds an attachment linked just after the message insert", async () => {
    const chain = createChain();
    chain.in
      .mockReturnValueOnce(Promise.resolve({ data: [], error: null }))
      .mockReturnValueOnce(Promise.resolve({ data: [row], error: null }));
    const { supabase } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await fetchMessageAttachmentWithRetry("m1", { delayMs: 0 });

    expect(result?.id).toBe("a1");
    expect(chain.in).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempts instead of waiting forever", async () => {
    const chain = createChain();
    chain.in.mockReturnValue(Promise.resolve({ data: [], error: null }));
    const { supabase } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);

    await expect(
      fetchMessageAttachmentWithRetry("m1", { attempts: 2, delayMs: 0 }),
    ).resolves.toBeNull();
    expect(chain.in).toHaveBeenCalledTimes(2);
  });
});

describe("signedChatUrl", () => {
  it("returns null for an empty path", async () => {
    expect(await signedChatUrl("")).toBeNull();
  });

  it("returns null without a backend", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await signedChatUrl("c1/x.jpg")).toBeNull();
  });

  it("caches the url until just before expiry", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    storage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://cdn/x?sig=1" },
      error: null,
    });

    const first = await signedChatUrl("c1/unique-cache-probe.jpg");
    const second = await signedChatUrl("c1/unique-cache-probe.jpg");

    expect(first).toBe("https://cdn/x?sig=1");
    expect(second).toBe(first);
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("returns null when signing fails", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    storage.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "denied" },
    });

    expect(await signedChatUrl("c1/other.jpg")).toBeNull();
  });

  it("evicts the oldest entry past 200 cached urls", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    storage.createSignedUrl.mockImplementation((path: string) =>
      Promise.resolve({ data: { signedUrl: `https://cdn/${path}` }, error: null }),
    );

    for (let i = 0; i < 201; i++) {
      await signedChatUrl(`c1/evict-${i}.jpg`);
    }

    // The first path was evicted, so it signs again instead of hitting cache.
    const before = storage.createSignedUrl.mock.calls.length;
    await signedChatUrl("c1/evict-0.jpg");
    expect(storage.createSignedUrl.mock.calls.length).toBe(before + 1);
  });
});

describe("sendImageMessage", () => {
  function successSetup() {
    mockedPick.mockResolvedValue({ granted: true });
    mockedLaunch.mockResolvedValue({ canceled: false, assets: [asset()] });
    mockedManipulate
      .mockResolvedValueOnce({
        uri: "file:///full.jpg",
        width: 1920,
        height: 1080,
      })
      .mockResolvedValueOnce({
        uri: "file:///thumb.jpg",
        width: 400,
        height: 225,
      });
    mockedInfo.mockResolvedValue({ exists: true, size: 50 });
    mockedRead.mockResolvedValue(Buffer.from([9, 9]).toString("base64"));
  }

  function attachmentsChain(attachId = "att-1", linked: unknown[] = [{ id: attachId }]) {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { id: attachId }, error: null });
    // The link step is `.update(...).eq(...).select(...)`; the trailing select
    // is what makes a zero-row (RLS-filtered) update observable.
    const linkSelect = jest.fn().mockResolvedValue({ data: linked, error: null });
    const updateEq = jest.fn().mockReturnValue({ select: linkSelect });
    chain.update.mockReturnValue({ eq: updateEq });
    chain.insert.mockReturnValue(chain);
    return { chain, updateEq, linkSelect };
  }

  it("reports the backend is missing with the pick stage", async () => {
    mockedGetSupabase.mockReturnValue(null);
    expect(await sendImageMessage("c1", "")).toEqual({
      ok: false,
      error: "Backend not configured",
      stage: "pick",
    });
  });

  it("reports sign-out at the pick stage", async () => {
    const { supabase } = makeSupabase({}, null);
    mockedGetSupabase.mockReturnValue(supabase);
    const result = await sendImageMessage("c1", "");
    expect(result).toEqual({
      ok: false,
      error: "Not signed in",
      stage: "pick",
    });
  });

  it("reports cancellation distinctly from failure", async () => {
    const { supabase } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    mockedPick.mockResolvedValue({ granted: true });
    mockedLaunch.mockResolvedValue({ canceled: true });

    expect(await sendImageMessage("c1", "")).toEqual({
      ok: false,
      error: "cancelled",
      stage: "pick",
    });
  });

  it("reports a compress failure with the compress stage", async () => {
    const { supabase } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    mockedPick.mockResolvedValue({ granted: true });
    mockedLaunch.mockResolvedValue({ canceled: false, assets: [asset()] });
    mockedManipulate.mockRejectedValue(new Error("OOM"));

    const result = await sendImageMessage("c1", "");
    expect(result).toEqual({ ok: false, error: "OOM", stage: "compress" });
  });

  it("sends with type image and links the attachment", async () => {
    successSetup();
    const { chain, updateEq, linkSelect } = attachmentsChain();
    const { supabase, storage } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);
    storage.upload.mockResolvedValue({ data: { path: "x" }, error: null });
    mockedSendMessage.mockResolvedValue({
      ok: true,
      message: { id: "m1", content: "", type: "image" } as never,
    });

    const result = await sendImageMessage("c1", "beach day");

    expect(result).toEqual({
      ok: true,
      messageId: "m1",
      attachmentId: "att-1",
    });
    // Two parallel uploads: full + thumb.
    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(mockedSendMessage).toHaveBeenCalledWith("c1", "beach day", {
      messageType: "image",
    });
    expect(updateEq).toHaveBeenCalledWith("id", "att-1");
    expect(linkSelect).toHaveBeenCalledWith("id");
  });

  it("fails at the link stage when the update affects no rows", async () => {
    // Regression: an RLS-filtered update reports success but matches nothing,
    // which silently left every photo unlinked before the attachments UPDATE
    // policy existed.
    successSetup();
    const { chain } = attachmentsChain("att-1", []);
    const { supabase, storage } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);
    storage.upload.mockResolvedValue({ data: { path: "x" }, error: null });
    mockedSendMessage.mockResolvedValue({
      ok: true,
      message: { id: "m1", content: "", type: "image" } as never,
    });

    expect(await sendImageMessage("c1", "")).toEqual({
      ok: false,
      error: "Could not link the photo",
      stage: "link",
    });
  });

  it("reports a send failure with the send stage", async () => {
    successSetup();
    const { chain } = attachmentsChain();
    const { supabase, storage } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);
    storage.upload.mockResolvedValue({ data: { path: "x" }, error: null });
    mockedSendMessage.mockResolvedValue({ ok: false, error: "RLS denied" });

    expect(await sendImageMessage("c1", "")).toEqual({
      ok: false,
      error: "RLS denied",
      stage: "send",
    });
  });

  it("reports the existing send when the message and its media already landed", async () => {
    // A retry after a lost response must not upload a second copy or attach a
    // second image to the message.
    const { chain } = attachmentsChain("att-1");
    chain.limit.mockResolvedValue({ data: [{ id: "att-0" }], error: null });
    const { supabase, storage } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);
    mockedFetchByClientId.mockResolvedValue("m-existing");

    const result = await sendStoredImage(
      "c1",
      "file:///full.jpg",
      "file:///thumb.jpg",
      "beach day",
      false,
      "local-1",
    );

    expect(result).toEqual({
      ok: true,
      messageId: "m-existing",
      attachmentId: null,
    });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("repairs a message whose link step failed instead of deduplicating it", async () => {
    const { chain } = attachmentsChain("att-1");
    chain.limit.mockResolvedValue({ data: [], error: null });
    const { supabase, storage } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);
    storage.upload.mockResolvedValue({ data: { path: "x" }, error: null });
    mockedFetchByClientId.mockResolvedValue("m-existing");
    mockedSendMessage.mockResolvedValue({
      ok: true,
      message: { id: "m-existing" } as never,
    });

    const result = await sendStoredImage(
      "c1",
      "file:///full.jpg",
      "file:///thumb.jpg",
      "",
      false,
      "local-1",
    );

    expect(result).toEqual({
      ok: true,
      messageId: "m-existing",
      attachmentId: "att-1",
    });
    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(mockedSendMessage).toHaveBeenCalledWith(
      "c1",
      "",
      expect.objectContaining({ clientId: "local-1" }),
    );
  });
});

describe("sendSharedImageMessage", () => {
  function chainForAttachment() {
    const chain = createChain();
    chain.select.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { id: "att-1" }, error: null });
    const linkSelect = jest
      .fn()
      .mockResolvedValue({ data: [{ id: "att-1" }], error: null });
    chain.update.mockReturnValue({ eq: jest.fn().mockReturnValue({ select: linkSelect }) });
    chain.insert.mockReturnValue(chain);
    return chain;
  }

  it("rejects types outside the supported image set before uploading", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);

    const result = await sendSharedImageMessage(
      "c1",
      "file:///clip.mp4",
      "video/mp4",
    );

    expect(result).toEqual({
      ok: false,
      error: "That attachment type is not supported.",
      stage: "pick",
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects files over the 10MB bucket limit", async () => {
    const { supabase, storage } = makeSupabase();
    mockedGetSupabase.mockReturnValue(supabase);
    mockedInfo.mockResolvedValue({ exists: true, size: MAX_IMAGE_BYTES + 1 });

    const result = await sendSharedImageMessage(
      "c1",
      "file:///big.png",
      "image/png",
    );

    expect(result).toEqual({
      ok: false,
      error: "That attachment is over 10MB.",
      stage: "upload",
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("keeps GIF bytes and MIME type instead of recompressing to JPEG", async () => {
    const chain = chainForAttachment();
    const { supabase, storage } = makeSupabase({ attachments: chain });
    mockedGetSupabase.mockReturnValue(supabase);
    mockedInfo.mockResolvedValue({ exists: true, size: 2048 });
    mockedRead.mockResolvedValue(Buffer.from([1, 2, 3]).toString("base64"));
    storage.upload.mockResolvedValue({ data: { path: "x" }, error: null });
    mockedSendMessage.mockResolvedValue({
      ok: true,
      message: { id: "m1", content: "", type: "image" } as never,
    });

    const result = await sendSharedImageMessage(
      "c1",
      "file:///keyboard.gif",
      "image/gif",
      "look",
    );

    expect(result).toEqual({
      ok: true,
      messageId: "m1",
      attachmentId: "att-1",
    });
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^c1\/self-.*-shared\.gif$/),
      expect.any(Uint8Array),
      { contentType: "image/gif", upsert: false },
    );
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        mime_type: "image/gif",
        thumb_path: null,
        kind: "image",
      }),
    );
    expect(mockedSendMessage).toHaveBeenCalledWith("c1", "look", {
      messageType: "image",
      clientId: undefined,
    });
  });
});
