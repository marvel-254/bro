import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Durable outbox for messages that could not be sent yet.
 *
 * The failure being handled here is not exotic: a lift, a tunnel, mobile data
 * that dropped mid-send. Today a failed send leaves the text sitting in the
 * composer with no record that it was ever meant to go anywhere, so the user
 * has to notice, retype, and resend -- and there is no guarantee they do.
 *
 * A queued entry is the smallest possible description of "I tried to send
 * this". It deliberately does not hold a Supabase row id, because a failed
 * insert has no row id; the server id is only known once the send succeeds,
 * and the caller swaps the local entry for the server row at that point.
 *
 * `clientId` is generated locally and is the identity of a queued message for
 * its whole life, so a retry can never duplicate a row that already landed.
 */
export type OutboxKind = "text" | "image" | "voice" | "gif";

/**
 * How to replay a media send. Local URIs can vanish (cache eviction, app
 * restart), in which case replay fails and the entry ages out — that is
 * preferable to silently sending nothing.
 */
export interface OutboxMedia {
  /** Local file to re-upload (image full / voice recording). */
  localUri?: string;
  /** Local thumbnail file (image only). */
  thumbUri?: string;
  /** Library gif id (gif only — nothing to upload). */
  gifId?: string;
  viewOnce?: boolean;
}

export interface OutboxEntry {
  /** Locally generated identity. Stable across retries; never sent as an id. */
  clientId: string;
  conversationId: string;
  content: string;
  replyToMessageId: string | null;
  createdAt: string;
  /** How many send attempts have failed so far. Drives the backoff. */
  attempts: number;
  /** Message family. Absent on old entries, which are all plain text. */
  kind: OutboxKind;
  /** Present for media kinds. */
  media?: OutboxMedia;
}

const STORAGE_KEY = "bro:outbox:v1";

function isOutboxKind(value: unknown): value is OutboxKind {
  return (
    value === "text" ||
    value === "image" ||
    value === "voice" ||
    value === "gif"
  );
}

/**
 * Reads a media descriptor, keeping only string ids/uris. Anything else is
 * treated as absent so a corrupt field cannot break replay for the entry.
 */
function parseMedia(value: unknown): OutboxMedia | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const media: OutboxMedia = {};
  if (typeof raw.localUri === "string") media.localUri = raw.localUri;
  if (typeof raw.thumbUri === "string") media.thumbUri = raw.thumbUri;
  if (typeof raw.gifId === "string") media.gifId = raw.gifId;
  if (typeof raw.viewOnce === "boolean") media.viewOnce = raw.viewOnce;
  return Object.keys(media).length > 0 ? media : undefined;
}

/** Entry older than this is presumed abandoned rather than in flight. */
const MAX_ENTRY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parses persisted JSON defensively.
 *
 * This data is read back after an app update, a crash, or a partial write, and
 * a single malformed entry must not stop the rest of the outbox from sending.
 * Anything unrecognisable is dropped instead of thrown.
 */
export function parseOutbox(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: OutboxEntry[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const candidate = item as Record<string, unknown>;

    const { clientId, conversationId, content, createdAt } = candidate;
    if (
      typeof clientId !== "string" ||
      typeof conversationId !== "string" ||
      typeof content !== "string" ||
      typeof createdAt !== "string"
    ) {
      continue;
    }

    // replyToMessageId predates the reply feature; those entries are replies to
    // nothing rather than malformed, so a missing value is normalised to null.
    const rawReply = candidate.replyToMessageId;
    const replyToMessageId =
      typeof rawReply === "string" && rawReply.length > 0 ? rawReply : null;

    const attempts = candidate.attempts;
    const kind = isOutboxKind(candidate.kind) ? candidate.kind : "text";
    const media = parseMedia(candidate.media);

    entries.push({
      clientId,
      conversationId,
      content,
      replyToMessageId,
      createdAt,
      attempts: typeof attempts === "number" && attempts >= 0 ? attempts : 0,
      kind,
      ...(media ? { media } : {}),
    });
  }
  return entries;
}

/** Adds an entry, replacing any earlier one sharing its clientId. */
export function appendEntry(
  entries: OutboxEntry[],
  entry: OutboxEntry,
): OutboxEntry[] {
  return [...entries.filter((item) => item.clientId !== entry.clientId), entry];
}

