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
import { usePeople } from "../../lib/people-context";
import { useAuth } from "../../lib/auth-context";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  fetchLiveConversations,
  fetchUpcomingPlans,
  subscribeToPulse,
  type PulseLiveConversation,
  type PulsePlan,
} from "../../lib/pulse";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";

/**
 * Pulse — what is happening right now.
 *
 * Three time-bounded strips and nothing else: Live now (conversations with a
 * recent burst), Tap-in (plans still open), Around (peers and their presence).
 * There is no ranking and no score, so this cannot decay into a feed; ordering
 * is purely chronological and everything expires on its own.
 */

function relativeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function startsLabel(iso: string): string {
  const starts = new Date(iso).getTime();
  const diffMs = starts - Date.now();
  if (diffMs <= 0) return "happening now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

function titleFor(live: PulseLiveConversation): string {
  if (live.name) return live.name;
  if (live.peers.length === 1) return live.peers[0].displayName;
  if (live.peers.length > 1) {
    return `${live.peers[0].displayName} +${live.peers.length - 1}`;
  }
  return "Conversation";
}

export default function PulseScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { people } = usePeople();

  const [live, setLive] = useState<PulseLiveConversation[]>([]);
  const [plans, setPlans] = useState<PulsePlan[]>([]);
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
      const [liveRows, planRows] = await Promise.all([
        fetchLiveConversations(),
        fetchUpcomingPlans(),
      ]);
      setLive(liveRows);
      setPlans(planRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Pulse");
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
    const unsubscribe = subscribeToPulse({ onChange: () => void load(true) });
    return unsubscribe;
  }, [load]);

  const firstName = user?.displayName?.split(" ")[0] ?? null;
  const around = people.filter((person) => person.presence !== "offline");
  const isQuiet =
    live.length === 0 && plans.length === 0 && around.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
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
        <View style={styles.headerText}>
          <Text style={styles.greeting}>
            {firstName ? `Yoh, ${firstName}` : "Yoh, tsup bruv?"}
          </Text>
          <Text style={styles.subtitle}>What's happening right now</Text>
        </View>
        <TouchableOpacity
          style={styles.iconCircle}
          onPress={() => router.push("/search")}
          accessibilityRole="button"
          accessibilityLabel="Search BRO"
        >
          <Ionicons name="search" size={20} color={COLORS.primaryContainer} />
        </TouchableOpacity>
      </View>

      {!isSupabaseConfigured ? (
        <EmptyState
          message="Backend not configured. Pull up EXPO_PUBLIC_SUPABASE_URL and the anon key to see what's live."
          icon={
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      ) : loading ? (
        <LoadingState message="Checking what's live..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <>
          {/* Strip 1 — Live now */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live now</Text>
              <Text style={styles.sectionMeta}>{live.length || ""}</Text>
            </View>
            {live.length === 0 ? (
              <Text style={styles.stripEmpty}>Quiet fr. Nothing cooking.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {live.map((item) => (
                  <TouchableOpacity
                    key={item.conversationId}
                    style={styles.liveCard}
                    onPress={() => router.push(`/chat/${item.conversationId}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${titleFor(item)}, ${item.messageCount} messages`}
                  >
                    <View style={styles.liveCardTop}>
                      <Text style={styles.liveBadge}>LIVE</Text>
                      <Text style={styles.liveCount}>
                        {item.messageCount} in{" "}
                        {relativeLabel(item.lastMessageAt)}
                      </Text>
                    </View>
                    <Text style={styles.liveTitle} numberOfLines={1}>
                      {titleFor(item)}
                    </Text>
                    {item.lastMessagePreview ? (
                      <Text style={styles.liveSnippet} numberOfLines={2}>
                        {item.lastMessagePreview}
                      </Text>
                    ) : null}
                    <View style={styles.avatarRow}>
                      {item.peers.slice(0, 4).map((peer) => (
                        <Avatar
                          key={peer.userId}
                          name={peer.displayName}
                          uri={peer.avatarUrl}
                          size={22}
                          style={styles.stackedAvatar}
                        />
                      ))}
                      {item.peers.length > 4 ? (
                        <Text style={styles.avatarOverflow}>
                          +{item.peers.length - 4}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Strip 2 — Tap-in */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tap in</Text>
              <Text style={styles.sectionMeta}>{plans.length || ""}</Text>
            </View>
            {plans.length === 0 ? (
              <Text style={styles.stripEmpty}>
                Nothing on. Make something happen.
              </Text>
            ) : (
              plans.map((plan) => (
                <View key={plan.id} style={styles.planRow}>
                  <View style={styles.planMain}>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {plan.title}
                    </Text>
                    <Text style={styles.planMeta}>
                      {plan.creatorName ? `${plan.creatorName} · ` : ""}
                      {startsLabel(plan.startsAt)}
                      {plan.location ? ` · ${plan.location}` : ""}
                    </Text>
                  </View>
                  <View style={styles.planTally}>
                    <Text style={styles.planGoing}>{plan.goingCount} in</Text>
                    <Text style={styles.planMeta}>
                      {plan.responseCount} said
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Strip 3 — Around */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Around</Text>
              <Text style={styles.sectionMeta}>{around.length || ""}</Text>
            </View>
            {around.length === 0 ? (
              <Text style={styles.stripEmpty}>
                Uko solo msee. No bros around.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {around.map((person) => (
                  <TouchableOpacity
                    key={person.userId}
                    style={styles.aroundItem}
                    onPress={() => router.push("/new-chat")}
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${person.displayName}`}
                  >
                    <Avatar
                      name={person.displayName}
                      uri={person.avatarUrl}
                      presence={person.presence}
                      size={44}
                    />
                    <Text style={styles.aroundName} numberOfLines={1}>
                      {person.displayName.split(" ")[0]}
                    </Text>
                    <Text style={styles.aroundState} numberOfLines={1}>
                      {person.presence}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {isQuiet ? (
            <Text style={styles.quietNote}>Quiet fr. Drop a vibe cuz.</Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingTop: SPACING.spaceXs,
    paddingBottom: SPACING.spaceXl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.spaceMd,
    paddingBottom: SPACING.spaceSm,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    ...TYPOGRAPHY.headlineMD,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: COLORS.onSurface,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  section: {
    marginTop: SPACING.spaceSm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
    paddingHorizontal: SPACING.spaceMd,
    marginBottom: SPACING.spaceXs,
  },
  sectionTitle: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  sectionMeta: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
  },
  stripEmpty: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceXs,
  },
  rail: {
    paddingHorizontal: SPACING.spaceMd,
    gap: SPACING.spaceSm,
  },
  liveCard: {
    width: 220,
    padding: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  liveCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceXs,
  },
  liveBadge: {
    ...TYPOGRAPHY.labelSM,
    fontWeight: "700",
    color: COLORS.primaryContainer,
    letterSpacing: 1,
  },
  liveCount: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
  },
  liveTitle: {
    ...TYPOGRAPHY.bodyMD,
    fontWeight: "600",
    color: COLORS.onSurface,
  },
  liveSnippet: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.spaceXs,
  },
  stackedAvatar: {
    marginRight: -6,
    borderWidth: 1,
    borderColor: COLORS.surfaceContainer,
  },
  avatarOverflow: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginLeft: SPACING.spaceXs,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  planMain: {
    flex: 1,
  },
  planTitle: {
    ...TYPOGRAPHY.bodyMD,
    fontWeight: "600",
    color: COLORS.onSurface,
  },
  planMeta: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  planTally: {
    alignItems: "flex-end",
  },
  planGoing: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.primaryContainer,
  },
  aroundItem: {
    width: 68,
    alignItems: "center",
    gap: 2,
  },
  aroundName: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurface,
    marginTop: 2,
  },
  aroundState: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
  },
  quietNote: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    textAlign: "center",
    paddingTop: SPACING.spaceMd,
  },
});
