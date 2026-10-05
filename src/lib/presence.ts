import { getSupabase, type SupabaseClient } from "./supabase";

/**
 * Presence and typing.
 *
 * Both ride on realtime *broadcast* channels rather than the database:
 * neither is worth persisting. Presence is mirrored onto `profiles.presence`
 * so it can be read by people who are not in the conversation, but the live
 * signal is a broadcast. Typing is broadcast only and is never written at all.
 */

export type Presence =
  | "online"
  | "busy"
  | "chilling"
  | "gaming"
  | "listening"
  | "afk"
  | "offline";

export const PRESENCE_LABELS: Record<Presence, string> = {
  online: "Online",
  busy: "Busy",
  chilling: "Chilling",
  gaming: "Gaming",
  listening: "Listening",
  afk: "AFK",
  offline: "Offline",
};

export const PRESENCE_COLORS: Record<Presence, string> = {
  online: "#3DD68C",
  busy: "#F0616D",
  chilling: "#5AC8FA",
  gaming: "#B388FF",
  listening: "#FFB020",
  afk: "#8F9CAE",
  offline: "#4F5B6E",
};

export interface PresencePayload {
  userId: string;
  presence: Presence;
  statusText?: string;
  emoji?: string;
}

export interface TypingPayload {
  userId: string;
  displayName: string;
  isTyping: boolean;
}

/** How long a typing indicator stays lit after the last keystroke. */
export const TYPING_TIMEOUT_MS = 4000;

/** How long before an untouched client is considered gone. */
export const PRESENCE_TIMEOUT_MS = 60_000;

function supabaseOrNull(): SupabaseClient | null {
  return getSupabase();
}

/**
 * Watch who is present in a conversation. onChange fires immediately with the
 * current roster, then on every join, state change and leave.
 */
export function watchPresence(
  conversationId: string,
  selfId: string,
  onChange: (present: Map<string, PresencePayload>) => void,
): () => void {
  const supabase = supabaseOrNull();
  if (!supabase) {
    return () => {};
  }

  const roster = new Map<string, PresencePayload>();
  const emit = () => onChange(new Map(roster));

  const channel = supabase.channel(`presence:${conversationId}`, {
    config: { presence: { key: selfId } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      roster.clear();
      const state = channel.presenceState() as Record<string, unknown[]>;
      for (const [, metas] of Object.entries(state)) {
        for (const meta of metas) {
          const payload = meta as unknown as PresencePayload;
          roster.set(payload.userId, payload);
        }
      }
      emit();
    })
    .on("presence", { event: "join" }, () => emit())
    .on("presence", { event: "leave" }, () => emit())
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          userId: selfId,
          presence: "online",
        } satisfies PresencePayload);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Announce this user's presence to everyone currently in the conversation. */
export function announcePresence(
  conversationId: string,
  _selfId: string,
  payload: PresencePayload,
): void {
  const supabase = supabaseOrNull();
  if (!supabase) {
    return;
  }
  const channel = supabase.channel(`presence:${conversationId}`);
  void channel.track(payload);
}

/** Persist presence so people outside the conversation can still see it. */
export async function persistPresence(
  presence: Presence,
  statusText?: string,
  emoji?: string,
): Promise<void> {
  const supabase = supabaseOrNull();
  if (!supabase) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return;
  }

  await supabase
    .from("profiles")
    .update({
      presence,
      presence_text: statusText ?? null,
      presence_emoji: emoji ?? null,
    })
    .eq("id", userData.user.id);
}

/**
 * Broadcast typing state. Nothing is persisted.
 *
 * Channels are cached per conversation and subscribed once: sending on a
 * fresh, unsubscribed channel is dropped by Realtime, and building one per
 * keystroke leaked a channel object every time.
 */
const typingChannels = new Map<string, { channel: TypingChannel; refs: number }>();

interface TypingChannel {
  send(message: { type: string; event: string; payload: unknown }): void;
  subscribe(): unknown;
}

function typingChannelFor(conversationId: string): TypingChannel | null {
  const supabase = supabaseOrNull();
  if (!supabase) {
    return null;
  }
  const cached = typingChannels.get(conversationId);
  if (cached) {
    cached.refs += 1;
    return cached.channel;
  }
  const channel = supabase.channel(
    `typing:${conversationId}`,
  ) as unknown as TypingChannel;
  void channel.subscribe();
  typingChannels.set(conversationId, { channel, refs: 1 });
  return channel;
}

export function releaseTypingChannel(conversationId: string): void {
  const cached = typingChannels.get(conversationId);
  if (!cached) return;
  cached.refs -= 1;
  if (cached.refs <= 0) {
    typingChannels.delete(conversationId);
  }
}

export function sendTyping(
  conversationId: string,
  userId: string,
  displayName: string,
  isTyping: boolean,
): void {
  const channel = typingChannelFor(conversationId);
  if (!channel) {
    return;
  }

  channel.send({
    type: "broadcast",
    event: "typing",
    payload: { userId, displayName, isTyping } satisfies TypingPayload,
  });
}

/** Listen for others' typing state. Callbacks fire on change only. */
export function watchTyping(
  conversationId: string,
  selfId: string,
  onChange: (typists: Map<string, string>) => void,
): () => void {
  const supabase = supabaseOrNull();
  if (!supabase) {
    return () => {};
  }

  const typists = new Map<string, { name: string; at: number }>();

  const channel = supabase
    .channel(`typing:${conversationId}`)
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const data = payload as TypingPayload;
      if (data.userId === selfId) {
        return;
      }

      if (data.isTyping) {
        typists.set(data.userId, { name: data.displayName, at: Date.now() });
      } else {
        typists.delete(data.userId);
      }
      prune();
      emit();
    })
    .subscribe();

  const emit = () =>
    onChange(new Map([...typists.entries()].map(([id, v]) => [id, v.name])));

  const prune = () => {
    const cutoff = Date.now() - TYPING_TIMEOUT_MS;
    for (const [id, value] of typists) {
      if (value.at < cutoff) {
        typists.delete(id);
      }
    }
  };

  // Typing indicators must expire even if no further events arrive.
  const sweeper = setInterval(() => {
    const before = typists.size;
    prune();
    if (typists.size !== before) {
      emit();
    }
  }, 1000);

  return () => {
    clearInterval(sweeper);
    void supabase.removeChannel(channel);
  };
}

/** Options accepted when sending. `expiresInSeconds` drives disappearing messages. */
export const DISAPPEAR_PRESETS = [
  { label: "10 seconds", seconds: 10 },
  { label: "1 minute", seconds: 60 },
  { label: "1 hour", seconds: 3600 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
  { label: "Never", seconds: null },
] as const;
