import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  fetchSpace,
  fetchSpaceMembers,
  fetchSpaceConversations,
  joinSpace,
  leaveSpace,
  type SpaceMember,
  type SpaceConversation,
  type SpaceSummary,
} from "../../lib/spaces";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";

/**
 * One space: what it is, who is in it, and the conversations that live in it.
 *
 * Conversations are primary here, matching the docs — a space organises chats,
 * it is not a forum with a chat bolted on. Tapping a conversation goes straight
 * to it; the member list is informational and does not navigate anywhere.
 */

function memberCountLabel(space: SpaceSummary): string {
  if (space.memberCount !== null) {
    return `${space.memberCount} in`;
  }
  return space.isPublic ? "Public" : "Private";
}

export default function SpaceDetail({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [space, setSpace] = useState<SpaceSummary | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [conversations, setConversations] = useState<SpaceConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const summary = await fetchSpace(spaceId);
        // Null means it does not exist or RLS hides it; both read as not found.
        if (!summary) {
          setError("Space not found");
          return;
        }
        setSpace(summary);
        const [memberRows, conversationRows] = await Promise.all([
          // A space you have not joined has no readable members; that is RLS,
          // not an error, and the catch below must not fire for it.
          fetchSpaceMembers(spaceId).catch(() => [] as SpaceMember[]),
          fetchSpaceConversations(spaceId),
        ]);
        setMembers(memberRows);
        setConversations(conversationRows);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load space");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [spaceId],
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    void load();
  }, [load]);

  const onJoin = useCallback(async () => {
    setBusy(true);
    const result = await joinSpace(spaceId);
    setBusy(false);
    if (!result.ok) {
      Alert.alert("Could not join", result.error ?? "Try again in a bit.");
      return;
    }
    void load(true);
  }, [spaceId, load]);

  const onLeave = useCallback(async () => {
    setBusy(true);
    const result = await leaveSpace(spaceId);
    setBusy(false);
    if (!result.ok) {
      Alert.alert("Could not leave", result.error ?? "Try again in a bit.");
      return;
    }
    router.back();
  }, [spaceId, router]);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <EmptyState
          message="Backend not configured."
          icon={
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      </View>
    );
  }

  if (loading) {
    return <LoadingState message="Opening space..." />;
  }

  if (error || !space) {
    return (
      <View style={styles.centered}>
        <ErrorState
          message={error ?? "Space not found"}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  const isMine = space.myRole !== null;
  const isOwner = space.myRole === "owner";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + SPACING.spaceXs },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={COLORS.primaryContainer}
        />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerBody}>
          <Text style={styles.title} numberOfLines={1}>
            {space.name}
          </Text>
          <Text style={styles.meta}>{memberCountLabel(space)}</Text>
        </View>
        {isMine && !isOwner ? (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => void onLeave()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Leave ${space.name}`}
          >
            <Ionicons
              name="exit-outline"
              size={20}
              color={COLORS.onSurfaceVariant}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.hero}>
        <Avatar name={space.name} uri={space.avatarUrl} size={56} />
        {space.description ? (
          <Text style={styles.description}>{space.description}</Text>
        ) : null}
        {!isMine ? (
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => void onJoin()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Join ${space.name}`}
          >
            <Text style={styles.joinBtnText}>{busy ? "..." : "Tap in"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conversations</Text>
        {conversations.length === 0 ? (
          <Text style={styles.stripEmpty}>No chats in here yet.</Text>
        ) : (
          conversations.map((conversation) => (
            <TouchableOpacity
              key={conversation.id}
              style={styles.row}
              onPress={() => router.push(`/chat/${conversation.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${conversation.name ?? "chat"}`}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {conversation.name ?? "Chat"}
                </Text>
                {conversation.lastMessagePreview ? (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {conversation.lastMessagePreview}
                  </Text>
                ) : null}
              </View>
              {conversation.unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadText}>
                    {conversation.unreadCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members</Text>
        {members.length === 0 ? (
          <Text style={styles.stripEmpty}>
            {isMine ? "Just you so far." : "Join to see who is in here."}
          </Text>
        ) : (
          members.map((member) => (
            <View key={member.userId} style={styles.row}>
              <Avatar
                name={member.displayName}
                uri={member.avatarUrl}
                presence={member.presence}
                size={36}
              />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {member.displayName}
                </Text>
                <Text style={styles.rowMeta}>{member.role}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingBottom: SPACING.spaceXl,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceSm,
  },
  headerBody: {
    flex: 1,
  },
  headerBtn: {
    padding: SPACING.spaceXs,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  meta: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  hero: {
    alignItems: "flex-start",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceMd,
    paddingTop: SPACING.spaceSm,
  },
  description: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurfaceVariant,
  },
  joinBtn: {
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceXs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryContainer,
  },
  joinBtnText: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.onPrimary,
  },
  section: {
    marginTop: SPACING.spaceMd,
  },
  sectionTitle: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: SPACING.spaceMd,
    marginBottom: SPACING.spaceXs,
  },
  stripEmpty: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: SPACING.spaceMd,
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
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    ...TYPOGRAPHY.bodyMD,
    fontWeight: "600",
    color: COLORS.onSurface,
  },
  rowMeta: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  unreadPill: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
  },
  unreadText: {
    ...TYPOGRAPHY.labelSM,
    fontWeight: "700",
    color: COLORS.onPrimary,
  },
});
