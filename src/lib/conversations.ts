import { getSupabase } from './supabase';
import type {
  ConversationRow,
  ConversationSummary,
  MessageReactionRow,
  MessageRow,
  MessageWithSender,
} from './database.types';

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

/** Fetch a page of messages, newest-last, with sender profiles attached. */
export async function fetchMessages(
  conversationId: string,
  limit: number = MESSAGES_PAGE_SIZE,
  before?: string,
): Promise<MessageWithSender[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('messages')
    .select(
      'id, conversation_id, sender_id, content, type, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone, sender:profiles!messages_sender_id_fkey (id, username, display_name, avatar_url, status, presence, presence_text, presence_emoji)',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
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
  } = {},
): Promise<SendResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Backend not configured' };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: 'Message cannot be empty' };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: userData.user.id,
      content: trimmed,
      type: 'text',
      status: 'sent',
      reply_to_message_id: options.replyToMessageId ?? null,
      branch_id: options.branchId ?? null,
      expires_at:
        options.expiresInSeconds == null
          ? null
          : new Date(Date.now() + options.expiresInSeconds * 1000).toISOString(),
    })
    .select('id, conversation_id, sender_id, content, type, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, message: data as MessageRow };
}

/** Move the caller's read cursor forward for a conversation. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return;
  }

  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userData.user.id);
}

/** Conversations the caller belongs to, most recent activity first. */
export async function fetchConversationSummaries(): Promise<ConversationSummary[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;

  const { data, error } = await supabase
    .from('conversations')
    .select(
      'id, type, name, avatar_url, created_at, conversation_members!inner (user_id, last_read_at), messages (id, content, sender_id, created_at)',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data as unknown as Array<
    ConversationRow & {
      conversation_members?: Array<{ user_id: string; last_read_at: string | null }>;
      messages?: Array<{ id: string; content: string; sender_id: string; created_at: string }>;
    }
  >;

  const summaries: ConversationSummary[] = [];

  for (const row of rows) {
    const members = row.conversation_members ?? [];
    const messages = (row.messages ?? [])
      .slice()
      .sort(
        (a: { content: string; created_at: string }, b: { content: string; created_at: string }) =>
          Date.parse(b.created_at) - Date.parse(a.created_at),
      );
    const latest = messages[0] ?? null;

    // Unread = messages newer than the caller's read cursor.
    const myMembership = members.find((member) => member.user_id === selfId);
    const readAt = myMembership?.last_read_at ? Date.parse(myMembership.last_read_at) : 0;
    const unread = messages.filter((message) => {
      if (!selfId || message.sender_id === selfId) return false;
      return Date.parse(message.created_at) > readAt;
    }).length;

    summaries.push({
      id: row.id,
      type: row.type,
      name: row.name,
      avatar_url: row.avatar_url,
      last_message_at: latest?.created_at ?? row.created_at,
      last_message_preview: latest?.content ?? null,
      last_message_sender: latest?.sender_id ?? null,
      unread_count: unread,
      peers: [],
    });
  }

  // Attach peer profiles (everyone except the caller) for the list avatars.
  const conversationIds = summaries.map((summary) => summary.id);
  if (conversationIds.length > 0) {
    const { data: peerRows, error: peerError } = await supabase
      .from('conversation_members')
      .select(
        'conversation_id, user_id, profile:profiles!conversation_members_user_id_fkey (id, display_name, avatar_url, presence, presence_text, presence_emoji)',
      )
      .in('conversation_id', conversationIds)
      .neq('user_id', selfId ?? '');

    if (!peerError) {
      const byConversation = new Map<string, ConversationSummary['peers']>();
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
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: MessageRow }) => handlers.onInsert(payload.new),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: MessageRow }) => handlers.onUpdate(payload.new),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'message_reactions' },
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
    .from('message_reactions')
    .select('id, message_id, user_id, emoji, created_at')
    .in('message_id', messageIds);

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
export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return;
  }

  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userData.user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from('message_reactions').delete().eq('id', existing.id);
    return;
  }

  await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: userData.user.id, emoji });
}
/** Edit the content of a message the caller sent. RLS restricts this to the sender. */
export async function editMessage(messageId: string, content: string): Promise<SendResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Backend not configured' };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: 'Message cannot be empty' };
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ content: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id, conversation_id, sender_id, content, type, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone')
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
    return { ok: false, error: 'Backend not configured' };
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ deleted_for_everyone: true, content: '', deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id, conversation_id, sender_id, content, type, status, reply_to_message_id, branch_id, created_at, updated_at, expires_at, edited_at, deleted_at, deleted_for_everyone')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, message: data as MessageRow };
}

/** How far a caller has read into a conversation. */
export async function fetchReadCursor(conversationId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return null;
  }

  const { data } = await supabase
    .from('conversation_members')
    .select('last_read_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userData.user.id)
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
    .from('conversation_members')
    .select('user_id, last_read_at')
    .eq('conversation_id', conversationId);

  const cursors: Record<string, string | null> = {};
  for (const row of (data ?? []) as Array<{ user_id: string; last_read_at: string | null }>) {
    cursors[row.user_id] = row.last_read_at;
  }
  return cursors;
}

export type CreateConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

/**
 * Create a direct conversation with one peer, or return the existing one if a
 * direct conversation between the two already exists.
 */
export async function createDirectConversation(peerId: string): Promise<CreateConversationResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Backend not configured' };
  }

  const { data: userData } = await supabase.auth.getUser();
  const selfId = userData.user?.id;
  if (!selfId) {
    return { ok: false, error: 'Not signed in' };
  }

  // Look for an existing direct conversation shared by both users.
  const { data: mine } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', selfId);

  const myIds = (mine ?? []).map((row: { conversation_id: string }) => row.conversation_id);
  if (myIds.length > 0) {
    const { data: shared } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .in('conversation_id', myIds)
      .eq('user_id', peerId);

    if (shared && shared.length > 0) {
      return { ok: true, conversationId: (shared[0] as { conversation_id: string }).conversation_id };
    }
  }

  // Create the conversation and both membership rows.
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({ type: 'direct', created_by: selfId })
    .select('id')
    .single();

  if (convError || !conv) {
    return { ok: false, error: convError?.message ?? 'Could not create conversation' };
  }

  const conversationId = (conv as { id: string }).id;
  const { error: memberError } = await supabase.from('conversation_members').insert([
    { conversation_id: conversationId, user_id: selfId, role: 'admin' },
    { conversation_id: conversationId, user_id: peerId, role: 'member' },
  ]);

  if (memberError) {
    return { ok: false, error: memberError.message };
  }

  return { ok: true, conversationId };
}

/**
 * Subscribe to any new message in any conversation the caller belongs to, so
 * the conversation list can reorder and update unread counts live.
 */
export function subscribeToConversationList(
  handlers: { onChange: () => void },
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('conversation-list')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      () => handlers.onChange(),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      () => handlers.onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
