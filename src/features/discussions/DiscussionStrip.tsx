import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/ui/Avatar";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { formatRelativeTime } from "../../lib/utils";
import {
  contribute,
  fetchContributions,
  fetchDiscussions,
  withdrawContribution,
  type Contribution,
  type Discussion,
} from "../../lib/discussions";

type Props = {
  viewerId: string | null;
  /** Refetched after someone contributes, so the count stays honest. */
  onChanged?: () => void;
};

/**
 * Discussions on Pulse.
 *
 * Replaces the Tap-in strip, which listed plans and showed how many people had
 * said "going". There is no going here: a discussion is a thread, and the
 * number worth showing is how many people actually contributed something.
 */
export default function DiscussionStrip({ viewerId, onChanged }: Props) {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Discussion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDiscussions(await fetchDiscussions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    void load();
  }, [viewerId, load]);

  return (
    <View>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Discussions</Text>
          <Text style={styles.sectionMeta}>{discussions.length || ""}</Text>
        </View>

        {loading ? (
          <View style={styles.stripLoading}>
            <ActivityIndicator color={COLORS.primaryContainer} />
          </View>
        ) : error && discussions.length === 0 ? (
          <Text style={styles.stripEmpty}>{error}</Text>
        ) : discussions.length === 0 ? (
          <Text style={styles.stripEmpty}>
            Quiet in here. Start one.
          </Text>
        ) : (
          discussions.map((discussion) => (
            <Pressable
              key={discussion.id}
              onPress={() => setOpen(discussion)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`Open discussion: ${discussion.title}`}
            >
              <Avatar
                name={discussion.author.name}
                uri={discussion.author.avatarUrl}
                size={34}
              />
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {discussion.title}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {discussion.author.name} ·{" "}
                  {formatRelativeTime(discussion.createdAt)}
                  {discussion.isClosed ? " · closed" : ""}
                </Text>
              </View>
              <View style={styles.tally}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={13}
                  color={COLORS.semantic.textDim}
                />
                <Text style={styles.tallyText}>
                  {discussion.contributionCount}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <DiscussionSheet
        discussion={open}
        onClose={() => {
          setOpen(null);
          void load();
          onChanged?.();
        }}
      />
    </View>
  );
}

function DiscussionSheet({
  discussion,
  onClose,
}: {
  discussion: Discussion | null;
  onClose: () => void;
}) {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load once per opened discussion, and seed the box with what this user
  // already said — contributing again edits it rather than failing on the
  // one-contribution-per-person constraint.
  useEffect(() => {
    if (!discussion) {
      setContributions([]);
      setDraft("");
      setLoadedFor(null);
      return;
    }
    if (loadedFor === discussion.id) return;
    setLoadedFor(discussion.id);
    setDraft(discussion.myContribution ?? "");
    void fetchContributions(discussion.id).then(setContributions);
  }, [discussion, loadedFor]);

  const submit = useCallback(async () => {
    if (!discussion || saving) return;
    setSaving(true);
    setError(null);
    const result = await contribute(discussion.id, draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not add that");
      return;
    }
    setContributions(await fetchContributions(discussion.id));
    onClose();
  }, [discussion, draft, saving, onClose]);

  const withdraw = useCallback(async () => {
    if (!discussion || saving) return;
    setSaving(true);
    setError(null);
    const result = await withdrawContribution(discussion.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not remove that");
      return;
    }
    setDraft("");
    setContributions(await fetchContributions(discussion.id));
    onClose();
  }, [discussion, saving, onClose]);

  const mine = contributions.find((row) => row.mine);

  return (
    <Modal
      visible={discussion !== null}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          {discussion ? (
            <>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {discussion.title}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close discussion"
                >
                  <Ionicons name="close" size={22} color={COLORS.onSurface} />
                </Pressable>
              </View>

              <Text style={styles.sheetBy}>
                {discussion.author.name} ·{" "}
                {formatRelativeTime(discussion.createdAt)}
                {discussion.isClosed ? " · closed" : ""}
              </Text>

              {discussion.body ? (
                <ScrollView style={styles.thread}>
                  {discussion.body ? (
                    <Text style={styles.opening}>{discussion.body}</Text>
                  ) : null}
                  {contributions.map((row) => (
                    <View
                      key={row.id}
                      style={[styles.contribution, row.mine && styles.contributionMine]}
                    >
                      <Avatar
                        name={row.author.name}
                        uri={row.author.avatarUrl}
                        size={26}
                      />
                      <View style={styles.contributionBody}>
                        <Text style={styles.contributionName}>
                          {row.mine ? "You" : row.author.name}
                        </Text>
                        <Text style={styles.contributionText}>{row.body}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              {discussion.isClosed ? (
                <Text style={styles.closedNote}>
                  The person who started this closed it.
                </Text>
              ) : (
                <View style={styles.composer}>
                  {error ? (
                    <Text style={styles.errorText}>{error}</Text>
                  ) : null}
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Add to this..."
                    placeholderTextColor={COLORS.outline}
                    style={styles.composerInput}
                    multiline
                    accessibilityLabel="Your contribution"
                  />
                  <View style={styles.composerRow}>
                    {mine ? (
                      <Pressable
                        onPress={() => void withdraw()}
                        style={styles.withdraw}
                        accessibilityRole="button"
                        accessibilityLabel="Remove your contribution"
                      >
                        <Text style={styles.withdrawText}>Remove</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => void submit()}
                      disabled={saving || !draft.trim()}
                      style={[
                        styles.send,
                        (saving || !draft.trim()) && styles.sendDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Add your contribution"
                    >
                      <Text style={styles.sendText}>
                        {mine ? "Update" : "Add"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceSm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceXs,
  },
  sectionTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
  },
  sectionMeta: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textDim,
  },
  stripLoading: {
    paddingVertical: SPACING.spaceMd,
    alignItems: "center",
  },
  stripEmpty: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textDim,
    paddingVertical: SPACING.spaceSm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingVertical: SPACING.spaceSm,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    ...TYPOGRAPHY.bodyLG,
    color: COLORS.onSurface,
  },
  rowMeta: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textDim,
  },
  tally: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
  },
  tallyText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textDim,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.gutter,
    maxHeight: "85%",
    gap: SPACING.spaceXs,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.spaceSm,
  },
  sheetTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
    flex: 1,
  },
  sheetBy: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textDim,
  },
  thread: {
    marginTop: SPACING.spaceSm,
  },
  opening: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    marginBottom: SPACING.spaceSm,
  },
  contribution: {
    flexDirection: "row",
    gap: SPACING.spaceSm,
    paddingVertical: SPACING.spaceXs,
  },
  contributionMine: {
    opacity: 0.95,
  },
  contributionBody: {
    flex: 1,
  },
  contributionName: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.primaryContainer,
  },
  contributionText: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
  },
  composer: {
    marginTop: SPACING.spaceSm,
    gap: SPACING.spaceXs,
  },
  composerInput: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    minHeight: 68,
    maxHeight: 140,
    textAlignVertical: "top",
    padding: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: SPACING.spaceMd,
  },
  send: {
    paddingHorizontal: SPACING.spaceLg,
    paddingVertical: SPACING.spaceSm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
  },
  withdraw: {
    paddingVertical: SPACING.spaceSm,
  },
  withdrawText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textDim,
  },
  closedNote: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textDim,
    paddingVertical: SPACING.spaceMd,
  },
  errorText: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
});
