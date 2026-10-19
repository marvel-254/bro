import type { OutboxEntry } from "./outbox";

/**
 * Pure display derivations for the chat screen.
 *
 * Kept out of the screen so the fiddly rules — "when does a message count as
 * seen", "what does an empty queued media bubble say" — can be tested without
 * mounting a 1,700-line component.
 */

/**
 * The most recent point any OTHER member has read up to, in epoch ms.
 *
 * Read cursors live on `conversation_members.last_read_at`, so this is derived
 * rather than read from a per-message status column: no recipient write and no
 * RLS change is needed to turn the second tick on. Returns null when nobody
 * else has read anything, which means "no read information yet".
 */
export function peerReadCursor(
  cursors: Record<string, string | null>,
  selfId: string | undefined,
): number | null {
  let latest: number | null = null;
  for (const [userId, at] of Object.entries(cursors)) {
    if (userId === selfId || !at) continue;
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed)) continue;
    if (latest === null || parsed > latest) latest = parsed;
  }
  return latest;
}

/**
 * The status to render for one of our messages.
 *
 * "seen" overrides "sent" once another member's cursor has passed the message;
 * every other state (sending, failed, delivered) is passed through untouched.
 * Only ever called for the viewer's own messages.
 */
export function ownMessageStatus(
  status: string,
  createdAt: string,
  peerReadAt: number | null,
): string {
  if (status !== "sent" || peerReadAt === null) return status;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return status;
  return created <= peerReadAt ? "seen" : status;
}

/**
 * Label for a queued media message's retry bubble. Captions are optional, so
 * an image or gif can have no text, and a voice note never does.
 */
export function outboxPlaceholderText(entry: OutboxEntry): string {
  if (entry.content.trim()) return entry.content;
  if (entry.kind === "image") return "Photo";
  if (entry.kind === "voice") return "Voice message";
  if (entry.kind === "gif") return "GIF";
  return entry.content;
}
