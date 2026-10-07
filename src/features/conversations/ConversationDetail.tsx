import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  COLORS,
  RADIUS,
  SEMANTIC_COLORS,
  SPACING,
  TYPOGRAPHY,
} from "../../theme";
import {
  compareMessagesNewestFirst,
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
} from "../../lib/conversations";
import { sendTyping, watchTyping, releaseTypingChannel } from "../../lib/presence";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { useCall } from "../../lib/call-context";
import { fetchConversationPeer } from "../../lib/conversations";
import {
  fetchBranchesByRoot,
  fetchReplyCounts,
  branchFromReplies,
  subscribeToBranches,
  BRANCH_SUGGEST_AT,
} from "../../lib/branches";
import {
  fetchMessageAttachments,
  sendImageMessage,
  signedChatUrl,
  type AttachmentRef,
} from "../../lib/media";
import GifPicker from "../gifs/GifPicker";
import type { Gif } from "../../lib/gifs";
import type {
  MessageReactionRow,
  MessageWithSender,
} from "../../lib/database.types";

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

/**
 * Inline photo for an image message. Resolves the fast thumbnail first; the
 * full image loads on demand in the viewer. A message whose attachment row is
 * missing (deleted, or the link step failed) renders a plain placeholder
 * instead of a broken box.
 */
function ChatImage({
  attachment,
  onOpen,
}: {
  attachment: AttachmentRef | undefined;
  onOpen: (fullPath: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (!attachment) {
      setUrl(null);
      return;
    }
    void signedChatUrl(attachment.thumbPath ?? attachment.storagePath).then(
      (resolved) => {
        if (live) setUrl(resolved);
      },
    );
    return () => {
      live = false;
    };
  }, [attachment]);

  if (!attachment) {
    return (
      <View style={styles.photoPlaceholder}>
        <Text style={styles.photoPlaceholderText}>Photo unavailable</Text>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={styles.photoPlaceholder}>
        <ActivityIndicator size="small" color={SEMANTIC_COLORS.textDim} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onOpen(attachment.storagePath)}
      accessibilityRole="button"
      accessibilityLabel="Open photo"
    >
      <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
    </Pressable>
  );
}

/**
 * Voice/video buttons. Rendered only for direct conversations with exactly one
 * resolvable peer, because calls are 1:1 in v1 — a group header with a call
 * button that fails would be a dead button, which the docs forbid.
 */
function CallButtons({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { phase, start } = useCall();
  const [peer, setPeer] = useState<{ peerName: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    void fetchConversationPeer(conversationId).then((resolved) => {
      if (!live) return;
      setPeer(resolved && resolved.peerId ? { peerName: resolved.peerName } : null);
    });
    return () => {
      live = false;
    };
  }, [conversationId]);

  if (!peer) return null;

  const busy = phase !== "idle";
  const begin = async (kind: "voice" | "video") => {
    const callId = await start(conversationId, kind, peer.peerName);
    if (callId) {
      router.push(`/call/${callId}`);
    }
  };

  return (
    <View style={styles.callButtons}>
      <Pressable
        onPress={() => void begin("voice")}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Voice call"
      >
        <Ionicons
          name="call-outline"
          size={20}
          color={busy ? SEMANTIC_COLORS.textDim : COLORS.surfaceTint}
        />
      </Pressable>
      <Pressable
        onPress={() => void begin("video")}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Video call"
      >
        <Ionicons
          name="videocam-outline"
          size={22}
          color={busy ? SEMANTIC_COLORS.textDim : COLORS.surfaceTint}
        />
      </Pressable>
    </View>
  );
}

