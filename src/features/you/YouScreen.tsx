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
import { COLORS, SPACING, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import { useAuth } from "../../lib/auth-context";
import { usePresence } from "../../lib/presence-context";
import { PRESENCE_LABELS } from "../../lib/presence";
import { isSupabaseConfigured } from "../../lib/supabase";
import { fetchMySpaces, type SpaceSummary } from "../../lib/spaces";
import {
  fetchPlans,
  withdrawPlanResponse,
  type PlanSummary,
} from "../../lib/plans";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";

/**
 * Me — your profile, presence, spaces and plans.
 *
 * Everything here is read from the signed-in session and the backend. There is
 * deliberately no follower count, no "neural sync" percentage, and no other
 * number that cannot be derived from a real query.
 */

export default function YouScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { presence } = usePresence();

  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const [mySpaces, allPlans] = await Promise.all([
          fetchMySpaces(),
          fetchPlans(),
        ]);
        setSpaces(mySpaces);
        setPlans(allPlans.filter((plan) => plan.creatorId === user?.id));
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load your stuff",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !user) {
      setLoading(false);
      return;
    }
    void load();
  }, [load, user]);

  const onSignOut = useCallback(() => {
    Alert.alert("Sign out", "Touch grass msee, we will keep your spot.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } catch (err) {
            Alert.alert(
              "Could not sign out",
              err instanceof Error ? err.message : "Try again in a bit.",
            );
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  }, [signOut]);

  const onWithdrawPlan = useCallback(async (plan: PlanSummary) => {
    const result = await withdrawPlanResponse(plan.id);
    if (!result.ok) {
      Alert.alert("Could not remove", result.error ?? "Try again in a bit.");
      return;
    }
    setPlans((rows) =>
      rows.map((row) =>
        row.id === plan.id
          ? {
              ...row,
              myResponse: null,
              goingCount: Math.max(
                0,
                row.goingCount - (row.myResponse === "going" ? 1 : 0),
              ),
            }
          : row,
      ),
    );
  }, []);

  if (!user) {
    return (
      <View style={styles.centered}>
        <EmptyState
          message="You are not signed in. Slide in to see your stuff."
          icon={
            <Ionicons
              name="person-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      </View>
    );
  }

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
        <Text style={styles.title}>Me</Text>
        <TouchableOpacity
          onPress={onSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOut}>{signingOut ? "..." : "Sign out"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profile}>
        <Avatar
          name={user.displayName}
          uri={user.avatar}
          size={64}
          presence={presence === "offline" ? null : presence}
        />
        <View style={styles.profileBody}>
          <Text style={styles.displayName} numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{user.username}
          </Text>
          <Text style={styles.presence}>{PRESENCE_LABELS[presence]}</Text>
        </View>
      </View>

      {loading ? (
        <LoadingState message="Loading your stuff..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Your spaces</Text>
              <Text style={styles.sectionMeta}>{spaces.length || ""}</Text>
            </View>
            {spaces.length === 0 ? (
              <Text style={styles.stripEmpty}>
                No spaces yet. Tap into Discover to find one.
              </Text>
            ) : (
              spaces.map((space) => (
                <TouchableOpacity
                  key={space.id}
                  style={styles.row}
                  onPress={() => router.push(`/spaces/${space.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${space.name}`}
                >
                  <Avatar name={space.name} uri={space.avatarUrl} size={36} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {space.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {space.myRole ?? "member"}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={COLORS.onSurfaceVariant}
                  />
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Your plans</Text>
              <Text style={styles.sectionMeta}>{plans.length || ""}</Text>
            </View>
            {plans.length === 0 ? (
              <Text style={styles.stripEmpty}>
                No plans yet. Hit + and make one happen.
              </Text>
            ) : (
              plans.map((plan) => (
                <View key={plan.id} style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {plan.title}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {plan.goingCount} in
                      {plan.location ? ` · ${plan.location}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void onWithdrawPlan(plan)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${plan.title}`}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={COLORS.onSurfaceVariant}
                    />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
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
    paddingBottom: SPACING.spaceXl,
  },
  centered: {
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
  signOut: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.error,
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.spaceMd,
    paddingTop: SPACING.spaceMd,
  },
  profileBody: {
    flex: 1,
  },
  displayName: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  username: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
  },
  presence: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.primaryContainer,
    marginTop: 2,
  },
  section: {
    marginTop: SPACING.spaceMd,
  },
  sectionHead: {
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
});
