import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  fetchMessageById,
  fetchMessages,
  fetchReadCursors,
  fetchReactions,
  markConversationRead,
  sendMessage,
  subscribeToConversation,
  toggleReaction,
  MESSAGES_PAGE_SIZE,
} from "../../lib/conversations";
import {
  dequeue,
  entriesFor,
  flushConversation,
  queueMessage,
  readOutbox,
  recordFailure,
  type OutboxEntry,
} from "../../lib/outbox";
import {
  outboxPlaceholderText,
  peerReadCursor,
} from "../../lib/message-display";
import {
  sendTyping,
  watchTyping,
  watchPresence,
  releaseTypingChannel,
} from "../../lib/presence";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import {
  DEFAULT_APPEARANCE,
  loadAppearance,
} from "../../lib/chat-appearance";
import { useAuth } from "../../lib/auth-context";
import { useCall } from "../../lib/call-context";
import { fetchConversationPeer, fetchProfilesByIds } from "../../lib/conversations";
import {
  fetchBranchesByRoot,
  fetchReplyCounts,
  branchFromReplies,
  subscribeToBranches,
} from "../../lib/branches";

import {
  fetchMessageAttachments,
  sendImageMessage,
  sendStoredImage,
  sendStoredVoice,
  signedChatUrl,
  type AttachmentRef,
} from "../../lib/media";
import VoiceRecorder from "./VoiceRecorder";
import MessageBubbleRow from "./MessageBubbleRow";
import GifPicker from "../gifs/GifPicker";
import { getGif, getGifsByIds, type Gif } from "../../lib/gifs";
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
  /**
   * A GIF picked from a Space gallery, sent automatically on open.
   *
   * Carried through the route rather than a module-level singleton so that
   * opening the chat twice from the same Space does not replay a stale pick.
   */
  pendingGifId?: string;
  /**
   * Message to open on. A notification for a reaction or mention carries the
   * message id; if it is older than the first page, the context page ending at
   * it is loaded instead so the user lands on the message, not the bottom.
   */
  focusMessageId?: string;
}

/** The quick-reaction set offered from the message action sheet. */
const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "😮", "😢", "🎉", "🙏"];

/** Shared empty list so a message without reactions keeps a stable prop. */
const EMPTY_REACTIONS: MessageReactionRow[] = [];

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

