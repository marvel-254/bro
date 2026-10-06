import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import {
  fetchConversationSummaries,
  subscribeToConversationList,
} from "../../lib/conversations";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useActivityBadge } from "../../lib/activity-badge-context";
import type { ConversationSummary } from "../../lib/database.types";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";

/**
 * Conversation list — the Chats tab.
 *
 * Shows every conversation the caller belongs to, newest activity first, with
 * the peer avatar + presence, last message preview, and an unread badge. A
 * realtime subscription reorders and refreshes the list when a new message
 * lands in any conversation.
 */

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function titleFor(summary: ConversationSummary): string {
  if (summary.name) return summary.name;
  const names = summary.peers.map((peer) => peer.display_name);
  return names.length > 0 ? names.join(", ") : "Conversation";
}

export default function ConversationListScreen() {
  const router = useRouter();
  const { unreadCount: unreadActivity, refresh: refreshActivityBadge } =
    useActivityBadge();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const rows = await fetchConversationSummaries();
      setConversations(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load conversations",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToConversationList({
      onChange: () => void load(),
    });
    return unsubscribe;
  }, [load]);

  const openConversation = (id: string) => {
    router.push(`/chat/${id}`);
  };

  const renderItem = ({ item }: { item: ConversationSummary }) => {
    const peer = item.peers[0];
    const presence =
      (peer?.presence as
        | "online"
        | "busy"
        | "chilling"
        | "gaming"
        | "listening"
        | "afk"
        | "offline"
        | null) ?? null;
    const preview = item.last_message_preview ?? "No messages yet";

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => openConversation(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open conversation ${titleFor(item)}`}
      >
        <Avatar
          uri={peer?.avatar_url ?? item.avatar_url}
          name={titleFor(item)}
          size={48}
          presence={presence}
        />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {titleFor(item)}
            </Text>
            <Text style={styles.rowTime}>
              {timeLabel(item.last_message_at)}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.rowPreview} numberOfLines={1}>
              {preview}
            </Text>
            {item.unread_count > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {item.unread_count > 99 ? "99+" : item.unread_count}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>BRO</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            router.push("/activity");
            // Opening the screen is the natural moment to clear the badge.
            void refreshActivityBadge();
          }}
          accessibilityRole="button"
          accessibilityLabel="Activity"
        >
          <Ionicons
            name="notifications-outline"
            size={22}
            color={COLORS.onSurface}
          />
          {unreadActivity > 0 ? (
            <View style={styles.activityBadge}>
              <Text style={styles.activityBadgeText}>
                {unreadActivity > 9 ? "9+" : unreadActivity}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push("/new-chat")}
          accessibilityRole="button"
          accessibilityLabel="New chat"
        >
          <Ionicons name="create-outline" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState message="Loading conversations..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : conversations.length === 0 ? (
        <EmptyState
          message="No conversations yet. Someone has to say something stupid first."
          icon={
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={40}
              color={COLORS.semantic.textDim}
            />
          }
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={COLORS.surfaceTint}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceLg,
    paddingBottom: SPACING.spaceMd,
  },
  logo: {
    ...TYPOGRAPHY.headlineMD,
    color: COLORS.semantic.textPrimary,
    fontWeight: "800",
    letterSpacing: 1,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.semantic.textDim,
    flex: 1,
  },
  newBtn: {
    padding: SPACING.spaceSm,
  },
  headerBtn: {
    padding: SPACING.spaceSm,
  },
  activityBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
  },
  activityBadgeText: {
    ...TYPOGRAPHY.labelSM,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  listContent: {
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceXl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    paddingVertical: SPACING.spaceMd,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.semantic.ghostBorderLight,
  },
  rowBody: {
    flex: 1,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTitle: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textPrimary,
    fontWeight: "600",
    flex: 1,
    marginRight: SPACING.spaceSm,
  },
  rowTime: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.semantic.textDim,
    fontFamily: "monospace",
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  rowPreview: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textSecondary,
    flex: 1,
    marginRight: SPACING.spaceSm,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceTint,
  },
  unreadText: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onPrimary,
    fontWeight: "700",
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
    color: COLORS.semantic.textPrimary,
  },
  emptyBody: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textSecondary,
    textAlign: "center",
  },
});
