import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../../components/ui/Avatar";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import type { StatusGroup } from "../../lib/statuses";

type Props = {
  groups: StatusGroup[];
  viewerId: string | null;
  onOpen: (authorId: string) => void;
  onCompose: () => void;
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
  onOpen,
  onCompose,
  loading,
}: Props) {
  if (loading && groups.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <Pressable
          onPress={onCompose}
          style={styles.item}
          accessibilityRole="button"
          accessibilityLabel="Add your status"
        >
          <View>
            <Avatar name="You" uri={groups[0]?.authorAvatar} size={48} />
            <View style={styles.addBadge}>
              <Ionicons name="add" size={13} color={COLORS.onPrimary} />
            </View>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            Your story
          </Text>
        </Pressable>

        {groups.map((group) => (
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
              {group.authorId === viewerId ? "Your story" : group.authorName}
            </Text>
          </Pressable>
        ))}

        {groups.length === 0 && !loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No statuses yet. Yours is one tap away.
            </Text>
          </View>
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
  empty: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textDim,
  },
});
