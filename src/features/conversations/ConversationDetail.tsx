import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  fetchMessages,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
} from '../../lib/conversations';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { MessageWithSender } from '../../lib/database.types';
import type { User } from '../../types';

/**
 * Conversation screen: message history, realtime updates, and the composer.
 *
 * Realtime inserts arrive on a postgres_changes subscription filtered to this
 * conversation. The local list is the single source of truth so an echoed
 * insert never duplicates the row the sender already added optimistically.
 */

interface Props {
  conversationId: string;
  title?: string;
  currentUser?: User | null;
}

export default function ConversationDetail({ conversationId, title, currentUser }: Props) {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<MessageWithSender>>(null);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchMessages(conversationId);
      setMessages(rows);
      void markConversationRead(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

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
      },
      onUpdate: (updated) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === updated.id ? { ...message, ...updated } : message,
          ),
        );
      },
      onReactionChange: () => {
        // Reactions render from a separate fetch; a full reload is cheap enough here.
      },
    });
  }, [conversationId]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) {
      return;
    }

    setSending(true);
    const result = await sendMessage(conversationId, content);

    if (result.ok) {
      setDraft('');
      setMessages((current) => {
        if (current.some((message) => message.id === result.message.id)) {
          return current;
        }
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
  }, [conversationId, currentUser, draft, sending]);

  const renderItem = useCallback(
    ({ item, index }: { item: MessageWithSender; index: number }) => {
      const previous = index > 0 ? messages[index - 1] : null;
      const startsGroup =
        !previous ||
        previous.sender_id !== item.sender_id ||
        Date.parse(item.created_at) - Date.parse(previous.created_at) > 5 * 60 * 1000;
      const isMine = item.sender_id === currentUser?.id;

      return (
        <View
          style={[
            styles.bubbleRow,
            isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
            !startsGroup && styles.bubbleTight,
          ]}
        >
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            {startsGroup && !isMine && item.sender ? (
              <Text style={styles.senderName}>{item.sender.display_name}</Text>
            ) : null}
            <Text style={styles.messageText}>{item.content}</Text>
            <Text style={styles.timestamp}>
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>
      );
    },
    [currentUser?.id, messages],
  );

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Backend not configured</Text>
        <Text style={styles.emptyBody}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then rebuild the app.
        </Text>
      </View>
    );
  }

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
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyBody}>Send the first message to start the conversation.</Text>
            </View>
          }
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, SPACING.spaceMd) }]}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={SEMANTIC_COLORS.textDim}
          value={draft}
          onChangeText={setDraft}
          multiline
          onSubmitEditing={() => void send()}
          returnKeyType="send"
          accessibilityLabel="Message input"
        />
        <Pressable
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => void send()}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendButtonText}>{sending ? '...' : 'Send'}</Text>
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
  bubbleTight: {
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: RADIUS.DEFAULT,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderWidth: StyleSheet.hairlineWidth,
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
  messageText: {
    ...TYPOGRAPHY.bodyMD,
    color: SEMANTIC_COLORS.textPrimary,
  },
  timestamp: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
    alignSelf: 'flex-end',
    marginTop: 2,
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
  error: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.error,
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceXs,
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