export default function ConversationDetail({ conversationId, title }: Props) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<
    Record<string, MessageReactionRow[]>
  >({});
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
  const [branchByRoot, setBranchByRoot] = useState<Record<string, string>>({});
  const [branching, setBranching] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, AttachmentRef>>(
    {},
  );
  const [sendingImage, setSendingImage] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [sendingGif, setSendingGif] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [readCursors, setReadCursors] = useState<Record<string, string | null>>(
    {},
  );
  const [typists, setTypists] = useState<Map<string, string>>(new Map());
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [editing, setEditing] = useState<MessageWithSender | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const listRef = useRef<FlatList<MessageWithSender>>(null);
  const lastIdRef = useRef<string | null>(null);
  const messagesRef = useRef<MessageWithSender[]>([]);
  const insets = useSafeAreaInsets();
  const selfId = currentUser?.id;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /**
   * Page enrichment: reactions, reply counts, branch links, attachments.
   * Every page gets the same treatment — an older page rendering as bare
   * bubbles is a bug, not a performance win.
   */
  const enrich = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const [fetchedReactions, counts, branches, attached] = await Promise.all([
      fetchReactions(ids),
      fetchReplyCounts(ids),
      fetchBranchesByRoot(ids),
      fetchMessageAttachments(ids),
    ]);
    setReactions((current) => ({ ...current, ...fetchedReactions }));
    setReplyCounts((current) => ({ ...current, ...counts }));
    setBranchByRoot((current) => ({ ...current, ...branches }));
    setAttachments((current) => ({ ...current, ...attached }));
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchMessages(conversationId);
      setMessages(rows);
      setHasMore(rows.length >= MESSAGES_PAGE_SIZE);
      void markConversationRead(conversationId);
      await enrich(rows.map((message) => message.id));
      setReadCursors(await fetchReadCursors(conversationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [conversationId, enrich]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const older = await fetchMessages(conversationId, MESSAGES_PAGE_SIZE, {
        createdAt: oldest.created_at,
        id: oldest.id,
      });
      if (older.length > 0) {
        setMessages((current) => [...older, ...current]);
        setHasMore(older.length >= MESSAGES_PAGE_SIZE);
        await enrich(older.map((message) => message.id));
      } else {
        setHasMore(false);
      }
    } catch {
      // Non-fatal: keep the list as-is.
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, messages, enrich]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeToConversation(conversationId, {
      onInsert: (incoming) => {
        // Branch messages share the conversation_id, so this channel delivers
        // them too. They belong to the branch screen, not here.
        if (incoming.branch_id) return;
        setMessages((current) => {
          if (current.some((message) => message.id === incoming.id)) {
            return current;
          }
          // Insert-then-sort on (created_at, id): a message sent from a device
          // whose clock runs behind the server can otherwise land after newer
          // messages and sit there, wrongly ordered, until the next reload.
          // The list below renders oldest-first, hence the reversed comparator.
          return [...current, { ...incoming, sender: null }].sort(
            (a, b) => -compareMessagesNewestFirst(a, b),
          );
        });
        // An arriving image needs its attachment row for the thumbnail.
        if (incoming.type === "image") {
          void fetchMessageAttachments([incoming.id]).then((attached) => {
            setAttachments((current) => ({ ...current, ...attached }));
          });
        }
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

  // Branch creation and counter changes must refresh the pills, otherwise a
  // branch spun off in another client leaves a stale count here.
  useEffect(() => {
    return subscribeToBranches(conversationId, { onChange: () => void load() });
  }, [conversationId, load]);

  // Typing indicator.
  useEffect(() => {
    if (!selfId) return;
    const stopWatching = watchTyping(conversationId, selfId, setTypists);
    return () => {
      stopWatching();
      releaseTypingChannel(conversationId);
    };
  }, [conversationId, selfId]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (selfId) {
      sendTyping(
        conversationId,
        selfId,
        currentUser?.displayName ?? "Someone",
        text.length > 0,
      );
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
      setDraft("");
      setReplyingTo(null);
      setMessages((current) => {
        if (current.some((message) => message.id === result.message.id))
          return current;
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
                  status: currentUser.status ?? "online",
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
      setDraft("");
      setEditing(null);
    } else {
      setError(result.error);
    }
  }, [editing, draft]);

  const onDelete = useCallback((message: MessageWithSender) => {
    Alert.alert("Delete message", "Delete for everyone?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteMessage(message.id);
        },
      },
    ]);
  }, []);

  const onReact = useCallback((messageId: string, emoji: string) => {
    void toggleReaction(messageId, emoji);
  }, []);

  const startReply = (message: MessageWithSender) => {
    setEditing(null);
    setReplyingTo(message);
  };

  const startEdit = (message: MessageWithSender) => {
    setReplyingTo(null);
    setEditing(message);
    setDraft(message.content);
  };

  /**
   * Send a photo with the composer text as the caption. Cancellation is silent
   * (the user changed their mind); every other failure names its stage so the
   * error says what actually went wrong.
   */
  const sendImage = useCallback(async () => {
    if (sendingImage) return;
    setSendingImage(true);

    const result = await sendImageMessage(conversationId, draft);
    setSendingImage(false);

    if (!result.ok) {
      if (result.error !== "cancelled") {
        setError(result.error);
      }
      return;
    }

    const now = new Date().toISOString();
    setDraft("");
    setMessages((current) => {
      if (current.some((message) => message.id === result.messageId))
        return current;
      return [
        ...current,
        {
          id: result.messageId,
          conversation_id: conversationId,
          sender_id: currentUser?.id ?? "",
          content: draft.trim(),
          type: "image",
          gif_id: null,
          status: "sent",
          reply_to_message_id: null,
          branch_id: null,
          created_at: now,
          updated_at: now,
          sender: currentUser
            ? {
                id: currentUser.id,
                username: currentUser.username,
                display_name: currentUser.displayName,
                avatar_url: currentUser.avatar ?? null,
                status: currentUser.status ?? "online",
              }
            : null,
        },
      ];
    });
    // The attachment row exists by now; pull it in for the thumbnail.
    const attached = await fetchMessageAttachments([result.messageId]);
    setAttachments((current) => ({ ...current, ...attached }));
  }, [conversationId, currentUser, draft, sendingImage]);

  /**
   * Send a GIF from the self-hosted library. No upload happens: the message
   * points at a catalogue row, so this is one insert and nothing else.
   */
  const sendGif = useCallback(
    async (gif: Gif) => {
      if (sendingGif) return;
      setGifPickerOpen(false);
      setSendingGif(true);
      const caption = draft.trim();

      const result = await sendMessage(conversationId, caption, {
        messageType: "gif",
        gifId: gif.id,
      });
      setSendingGif(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDraft("");
      const now = new Date().toISOString();
      setMessages((current) => {
        if (current.some((message) => message.id === result.message.id)) {
          return current;
        }
        return [
          ...current,
          {
            id: result.message.id,
            conversation_id: conversationId,
            sender_id: currentUser?.id ?? "",
            content: caption,
            type: "gif",
            gif_id: gif.id,
            status: "sent",
            reply_to_message_id: null,
            branch_id: null,
            created_at: now,
            updated_at: now,
            sender: currentUser
              ? {
                  id: currentUser.id,
                  username: currentUser.username,
                  display_name: currentUser.displayName,
                  avatar_url: currentUser.avatar ?? null,
                  status: currentUser.status ?? null,
                }
              : null,
          } as MessageWithSender,
        ];
      });
    },
    [conversationId, currentUser, draft, sendingGif],
  );

  const openViewer = useCallback(async (fullPath: string) => {
    setViewerLoading(true);
    const url = await signedChatUrl(fullPath, 300);
    setViewerLoading(false);
    if (url) {
      setViewerUrl(url);
    } else {
      setError("Could not open that photo.");
    }
  }, []);

  /**
   * Spin a reply thread off into a branch. Existing replies are moved across
   * rather than copied, so nobody retypes anything and the parent chat stops
   * carrying a thread that has outgrown it.
   */
  const openBranch = useCallback(
    async (message: MessageWithSender) => {
      const existing = branchByRoot[message.id];
      if (existing) {
        router.push(`/chat/${conversationId}/branch/${existing}`);
        return;
      }

      setBranching(message.id);
      const result = await branchFromReplies(conversationId, message.id);
      setBranching(null);

      if (!result.ok) {
        Alert.alert("Could not open a branch", result.error);
        return;
      }
      setBranchByRoot((current) => ({
        ...current,
        [message.id]: result.branch.id,
      }));
      router.push(`/chat/${conversationId}/branch/${result.branch.id}`);
    },
    [branchByRoot, conversationId, router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MessageWithSender; index: number }) => {
      const previous = index > 0 ? messages[index - 1] : null;
      const startsGroup =
        !previous ||
        previous.sender_id !== item.sender_id ||
        Date.parse(item.created_at) - Date.parse(previous.created_at) >
          5 * 60 * 1000;
      const isMine = item.sender_id === selfId;
      const messageReactions = reactions[item.id] ?? [];
      const isDeleted = item.deleted_for_everyone;

      // Read receipt: show a check when the peer has read past this message.
      const peerRead = Object.entries(readCursors).some(
        ([userId, cursor]) =>
          userId !== selfId &&
          cursor &&
          Date.parse(cursor) >= Date.parse(item.created_at),
      );

      return (
        <Pressable
          style={[
            styles.bubbleRow,
            isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
          ]}
          onLongPress={() => {
            if (isMine) {
              Alert.alert("Message", undefined, [
                { text: "Reply", onPress: () => startReply(item) },
                { text: "Edit", onPress: () => startEdit(item) },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => onDelete(item),
                },
                { text: "Cancel", style: "cancel" },
              ]);
            } else {
              Alert.alert("Message", undefined, [
                { text: "Reply", onPress: () => startReply(item) },
                { text: "Cancel", style: "cancel" },
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

            {item.type === "image" && !isDeleted ? (
              <ChatImage
                attachment={attachments[item.id]}
                onOpen={(fullPath) => void openViewer(fullPath)}
              />
            ) : null}

            {isDeleted ? (
              <Text style={[styles.messageText, styles.deletedText]}>
                Message deleted
              </Text>
            ) : item.content ? (
              <Text style={styles.messageText}>{item.content}</Text>
            ) : null}

            {item.edited_at ? (
              <Text style={styles.editedHint}>edited</Text>
            ) : null}

            <View style={styles.metaRow}>
              <Text style={styles.timestamp}>
                {new Date(item.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
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

            {/* Branch pill: appears once a thread is busy enough to deserve its own
                room, or immediately when a branch already exists for this
                message. Tapping opens the branch rather than making a second one. */}
            {(() => {
              const existingBranchId = branchByRoot[item.id];
              const count = replyCounts[item.id] ?? 0;
              if (!existingBranchId && count < BRANCH_SUGGEST_AT) return null;
              const busy = branching === item.id;

              return (
                <Pressable
                  style={styles.branchPill}
                  onPress={() => void openBranch(item)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={
                    existingBranchId
                      ? `Open branch, ${count} ${count === 1 ? "reply" : "replies"}`
                      : `Move ${count} replies into a branch`
                  }
                >
                  <Ionicons
                    name="return-down-forward"
                    size={12}
                    color={COLORS.primaryContainer}
                  />
                  <Text style={styles.branchPillText}>
                    {busy
                      ? "opening..."
                      : `${count} ${count === 1 ? "reply" : "replies"}${
                          existingBranchId
                            ? " — open branch"
                            : " — make a branch"
                        }`}
                  </Text>
                </Pressable>
              );
            })()}
          </View>
        </Pressable>
      );
    },
    [
      messages,
      selfId,
      reactions,
      readCursors,
      onDelete,
      onReact,
      replyCounts,
      branchByRoot,
      branching,
      openBranch,
      attachments,
      openViewer,
    ],
  );

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Backend not configured</Text>
        <Text style={styles.emptyBody}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then
          rebuild.
        </Text>
      </View>
    );
  }

  const typistText =
    typists.size > 0
      ? `${[...typists.values()].join(", ")} ${typists.size > 1 ? "are" : "is"} typing…`
      : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title ?? "Conversation"}
        </Text>
        <CallButtons conversationId={conversationId} />
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
          // Scroll to the bottom only when a NEW message lands at the end.
          // Prepending an older page keeps the same last id, so the view is
          // never yanked away from where the user is reading. The previous
          // code scrolled on every content change, which made older history
          // unreachable: each prepend snapped straight back down.
          onContentSizeChange={() => {
            const last = messages[messages.length - 1]?.id ?? null;
            if (last && last !== lastIdRef.current) {
              lastIdRef.current = last;
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          // The list runs oldest -> newest, so older history lives at the TOP.
          // onEndReached fires at the bottom (newest) and could never reach it.
          onStartReached={() => void loadOlder()}
          onStartReachedThreshold={0.3}
          ListHeaderComponent={
            loadingOlder ? (
              <ActivityIndicator
                color={COLORS.surfaceTint}
                style={styles.olderLoader}
              />
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
            Replying to {replyingTo.sender?.display_name ?? "message"}
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
          <Pressable
            onPress={() => {
              setEditing(null);
              setDraft("");
            }}
          >
            <Text style={styles.replyBarClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          { paddingBottom: Math.max(insets.bottom, SPACING.spaceMd) },
        ]}
      >
        <GifPicker
          visible={gifPickerOpen}
          onClose={() => setGifPickerOpen(false)}
          onPick={(gif) => void sendGif(gif)}
        />
        <Pressable
          style={[
            styles.gifButton,
            sendingGif && styles.imageButtonDisabled,
          ]}
          onPress={() => setGifPickerOpen(true)}
          disabled={sendingGif || sending}
          accessibilityRole="button"
          accessibilityLabel="Send a GIF"
        >
          {sendingGif ? (
            <ActivityIndicator size="small" color={SEMANTIC_COLORS.textDim} />
          ) : (
            <Ionicons
              name="happy-outline"
              size={22}
              color={SEMANTIC_COLORS.textDim}
            />
          )}
        </Pressable>
        <Pressable
          style={[
            styles.imageButton,
            sendingImage && styles.imageButtonDisabled,
          ]}
          onPress={() => void sendImage()}
          disabled={sendingImage || sending}
          accessibilityRole="button"
          accessibilityLabel="Send a photo"
        >
          {sendingImage ? (
            <ActivityIndicator size="small" color={SEMANTIC_COLORS.textDim} />
          ) : (
            <Ionicons
              name="image-outline"
              size={22}
              color={SEMANTIC_COLORS.textDim}
            />
          )}
        </Pressable>
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
          style={[
            styles.sendButton,
            (!draft.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={() => (editing ? void onEdit() : void send())}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={editing ? "Save edit" : "Send message"}
        >
          <Text style={styles.sendButtonText}>
            {sending ? "…" : editing ? "Save" : "Send"}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={viewerUrl !== null || viewerLoading}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setViewerUrl(null);
          setViewerLoading(false);
        }}
      >
        <View style={styles.viewerBackdrop}>
          <Pressable
            style={styles.viewerClose}
            onPress={() => {
              setViewerUrl(null);
              setViewerLoading(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Ionicons
              name="close"
              size={26}
              color={SEMANTIC_COLORS.textPrimary}
            />
          </Pressable>
          {viewerLoading || !viewerUrl ? (
            <ActivityIndicator size="large" color={SEMANTIC_COLORS.textDim} />
          ) : (
            <Image
              source={{ uri: viewerUrl }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SEMANTIC_COLORS.canvasRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceMd,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: SEMANTIC_COLORS.textPrimary,
    flex: 1,
  },
  callButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.spaceXs,
  },
  listContent: {
    padding: SPACING.gutter,
    gap: SPACING.spaceXs,
  },
  olderLoader: {
    paddingVertical: SPACING.spaceMd,
  },
  bubbleRow: {
    flexDirection: "row",
    marginBottom: SPACING.spaceXs,
  },
  bubbleRowMine: {
    justifyContent: "flex-end",
  },
  bubbleRowTheirs: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
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
    borderColor: "transparent",
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
    fontStyle: "italic",
    marginBottom: 2,
  },
  messageText: {
    ...TYPOGRAPHY.bodyMD,
    color: SEMANTIC_COLORS.textPrimary,
  },
  deletedText: {
    color: SEMANTIC_COLORS.textDim,
    fontStyle: "italic",
  },
  editedHint: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
    alignSelf: "flex-end",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
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
    flexDirection: "row",
    flexWrap: "wrap",
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
  photo: {
    width: 220,
    height: 180,
    borderRadius: RADIUS.sm,
  },
  photoPlaceholder: {
    width: 220,
    height: 120,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
  },
  photoPlaceholderText: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
  },
  gifButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  imageButton: {
    padding: SPACING.spaceSm,
  },
  imageButtonDisabled: {
    opacity: 0.5,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerClose: {
    position: "absolute",
    top: 48,
    right: SPACING.gutter,
    padding: SPACING.spaceSm,
    zIndex: 1,
  },
  viewerImage: {
    width: "92%",
    height: "72%",
  },
  branchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: SPACING.spaceXs,
    paddingVertical: 4,
    paddingHorizontal: SPACING.spaceXs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primaryContainer,
    alignSelf: "flex-start",
  },
  branchPillText: {
    ...TYPOGRAPHY.labelSM,
    fontWeight: "700",
    color: COLORS.primaryContainer,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    textAlign: "center",
  },
  typingText: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textSecondary,
    fontStyle: "italic",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    flexDirection: "row",
    alignItems: "flex-end",
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
