import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parseInviteUrl,
  createInviteUrl,
  savePendingInvite,
  getPendingInvite,
  clearPendingInvite,
  STORAGE_KEY_PENDING_INVITE,
  type InvitePayload,
} from "../invites";

jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe("invites utility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("parseInviteUrl", () => {
    it("returns null for empty or non-string input", () => {
      expect(parseInviteUrl("")).toBeNull();
      expect(parseInviteUrl(null as any)).toBeNull();
      expect(parseInviteUrl(undefined as any)).toBeNull();
    });

    it("parses standard bro://invite url with query parameters", () => {
      const url =
        "bro://invite?code=NEURAL-99&inviter=Sarah&space=Neural+Nexus&spaceId=space-123";
      const result = parseInviteUrl(url);

      expect(result).not.toBeNull();
      expect(result?.code).toBe("NEURAL-99");
      expect(result?.inviterName).toBe("Sarah");
      expect(result?.spaceName).toBe("Neural Nexus");
      expect(result?.spaceId).toBe("space-123");
      expect(result?.targetType).toBe("space");
      expect(result?.timestamp).toBeDefined();
    });

    it("parses space deep link with invite code", () => {
      const url = "bro://space/cyber-lounge?invite=TOKEN-42&inviter=Alex";
      const result = parseInviteUrl(url);

      expect(result).not.toBeNull();
      expect(result?.code).toBe("TOKEN-42");
      expect(result?.inviterName).toBe("Alex");
      expect(result?.spaceId).toBe("cyber-lounge");
      expect(result?.targetType).toBe("space");
    });

    it("parses path-based invite token", () => {
      const url = "bro://invite/ALPHA-777?inviter=Kael";
      const result = parseInviteUrl(url);

      expect(result).not.toBeNull();
      expect(result?.code).toBe("ALPHA-777");
      expect(result?.inviterName).toBe("Kael");
    });

    it("returns null for unrelated urls without invite param", () => {
      expect(parseInviteUrl("bro://profile/123")).toBeNull();
      expect(parseInviteUrl("https://example.com/home")).toBeNull();
    });
  });

  describe("createInviteUrl", () => {
    it("creates a proper bro://invite link with parameters", () => {
      const link = createInviteUrl({
        code: "TEST-CODE",
        inviterName: "DevNode",
        spaceName: "Kernel Hub",
        spaceId: "kh-01",
        targetType: "space",
      });

      expect(link).toContain("bro://invite?");
      expect(link).toContain("code=TEST-CODE");
      expect(link).toContain("inviter=DevNode");
      expect(link).toContain("space=Kernel+Hub");
      expect(link).toContain("spaceId=kh-01");
      expect(link).toContain("type=space");
    });
  });

  describe("AsyncStorage persistence", () => {
    it("saves pending invite to AsyncStorage", async () => {
      const mockInvite: InvitePayload = {
        code: "INV-123",
        inviterName: "Zane",
        timestamp: 12345678,
      };

      await savePendingInvite(mockInvite);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY_PENDING_INVITE,
        JSON.stringify(mockInvite),
      );
    });

    it("retrieves saved pending invite from AsyncStorage", async () => {
      const mockInvite: InvitePayload = {
        code: "INV-456",
        inviterName: "Elena",
        timestamp: 99999999,
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify(mockInvite),
      );

      const retrieved = await getPendingInvite();
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(
        STORAGE_KEY_PENDING_INVITE,
      );
      expect(retrieved).toEqual(mockInvite);
    });

    it("returns null when no pending invite exists", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const retrieved = await getPendingInvite();
      expect(retrieved).toBeNull();
    });

    it("clears pending invite from AsyncStorage", async () => {
      await clearPendingInvite();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
        STORAGE_KEY_PENDING_INVITE,
      );
    });
  });
});
