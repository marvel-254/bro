import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  fetchActivity,
  markActivityRead,
  markAllActivityRead,
  subscribeToActivity,
  describeActivity,
  relativeTime,
  type ActivityItem,
} from "../../lib/activity";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";

/**
 * Activity — replies, mentions, reactions, joins, invites and follows aimed at
 * you.
 *
 * Reads the owner-scoped `notifications` table rather than `activity`, so this
 * screen structurally cannot show anyone else's activity. Unread rows carry an
 * accent bar; opening one marks it read.
 *
 * Copy here is deliberately plain English: these lines are about other people,
 * so the slang voice does not apply (see bro-voice-guide.md).
 */

export default function ActivityScreen() {
  const router = useRouter();

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const rows = await fetchActivity();
      setItems(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    void load();
    const unsubscribe = subscribeToActivity({
      onChange: () => void load(true),
    });
    return unsubscribe;
  }, [load]);

  const open = useCallback(
    (item: ActivityItem) => {
      // Optimistic: the row is marked read immediately so the accent bar does not
      // linger behind a navigation the user just took.
      setItems((rows) =>
        rows.map((row) =>
          row.notificationId === item.notificationId
            ? { ...row, isRead: true }
            : row,
        ),
      );
      void markActivityRead([item.notificationId]);

      if (item.deepLink === "/spaces") {
        router.push("/spaces");
        return;
      }
      if (item.deepLink === "/people") {
        router.push("/people");
        return;
      }
      // Message and conversation activity resolves to the parent conversation.
      if (item.targetType === "conversation" && item.targetId) {
        router.push(`/chat/${item.targetId}`);
        return;
      }
      router.push("/chats");
    },
    [router],
  );

  const unreadCount = items.filter((item) => !item.isRead).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={() => {
              setItems((rows) => rows.map((row) => ({ ...row, isRead: true })));
              void markAllActivityRead();
            }}
            accessibilityRole="button"
            accessibilityLabel="Mark all activity as read"
          >
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!isSupabaseConfigured ? (
        <EmptyState
          message="Backend not configured. Set the Supabase URL and anon key to see activity."
          icon={
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      ) : loading ? (
        <LoadingState message="Loading activity..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={COLORS.primaryContainer}
            />
          }
        >
          {items.length === 0 ? (
            <EmptyState
              message="Nothing here yet. Replies, mentions and reactions land in this spot."
              icon={
                <Ionicons
                  name="notifications-outline"
                  size={36}
                  color={COLORS.onSurfaceVariant}
                />
              }
            />
          ) : (
            items.map((item) => (
              <TouchableOpacity
                key={item.notificationId}
                style={[styles.row, !item.isRead && styles.rowUnread]}
                onPress={() => open(item)}
                accessibilityRole="button"
                accessibilityLabel={describeActivity(
                  item.type,
                  item.actorName,
                  item.targetType,
                )}
              >
                <Avatar
                  name={item.actorName}
                  uri={item.actorAvatarUrl}
                  presence={item.actorPresence}
                  size={40}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowText}>
                    {describeActivity(
                      item.type,
                      item.actorName,
                      item.targetType,
                    )}
                  </Text>
                  <Text style={styles.rowTime}>
                    {relativeTime(item.createdAt)}
                  </Text>
                </View>
                {!item.isRead ? <View style={styles.unreadDot} /> : null}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.spaceMd,
    paddingTop: SPACING.spaceXs,
  },
  title: {
    ...TYPOGRAPHY.headlineMD,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  markAll: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.primaryContainer,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.spaceXl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  rowUnread: {
    backgroundColor: COLORS.surfaceContainerLow,
  },
  rowBody: {
    flex: 1,
  },
  rowText: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
  },
  rowTime: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
  },
});
