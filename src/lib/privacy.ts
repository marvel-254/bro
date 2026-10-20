import { getSupabase } from "./supabase";

/**
 * Privacy switches that apply to presence, typing and read receipts.
 *
 * The settings live on `profiles` so every client sees the same answer, and
 * the enforcement points are:
 *   * presence  — persistPresence writes offline and watchPresence stops
 *                 broadcasting when hidden;
 *   * last seen — persistPresence stops touching last_seen_at;
 *   * typing    — the sender simply does not broadcast;
 *   * receipts  — the conversation_read_cursors RPC filters peer cursors.
 *
 * This module is only the read/write surface used by the settings screen and
 * by the chat screen's typing call.
 */

export interface PrivacySettings {
  sharePresence: boolean;
  shareLastActive: boolean;
  shareTyping: boolean;
  shareReadReceipts: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  sharePresence: true,
  shareLastActive: false,
  shareTyping: true,
  shareReadReceipts: true,
};

export interface PrivacyRow {
  share_presence: boolean | null;
  share_last_active: boolean | null;
  share_typing: boolean | null;
  share_read_receipts: boolean | null;
}

export function privacyFromRow(
  row: Partial<PrivacyRow> | null | undefined,
): PrivacySettings {
  return {
    sharePresence: row?.share_presence ?? DEFAULT_PRIVACY_SETTINGS.sharePresence,
    shareLastActive:
      row?.share_last_active ?? DEFAULT_PRIVACY_SETTINGS.shareLastActive,
    shareTyping: row?.share_typing ?? DEFAULT_PRIVACY_SETTINGS.shareTyping,
    shareReadReceipts:
      row?.share_read_receipts ?? DEFAULT_PRIVACY_SETTINGS.shareReadReceipts,
  };
}

function toRow(patch: Partial<PrivacySettings>): Partial<PrivacyRow> {
  const row: Partial<PrivacyRow> = {};
  if (patch.sharePresence !== undefined) {
    row.share_presence = patch.sharePresence;
  }
  if (patch.shareLastActive !== undefined) {
    row.share_last_active = patch.shareLastActive;
  }
  if (patch.shareTyping !== undefined) {
    row.share_typing = patch.shareTyping;
  }
  if (patch.shareReadReceipts !== undefined) {
    row.share_read_receipts = patch.shareReadReceipts;
  }
  return row;
}

export async function fetchPrivacySettings(): Promise<PrivacySettings> {
  const supabase = getSupabase();
  if (!supabase) return DEFAULT_PRIVACY_SETTINGS;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return DEFAULT_PRIVACY_SETTINGS;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "share_presence, share_last_active, share_typing, share_read_receipts",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return DEFAULT_PRIVACY_SETTINGS;
  return privacyFromRow(data as unknown as PrivacyRow);
}

export type PrivacyResult = { ok: boolean; error?: string };

export async function savePrivacySettings(
  patch: Partial<PrivacySettings>,
): Promise<PrivacyResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const row = toRow(patch);
  if (Object.keys(row).length === 0) return { ok: true };

  const { error } = await supabase
    .from("profiles")
    .update(row)
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
