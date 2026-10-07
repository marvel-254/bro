import { getSupabase } from "./supabase";
import type {
  ConversationRow,
  ConversationSummary,
  MessageReactionRow,
  MessageRow,
  MessageWithSender,
} from "./database.types";

/**
 * Data access for conversations and messages.
 *
 * Every call goes through RLS, so the caller only ever supplies identifiers it
 * already knows. No user id is trusted from the client: RLS derives the caller
 * from the Supabase session via auth.uid().
 */

export const MESSAGES_PAGE_SIZE = 50;

export type SendResult =
  | { ok: true; message: MessageRow }
  | { ok: false; error: string };

/**
 * Fetch a page of messages, newest-last, with sender profiles attached.
 *
 * Messages that live inside a branch are excluded: they belong to the branch
 * screen, and showing them here too would duplicate the thread and double-count
 * it in the reply pill.
 */
/**
 * Keyset cursor for message pagination. Two columns, not one: Postgres now()
 * is per-transaction, so batched inserts share a created_at and a bare
 * `.lt("created_at")` cursor re-fetches the tied page forever. (created_at,
 * id) is a total order — ids are unique — so every page boundary is exact.
 */
export interface MessageCursor {
  createdAt: string;
  id: string;
}

/** Newest-first comparison on (created_at, id). Exported for client-side inserts. */
export function compareMessagesNewestFirst(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string },
): number {
  const time = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (time !== 0) return time;
  return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

export async function fetchMessages(
  conversationId: string,
  limit: number = MESSAGES_PAGE_SIZE,
  before?: MessageCursor,
): Promise<MessageWithSender[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, type, gif_id, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone, sender:profiles!messages_sender_id_fkey (id, username, display_name, avatar_url, status, presence, presence_text, presence_emoji)",
    )
    .eq("conversation_id", conversationId)
    .is("branch_id", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (before) {
    // Rows strictly older than (createdAt, id) in the (desc, desc) order.
    // Neither an ISO timestamp nor a uuid contains a comma, so the or() list
    // cannot split.
    query = query.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as MessageWithSender[];
  // Query is newest-first for the LIMIT to work; flip for the chat list.
  return rows.reverse();
}

/** Send a text message. RLS enforces that the sender is the authenticated user. */
export async function sendMessage(
  conversationId: string,
  content: string,
  options: {
    replyToMessageId?: string | null;
    branchId?: string | null;
    /** Seconds until the message disappears. null or undefined means never. */
    expiresInSeconds?: number | null;
    /**
     * Message type. Non-text messages (images, files) carry their payload in
     * the attachments table and may have an empty caption, so the empty-content
     * check is skipped for them.
     */
    messageType?: "text" | "image" | "file" | "voice" | "gif";
    /** Self-hosted library entry, required when messageType is "gif". */
    gifId?: string | null;
  } = {},
): Promise<SendResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const trimmed = content.trim();
  const messageType = options.messageType ?? "text";
  const gifId = options.gifId ?? null;
  // A gif carries no text of its own: the caption is optional and the database
  // carries the shape check, so we mirror it here to fail fast with a clear
  // message rather than an RLS error.
  if (messageType === "gif" && !gifId) {
    return { ok: false, error: "Pick a gif first" };
  }
  if (messageType !== "gif" && gifId) {
    return { ok: false, error: "A gif id only belongs on a gif message" };
  }
  if (!trimmed && messageType === "text") {
    return { ok: false, error: "Message cannot be empty" };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Not signed in" };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userData.user.id,
      content: trimmed,
      type: messageType,
      gif_id: gifId,
      status: "sent",
      reply_to_message_id: options.replyToMessageId ?? null,
      branch_id: options.branchId ?? null,
      expires_at:
        options.expiresInSeconds == null
          ? null
          : new Date(
              Date.now() + options.expiresInSeconds * 1000,
            ).toISOString(),
    })
    .select(
      "id, conversation_id, sender_id, content, type, gif_id, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone",
    )
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, message: data as MessageRow };
}

/** Move the caller's read cursor forward for a conversation. */
export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return;
  }

  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userData.user.id);
}

export interface ConversationPreview {
  conversationId: string;
  messageId: string;
  content: string;
  senderId: string;
  createdAt: string;
  unreadCount: number;
}

/**
 * Latest message + unread count per conversation, one bounded row each, via
 * the conversation_previews RPC. Output size is O(conversations), never
 * O(messages) — the embedded-select approach this replaces returned every
 * message of every listed conversation on each render.
 */
