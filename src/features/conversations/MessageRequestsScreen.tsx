import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, RADIUS, SEMANTIC_COLORS, SPACING, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/feedback/States";
import { isSupabaseConfigured } from "../../lib/supabase";
import { blockUser } from "../../lib/blocks";
import {
  REPORT_REASONS,
  acceptMessageRequest,
  declineMessageRequest,
  fetchMessageRequests,
  reportUser,
  subscribeToMessageRequests,
  type MessageRequest,
} from "../../lib/requests";
import { formatRelativeTime } from "../../lib/utils";

/**
 * Incoming message requests.
 *
 * This screen exists so the recipient can judge a first message without the
 * sender learning anything: no presence, typing or read state is shown, and
 * the profile is one tap away. Accept moves the conversation into Chats;
 * decline, block and report all keep it out of the inbox.
 */

export default function MessageRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    setError(null);
    try {
      setRequests(await fetchMessageRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeToMessageRequests(() => void load());
  }, [load]);

  const remove = useCallback((conversationId: string) => {
    setRequests((current) =>
      current.filter((request) => request.conversationId !== conversationId),
    );
  }, []);

  const onAccept = useCallback(
    async (request: MessageRequest) => {
      setBusyId(request.conversationId);
      const result = await acceptMessageRequest(request.conversationId);
      setBusyId(null);
      if (!result.ok) {
        Alert.alert("Could not accept", result.error ?? "Try again in a bit.");
        return;
      }
      remove(request.conversationId);
      router.push(`/chat/${request.conversationId}`);
    },
    [remove, router],
  );

  const onDecline = useCallback(
    async (request: MessageRequest) => {
      setBusyId(request.conversationId);
      const result = await declineMessageRequest(request.conversationId);
      setBusyId(null);
      if (!result.ok) {
        Alert.alert("Could not decline", result.error ?? "Try again in a bit.");
        return;
      }
      remove(request.conversationId);
    },
    [remove],
  );

  const onBlock = useCallback(
    (request: MessageRequest) => {
      Alert.alert(
        `Block ${request.peerName}?`,
        "This declines the request and stops them from messaging you. They will not be told.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setBusyId(request.conversationId);
                const blocked = await blockUser(request.peerId);
                if (!blocked.ok) {
                  setBusyId(null);
                  Alert.alert("Could not block", blocked.error ?? "Try again.");
                  return;
                }
                const declined = await declineMessageRequest(
                  request.conversationId,
                );
                setBusyId(null);
                if (!declined.ok && !/no pending/i.test(declined.error ?? "")) {
                  Alert.alert(
                    "Blocked",
                    "The block is in place, but the request could not be removed. Pull to refresh.",
                  );
                  return;
                }
                remove(request.conversationId);
              })();
            },
          },
        ],
      );
    },
    [remove],
  );

  const onReport = useCallback((request: MessageRequest) => {
    Alert.alert(
      `Report ${request.peerName}`,
      "Reports are private and are not shown to the person you report.",
      [
        { text: "Cancel", style: "cancel" },
        ...REPORT_REASONS.map((reason) => ({
          text: reason,
          onPress: () => {
            void (async () => {
              const result = await reportUser(
                request.peerId,
                reason,
                request.conversationId,
              );
              if (!result.ok) {
                Alert.alert("Could not report", result.error ?? "Try again.");
                return;
              }
              Alert.alert("Report sent", "Thanks — the report was recorded.");
            })();
          },
        })),
      ],
    );
  }, []);

  const renderItem = ({ item }: { item: MessageRequest }) => {
    const busy = busyId === item.conversationId;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <TouchableOpacity
            style={styles.identity}
            onPress={() => router.push(`/profile/${item.peerId}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.peerName}'s profile`}
          >
            <Avatar uri={item.peerAvatar} name={item.peerName} size={48} />
            <View style={styles.identityBody}>
              <Text style={styles.name} numberOfLines={1}>
                {item.peerName}
              </Text>
              {item.peerUsername ? (
                <Text style={styles.username} numberOfLines={1}>
                  @{item.peerUsername}
                </Text>
              ) : null}
              <Text style={styles.time}>
                {formatRelativeTime(item.createdAt)}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() =>
              Alert.alert(item.peerName, "Choose what to do with this request.", [
                { text: "Block", style: "destructive", onPress: () => onBlock(item) },
                { text: "Report", onPress: () => onReport(item) },
                { text: "Cancel", style: "cancel" },
              ])
            }
            accessibilityRole="button"
            accessibilityLabel={`More options for ${item.peerName}`}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={COLORS.onSurfaceVariant}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.preview} numberOfLines={3}>
          {item.preview?.trim() || "Sent you a message request."}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.acceptBtn, busy && styles.busy]}
            onPress={() => void onAccept(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Accept request from ${item.peerName}`}
          >
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.declineBtn, busy && styles.busy]}
            onPress={() => void onDecline(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Decline request from ${item.peerName}`}
          >
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Message requests</Text>
      </View>

      {!isSupabaseConfigured ? (
        <ErrorState message="Backend not configured." />
      ) : loading ? (
        <LoadingState message="Loading requests..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.conversationId}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + SPACING.spaceXl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={COLORS.surfaceTint}
            />
          }
          ListEmptyComponent={
            <EmptyState
              message="No message requests. First DMs from people you are not friends with will show up here."
              icon={
                <Ionicons
                  name="mail-unread-outline"
                  size={40}
                  color={SEMANTIC_COLORS.textSecondary}
                />
              }
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
    backgroundColor: SEMANTIC_COLORS.canvasRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: SPACING.spaceSm,
  },
  headerBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: SEMANTIC_COLORS.textPrimary,
    fontWeight: "700",
  },
  list: {
    paddingHorizontal: SPACING.gutter,
    gap: SPACING.spaceMd,
  },
  card: {
    padding: SPACING.spaceMd,
    borderRadius: RADIUS.sm,
    backgroundColor: SEMANTIC_COLORS.surfaceLevel1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
    gap: SPACING.spaceSm,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.spaceSm,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    minHeight: 48,
  },
  identityBody: {
    flex: 1,
  },
  name: {
    ...TYPOGRAPHY.bodyLG,
    color: SEMANTIC_COLORS.textPrimary,
    fontWeight: "600",
  },
  username: {
    ...TYPOGRAPHY.bodySM,
    color: SEMANTIC_COLORS.textSecondary,
  },
  time: {
    ...TYPOGRAPHY.labelSM,
    color: SEMANTIC_COLORS.textSecondary,
    marginTop: 2,
  },
  moreBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    ...TYPOGRAPHY.bodyMD,
    color: SEMANTIC_COLORS.textPrimary,
    paddingLeft: 4,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.spaceSm,
  },
  acceptBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryContainer,
  },
  acceptText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
  },
  declineBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  declineText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onSurface,
  },
  busy: {
    opacity: 0.6,
  },
});
