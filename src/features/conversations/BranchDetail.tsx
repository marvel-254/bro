import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SEMANTIC_COLORS, SPACING, TYPOGRAPHY } from '../../theme';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../lib/auth-context';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  fetchBranch,
  fetchBranchMessages,
  postToBranch,
  deleteBranch,
  renameBranch,
  subscribeToBranch,
  BRANCH_TITLE_MAX,
  type BranchWithContext,
} from '../../lib/branches';
import type { MessageWithSender } from '../../lib/database.types';
import { LoadingState, ErrorState, EmptyState } from '../../components/feedback/States';

/**
 * Branch — a room that sprouted off a message.
 *
 * The context header is not decoration. It is the whole reason branches exist
 * instead of forum threads: you can always see the message this started from,
 * who said it, and that you are still inside the parent conversation. Back goes
 * Branch -> Conversation, never to the root of the app.
 *
 * Back navigation is explicit: the header arrow returns to `/chat/[conversationId]`
 * so the Android hardware back and the UI agree.
 */

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function BranchDetail({ branchId }: { branchId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();

  const [branch, setBranch] = useState<BranchWithContext | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const listRef = useRef<FlatList<MessageWithSender>>(null);

  const load = useCallback(async () => {
    try {
      const [branchRow, branchMessages] = await Promise.all([
        fetchBranch(branchId),
        fetchBranchMessages(branchId),
      ]);
      // null here means either it does not exist or RLS hid it. Both are the
      // same thing to the caller: not found.
      if (!branchRow) {
        setError('Branch not found');
        setLoading(false);
        return;
      }
      setBranch(branchRow);
      setMessages(branchMessages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load branch');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    void load();
    return subscribeToBranch(branchId, { onChange: () => void load() });
  }, [branchId, load]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    const result = await postToBranch(branchId, content);
    setSending(false);

    if (!result.ok) {
      Alert.alert("That didn't send ngl", result.error);
      return;
    }
    setDraft('');
    // The realtime subscription will deliver the row; scroll now so it does not
    // appear below the fold.
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [draft, sending, branchId]);

  const confirmDelete = useCallback(() => {
    if (!branch) return;
    Alert.alert(
      'Delete branch',
      'Messages in here go back to the main chat. Nothing is lost.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteBranch(branch.id);
            if (!result.ok) {
              Alert.alert('Could not delete', result.error);
              return;
            }
            router.replace(`/chat/${branch.conversationId}`);
          },
        },
      ],
    );
  }, [branch, router]);

  const saveTitle = useCallback(async () => {
    if (!branch) return;
    const result = await renameBranch(branch.id, titleDraft);
    if (!result.ok) {
      Alert.alert('Could not rename', result.error);
      return;
    }
    setRenaming(false);
    setBranch({ ...branch, title: titleDraft.trim() || null });
  }, [branch, titleDraft]);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <EmptyState
          message="Backend not configured."
          icon={<Ionicons name="cloud-offline-outline" size={36} color={COLORS.onSurfaceVariant} />}
        />
      </View>
    );
  }

  if (loading) {
    return <LoadingState message="Opening branch..." />;
  }

  if (error || !branch) {
    return (
      <View style={styles.centered}>
        <ErrorState message={error ?? 'Branch not found'} onRetry={() => void load()} />
        <TouchableOpacity
          style={styles.backFallback}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.backFallbackText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const title = branch.title ?? 'Branch';

  return (
    <View style={styles.container}>
      {/* Header: back goes to the parent conversation, explicitly. */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.spaceXs }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.replace(`/chat/${branch.conversationId}`)}
          accessibilityRole="button"
          accessibilityLabel="Back to conversation"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>

        <View style={styles.headerBody}>
          {renaming ? (
            <TextInput
              style={styles.titleInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
              maxLength={BRANCH_TITLE_MAX}
              autoFocus
              onSubmitEditing={() => void saveTitle()}
              onBlur={() => void saveTitle()}
              accessibilityLabel="Branch title"
            />
          ) : (
            <TouchableOpacity
              style={styles.titleRow}
              onPress={() => {
                setTitleDraft(branch.title ?? '');
                setRenaming(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Branch ${title}. Tap to rename.`}
            >
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Ionicons name="pencil" size={12} color={COLORS.onSurfaceVariant} />
            </TouchableOpacity>
          )}
          <Text style={styles.subtitle}>
            {branch.messageCount} {branch.messageCount === 1 ? 'message' : 'messages'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={confirmDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete branch"
        >
          <Ionicons name="trash-outline" size={19} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      {/* Context: the message this branch started from. Always visible. */}
      {branch.rootMessage ? (
        <View style={styles.context}>
          <View style={styles.contextLabelRow}>
            <Ionicons name="return-down-forward" size={12} color={COLORS.primaryContainer} />
            <Text style={styles.contextLabel}>Started from</Text>
          </View>
          <View style={styles.contextBody}>
            <Avatar
              name={branch.rootMessage.sender?.display_name}
              uri={branch.rootMessage.sender?.avatar_url}
              size={22}
            />
            <Text style={styles.contextAuthor} numberOfLines={1}>
              {branch.rootMessage.sender?.display_name ?? 'Someone'}
            </Text>
            <Text style={styles.contextTime}>{timeLabel(branch.rootMessage.created_at)}</Text>
          </View>
          <Text style={styles.contextText} numberOfLines={3}>
            {branch.rootMessage.content}
          </Text>
        </View>
      ) : (
        <View style={styles.context}>
          <Text style={styles.contextMissing}>The original message was deleted.</Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyThread}>
            <Text style={styles.emptyThreadText}>
              Nothing in here yet. Break the ice.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const mine = item.sender_id === currentUser?.id;
          return (
            <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
              {!mine ? (
                <Avatar
                  name={item.sender?.display_name}
                  uri={item.sender?.avatar_url}
                  size={26}
                />
              ) : null}
              <View style={styles.bubbleWrap}>
                {!mine ? (
                  <Text style={styles.senderName}>{item.sender?.display_name ?? 'Someone'}</Text>
                ) : null}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text
                    style={[styles.bubbleText, item.deleted_for_everyone && styles.bubbleDeleted]}
                  >
                    {item.deleted_for_everyone ? 'This message was deleted.' : item.content}
                  </Text>
                  <Text style={styles.bubbleTime}>{timeLabel(item.created_at)}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Composer */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + SPACING.spaceXs }]}>
        <TextInput
          style={styles.composerInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Say tsup bruv..."
          placeholderTextColor={COLORS.onSurfaceVariant}
          multiline
          accessibilityLabel="Message this branch"
        />
        <TouchableOpacity
          style={[styles.sendBtn, draft.trim().length === 0 && styles.sendBtnDisabled]}
          onPress={() => void send()}
          disabled={draft.trim().length === 0 || sending}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={draft.trim().length === 0 ? COLORS.onSurfaceVariant : COLORS.onPrimary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceSm,
    paddingBottom: SPACING.spaceSm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  headerBody: {
    flex: 1,
  },
  headerBtn: {
    padding: SPACING.spaceXs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceXs,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: '700',
    color: COLORS.onSurface,
    flexShrink: 1,
  },
  titleInput: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: '700',
    color: COLORS.onSurface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryContainer,
    paddingVertical: 0,
  },
  subtitle: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  context: {
    margin: SPACING.spaceSm,
    padding: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainerLow,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primaryContainer,
  },
  contextLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.spaceXs,
  },
  contextLabel: {
    ...TYPOGRAPHY.labelSM,
    fontWeight: '700',
    color: COLORS.primaryContainer,
    letterSpacing: 0.5,
  },
  contextBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceXs,
  },
  contextAuthor: {
    ...TYPOGRAPHY.labelMD,
    fontWeight: '600',
    color: COLORS.onSurface,
    flexShrink: 1,
  },
  contextTime: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
  },
  contextText: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
  contextMissing: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    fontStyle: 'italic',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.spaceSm,
    paddingBottom: SPACING.spaceSm,
  },
  emptyThread: {
    padding: SPACING.spaceLg,
    alignItems: 'center',
  },
  emptyThreadText: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.spaceXs,
    marginBottom: SPACING.spaceSm,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  bubbleWrap: {
    maxWidth: '80%',
  },
  senderName: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginBottom: 2,
    marginLeft: SPACING.spaceXs,
  },
  bubble: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: SPACING.spaceXs,
    borderRadius: RADIUS.sm,
  },
  bubbleMine: {
    backgroundColor: COLORS.primaryContainer,
    borderBottomRightRadius: 2,
  },
  bubbleTheirs: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
  },
  bubbleDeleted: {
    color: COLORS.onSurfaceVariant,
    fontStyle: 'italic',
  },
  bubbleTime: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.spaceXs,
    paddingHorizontal: SPACING.spaceSm,
    paddingTop: SPACING.spaceXs,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  composerInput: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    maxHeight: 110,
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: SPACING.spaceXs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  backFallback: {
    padding: SPACING.spaceMd,
  },
  backFallbackText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.primaryContainer,
  },
});