export async function fetchConversationPreviews(
  conversationIds: string[],
): Promise<Map<string, ConversationPreview>> {
  const supabase = getSupabase();
  if (!supabase || conversationIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.rpc("conversation_previews", {
    ids: conversationIds,
  });

  if (error) {
    throw new Error(error.message);
  }

  const previews = new Map<string, ConversationPreview>();
  for (const row of (data ?? []) as Array<{
    conversation_id: string;
    message_id: string;
    content: string;
    sender_id: string;
    created_at: string;
    // PostgREST serializes bigint counts as strings.
    unread_count: number | string;
  }>) {
    const unread = Number(row.unread_count);
    previews.set(row.conversation_id, {
      conversationId: row.conversation_id,
      messageId: row.message_id,
      content: row.content,
      senderId: row.sender_id,
      createdAt: row.created_at,
      unreadCount: Number.isFinite(unread) ? unread : 0,
    });
  }
  return previews;
}

/** Conversations the caller belongs to, most recent activity first. */
export async function fetchConversationSummaries(): Promise<
  ConversationSummary[]
> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, type, name, avatar_url, created_at, conversation_members!inner (user_id, last_read_at)",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data as unknown as Array<
    ConversationRow & {
      conversation_members?: Array<{
        user_id: string;
        last_read_at: string | null;
      }>;
    }
  >;

  // Latest message + unread per conversation, one bounded row each. The old
  // code embedded the full messages relation here, so a 10k-message group
  // returned its entire history on every list render.
  const ids = rows.map((row) => row.id);
  const previews = await fetchConversationPreviews(ids);

  const summaries: ConversationSummary[] = [];

  for (const row of rows) {
    const preview = previews.get(row.id);
    const latest = preview ?? null;

    summaries.push({
      id: row.id,
      type: row.type,
      name: row.name,
      avatar_url: row.avatar_url,
      last_message_at: latest?.createdAt ?? row.created_at,
      last_message_preview: latest?.content ?? null,
      last_message_sender: latest?.senderId ?? null,
      unread_count: latest?.unreadCount ?? 0,
      peers: [],
    });
  }

  // Attach peer profiles (everyone except the caller) for the list avatars.
  const conversationIds = summaries.map((summary) => summary.id);
  if (conversationIds.length > 0) {
    const { data: peerRows, error: peerError } = await supabase
      .from("conversation_members")
      .select(
        "conversation_id, user_id, profile:profiles!conversation_members_user_id_fkey (id, display_name, avatar_url, presence, presence_text, presence_emoji)",
      )
      .in("conversation_id", conversationIds)
      .neq("user_id", selfId ?? "");

    if (!peerError) {
      const byConversation = new Map<string, ConversationSummary["peers"]>();
      for (const peer of (peerRows ?? []) as unknown as Array<{
        conversation_id: string;
        user_id: string;
        profile: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          presence: string | null;
          presence_text: string | null;
          presence_emoji: string | null;
        } | null;
      }>) {
        const profile = peer.profile;
        if (!profile) continue;
        const list = byConversation.get(peer.conversation_id) ?? [];
        list.push({
          user_id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          presence: profile.presence,
          presence_text: profile.presence_text,
          presence_emoji: profile.presence_emoji,
        });
        byConversation.set(peer.conversation_id, list);
      }
      for (const summary of summaries) {
        summary.peers = byConversation.get(summary.id) ?? [];
      }
    }
  }

  return summaries;
}

/** Start (or re-start) a realtime subscription for one conversation. */
export function subscribeToConversation(
  conversationId: string,
  handlers: {
    onInsert: (message: MessageRow) => void;
    onUpdate: (message: MessageRow) => void;
    onReactionChange: () => void;
  },
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: MessageRow }) => handlers.onInsert(payload.new),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: MessageRow }) => handlers.onUpdate(payload.new),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "message_reactions" },
      () => handlers.onReactionChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Reactions on a page of messages, keyed by message id. */
export async function fetchReactions(
  messageIds: string[],
): Promise<Record<string, MessageReactionRow[]>> {
  const supabase = getSupabase();
  if (!supabase || messageIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("message_reactions")
    .select("id, message_id, user_id, emoji, created_at")
    .in("message_id", messageIds);

  if (error) {
    throw new Error(error.message);
  }

  const grouped: Record<string, MessageReactionRow[]> = {};
  for (const reaction of (data ?? []) as MessageReactionRow[]) {
    (grouped[reaction.message_id] ??= []).push(reaction);
  }
  return grouped;
}

/** Toggle a reaction. Adds when absent, removes when the caller already reacted. */
export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return;
  }

  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", userData.user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from("message_reactions").delete().eq("id", existing.id);
    return;
  }

  await supabase
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: userData.user.id, emoji });
}
/** Edit the content of a message the caller sent. RLS restricts this to the sender. */
export async function editMessage(
  messageId: string,
  content: string,
): Promise<SendResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "Message cannot be empty" };
  }

  const { data, error } = await supabase
    .from("messages")
    .update({ content: trimmed, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select(
      "id, conversation_id, sender_id, content, type, gif_id, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone",
    )
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, message: data as MessageRow };
}

