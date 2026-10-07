import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/ui/Avatar";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { formatRelativeTime } from "../../lib/utils";
import {
  deleteStatus,
  fetchStatusReplies,
  replyToStatus,
  statusMediaUrl,
  type StatusGroup,
  type StatusUpdate,
} from "../../lib/statuses";

type Props = {
  visible: boolean;
  groups: StatusGroup[];
  startAuthorId: string;
  viewerId: string | null;
  onClose: () => void;
  onSeen: (statusIds: string[]) => void;
};

/** Seconds each item holds the screen, like a story. */
const DWELL_MS = 6000;

export default function StatusViewer({
  visible,
  groups,
  startAuthorId,
  viewerId,
  onClose,
  onSeen,
}: Props) {
  const { width } = useWindowDimensions();

  const [authorIndex, setAuthorIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [replies, setReplies] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const group = groups[authorIndex];
  const item: StatusUpdate | undefined = group?.updates[itemIndex];

  // Opening on a specific author: find them, or fall back to the first.
  useEffect(() => {
    if (!visible) return;
    const found = groups.findIndex((entry) => entry.authorId === startAuthorId);
    setAuthorIndex(found >= 0 ? found : 0);
    setItemIndex(0);
    setProgress(0);
    setComposerOpen(false);
    setDraft("");
  }, [visible, startAuthorId, groups]);

  const markSeen = useCallback(
    (status: StatusUpdate) => {
      if (seen.current.has(status.id)) return;
      seen.current.add(status.id);
      onSeen([...seen.current]);
    },
    [onSeen],
  );

  const advance = useCallback(() => {
    if (!groups.length) return;
    const currentGroup = groups[authorIndex];
    if (!currentGroup) return;

    if (itemIndex + 1 < currentGroup.updates.length) {
      setItemIndex(itemIndex + 1);
      return;
    }
    if (authorIndex + 1 < groups.length) {
      setAuthorIndex(authorIndex + 1);
      setItemIndex(0);
      return;
    }
    onClose();
  }, [authorIndex, itemIndex, groups, onClose]);

  const goBack = useCallback(() => {
    if (itemIndex > 0) {
      setItemIndex(itemIndex - 1);
      return;
    }
    if (authorIndex > 0) {
      const previous = groups[authorIndex - 1];
      setAuthorIndex(authorIndex - 1);
      setItemIndex(Math.max(0, previous.updates.length - 1));
    }
  }, [authorIndex, itemIndex, groups]);

  // Dwell timer. Pauses while the composer is open so typing is not eaten.
  useEffect(() => {
    if (!visible || !item || composerOpen) return;
    if (item.kind !== "photo") return;

    markSeen(item);
    setProgress(0);

    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(1, elapsed / DWELL_MS));
      if (elapsed >= DWELL_MS) {
        if (timer.current) clearInterval(timer.current);
        advance();
      }
    }, 50);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [visible, item, composerOpen, advance, markSeen]);

  // Resolve the signed URL for the current photo.
  useEffect(() => {
    let cancelled = false;
    if (!item || item.kind !== "photo" || !item.mediaPath) {
      setMediaUrl(null);
      setMediaLoading(false);
      setMediaFailed(Boolean(item) && item.kind === "photo");
      return;
    }
    setMediaLoading(true);
    setMediaFailed(false);
    void statusMediaUrl(item.mediaPath)
      .then((url) => {
        if (cancelled) return;
        setMediaUrl(url);
        setMediaFailed(!url);
        setMediaLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMediaUrl(null);
        setMediaFailed(true);
        setMediaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, retryToken]);

  useEffect(() => {
    if (!visible || !item) {
      setReplies([]);
      return;
    }
    let cancelled = false;
    void fetchStatusReplies(item.id).then((rows) => {
      if (cancelled) return;
      setReplies(rows.map((row) => row.body));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, item]);

  const send = async () => {
    if (!item || !draft.trim() || sending) return;
    setSending(true);
    try {
      await replyToStatus(item.id, draft);
      setReplies((prev) => [...prev, draft.trim()]);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  if (!visible || !group || !item) return null;

  const isMine = viewerId === item.authorId;
  const total = group.updates.length;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          {/* Progress bars, one per item in this author's run. */}
          <View style={styles.bars}>
            {group.updates.map((entry, index) => (
              <View key={entry.id} style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width:
                        index < itemIndex
                          ? "100%"
                          : index === itemIndex
                            ? `${Math.round(progress * 100)}%`
                            : "0%",
                    },
                  ]}
                />
              </View>
            ))}
          </View>

          <View style={styles.head}>
            <Avatar
              name={group.authorName}
              uri={group.authorAvatar}
              size={34}
            />
            <View style={styles.headText}>
              <Text style={styles.author}>{group.authorName}</Text>
              <Text style={styles.meta}>
                {formatRelativeTime(item.createdAt)}
                {total > 1 ? ` · ${itemIndex + 1}/${total}` : ""}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close status"
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          <View style={[styles.stage, { width }]}>
            {item.kind === "photo" ? (
              mediaLoading ? (
                <ActivityIndicator color={COLORS.primaryContainer} />
              ) : mediaFailed || !mediaUrl ? (
                <View style={styles.mediaFallback}>
                  <Ionicons name="image-outline" size={30} color="#9CA3AF" />
                  <Text style={styles.mediaFallbackText}>
                    Could not load this status
                  </Text>
                  <Pressable
                    onPress={() => setRetryToken((n) => n + 1)}
                    style={styles.retryButton}
                    accessibilityLabel="Retry loading status"
                  >
                    <Text style={styles.retryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : (
                <Image
                  source={{ uri: mediaUrl }}
                  style={styles.photo}
                  resizeMode="contain"
                />
              )
            ) : item.body?.trim() ? (
              <ScrollView
                contentContainerStyle={styles.textStage}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.statusText}>{item.body}</Text>
              </ScrollView>
            ) : (
              <View style={styles.mediaFallback}>
                <Ionicons name="chatbubble-outline" size={30} color="#9CA3AF" />
                <Text style={styles.mediaFallbackText}>
                  This status has no content
                </Text>
              </View>
            )}
          </View>

          {replies.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.replyStrip}
            >
              {replies.map((body, index) => (
                <View
                  key={`${index}-${body.slice(0, 8)}`}
                  style={styles.replyPill}
                >
                  <Text style={styles.replyText} numberOfLines={1}>
                    {body}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.footer}>
            {isMine ? (
              <Pressable
                onPress={() => {
                  if (composerOpen) return;
                  void deleteStatus(item.id).then(onClose);
                }}
                style={styles.footerBtn}
                accessibilityRole="button"
                accessibilityLabel="Delete status"
              >
                <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setComposerOpen((open) => !open)}
                style={styles.footerBtn}
                accessibilityRole="button"
                accessibilityLabel="Reply to status"
              >
                <Ionicons name="chatbubble-outline" size={20} color="#fff" />
              </Pressable>
            )}

            {composerOpen ? (
              <View style={styles.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Reply..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={styles.composerInput}
                  autoFocus
                  maxLength={300}
                  onSubmitEditing={() => void send()}
                  accessibilityLabel="Reply"
                />
                <Pressable
                  onPress={() => void send()}
                  disabled={!draft.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send reply"
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </Pressable>
              </View>
            ) : (
              <Text style={styles.hint}>
                Tap right for next, left to go back
              </Text>
            )}
          </View>

          {/* Tap zones: the whole card is split, no visible buttons. */}
          <Pressable
            style={styles.zoneLeft}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Previous status"
          />
          <Pressable
            style={styles.zoneRight}
            onPress={advance}
            accessibilityRole="button"
            accessibilityLabel="Next status"
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  safe: {
    flex: 1,
  },
  bars: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: SPACING.spaceSm,
    paddingTop: SPACING.spaceXs,
  },
  barTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
  },
  barFill: {
    height: 3,
    backgroundColor: "#fff",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceSm,
  },
  headText: {
    flex: 1,
  },
  author: {
    ...TYPOGRAPHY.labelLG,
    color: "#fff",
  },
  meta: {
    ...TYPOGRAPHY.bodySM,
    color: "rgba(255,255,255,0.65)",
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceXl,
  },
  mediaFallbackText: {
    ...TYPOGRAPHY.bodyMD,
    color: "#9CA3AF",
    textAlign: "center",
  },
  retryButton: {
    marginTop: SPACING.spaceXs,
    paddingHorizontal: SPACING.spaceLg,
    paddingVertical: SPACING.spaceSm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
  },
  retryText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurface,
  },
  photo: {
    flex: 1,
  },
  textStage: {
    flexGrow: 1,
    justifyContent: "center",
    padding: SPACING.gutter,
  },
  statusText: {
    ...TYPOGRAPHY.headlineLG,
    color: "#fff",
  },
  replyStrip: {
    gap: SPACING.spaceXs,
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceSm,
  },
  replyPill: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceXs,
    maxWidth: 220,
  },
  replyText: {
    ...TYPOGRAPHY.bodySM,
    color: "#fff",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceSm,
  },
  footerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  composer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.spaceMd,
  },
  composerInput: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: "#fff",
    paddingVertical: SPACING.spaceSm,
  },
  hint: {
    flex: 1,
    ...TYPOGRAPHY.bodySM,
    color: "rgba(255,255,255,0.5)",
  },
  zoneLeft: {
    position: "absolute",
    left: 0,
    top: "22%",
    bottom: "18%",
    width: "32%",
  },
  zoneRight: {
    position: "absolute",
    right: 0,
    top: "22%",
    bottom: "18%",
    width: "68%",
  },
});
