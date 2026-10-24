import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  COLORS,
  RADIUS,
  SEMANTIC_COLORS,
  SPACING,
  TYPOGRAPHY,
} from "../../theme";
import { readableTextOn, type BubbleTheme } from "../../lib/chat-appearance";
import { signedChatUrl, type AttachmentRef } from "../../lib/media";
import { BRANCH_SUGGEST_AT } from "../../lib/branches";
import { ownMessageStatus } from "../../lib/message-display";
import type { Gif } from "../../lib/gifs";
import { UNSEND_LIMIT_MS } from "../../constants";
import type {
  MessageReactionRow,
  MessageWithSender,
} from "../../lib/database.types";
import VoiceMessage from "./VoiceMessage";
import { useReducedMotion } from "../../hooks/useReducedMotion";

/** Parse @mentions from text and return segments for rendering */
function parseMentions(text: string): Array<{ type: "text" | "mention"; value: string }> {
  const segments: Array<{ type: "text" | "mention"; value: string }> = [];
  let lastIndex = 0;
  const mentionRegex = /@(\w+)/g;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mention", value: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}

/**
 * Message status indicator — shows sent/delivered/read/failed state.
 * Uses the message's status field: "pending" | "sending" | "sent" | "delivered" | "seen" | "failed"
 */
function MessageStatus({ status }: { status: string }) {
  if (status === "pending" || status === "sending") {
    return (
      <Ionicons
        name="time-outline"
        size={14}
        color={SEMANTIC_COLORS.textDim}
      />
    );
  }
  if (status === "sent") {
    return (
      <Ionicons
        name="checkmark-outline"
        size={14}
        color={SEMANTIC_COLORS.textDim}
      />
    );
  }
  if (status === "delivered") {
    return (
      <View style={styles.doubleCheck}>
        <Ionicons name="checkmark-outline" size={14} color={SEMANTIC_COLORS.textDim} />
        <Ionicons
          name="checkmark-outline"
          size={14}
          color={SEMANTIC_COLORS.textDim}
          style={styles.checkOverlap}
        />
      </View>
    );
  }
  if (status === "seen") {
    return (
      <View style={styles.doubleCheck}>
        <Ionicons name="checkmark-sharp" size={14} color={COLORS.surfaceTint} />
        <Ionicons
          name="checkmark-sharp"
          size={14}
          color={COLORS.surfaceTint}
          style={styles.checkOverlap}
        />
      </View>
    );
  }
  if (status === "failed") {
    return (
      <Ionicons
        name="alert-circle-outline"
        size={14}
        color={COLORS.error}
      />
    );
  }
  return null;
}

/**
 * Corner overrides for a bubble theme. "default" is the asymmetric BRO tail
 * (sharp corner on the sender's side); the others are purely local cosmetics.
 *
 * The rounded corners are a FIXED radius rather than RADIUS.full: with
 * "full", a long multi-line message clamps to half the bubble height and the
 * curve eats into the text column, so the shape visually breaks as the
 * message grows. A fixed radius keeps the text inside the shape at any
 * length, and the bubble's overflow:"hidden" clips the image corners to match.
 */
function bubbleShape(theme: BubbleTheme, isMine: boolean) {
  const round = 20;
  const tail = 5;
  switch (theme) {
    case "rounded":
      return {
        borderTopLeftRadius: round,
        borderTopRightRadius: round,
        borderBottomLeftRadius: round,
        borderBottomRightRadius: round,
      } as const;
    case "teardrop":
      return isMine
        ? {
            borderTopLeftRadius: round,
            borderTopRightRadius: round,
            borderBottomLeftRadius: round,
            borderBottomRightRadius: tail,
          } as const
        : {
            borderTopLeftRadius: round,
            borderTopRightRadius: round,
            borderBottomLeftRadius: tail,
            borderBottomRightRadius: round,
          } as const;
    default:
      return null;
  }
}

/**
 * Inline photo for an image message. Resolves the fast thumbnail first; the
 * full image loads on demand in the viewer. A message whose attachment row is
 * missing (deleted, or the link step failed) renders a plain placeholder
 * instead of a broken box.
 */
function ChatImage({
  attachment,
  isMine,
  onOpen,
}: {
  attachment: AttachmentRef | undefined;
  isMine: boolean;
  onOpen: (fullPath: string, viewOnce?: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isViewOnce = attachment?.viewOnce === true;
  const consumed = isViewOnce && Boolean(attachment?.viewedAt);

  useEffect(() => {
    let live = true;
    setFailed(false);
    // Never resolve the thumbnail of an unopened view-once attachment: showing
    // it in the bubble would defeat the whole point.
    if (!attachment || (attachment.viewOnce && !attachment.viewedAt)) {
      setUrl(null);
      return;
    }
    void signedChatUrl(attachment.thumbPath ?? attachment.storagePath)
      .then((resolved) => {
        if (!live) return;
        // A null URL is a failure, not a pending load: spinning forever hides
        // the fact that the image cannot be opened.
        if (resolved) setUrl(resolved);
        else setFailed(true);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attachment]);

  if (!attachment || failed) {
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

  if (isViewOnce && !consumed) {
    return (
      <Pressable
        onPress={() => onOpen(attachment.storagePath, !isMine)}
        accessibilityRole="button"
        accessibilityLabel="Open view-once photo"
        style={styles.viewOnceTile}
      >
        <Ionicons
          name="eye-off-outline"
          size={22}
          color={SEMANTIC_COLORS.textDim}
        />
        <Text style={styles.viewOnceTileText}>View once photo</Text>
      </Pressable>
    );
  }

  if (isViewOnce && consumed && !isMine) {
    return (
      <View
        style={styles.viewOnceTile}
        accessibilityLabel="View-once photo opened"
      >
        <Ionicons
          name="eye-off-outline"
          size={22}
          color={SEMANTIC_COLORS.textDim}
        />
        <Text style={styles.viewOnceTileText}>Opened</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onOpen(attachment.storagePath, isViewOnce && !isMine)}
      accessibilityRole="button"
      accessibilityLabel={isViewOnce ? "Open view-once photo" : "Open photo"}
    >
      <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
      {isViewOnce && (
        <View style={styles.viewOnceBadge}>
          <Ionicons name="eye-off-outline" size={12} color={COLORS.onPrimary} />
          <Text style={styles.viewOnceBadgeText}>
            {consumed ? "Opened" : "View once"}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Inline GIF for a gif message. The catalogue row carries the dimensions, so
 * the bubble keeps the animation's aspect ratio instead of squashing it.
 *
 * A missing row is terminal, not loading: the catalogue lookup happens once
 * with the page, so animating a spinner here promises an animation that will
 * never arrive. Show a static "unavailable" box instead.
 */
function GifBubble({ gif }: { gif: Gif | undefined }) {
  if (!gif) {
    return (
      <View
        style={styles.gifPlaceholder}
        accessibilityLabel="GIF unavailable"
      >
        <Ionicons
          name="image-outline"
          size={22}
          color={SEMANTIC_COLORS.textDim}
        />
        <Text style={styles.gifPlaceholderText}>GIF unavailable</Text>
      </View>
    );
  }

  const ratio = gif.width > 0 && gif.height > 0 ? gif.width / gif.height : 1;

  return (
    <Image
      source={{ uri: gif.url }}
      style={[styles.gif, { aspectRatio: ratio }]}
      resizeMode="cover"
      accessibilityLabel={gif.title || "GIF"}
    />
  );
}

export interface MessageBubbleRowProps {
  item: MessageWithSender;
  selfId: string | undefined;
  /** First message from this sender within the grouping window. */
  startsGroup: boolean;
  isMine: boolean;
  reactions: MessageReactionRow[];
  /** The message this one replies to, already resolved by the parent. */
  quotedMessage: MessageWithSender | undefined;
  attachment: AttachmentRef | undefined;
  gif: Gif | undefined;
  /** Existing branch rooted at this message, if any. */
  branchId: string | undefined;
  replyCount: number;
  /** This message's branch is currently being opened. */
  branching: boolean;
  bubbleTheme: BubbleTheme;
  mineColor: string | null;
  theirsColor: string | null;
  /** Newest read cursor among other members, in epoch ms. */
  peerReadAt: number | null;
  /**
   * Transient reaction animation. The parent only sets this for the message
   * the local user just reacted to, so opening history or receiving someone
   * else's reaction never replays effects.
   */
  burst?: { emoji: string; token: number } | null;
  onRetry: (item: MessageWithSender) => void;
  onLongPress: (item: MessageWithSender) => void;
  onReact: (messageId: string, emoji: string) => void;
  onOpenBranch: (item: MessageWithSender) => void;
  onOpenViewer: (fullPath: string, viewOnce?: boolean) => void;
  /** Select mode for bulk actions. */
  selectMode?: boolean;
  /** Whether this message is currently selected. */
  isSelected?: boolean;
  /** Callback when selection changes. */
  onSelect?: (id: string) => void;
}

const EMPTY_REACTIONS: MessageReactionRow[] = [];

function MessageBubbleRowImpl({
  item,
  selfId,
  startsGroup,
  isMine,
  reactions,
  quotedMessage,
  attachment,
  gif,
  branchId,
  replyCount,
  branching,
  bubbleTheme,
  mineColor,
  theirsColor,
  peerReadAt,
  burst,
  onRetry,
  onLongPress,
  onReact,
  onOpenBranch,
  onOpenViewer,
  selectMode = false,
  isSelected = false,
  onSelect,
}: MessageBubbleRowProps) {
  const messageReactions = reactions.length > 0 ? reactions : EMPTY_REACTIONS;
  const isDeleted = item.deleted_for_everyone;

  const reducedMotion = useReducedMotion();
  const burstProgress = useRef(new Animated.Value(0)).current;
  const [burstVisible, setBurstVisible] = useState(false);

  useEffect(() => {
    if (!burst) return;
    if (reducedMotion) {
      // Still acknowledge the reaction briefly, just without movement.
      setBurstVisible(true);
      const timeout = setTimeout(() => setBurstVisible(false), 450);
      return () => clearTimeout(timeout);
    }
    setBurstVisible(true);
    burstProgress.setValue(0);
    const animation = Animated.timing(burstProgress, {
      toValue: 1,
      duration: 620,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setBurstVisible(false);
    });
    return () => animation.stop();
  }, [burst, burstProgress, reducedMotion]);

  // A chosen bubble colour overrides the theme default, and every text
  // inside the bubble switches to the contrast-safe pairing for it.
  const bubbleColor = isMine ? mineColor : theirsColor;
  const bubbleTextStyle = bubbleColor
    ? { color: readableTextOn(bubbleColor) }
    : null;

  const quotedName = quotedMessage
    ? quotedMessage.sender_id === selfId
      ? "You"
      : quotedMessage.sender?.display_name ?? "Message"
    : "Message";
  const quotedBody = !quotedMessage
    ? "Original message"
    : quotedMessage.deleted_for_everyone
      ? "Message deleted"
      : quotedMessage.content ||
        (quotedMessage.type === "image"
          ? "Photo"
          : quotedMessage.type === "voice"
            ? "Voice message"
            : quotedMessage.type === "gif"
              ? "GIF"
              : "");

  const status = ownMessageStatus(item.status, item.created_at, peerReadAt);

  return (
    <Pressable
      style={[
        styles.bubbleRow,
        isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
      ]}
      // A failed message is a retry target: tapping it tries again
      // immediately rather than waiting for the automatic flush's backoff.
      onPress={
        selectMode
          ? () => onSelect?.(item.id)
          : item.status === "failed"
            ? () => onRetry(item)
            : undefined
      }
      accessibilityRole={
        item.status === "failed" || selectMode ? "button" : undefined
      }
      accessibilityLabel={
        item.status === "failed"
          ? "Message failed to send. Double tap to retry."
          : selectMode
            ? isSelected
              ? "Message selected. Tap to deselect."
              : "Message not selected. Tap to select."
            : undefined
      }
      onLongPress={() => onLongPress(item)}
      delayLongPress={350}
    >
      {selectMode ? (
        <View style={styles.selectCheckboxWrap}>
          <View
            style={[
              styles.selectCheckbox,
              isSelected && styles.selectCheckboxActive,
            ]}
          >
            {isSelected ? (
              <Ionicons name="checkmark" size={14} color={COLORS.onPrimary} />
            ) : null}
          </View>
        </View>
      ) : null}
      {burstVisible && burst ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.burst,
            isMine ? styles.burstMine : styles.burstTheirs,
            reducedMotion
              ? styles.burstReduced
              : {
                  opacity: burstProgress.interpolate({
                    inputRange: [0, 0.15, 0.7, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    {
                      translateY: burstProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [6, -22],
                      }),
                    },
                    {
                      scale: burstProgress.interpolate({
                        inputRange: [0, 0.25, 1],
                        outputRange: [0.6, 1.15, 0.95],
                      }),
                    },
                  ],
                },
          ]}
        >
          <Text style={styles.burstEmoji}>{burst.emoji}</Text>
        </Animated.View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
          !startsGroup && styles.bubbleTight,
          bubbleShape(bubbleTheme, isMine),
          bubbleColor ? { backgroundColor: bubbleColor } : null,
        ]}
      >
        {startsGroup && !isMine && item.sender ? (
          <Text style={[styles.senderName, bubbleTextStyle]}>
            {item.sender.display_name}
          </Text>
        ) : null}

        {item.reply_to_message_id ? (
          <View style={styles.quote}>
            <Text style={styles.quoteName} numberOfLines={1}>
              {quotedName}
            </Text>
            <Text style={styles.quoteBody} numberOfLines={2}>
              {quotedBody}
            </Text>
          </View>
        ) : null}

        {item.type === "image" && !isDeleted ? (
          <ChatImage
            attachment={attachment}
            isMine={isMine}
            onOpen={onOpenViewer}
          />
        ) : null}

        {item.type === "voice" && !isDeleted ? (
          <VoiceMessage attachment={attachment} />
        ) : null}

        {item.type === "gif" && !isDeleted ? <GifBubble gif={gif} /> : null}

        {isDeleted ? (
          <Text style={[styles.messageText, styles.deletedText]}>
            This message was deleted
          </Text>
        ) : item.content ? (
          <Text style={[styles.messageText, bubbleTextStyle]}>
            {parseMentions(item.content).map((segment, index) => (
              segment.type === "mention" ? (
                <Text
                  key={index}
                  style={[
                    styles.mention,
                    bubbleTextStyle,
                    { color: COLORS.primary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={segment.value}
                >
                  {segment.value}
                </Text>
              ) : (
                <Text key={index}>{segment.value}</Text>
              )
            ))}
          </Text>
        ) : null}

        {item.edited_at ? (
          <Text style={[styles.editedHint, bubbleTextStyle]}>edited</Text>
        ) : null}

        {/* Disappearing message timer indicator */}
        {item.expires_at && !isDeleted && (
          (() => {
            const remainingMs = Date.parse(item.expires_at) - Date.now();
            if (remainingMs <= 0) return null;
            
            const hours = Math.floor(remainingMs / 3600000);
            const minutes = Math.floor((remainingMs % 3600000) / 60000);
            const seconds = Math.floor((remainingMs % 60000) / 1000);
            let label = "";
            if (hours > 0) {
              label = `${hours}h ${minutes}m`;
            } else if (minutes > 0) {
              label = `${minutes}m ${seconds}s`;
            } else {
              label = `${seconds}s`;
            }
            return (
              <View style={styles.expireIndicator}>
                <Ionicons name="timer-outline" size={10} color="#FFB020" />
                <Text style={styles.expireText}>Disappears in {label}</Text>
              </View>
            );
          })()
        )}

        {/* Unsend time limit indicator for own messages */}
        {isMine && !isDeleted && item.created_at && (
          (() => {
            const ageMs = Date.now() - Date.parse(item.created_at);
            const remainingMs = UNSEND_LIMIT_MS - ageMs;
            if (remainingMs <= 0) return null;
            
            const hours = Math.floor(remainingMs / 3600000);
            const minutes = Math.floor((remainingMs % 3600000) / 60000);
            let label = "";
            if (hours > 0) {
              label = `${hours}h`;
            } else if (minutes > 0) {
              label = `${minutes}m`;
            } else {
              label = `${Math.ceil(remainingMs / 1000)}s`;
            }
            return (
              <Text style={[styles.unsendHint, bubbleTextStyle]}>
                Unsend: {label}
              </Text>
            );
          })()
        )}

        <View style={styles.metaRow}>
          <Text style={[styles.timestamp, bubbleTextStyle]}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isMine ? <MessageStatus status={status} /> : null}
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
          if (!branchId && replyCount < BRANCH_SUGGEST_AT) return null;

          return (
            <Pressable
              style={styles.branchPill}
              onPress={() => onOpenBranch(item)}
              disabled={branching}
              accessibilityRole="button"
              accessibilityLabel={
                branchId
                  ? `Open branch, ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                  : `Move ${replyCount} replies into a branch`
              }
            >
              <Ionicons
                name="return-down-forward"
                size={12}
                color={COLORS.primaryContainer}
              />
              <Text style={styles.branchPillText}>
                {branching
                  ? "opening..."
                  : `${replyCount} ${replyCount === 1 ? "reply" : "replies"}${
                      branchId ? " — open branch" : " — make a branch"
                    }`}
              </Text>
            </Pressable>
          );
        })()}
      </View>
    </Pressable>
  );
}

/**
 * One message row, memoized on its props.
 *
 * Unchanged rows keep the same `item` reference (state updates map only the
 * rows they touch), so React.memo skips re-rendering the rest of the thread
 * when a single message, reaction, or read cursor changes.
 */
const MessageBubbleRow = React.memo(MessageBubbleRowImpl);

export default MessageBubbleRow;

const styles = StyleSheet.create({
  bubbleRow: {
    flexDirection: "row",
    marginBottom: SPACING.spaceXs,
  },
  selectCheckboxWrap: {
    justifyContent: "center",
    marginRight: SPACING.spaceSm,
  },
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCheckboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
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
    // Clips images and text to whatever corner shape the theme draws, so a
    // teardrop stays a teardrop even with a long message or a photo.
    overflow: "hidden",
    flexShrink: 1,
  },
  bubbleTight: {
    marginBottom: 2,
  },
  bubbleMine: {
    backgroundColor: COLORS.secondaryContainer,
    borderColor: "transparent",
    borderBottomRightRadius: RADIUS.sm,
    borderTopLeftRadius: RADIUS.DEFAULT,
    borderTopRightRadius: RADIUS.DEFAULT,
    borderBottomLeftRadius: RADIUS.DEFAULT,
  },
  bubbleTheirs: {
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
    borderBottomLeftRadius: RADIUS.sm,
    borderTopLeftRadius: RADIUS.DEFAULT,
    borderTopRightRadius: RADIUS.DEFAULT,
    borderBottomRightRadius: RADIUS.DEFAULT,
  },
  senderName: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.secondary,
    marginBottom: 2,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.surfaceTint,
    paddingLeft: SPACING.spaceSm,
    marginBottom: SPACING.spaceXs,
  },
  quoteName: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.surfaceTint,
    fontWeight: "700",
  },
  quoteBody: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
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
    color: SEMANTIC_COLORS.textSecondary,
    alignSelf: "flex-end",
    fontWeight: "600" as const,
  },
  unsendHint: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.primary,
    alignSelf: "flex-end",
    fontWeight: "600" as const,
  },
  expireIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-end",
    marginTop: SPACING.spaceXs,
    paddingHorizontal: SPACING.spaceXs,
    paddingVertical: 1,
    backgroundColor: "#FFB02020",
    borderRadius: RADIUS.sm,
  },
  expireText: {
    ...TYPOGRAPHY.labelSM,
    color: "#FFB020",
    fontWeight: "600" as const,
  },
  mention: {
    fontWeight: "600" as const,
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
  doubleCheck: {
    flexDirection: "row",
  },
  // Overlap the second tick with the first so the pair reads as one glyph
  // instead of two chevrons with a gap.
  checkOverlap: {
    marginLeft: -6,
  },
  burst: {
    position: "absolute",
    top: -10,
    zIndex: 2,
  },
  burstMine: {
    right: 12,
  },
  burstTheirs: {
    left: 12,
  },
  burstReduced: {
    opacity: 0.9,
  },
  burstEmoji: {
    fontSize: 28,
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
  viewOnceTile: {
    width: 220,
    height: 160,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceXs,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
  },
  viewOnceTileText: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
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
  gif: {
    width: 220,
    borderRadius: RADIUS.sm,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
  },
  gifPlaceholder: {
    width: 220,
    height: 120,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceXs,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel2,
  },
  gifPlaceholderText: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textDim,
  },
  viewOnceBadge: {
    position: "absolute",
    top: SPACING.spaceXs,
    right: SPACING.spaceXs,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: SPACING.spaceXs,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: RADIUS.sm,
  },
  viewOnceBadgeText: {
    fontSize: 10,
    color: COLORS.onPrimary,
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
});
