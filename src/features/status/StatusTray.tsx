import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../../components/ui/Avatar";
import { COLORS, SPACING, TYPOGRAPHY } from "../../theme";
import type { StatusGroup } from "../../lib/statuses";
import PeopleToFollow from "./PeopleToFollow";

type Props = {
  groups: StatusGroup[];
  viewerId: string | null;
  /** The viewer's own name and picture, for the compose tile. */
  viewerName: string | null;
  viewerAvatar: string | null;
  onOpen: (authorId: string) => void;
  onCompose: () => void;
  /** Refetch the feed, so a new follow shows up without a manual refresh. */
  onFollowed?: () => void;
  loading?: boolean;
};

/**
 * Horizontal tray of everyone with an active status.
 *
 * Mirrors the WhatsApp pattern: a ring around each avatar, coloured only when
 * there is something you have not seen, with your own entry first so posting
 * is one tap away.
 */
export default function StatusTray({
  groups,
  viewerId,
  viewerName,
  viewerAvatar,
  onOpen,
  onCompose,
  onFollowed,
  loading,
}: Props) {
  // The compose tile already represents the viewer, so their own group would
  // otherwise render a second "Your story" beside it. The tile also used to
  // borrow groups[0]'s avatar, which before you had posted anything was a
  // stranger's face under your own name.
  const others = viewerId
    ? groups.filter((group) => group.authorId !== viewerId)
    : groups;

  /**
   * Your own group, which is rendered as the leading tile rather than being
   * listed alongside everyone else — that duplication was the original bug.
   * The tile opens your story when you have one and the composer when you do
   * not, so filtering it out of the list never makes your own status
   * unreachable.
   */
  const mine = viewerId
    ? groups.find((group) => group.authorId === viewerId)
    : undefined;

  if (loading && groups.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <Pressable
          onPress={() => (mine ? onOpen(mine.authorId) : onCompose())}
          style={styles.item}
          accessibilityRole="button"
          accessibilityLabel={
            mine ? "Your status" : "Add your status"
          }
        >
          <View>
            <View
              style={[
                styles.ring,
                mine
                  ? mine.unseen
                    ? styles.ringUnseen
                    : styles.ringSeen
                  : null,
              ]}
            >
              <Avatar
                name={viewerName ?? "You"}
                uri={viewerAvatar ?? mine?.authorAvatar ?? null}
                size={44}
              />
              {!mine ? (
                <View style={styles.addBadge}>
                  <Ionicons name="add" size={13} color={COLORS.onPrimary} />
                </View>
              ) : null}
            </View>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            Your story
          </Text>
        </Pressable>

        {others.map((group) => (
          <Pressable
            key={group.authorId}
            onPress={() => onOpen(group.authorId)}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={`${group.authorName}'s status`}
          >
            <View
              style={[
                styles.ring,
                group.unseen ? styles.ringUnseen : styles.ringSeen,
              ]}
            >
              <Avatar
                name={group.authorName}
                uri={group.authorAvatar}
                size={44}
              />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {group.authorName}
            </Text>
          </Pressable>
        ))}

        {groups.length === 0 && !loading ? (
          <PeopleToFollow
            viewerId={viewerId}
            onFollowed={onFollowed ?? (() => {})}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: SPACING.spaceSm,
  },
  rail: {
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.gutter,
    alignItems: "center",
  },
  item: {
    width: 56,
    alignItems: "center",
    gap: SPACING.spaceXs,
  },
  ring: {
    padding: 2,
    borderRadius: 28,
    borderWidth: 2,
  },
  ringUnseen: {
    borderColor: COLORS.primaryContainer,
  },
  ringSeen: {
    borderColor: COLORS.semantic.ghostBorderLight,
  },
  name: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.semantic.textSecondary,
    textAlign: "center",
  },
  addBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.semantic.canvasRoot,
  },
});