export function removeEntry(
  entries: OutboxEntry[],
  clientId: string,
): OutboxEntry[] {
  return entries.filter((entry) => entry.clientId !== clientId);
}

export function findEntry(
  entries: OutboxEntry[],
  clientId: string,
): OutboxEntry | undefined {
  return entries.find((entry) => entry.clientId === clientId);
}

/** Increments the attempt counter so backoff grows across repeated failures. */
export function bumpAttempts(
  entries: OutboxEntry[],
  clientId: string,
): OutboxEntry[] {
  return entries.map((entry) =>
    entry.clientId === clientId ? { ...entry, attempts: entry.attempts + 1 } : entry,
  );
}

/** Entries for one conversation, oldest first, so replay order is preserved. */
export function entriesFor(
  entries: OutboxEntry[],
  conversationId: string,
): OutboxEntry[] {
  return entries
    .filter((entry) => entry.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Drops entries too old to still be meaningful, so the queue cannot grow forever. */
export function pruneExpired(
  entries: OutboxEntry[],
  now: number,
): OutboxEntry[] {
  return entries.filter((entry) => {
    const created = Date.parse(entry.createdAt);
    if (Number.isNaN(created)) return false;
    return now - created < MAX_ENTRY_AGE_MS;
  });
}

/**
 * Retry delay for an entry, capped so a message never waits so long that the
 * user assumes it was lost.
 */
export function backoffDelayMs(attempts: number): number {
  const base = 1000;
  const delay = base * 2 ** Math.max(0, attempts);
  return Math.min(delay, 5 * 60 * 1000);
}

function randomClientId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function readOutbox(): Promise<OutboxEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return pruneExpired(parseOutbox(raw), Date.now());
}

async function writeOutbox(entries: OutboxEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export async function queueMessage(params: {
  conversationId: string;
  content: string;
  replyToMessageId?: string | null;
  clientId?: string;
  kind?: OutboxKind;
  media?: OutboxMedia;
}): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    clientId: params.clientId ?? randomClientId(),
    conversationId: params.conversationId,
    content: params.content,
    replyToMessageId: params.replyToMessageId ?? null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    kind: params.kind ?? "text",
    ...(params.media ? { media: params.media } : {}),
  };
  const entries = await readOutbox();
  await writeOutbox(appendEntry(entries, entry));
  return entry;
}

/** Returns the entry after recording a failed attempt, so backoff keeps growing. */
export async function recordFailure(clientId: string): Promise<OutboxEntry[]> {
  const entries = await readOutbox();
  const updated = bumpAttempts(entries, clientId);
  await writeOutbox(updated);
  return updated;
}

export async function dequeue(clientId: string): Promise<void> {
  const entries = await readOutbox();
  await writeOutbox(removeEntry(entries, clientId));
}

export async function clearOutbox(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Sends every queued message for a conversation, oldest first.
 *
 * Stops at the first failure rather than pushing on: if the network is down,
 * the remaining entries would fail identically, and continuing would burn
 * through every attempt counter and make the real backoff useless.
 *
 * `send` returns the server row on success. Returning it lets the caller swap
 * the optimistic local message for the authoritative one, which is what keeps
 * a retried message from appearing twice.
 */
export async function flushConversation(params: {
  conversationId: string;
  send: (entry: OutboxEntry) => Promise<{ ok: boolean; messageId?: string }>;
  onSent?: (entry: OutboxEntry, messageId: string) => void | Promise<void>;
  onFailure?: (entry: OutboxEntry, error: unknown) => void;
}): Promise<{ sent: number; failed: number; remaining: number }> {
  const entries = entriesFor(await readOutbox(), params.conversationId);
  let sent = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      const result = await params.send(entry);
      if (result.ok) {
        await dequeue(entry.clientId);
        sent += 1;
        if (params.onSent && result.messageId) {
          await params.onSent(entry, result.messageId);
        }
      } else {
        await recordFailure(entry.clientId);
        failed += 1;
        params.onFailure?.(entry, result);
        break;
      }
    } catch (error) {
      await recordFailure(entry.clientId);
      failed += 1;
      params.onFailure?.(entry, error);
      break;
    }
  }

  const remaining = (await readOutbox()).filter(
    (entry) => entry.conversationId === params.conversationId,
  ).length;

  return { sent, failed, remaining };
}