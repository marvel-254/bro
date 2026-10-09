import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "../../components/ui/Avatar";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import {
  fetchFollowSuggestions,
  followUser,
  type FollowSuggestion,
} from "../../lib/follows";

type Props = {
  viewerId: string | null;
  /** Called after a successful follow so the tray can refill. */
  onFollowed: () => void;
};

/**
 * The tray's empty state.
 *
 * A follow-based status feed is legitimately empty until you follow someone,
 * so the honest thing to put here is the thing that fixes it. Showing "No
 * statuses yet" would be true and useless — it reads as a broken feed, and
 * there is no action on it.
 */
export default function PeopleToFollow({ viewerId, onFollowed }: Props) {
  const [people, setPeople] = useState<FollowSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPeople(await fetchFollowSuggestions());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load people",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    void load();
  }, [viewerId, load]);

  const onFollow = useCallback(
    async (id: string) => {
      setBusyId(id);
      const result = await followUser(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not follow");
        return;
      }
      // Drop them from the list immediately: the feed is now expected to have
      // their stories, so leaving them here would imply the follow failed.
      setPeople((prev) => prev.filter((person) => person.id !== id));
      onFollowed();
    },
    [onFollowed],
  );

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={COLORS.primaryContainer} />
      </View>
    );
  }

  if (people.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyText}>
          {error ??
            "No statuses yet. Yours is one tap away."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>People you might follow</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {people.map((person) => (
          <View key={person.id} style={styles.item}>
            <Avatar name={person.name} uri={person.avatarUrl} size={48} />
            <Text style={styles.name} numberOfLines={1}>
              {person.name}
            </Text>
            <Pressable
              onPress={() => void onFollow(person.id)}
              disabled={busyId === person.id}
              style={styles.follow}
              accessibilityRole="button"
              accessibilityLabel={`Follow ${person.name}`}
            >
              {busyId === person.id ? (
                <ActivityIndicator size="small" color={COLORS.onPrimary} />
              ) : (
                <Ionicons name="add" size={13} color={COLORS.onPrimary} />
              )}
            </Pressable>
          </View>
        ))}
      </ScrollView>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceSm,
    gap: SPACING.spaceXs,
  },
  heading: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.semantic.textDim,
  },
  rail: {
    gap: SPACING.spaceMd,
    paddingVertical: SPACING.spaceXs,
    alignItems: "center",
  },
  item: {
    width: 64,
    gap: SPACING.spaceXs,
  },
  name: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurface,
    textAlign: "center",
  },
  follow: {
    alignSelf: "center",
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  emptyText: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textDim,
  },
  errorText: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
});
