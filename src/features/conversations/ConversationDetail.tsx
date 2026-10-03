import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SEMANTIC_COLORS, SPACING, TYPOGRAPHY } from '../../theme';
import {
  deleteMessage,
  editMessage,
  fetchMessages,
  fetchReadCursors,
  fetchReactions,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
  toggleReaction,
  MESSAGES_PAGE_SIZE,
} from '../../lib/conversations';
import { sendTyping, watchTyping } from '../../lib/presence';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import type { MessageReactionRow, MessageWithSender } from '../../lib/database.types';

/**
 * Conversation screen: message history, realtime updates, and the composer.
 *
 * Features: replies, reactions, edit/delete, typing indicator, read receipts,
 * pagination, and a compact layout where the sender's name sits above the
 * message rather than a giant bubble.
 */

interface Props {
  conversationId: string;
  title?: string;
}

export default function ConversationDetail({ conversationId, title }: Props) {
  const { user: currentUser } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, MessageReactionRow[]>>({});
  const [readCursors, setReadCursors] = useState<Record<string, string | null>>({});
  const [typists, setTypists] = useState<Map<string, string>>(new Map());
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [editing, setEditing] = useState<MessageWithSender | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const listRef = useRef<FlatList<MessageWithSender>>(null);
  const messagesRef = useRef<MessageWithSender[]>([]);
  const insets = useSafeAreaInsets();
  const selfId = currentUser?.id;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchMessages(conversationId);
      setMessages(rows);
      setHasMore(rows.length >= MESSAGES_PAGE_SIZE);
      void markConversationRead(conversationId);
      const ids = rows.map((message) => message.id);
      if (ids.length > 0) {
        setReactions(await fetchReactions(ids));
      }
      setReadCursors(await fetchReadCursors(conversationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const older = await fetchMessages(conversationId, MESSAGES_PAGE_SIZE, oldest.created_at);
      if (older.length > 0) {
        setMessages((current) => [...older, ...current]);
        setHasMore(older.length >= MESSAGES_PAGE_SIZE);
        const ids = older.map((message) => message.id);
        if (ids.length > 0) {
          const olderReactions = await fetchReactions(ids);
          setReactions((current) => ({ ...current, ...olderReactions }));
        }
      } else {
        setHasMore(false);
      }
    } catch {
      // Non-fatal: keep the list as-is.
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, messages]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeToConversation(conversationId, {
      onInsert: (incoming) => {
        setMessages((current) => {
          if (current.some((message) => message.id === incoming.id)) {
            return current;
          }
          return [...current, { ...incoming, sender: null }];
        });
        void markConversationRead(conversationId);
      },
      onUpdate: (updated) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === updated.id ? { ...message, ...updated } : message,
          ),
        );
      },
      onReactionChange: () => {
        void (async () => {
          const ids = messagesRef.current.map((message) => message.id);
          if (ids.length > 0) {
            setReactions(await fetchReactions(ids));
          }
        })();
      },
    });
  }, [conversationId]);

  // Typing indicator.
  useEffect(() => {
    if (!selfId) return;
    return watchTyping(conversationId, selfId, setTypists);
  }, [conversationId, selfId]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (selfId) {
      sendTyping(conversationId, selfId, currentUser?.displayName ?? 'Someone', text.length > 0);
    }
  };

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    const result = await sendMessage(conversationId, content, {
      replyToMessageId: replyingTo?.id ?? null,
    });

    if (result.ok) {
      setDraft('');
      setReplyingTo(null);
      setMessages((current) => {
        if (current.some((message) => message.id === result.message.id)) return current;
        return [
          ...current,
          {
            ...result.message,
            sender: currentUser
              ? {
                  id: currentUser.id,
                  username: currentUser.username,
                  display_name: currentUser.displayName,
                  avatar_url: currentUser.avatar ?? null,
                  status: currentUser.status ?? 'online',
                }
              : null,
          },
        ];
      });
    } else {
      setError(result.error);
    }
    setSending(false);
  }, [conversationId, currentUser, draft, replyingTo, sending]);

  const onEdit = useCallback(async () => {
    if (!editing) return;
    const content = draft.trim();
    if (!content) return;
    const result = await editMessage(editing.id, content);
    if (result.ok) {
      setDraft('');
      setEditing(null);
    } else {
      setError(result.error);
    }
  }, [editing, draft]);

  const onDelete = useCallback(
    (message: MessageWithSender) => {
      Alert.alert('Delete message', 'Delete for everyone?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteMessage(message.id);
          },
        },
      ]);
    },
    [],
  );

  const onReact = useCallback(
    (messageId: string, emoji: string) => {
      void toggleReaction(messageId, emoji);
    },
    [],
  );

  const startReply = (message: MessageWithSender) => {
    setEditing(null);
    setReplyingTo(message);
  };

  const startEdit = (message: MessageWithSender) => {
    setReplyingTo(null);
    setEditing(message);
    setDraft(message.content);
  };

  const renderItem = useCallback(
    ({ item, index }: { item: MessageWithSender; index: number }) => {
      const previous = index > 0 ? messages[index - 1] : null;
      const startsGroup =
        !previous ||
        previous.sender_id !== item.sender_id ||
        Date.parse(item.created_at) - Date.parse(previous.created_at) > 5 * 60 * 1000;
      const isMine = item.sender_id === selfId;
      const messageReactions = reactions[item.id] ?? [];
      const isDeleted = item.deleted_for_everyone;

      // Read receipt: show a check when the peer has read past this message.
      const peerRead = Object.entries(readCursors).some(
        ([userId, cursor]) =>
          userId !== selfId && cursor && Date.parse(cursor) >= Date.parse(item.created_at),
      );

      return (
        <Pressable
          style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}
          onLongPress={() => {
            if (isMine) {
              Alert.alert('Message', undefined, [
                { text: 'Reply', onPress: () => startReply(item) },
                { text: 'Edit', onPress: () => startEdit(item) },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(item) },
                { text: 'Cancel', style: 'cancel' },
              ]);
            } else {
              Alert.alert('Message', undefined, [
                { text: 'Reply', onPress: () => startReply(item) },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }
          }}
          delayLongPress={350}
        >
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              !startsGroup && styles.bubbleTight,
            ]}
          >
            {startsGroup && !isMine && item.sender ? (
              <Text style={styles.senderName}>{item.sender.display_name}</Text>
            ) : null}

            {item.reply_to_message_id ? (
              <Text style={styles.replyHint}>↳ replying to a message</Text>
            ) : null}

            <Text style={[styles.messageText, isDeleted && styles.deletedText]}>
              {isDeleted ? 'Message deleted' : item.content}
            </Text>

            {item.edited_at ? <Text style={styles.editedHint}>edited</Text> : null}

            <View style={styles.metaRow}>
              <Text style={styles.timestamp}>
                {new Date(item.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {isMine && peerRead ? (
                <Text style={styles.readReceipt}>✓✓</Text>
              ) : null}
            </View>

            {messageReactions.length > 0 ? (
              <View style={styles.reactionRow}>
                {messageReactions.map((reaction) => (
                  <Pressable
                    key={reaction.id}
                    style={styles.reactionChip}
                    onPress={() => onReact(item.id, reaction.emoji)}
                  >
                    <Text style={styles.reactionText}>{reaction.emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [messages, selfId, reactions, readCursors, onDelete, onReact],
  );

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Backend not configured</Text>
        <Text style={styles.emptyBody}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then rebuild.
        </Text>
      </View>
    );
  }

  const typistText =
    typists.size > 0 ? `${[...typists.values()].join(', ')} ${typists.size > 1 ? 'are' : 'is'} typing…` : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title ?? 'Conversation'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.surfaceTint} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            loadingOlder ? (
              <ActivityIndicator color={COLORS.surfaceTint} style={styles.olderLoader} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyBody}>
                Someone has to say something stupid first.
              </Text>
            </View>
          }
        />
      )}

      {typistText ? <Text style={styles.typingText}>{typistText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {replyingTo ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarText} numberOfLines={1}>
            Replying to {replyingTo.sender?.display_name ?? 'message'}
          </Text>
          <Pressable onPress={() => setReplyingTo(null)}>
            <Text style={styles.replyBarClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      {editing ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarText} numberOfLines={1}>
            Editing message
          </Text>
          <Pressable onPress={() => { setEditing(null); setDraft(''); }}>
            <Text style={styles.replyBarClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, SPACING.spaceMd) }]}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={SEMANTIC_COLORS.textDim}
          value={draft}
          onChangeText={onDraftChange}
          multiline
          accessibilityLabel="Message input"
        />
        <Pressable
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => (editing ? void onEdit() : void send())}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save edit' : 'Send message'}
        >
          <Text style={styles.sendButtonText}>
            {sending ? '…' : editing ? 'Save' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SEMANTIC_COLORS.canvasRoot,
  },
  header: {
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceMd,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: SEMANTIC_COLORS.textPrimary,
  },
  listContent: {
    padding: SPACING.gutter,
    gap: SPACING.spaceXs,
  },
  olderLoader: {
    paddingVertical: SPACING.spaceMd,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: SPACING.spaceXs,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: RADIUS.DEFAULT,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleTight: {
    marginBottom: 2,
  },
  bubbleMine: {
    backgroundColor: COLORS.secondaryContainer,
    borderColor: 'transparent',
    borderBottomRightRadius: RADIUS.sm,
  },
  bubbleTheirs: {
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
    borderBottomLeftRadius: RADIUS.sm,
  },
  senderName: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.secondary,
    marginBottom: 2,
  },
  replyHint: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  messageText: {
    ...TYPOGRAPHY.bodyMD,
    color: SEMANTIC_COLORS.textPrimary,
  },
  deletedText: {
    color: SEMANTIC_COLORS.textDim,
    fontStyle: 'italic',
  },
  editedHint: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
    alignSelf: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.spaceXs,
    marginTop: 2,
  },
  timestamp: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
  },
  readReceipt: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.surfaceTint,
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.spaceXs,
    marginTop: SPACING.spaceXs,
  },
  reactionChip: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  reactionText: {
    fontSize: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.margin,
    gap: SPACING.spaceSm,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: SEMANTIC_COLORS.textPrimary,
  },
  emptyBody: {
    ...TYPOGRAPHY.bodyMD,
    color: SEMANTIC_COLORS.textSecondary,
    textAlign: 'center',
  },
  typingText: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textSecondary,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceXs,
  },
  error: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.error,
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceXs,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceSm,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  replyBarText: {
    ...TYPOGRAPHY.labelMD,
    color: SEMANTIC_COLORS.textSecondary,
    flex: 1,
  },
  replyBarClose: {
    ...TYPOGRAPHY.labelLG,
    color: SEMANTIC_COLORS.textDim,
    paddingHorizontal: SPACING.spaceSm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceMd,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  input: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: SEMANTIC_COLORS.textPrimary,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
    borderRadius: RADIUS.DEFAULT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEMANTIC_COLORS.ghostBorder,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: COLORS.surfaceTint,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.spaceLg,
    paddingVertical: SPACING.spaceSm,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
  },
});