export default function ConversationDetail({
  conversationId,
  title,
  pendingGifId,
  focusMessageId,
}: Props) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
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
  /** Gif catalogue rows keyed by gif id, for rendering gif messages. */
  const [gifs, setGifs] = useState<Record<string, Gif>>({});
  /** Header name resolved from the conversation when no title prop is given. */
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);
  /** Whether any other member is currently present in the conversation. */
  const [peerOnline, setPeerOnline] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  /** When armed, the next photo is flagged view-once instead of permanent. */
  const [viewOnce, setViewOnce] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [sendingGif, setSendingGif] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  // Per-member read cursors, used to derive read receipts.
  const [readCursors, setReadCursors] = useState<Record<string, string | null>>(
    {},
  );
  const [typists, setTypists] = useState<Map<string, string>>(new Map());
  /** The message whose long-press action sheet is open. */
  const [actionTarget, setActionTarget] = useState<MessageWithSender | null>(
    null,
  );
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [editing, setEditing] = useState<MessageWithSender | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Device-local chat appearance (bubble shape + optional background image).
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  useEffect(() => {
    let cancelled = false;
    void loadAppearance().then((stored) => {
      if (!cancelled) setAppearance(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const listRef = useRef<FlatList<MessageWithSender>>(null);
  const lastIdRef = useRef<string | null>(null);
  const messagesRef = useRef<MessageWithSender[]>([]);
  const reactionsRef = useRef<Record<string, MessageReactionRow[]>>({});
  const insets = useSafeAreaInsets();
  const selfId = currentUser?.id;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);

  /** Message lookup for reply quotes, so a reply shows what it answers. */
  const messagesById = useMemo(() => {
    const map: Record<string, MessageWithSender> = {};
    for (const message of messages) map[message.id] = message;
    return map;
  }, [messages]);

  /** Latest read cursor among other members; see peerReadCursor. */
  const peerReadAt = useMemo(
    () => peerReadCursor(readCursors, selfId),
    [readCursors, selfId],
  );

  /**
   * Page enrichment: reactions, reply counts, branch links, attachments.
   * Every page gets the same treatment — an older page rendering as bare
   * bubbles is a bug, not a performance win.
   */
  const enrich = useCallback(async (rows: MessageWithSender[]) => {
    if (rows.length === 0) return;
    const ids = rows.map((message) => message.id);
    const gifIds = rows
      .filter((message) => message.type === "gif" && message.gif_id)
      .map((message) => message.gif_id as string);
    const [fetchedReactions, counts, branches, attached, fetchedGifs] =
      await Promise.all([
        fetchReactions(ids),
        fetchReplyCounts(ids),
        fetchBranchesByRoot(ids),
        fetchMessageAttachments(ids),
        getGifsByIds(gifIds),
      ]);
    setReactions((current) => ({ ...current, ...fetchedReactions }));
    setReplyCounts((current) => ({ ...current, ...counts }));
    setBranchByRoot((current) => ({ ...current, ...branches }));
    setAttachments((current) => ({ ...current, ...attached }));
    if (Object.keys(fetchedGifs).length > 0) {
      setGifs((current) => ({ ...current, ...fetchedGifs }));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      let rows = await fetchMessages(conversationId);

      // A deep link can point at a message older than the first page. Load the
      // page ending at it so the target is present, rather than opening the
      // thread at the bottom and hoping the user scrolls up.
      if (
        focusMessageId &&
        !rows.some((message) => message.id === focusMessageId)
      ) {
        const focused = await fetchMessageById(focusMessageId);
        const created = focused ? Date.parse(focused.created_at) : NaN;
        if (
          focused &&
          focused.conversation_id === conversationId &&
          !focused.branch_id &&
          !Number.isNaN(created)
        ) {
          const around = await fetchMessages(conversationId, MESSAGES_PAGE_SIZE, {
            // 1ms after the target makes the cursor inclusive of it.
            createdAt: new Date(created + 1).toISOString(),
            id: focused.id,
          });
          if (around.length > 0) rows = around;
        }
      }

      setMessages(rows);
      setHasMore(rows.length >= MESSAGES_PAGE_SIZE);
      void markConversationRead(conversationId);
      await enrich(rows);
      setReadCursors(await fetchReadCursors(conversationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [conversationId, enrich, focusMessageId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const oldest = messages[0];
      const older = await fetchMessages(conversationId, MESSAGES_PAGE_SIZE, {
        createdAt: oldest.created_at,
        id: oldest.id,
      });
      if (older.length > 0) {
        setMessages((current) => [...older, ...current]);
        setHasMore(older.length >= MESSAGES_PAGE_SIZE);
        await enrich(older);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      // Keep the list as-is, but surface a retry instead of silently stopping,
      // so a dropped request does not look like the start of history.
      setOlderError(
        err instanceof Error ? err.message : "Could not load older messages",
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, messages, enrich]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Scroll the deep-linked message into view once it is on screen. Runs once
  // per focused id; the list has no fixed row height, so a failure falls back
  // to an offset-based attempt in onScrollToIndexFailed.
  const focusHandledRef = useRef(false);
  useEffect(() => {
    if (focusHandledRef.current || loading || !focusMessageId) return;
    const index = messages.findIndex(
      (message) => message.id === focusMessageId,
    );
    if (index < 0) return;
    focusHandledRef.current = true;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [loading, messages, focusMessageId]);

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
        // A live message carries its payload-shaped gaps: photo/voice need
        // their attachment row, a gif needs its library row, and every
        // arriving message needs its sender profile (the realtime payload has
        // no join), or a group message shows no name until a reload.
        if (incoming.type === "image" || incoming.type === "voice") {
          void fetchMessageAttachments([incoming.id]).then((attached) => {
            setAttachments((current) => ({ ...current, ...attached }));
          });
        }
        if (incoming.type === "gif" && incoming.gif_id) {
          void getGifsByIds([incoming.gif_id]).then((fetched) => {
            if (Object.keys(fetched).length > 0) {
              setGifs((current) => ({ ...current, ...fetched }));
            }
          });
        }
        void fetchProfilesByIds([incoming.sender_id]).then((profiles) => {
          const sender = profiles[incoming.sender_id];
          if (!sender) return;
          setMessages((current) =>
            current.map((message) =>
              message.id === incoming.id ? { ...message, sender } : message,
            ),
          );
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
      onReactionChange: (messageId) => {
        // Reactions are only delivered with the message id, so a reaction on
        // another thread is ignored rather than forcing a refetch here.
        if (!messageId) return;
        if (!messagesRef.current.some((message) => message.id === messageId)) {
          return;
        }
        void (async () => {
          const fresh = await fetchReactions([messageId]);
          setReactions((current) => ({ ...current, ...fresh }));
        })();
      },
      onReadCursorChange: () => {
        void fetchReadCursors(conversationId).then(setReadCursors);
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

  // Live presence for the header: are any of the other members here now?
  useEffect(() => {
    if (!selfId) return;
    return watchPresence(conversationId, selfId, (present) => {
      let online = false;
      for (const id of present.keys()) {
        if (id !== selfId) {
          online = true;
          break;
        }
      }
      setPeerOnline(online);
    });
  }, [conversationId, selfId]);

  // Resolve the header name from the conversation itself when the route did
  // not pass one. Direct -> the peer's name; group/space -> the stored name.
  useEffect(() => {
    if (title) {
      setResolvedTitle(title);
      return;
    }
    let live = true;
    void fetchConversationPeer(conversationId).then((peer) => {
      if (!live || !peer) return;
      if (peer.type === "direct") {
        setResolvedTitle(peer.peerName ?? "Conversation");
      } else {
        setResolvedTitle(
          peer.name ?? (peer.type === "space" ? "Space chat" : "Group chat"),
        );
      }
    });
    return () => {
      live = false;
    };
  }, [conversationId, title]);

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

  /**
   * Broadcast that we've stopped typing. Clearing the draft directly bypasses
   * `onDraftChange`, so without this the peer's "typing…" lingers for the full
   * timeout after every sent message.
   */
  const stopTyping = useCallback(() => {
    if (selfId) {
      sendTyping(
        conversationId,
        selfId,
        currentUser?.displayName ?? "Someone",
        false,
      );
    }
  }, [conversationId, selfId, currentUser]);

  // Keyed on primitives, not the `currentUser` object: the auth provider used
  // to rebuild that object every render, and a changing identity here would
  // re-create every callback below and re-run the outbox flush effect.
  const senderProfile = useMemo(
    () =>
      selfId
        ? {
            id: selfId,
            username: currentUser?.username ?? "",
            display_name: currentUser?.displayName ?? "",
            avatar_url: currentUser?.avatar ?? null,
            status: currentUser?.status ?? "online",
          }
        : null,
    [
      selfId,
      currentUser?.username,
      currentUser?.displayName,
      currentUser?.avatar,
      currentUser?.status,
    ],
  );

  /**
   * Sends `content`, showing the bubble immediately.
   *
   * The bubble is appended with a locally generated id before the request is
   * made, so the composer clears the moment the user hits send instead of the
   * text appearing to hang while the network call is in flight. On success
   * that placeholder is swapped for the authoritative server row (matched by
   * the same local id); on failure it stays in place marked failed and is
   * persisted to the outbox so it survives leaving the screen.
   */
  const sendContent = useCallback(
    async (params: {
      content: string;
      replyToMessageId: string | null;
      clientId: string;
    }) => {
      const optimisticId = params.clientId;
      setMessages((current) => {
        if (current.some((message) => message.id === optimisticId)) return current;
        return [
          ...current,
          {
            id: optimisticId,
            conversation_id: conversationId,
            sender_id: selfId ?? "",
            content: params.content,
            type: "text" as const,
            gif_id: null,
            status: "sending" as const,
            reply_to_message_id: params.replyToMessageId,
            branch_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            sender: senderProfile,
          },
        ];
      });

      const result = await sendMessage(conversationId, params.content, {
        replyToMessageId: params.replyToMessageId,
      });

      if (result.ok) {
        // Replace the placeholder with the real row rather than appending, so
        // a message never appears twice when the send succeeds.
        setMessages((current) =>
          current.map((message) =>
            message.id === optimisticId
              ? { ...result.message, sender: senderProfile }
              : message,
          ),
        );
        return true;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, status: "failed" as const }
            : message,
        ),
      );
      setError(result.error);
      return false;
    },
    [conversationId, selfId, senderProfile],
  );

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setError(null);

    const replyToMessageId = replyingTo?.id ?? null;
    // One identity for the placeholder, the outbox entry and every retry, so
    // a message can never land twice.
    const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    setDraft("");
    setReplyingTo(null);
    stopTyping();

    const sent = await sendContent({ content, replyToMessageId, clientId });

    if (!sent) {
      // Only persisted once the send has actually failed; queuing up front
      // would leave entries behind for messages that succeeded immediately.
      await queueMessage({
        conversationId,
        content,
        replyToMessageId,
        clientId,
      });
      // Restore the text so the user is not left staring at a failed bubble
      // with no way to tell what was lost.
      setDraft(content);
    }

    setSending(false);
  }, [conversationId, draft, replyingTo, sendContent, sending, stopTyping]);

  /**
   * Replaces a queued message's optimistic bubble with the authoritative row.
   *
   * Text sends already reconcile inside `sendContent` (it swaps the
   * placeholder for `result.message`), so only the media kinds need this: their
   * send helpers return an id but not the row. Fetching it means the bubble is
   * right even when the realtime echo never arrives, and reconciling against an
   * echo that did arrive keeps the message from appearing twice.
   */
  const applySentEntry = useCallback(
    async (entry: OutboxEntry, messageId: string) => {
      if (messageId === entry.clientId) return;

      const real = await fetchMessageById(messageId);
      setMessages((current) => {
        const withoutPlaceholder = current.filter(
          (message) => message.id !== entry.clientId,
        );
        if (!real) return withoutPlaceholder;
        if (withoutPlaceholder.some((message) => message.id === real.id)) {
          return withoutPlaceholder;
        }
        return [...withoutPlaceholder, real];
      });

      if (entry.kind === "gif" && entry.media?.gifId) {
        try {
          const gif = await getGif(entry.media.gifId);
          if (gif) setGifs((current) => ({ ...current, [gif.id]: gif }));
        } catch {
          // Enrichment will still find it; a missed cache entry is cosmetic.
        }
      }

      if (entry.kind === "image" || entry.kind === "voice") {
        const attached = await fetchMessageAttachments([messageId]);
        setAttachments((current) => ({ ...current, ...attached }));
      }
    },
    [],
  );

  /** Replays one outbox entry by its kind, returning the server message id. */
  const replayEntry = useCallback(
    async (
      entry: OutboxEntry,
    ): Promise<{ ok: boolean; messageId?: string; error?: string }> => {
      if (entry.kind === "gif" && entry.media?.gifId) {
        const r = await sendMessage(entry.conversationId, entry.content, {
          messageType: "gif",
          gifId: entry.media.gifId,
        });
        return r.ok
          ? { ok: true, messageId: r.message.id }
          : { ok: false, error: r.error };
      }
      if (entry.kind === "image" && entry.media?.localUri) {
        const r = await sendStoredImage(
          entry.conversationId,
          entry.media.localUri,
          entry.media.thumbUri ?? entry.media.localUri,
          entry.content,
          entry.media.viewOnce ?? false,
        );
        return r.ok
          ? { ok: true, messageId: r.messageId }
          : { ok: false, error: r.error };
      }
      if (entry.kind === "voice" && entry.media?.localUri) {
        const r = await sendStoredVoice(
          entry.conversationId,
          entry.media.localUri,
        );
        return r.ok
          ? { ok: true, messageId: r.messageId }
          : { ok: false, error: r.error };
      }
      const ok = await sendContent({
        content: entry.content,
        replyToMessageId: entry.replyToMessageId,
        clientId: entry.clientId,
      });
      return { ok, messageId: ok ? entry.clientId : undefined };
    },
    [sendContent],
  );

  /**
   * Replays everything the outbox holds for this conversation.
   *
   * Runs on mount, so anything queued while the app was closed or the user was
   * in another conversation goes out as soon as they come back.
   */
  const flushingRef = useRef(false);
  const flushOutbox = useCallback(async () => {
    // A second flush reading the same rows before the first dequeues them
    // would send everything twice.
    if (flushingRef.current) return;
    flushingRef.current = true;

    try {
      const queued = entriesFor(await readOutbox(), conversationId);
      if (queued.length === 0) return;

      // Show the queued messages again while they retry, so the user sees what
      // is in flight rather than an apparently empty gap in the thread.
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        const missing = queued.filter((entry) => !known.has(entry.clientId));
        if (missing.length === 0) return current;
        return [
          ...current,
          ...missing.map((entry) => ({
            id: entry.clientId,
            conversation_id: conversationId,
            sender_id: selfId ?? "",
            // Media captions can be empty; fall back to a label so the retry
            // bubble is not a blank line.
            content: outboxPlaceholderText(entry),
            type: "text" as const,
            gif_id: null,
            status: "sending" as const,
            reply_to_message_id: entry.replyToMessageId,
            branch_id: null,
            created_at: entry.createdAt,
            updated_at: entry.createdAt,
            sender: senderProfile,
          })),
        ];
      });

      await flushConversation({
        conversationId,
        send: replayEntry,
        onSent: (entry, messageId) => applySentEntry(entry, messageId),
        onFailure: (entry) => {
          // Only the entry that failed; the rest were never attempted.
          setMessages((current) =>
            current.map((message) =>
              message.id === entry.clientId
                ? { ...message, status: "failed" as const }
                : message,
            ),
          );
        },
      });
    } finally {
      flushingRef.current = false;
    }
  }, [applySentEntry, conversationId, replayEntry, selfId, senderProfile]);

  useEffect(() => {
    void flushOutbox();
  }, [flushOutbox]);

  /**
   * Re-sends one queued message the user tapped.
   *
   * Kept separate from the automatic flush so an explicit tap is not subject
   * to backoff: the user has just told us to try again now.
   */
  const retryMessage = useCallback(
    async (message: MessageWithSender) => {
      if (message.status !== "failed") return;

      const entry = (await readOutbox()).find(
        (candidate) => candidate.clientId === message.id,
      );

      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, status: "sending" as const } : item,
        ),
      );

      if (!entry) {
        // A failed bubble with no queued payload predates the outbox, or its
        // recorded media file was purged. Fall back to sending the visible
        // text; there is nothing else left to replay.
        const sent = await sendContent({
          content: message.content,
          replyToMessageId: message.reply_to_message_id,
          clientId: message.id,
        });
        if (sent) await dequeue(message.id);
        return;
      }

      // Retry by kind. Sending `message.content` would turn a failed photo or
      // voice note into a text message ("Photo") and then discard the payload.
      const result = await replayEntry(entry);
      if (!result.ok) {
        await recordFailure(entry.clientId);
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id
              ? { ...item, status: "failed" as const }
              : item,
          ),
        );
        setError(result.error ?? "Could not send that message");
        return;
      }

      await dequeue(entry.clientId);
      await applySentEntry(entry, result.messageId ?? entry.clientId);
    },
    [applySentEntry, replayEntry, sendContent],
  );

  const onEdit = useCallback(async () => {
    if (!editing) return;
    const content = draft.trim();
    if (!content) return;
    const result = await editMessage(editing.id, content);
    if (result.ok) {
      setDraft("");
      setEditing(null);
      stopTyping();
    } else {
      setError(result.error);
    }
  }, [editing, draft, stopTyping]);

  const onDelete = useCallback((message: MessageWithSender) => {
    Alert.alert("Delete message", "Delete for everyone?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // Hide it immediately; restore the row if the server rejects it.
          const previous = messagesRef.current;
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id
                ? { ...item, deleted_for_everyone: true, content: "" }
                : item,
            ),
          );
          void deleteMessage(message.id).then((result) => {
            if (!result.ok) {
              setMessages(previous);
              setError(result.error);
            }
          });
        },
      },
    ]);
  }, []);

  /**
   * Toggle a reaction, showing it locally before the round-trip. The list is
   * keyed by message, so only that bubble re-renders; a failed write refetches
   * the authoritative set for the one message rather than the whole page.
   */
  const onReact = useCallback(
    (messageId: string, emoji: string) => {
      if (!selfId) return;
      const mine = (reactionsRef.current[messageId] ?? []).find(
        (reaction) => reaction.user_id === selfId && reaction.emoji === emoji,
      );

      setReactions((current) => {
        const list = current[messageId] ?? [];
        if (mine) {
          return {
            ...current,
            [messageId]: list.filter(
              (reaction) =>
                !(reaction.user_id === selfId && reaction.emoji === emoji),
            ),
          };
        }
        const optimistic: MessageReactionRow = {
          id: `temp-${messageId}-${emoji}-${selfId}`,
          message_id: messageId,
          user_id: selfId,
          emoji,
          created_at: new Date().toISOString(),
        };
        return { ...current, [messageId]: [...list, optimistic] };
      });

      void toggleReaction(messageId, emoji)
        .then(() => fetchReactions([messageId]))
        .then((fresh) => setReactions((current) => ({ ...current, ...fresh })))
        .catch(() => {
          setError("Could not update that reaction.");
          void fetchReactions([messageId]).then((fresh) =>
            setReactions((current) => ({ ...current, ...fresh })),
          );
        });
    },
    [selfId],
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

  /**
   * Send a photo with the composer text as the caption. Cancellation is silent
   * (the user changed their mind); every other failure names its stage so the
   * error says what actually went wrong.
   */
  const sendImage = useCallback(async () => {
    if (sendingImage) return;
    setSendingImage(true);

    // Captured synchronously during the send so a failed upload can be queued
    // with the same local files, instead of losing the photo to the error path.
    const compressed: { full: string; thumb: string } | null = { full: "", thumb: "" };
    const result = await sendImageMessage(conversationId, draft, viewOnce, (pair) => {
      compressed.full = pair.full.uri;
      compressed.thumb = pair.thumb.uri;
    });
    setSendingImage(false);

    if (!result.ok) {
      if (result.error !== "cancelled") {
        setError(result.error);
      }
      // Only queue once the image was compressible; pick/compress failures are
      // user-side and have nothing to replay.
      if (result.stage !== "pick" && result.stage !== "compress" && compressed.full) {
        const caption = draft.trim();
        await queueMessage({
          conversationId,
          content: caption,
          kind: "image",
          media: {
            localUri: compressed.full,
            thumbUri: compressed.thumb,
            viewOnce,
          },
        });
        setDraft("");
        setViewOnce(false);
      }
      return;
    }

    const now = new Date().toISOString();
    setDraft("");
    setViewOnce(false);
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
  }, [conversationId, currentUser, draft, sendingImage, viewOnce]);

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
        // A gif send is a single insert with no upload, so it replays cleanly.
        await queueMessage({
          conversationId,
          content: caption,
          kind: "gif",
          media: { gifId: gif.id },
        });
        setDraft("");
        return;
      }

      setDraft("");
      // Cache the picked row so the bubble renders immediately, without
      // waiting for the enrichment pass to come back around.
      setGifs((current) => ({ ...current, [gif.id]: gif }));
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

  // Send a GIF chosen from a Space gallery as soon as the chat opens.
  // Guarded on a ref so the effect cannot re-fire: sendGif changes identity
  // whenever the draft changes, and without this the GIF would be resent on
  // every keystroke in the composer.
  const pendingGifHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingGifId || pendingGifHandled.current === pendingGifId) return;
    pendingGifHandled.current = pendingGifId;
    void (async () => {
      try {
        const gif = await getGif(pendingGifId);
        if (gif) await sendGif(gif);
      } catch {
        // A missing GIF should not block the conversation from opening.
      }
    })();
  }, [pendingGifId, sendGif]);

  const openViewer = useCallback(async (fullPath: string, viewOnce = false) => {
    if (viewOnce) {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data: attachment } = await supabase
            .from("attachments")
            .select("id")
            .eq("storage_path", fullPath)
            .eq("view_once", true)
            .maybeSingle();
          if (attachment) {
            await supabase.rpc("mark_attachment_viewed", {
              attachment_id: attachment.id,
            });
          }
        }
      } catch {
        // ignore RPC errors
      }
    }

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
      const existingBranchId = branchByRoot[item.id];

      return (
        <MessageBubbleRow
          item={item}
          selfId={selfId}
          startsGroup={startsGroup}
          isMine={isMine}
          reactions={reactions[item.id] ?? EMPTY_REACTIONS}
          quotedMessage={
            item.reply_to_message_id
              ? messagesById[item.reply_to_message_id]
              : undefined
          }
          attachment={attachments[item.id]}
          gif={item.gif_id ? gifs[item.gif_id] : undefined}
          branchId={existingBranchId}
          replyCount={replyCounts[item.id] ?? 0}
          branching={branching === item.id}
          bubbleTheme={appearance.bubbleTheme}
          mineColor={appearance.mineColor}
          theirsColor={appearance.theirsColor}
          peerReadAt={peerReadAt}
          onRetry={retryMessage}
          onLongPress={setActionTarget}
          onReact={onReact}
          onOpenBranch={openBranch}
          onOpenViewer={openViewer}
        />
      );
    },
    [
      messages,
      selfId,
      reactions,
      replyCounts,
      branchByRoot,
      branching,
      openBranch,
      attachments,
      gifs,
      messagesById,
      peerReadAt,
      openViewer,
      appearance.bubbleTheme,
      appearance.mineColor,
      appearance.theirsColor,
      retryMessage,
      onReact,
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
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {resolvedTitle ?? title ?? "Conversation"}
          </Text>
          {peerOnline ? (
            <View style={styles.presenceRow}>
              <View style={styles.presenceDot} />
              <Text style={styles.presenceText}>Online</Text>
            </View>
          ) : null}
        </View>
        <CallButtons conversationId={conversationId} />
      </View>

      {appearance.backgroundUri ? (
        <Image
          source={{ uri: appearance.backgroundUri }}
          style={styles.chatBackground}
          resizeMode="cover"
        />
      ) : null}

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
          // Tuned for a long thread on a mid-range Android device: keep the
          // first screenful mounted, grow the window in small batches, and cap
          // how much stays resident above/below the viewport.
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          updateCellsBatchingPeriod={50}
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
          onScrollToIndexFailed={({ averageItemLength, index }) => {
            // Rows are variable height, so an index scroll can miss. Jump near
            // the target and let the list settle, rather than crashing.
            listRef.current?.scrollToOffset({
              offset: averageItemLength * index,
              animated: false,
            });
          }}
          ListHeaderComponent={
            loadingOlder ? (
              <ActivityIndicator
                color={COLORS.surfaceTint}
                style={styles.olderLoader}
              />
            ) : olderError ? (
              <Pressable
                style={styles.olderLoader}
                onPress={() => void loadOlder()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading older messages"
              >
                <Text style={styles.olderErrorText}>
                  Couldn&apos;t load older messages. Tap to retry.
                </Text>
              </Pressable>
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
              name="images-outline"
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
        <Pressable
          style={[
            styles.viewOnceButton,
            viewOnce && styles.viewOnceButtonActive,
          ]}
          onPress={() => setViewOnce((v) => !v)}
          disabled={sendingImage || sending}
          accessibilityRole="button"
          accessibilityLabel={viewOnce ? "Disable view once" : "Enable view once"}
        >
          <Ionicons
            name={viewOnce ? "eye-off-outline" : "eye-outline"}
            size={22}
            color={viewOnce ? COLORS.primary : SEMANTIC_COLORS.textDim}
          />
        </Pressable>
        <VoiceRecorder
          conversationId={conversationId}
          currentUser={currentUser}
          disabled={sending || sendingImage}
          onSent={(message) => {
            setMessages((current) => {
              if (current.some((m) => m.id === message.id)) return current;
              return [
                ...current,
                {
                  ...message,
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
          }}
        />
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
          <Ionicons
            name="send-sharp"
            size={20}
            color={COLORS.onPrimary}
          />
        </Pressable>
      </View>

      <Modal
        visible={actionTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setActionTarget(null)}
          accessibilityRole="button"
          accessibilityLabel="Close message actions"
        >
          <View
            style={styles.sheet}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.reactionPicker}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={styles.reactionPick}
                  onPress={() => {
                    const target = actionTarget;
                    setActionTarget(null);
                    if (target) onReact(target.id, emoji);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${emoji}`}
                >
                  <Text style={styles.reactionPickEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                const target = actionTarget;
                setActionTarget(null);
                if (target) startReply(target);
              }}
              accessibilityRole="button"
            >
              <Ionicons
                name="arrow-undo-outline"
                size={20}
                color={SEMANTIC_COLORS.textPrimary}
              />
              <Text style={styles.sheetActionText}>Reply</Text>
            </Pressable>
            {actionTarget?.sender_id === selfId ? (
              <Pressable
                style={styles.sheetAction}
                onPress={() => {
                  const target = actionTarget;
                  setActionTarget(null);
                  if (target) startEdit(target);
                }}
                accessibilityRole="button"
              >
                <Ionicons
                  name="create-outline"
                  size={20}
                  color={SEMANTIC_COLORS.textPrimary}
                />
                <Text style={styles.sheetActionText}>Edit</Text>
              </Pressable>
            ) : null}
            {actionTarget?.sender_id === selfId &&
            !actionTarget?.deleted_for_everyone ? (
              <Pressable
                style={styles.sheetAction}
                onPress={() => {
                  const target = actionTarget;
                  setActionTarget(null);
                  if (target) onDelete(target);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                <Text style={[styles.sheetActionText, styles.sheetActionDanger]}>
                  Delete
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>

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
  chatBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceLg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: SEMANTIC_COLORS.textPrimary,
  },
  presenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
    marginTop: 1,
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
    backgroundColor: "#3DD68C",
  },
  presenceText: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
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
  olderErrorText: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.error,
    textAlign: "center",
  },
  // Overlap the second tick with the first so the pair reads as one glyph
  // instead of two chevrons with a gap.
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: SEMANTIC_COLORS.surfaceLevel1,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceMd,
    paddingBottom: SPACING.spaceXl,
    gap: SPACING.spaceXs,
  },
  reactionPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.spaceSm,
    marginBottom: SPACING.spaceXs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  reactionPick: {
    paddingHorizontal: SPACING.spaceXs,
    paddingVertical: SPACING.spaceXs,
    borderRadius: RADIUS.full,
  },
  reactionPickEmoji: {
    fontSize: 26,
  },
  sheetAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    paddingVertical: SPACING.spaceMd,
  },
  sheetActionText: {
    ...TYPOGRAPHY.bodyMD,
    color: SEMANTIC_COLORS.textPrimary,
  },
  sheetActionDanger: {
    color: COLORS.error,
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
  viewOnceButton: {
    padding: SPACING.spaceSm,
  },
  viewOnceButtonActive: {
    backgroundColor: COLORS.primaryContainer,
    borderRadius: RADIUS.full,
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
});