/**
 * Delete for everyone. The row survives so replies and branches do not dangle;
 * the body is blanked and hidden from every reader by the RLS policy.
 */
export async function deleteMessage(messageId: string): Promise<SendResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const { data, error } = await supabase
    .from("messages")
    .update({
      deleted_for_everyone: true,
      content: "",
      deleted_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .select(
      "id, conversation_id, sender_id, content, type, gif_id, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone",
    )
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, message: data as MessageRow };
}

/** How far a caller has read into a conversation. */
export async function fetchReadCursor(
  conversationId: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return null;
  }

  const { data } = await supabase
    .from("conversation_members")
    .select("last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userData.user.id)
    .maybeSingle<{ last_read_at: string | null }>();

  return data?.last_read_at ?? null;
}

/** Per-member read cursors, used to render read receipts. */
export async function fetchReadCursors(
  conversationId: string,
): Promise<Record<string, string | null>> {
  const supabase = getSupabase();
  if (!supabase) {
    return {};
  }

  const { data } = await supabase
    .from("conversation_members")
    .select("user_id, last_read_at")
    .eq("conversation_id", conversationId);

  const cursors: Record<string, string | null> = {};
  for (const row of (data ?? []) as Array<{
    user_id: string;
    last_read_at: string | null;
  }>) {
    cursors[row.user_id] = row.last_read_at;
  }
  return cursors;
}

export type CreateConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

export interface ConversationPeer {
  type: string;
  /** The other member of a direct conversation, if there is exactly one. */
  peerId: string | null;
  peerName: string | null;
}

/**
 * The header facts a chat screen needs: what kind of conversation this is,
 * and who the other person is when it is a direct one. Calls are 1:1, so the
 * call buttons render only when a single peer resolves.
 */
export async function fetchConversationPeer(conversationId: string): Promise<ConversationPeer | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  if (!selfId) {
    return null;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, type")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return null;
  }

  const row = conversation as { id: string; type: string };
  if (row.type !== "direct") {
    return { type: row.type, peerId: null, peerName: null };
  }

  const { data: members } = await supabase
    .from("conversation_members")
    .select("user_id, profile:profiles!conversation_members_user_id_fkey (display_name)")
    .eq("conversation_id", conversationId)
    .neq("user_id", selfId);

  const peers = (members ?? []) as unknown as Array<{
    user_id: string;
    profile: { display_name: string } | null;
  }>;
  if (peers.length !== 1) {
    return { type: row.type, peerId: null, peerName: null };
  }

  return {
    type: row.type,
    peerId: peers[0].user_id,
    peerName: peers[0].profile?.display_name ?? "Someone",
  };
}

/**
 * Create a direct conversation with one peer, or return the existing one if a
 * direct conversation between the two already exists.
 *
 * This goes through the `create_direct_conversation` RPC rather than inserting
 * membership rows directly. The old client-side path needed a policy branch
 * that let a conversation creator insert ANY user_id — which is also a
 * primitive for adding a victim to a conversation they never agreed to join.
 * The RPC resolves both parties server-side and only ever creates direct
 * conversations, so opening a shared group by mistake cannot happen either.
 */
export async function createDirectConversation(
  peerId: string,
): Promise<CreateConversationResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: "Not signed in" };
  }

  const { data, error } = await supabase.rpc("create_direct_conversation", {
    peer_id: peerId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { ok: false, error: "Could not create conversation" };
  }

  return { ok: true, conversationId: data };
}

/**
 * Create a group conversation with the given members.
 *
 * Goes through the `create_group_conversation` RPC rather than inserting
 * membership rows client-side, for the same reason as the direct path: the
 * memberships table must stay unreachable to arbitrary writes. The RPC also
 * enforces that you can only add people you already share a friendship, Space
 * or conversation with, which is what stops group creation being used to pull
 * strangers into a chat.
 */
export async function createGroupConversation(
  title: string,
  memberIds: string[],
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > 80) {
    return { ok: false, error: "Give the group a name (1-80 characters)" };
  }

  const unique = [
    ...new Set(memberIds.filter((id) => typeof id === "string" && id.length > 0)),
  ];
  if (unique.length === 0) {
    return { ok: false, error: "Pick at least one other bro" };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: "Backend not configured" };
  }

  const { data, error } = await supabase.rpc("create_group_conversation", {
    group_title: trimmed,
    member_ids: unique,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (typeof data !== "string" || data.length === 0) {
    return { ok: false, error: "Could not create the group" };
  }

  return { ok: true, conversationId: data };
}

/**
 * Subscribe to any new message in any conversation the caller belongs to, so
 * the conversation list can reorder and update unread counts live.
 */
export function subscribeToConversationList(handlers: {
  onChange: () => void;
}): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel("conversation-list")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      () => handlers.onChange(),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages" },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
