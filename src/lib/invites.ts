import AsyncStorage from "@react-native-async-storage/async-storage";

export interface InvitePayload {
  code: string;
  inviterName?: string;
  inviterAvatar?: string;
  spaceName?: string;
  spaceId?: string;
  channelId?: string;
  targetType?: "space" | "user" | "conversation";
  targetId?: string;
  timestamp: number;
}

export const STORAGE_KEY_PENDING_INVITE = "@bro:pending_invite";

/**
 * Parse an incoming deep link URL into an InvitePayload.
 * Supports:
 * - bro://invite?code=XYZ&inviter=Sarah&space=Neural+Nexus
 * - bro://space/123?invite=XYZ&inviter=Sarah
 * - bro://user/456?invite=XYZ
 * - https://bro.app/invite?code=XYZ...
 */
export function parseInviteUrl(url: string): InvitePayload | null {
  if (!url || typeof url !== "string") return null;

  try {
    // Normalise scheme for URL constructor if custom scheme
    let standardUrl = url;
    if (url.startsWith("bro://")) {
      standardUrl = url.replace("bro://", "https://bro.internal/");
    }

    const parsed = new URL(standardUrl);
    const searchParams = parsed.searchParams;

    const code = searchParams.get("code") || searchParams.get("invite") || "";
    if (!code && !parsed.pathname.includes("/invite")) {
      return null;
    }

    const finalCode =
      code || parsed.pathname.split("/invite/")[1] || "";
    // A link with no code in it is not an invite — returning a fabricated
    // placeholder here would mint Redeemable-looking rows out of thin air.
    if (!finalCode) {
      return null;
    }

    const inviterName =
      searchParams.get("inviter") || searchParams.get("from") || undefined;
    const inviterAvatar = searchParams.get("avatar") || undefined;
    const spaceName =
      searchParams.get("space") || searchParams.get("spaceName") || undefined;
    const spaceId =
      searchParams.get("spaceId") ||
      (parsed.pathname.startsWith("/space/")
        ? parsed.pathname.split("/")[2]
        : undefined);
    const targetType =
      (searchParams.get("type") as InvitePayload["targetType"]) ||
      (spaceId ? "space" : undefined);
    const targetId = searchParams.get("targetId") || spaceId;

    return {
      code: finalCode,
      inviterName,
      inviterAvatar,
      spaceName,
      spaceId,
      targetType,
      targetId,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Generate a shareable deep link invite URL.
 */
export function createInviteUrl(payload: {
  code: string;
  inviterName?: string;
  spaceName?: string;
  spaceId?: string;
  targetType?: "space" | "user" | "conversation";
  targetId?: string;
}): string {
  const params = new URLSearchParams();
  params.set("code", payload.code);
  if (payload.inviterName) params.set("inviter", payload.inviterName);
  if (payload.spaceName) params.set("space", payload.spaceName);
  if (payload.spaceId) params.set("spaceId", payload.spaceId);
  if (payload.targetType) params.set("type", payload.targetType);
  if (payload.targetId) params.set("targetId", payload.targetId);

  return `bro://invite?${params.toString()}`;
}

/**
 * Save pending invite to local storage so it survives app restarts and auth flow.
 */
export async function savePendingInvite(invite: InvitePayload): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY_PENDING_INVITE,
      JSON.stringify(invite),
    );
  } catch {
    // Non-fatal storage error
  }
}

/**
 * Retrieve any pending invite from local storage.
 */
export async function getPendingInvite(): Promise<InvitePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PENDING_INVITE);
    if (!raw) return null;
    return JSON.parse(raw) as InvitePayload;
  } catch {
    return null;
  }
}

/**
 * Clear stored pending invite.
 */
export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_PENDING_INVITE);
  } catch {
    // Non-fatal storage error
  }
}
