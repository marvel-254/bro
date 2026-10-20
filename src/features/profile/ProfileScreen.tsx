import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  COLORS,
  RADIUS,
  SEMANTIC_COLORS,
  SPACING,
  TYPOGRAPHY,
} from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import { ErrorState, LoadingState } from "../../components/feedback/States";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  fetchProfileView,
  type ProfileView,
} from "../../lib/profiles";
import { followUser, unfollowUser } from "../../lib/follows";
import { blockUser, unblockUser } from "../../lib/blocks";
import { createDirectConversation } from "../../lib/conversations";
import { PRESENCE_LABELS } from "../../lib/presence";

/**
 * Someone else's profile, reached from a direct-chat header or People.
 *
 * This is deliberately a communication surface, not a timeline: identity,
 * the one relationship control that matters (follow), and a way to message
 * them. Block lives behind the overflow control because it is destructive and
 * needs a confirmation that explains its effect.
 */

function presenceLabel(view: ProfileView): string | null {
  if (view.isSelf) return "You";
  const presence = view.profile.presence;
  if (!presence || presence === "offline") return null;
  return PRESENCE_LABELS[presence];
}

export default function ProfileScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"follow" | "block" | "message" | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      try {
        const next = await fetchProfileView(userId);
        if (!next) {
          setError("This profile could not be opened.");
        } else {
          setView(next);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load profile.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const onToggleFollow = useCallback(async () => {
    if (!view || busy) return;
    setBusy("follow");
    const result = view.following
      ? await unfollowUser(view.profile.id)
      : await followUser(view.profile.id);
    setBusy(null);
    if (!result.ok) {
      Alert.alert(
        view.following ? "Could not unfollow" : "Could not follow",
        result.error ?? "Try again in a bit.",
      );
      return;
    }
    setView((current) =>
      current
        ? {
            ...current,
            following: !current.following,
            followerCount: Math.max(
              0,
              current.followerCount + (current.following ? -1 : 1),
            ),
          }
        : current,
    );
  }, [busy, view]);

  const onMessage = useCallback(async () => {
    if (!view || busy) return;
    setBusy("message");
    const result = await createDirectConversation(view.profile.id);
    setBusy(null);
    if (!result.ok) {
      Alert.alert(
        "Could not open chat",
        result.error ?? "Try again in a bit.",
      );
      return;
    }
    router.push(`/chat/${result.conversationId}`);
  }, [busy, router, view]);

  const onConfirmBlock = useCallback(() => {
    if (!view) return;
    Alert.alert(
      "Block this person?",
      "You will not see each other's messages, and neither of you can start a new chat. Existing messages stay hidden while the block is in place. You can unblock later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy("block");
              const result = await blockUser(view.profile.id);
              setBusy(null);
              if (!result.ok) {
                Alert.alert("Could not block", result.error ?? "Try again.");
                return;
              }
              setView((current) =>
                current ? { ...current, blocked: true } : current,
              );
            })();
          },
        },
      ],
    );
  }, [view]);

  const onUnblock = useCallback(() => {
    if (!view) return;
    void (async () => {
      setBusy("block");
      const result = await unblockUser(view.profile.id);
      setBusy(null);
      if (!result.ok) {
        Alert.alert("Could not unblock", result.error ?? "Try again.");
        return;
      }
      setView((current) =>
        current ? { ...current, blocked: false } : current,
      );
    })();
  }, [view]);

  const onMore = useCallback(() => {
    if (!view || view.isSelf) return;
    if (view.blocked) {
      Alert.alert("Blocked", "You have blocked this person.", [
        { text: "Cancel", style: "cancel" },
        { text: "Unblock", onPress: onUnblock },
      ]);
      return;
    }
    Alert.alert("More options", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: onConfirmBlock },
    ]);
  }, [onConfirmBlock, onUnblock, view]);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <ErrorState message="Backend not configured." />
      </View>
    );
  }

  if (loading) {
    return <LoadingState message="Opening profile..." />;
  }

  if (error || !view) {
    return (
      <View style={styles.centered}>
        <ErrorState
          message={error ?? "Profile not found"}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  const { profile } = view;
  const presence = presenceLabel(view);
  const initialsName = profile.displayName;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom + SPACING.spaceXl },
      ]}
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
        <Text style={styles.headerTitle} numberOfLines={1}>
          Profile
        </Text>
        {view.isSelf ? (
          <View style={styles.headerBtn} />
        ) : (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onMore}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="More profile actions"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={22}
              color={COLORS.onSurface}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.hero}>
        <Avatar
          uri={profile.avatarUrl}
          name={initialsName}
          size={96}
          presence={view.isSelf || view.blocked ? null : profile.presence}
        />
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {profile.displayName}
            </Text>
            {profile.isVerified ? (
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={COLORS.surfaceTint}
                accessibilityLabel="Verified"
              />
            ) : null}
          </View>
          {profile.username ? (
            <Text style={styles.username} numberOfLines={1}>
              @{profile.username}
            </Text>
          ) : null}
          {presence ? (
            <Text style={styles.presence} numberOfLines={1}>
              {presence}
            </Text>
          ) : null}
        </View>
      </View>

      {view.blocked ? (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban" size={18} color={COLORS.error} />
          <Text style={styles.blockedText}>
            You blocked this person. Their messages are hidden and neither of
            you can start a new chat.
          </Text>
        </View>
      ) : null}

      {profile.bio?.trim() ? (
        <Text style={styles.bio}>{profile.bio.trim()}</Text>
      ) : (
        <Text style={styles.bioMuted}>No bio yet.</Text>
      )}

      {profile.interests.length > 0 ? (
        <View style={styles.interests}>
          {profile.interests.slice(0, 8).map((interest) => (
            <View key={interest} style={styles.interestChip}>
              <Text style={styles.interestText}>{interest}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{view.followerCount}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{view.followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>

      {view.isSelf ? null : (
        <View style={styles.actions}>
          {!view.blocked ? (
            <TouchableOpacity
              style={[styles.primaryBtn, busy === "message" && styles.btnBusy]}
              onPress={() => void onMessage()}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={`Message ${profile.displayName}`}
            >
              <Ionicons
                name="chatbubble-outline"
                size={18}
                color={COLORS.onPrimary}
              />
              <Text style={styles.primaryBtnText}>Message</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.secondaryBtn, busy === "follow" && styles.btnBusy]}
            onPress={() => void onToggleFollow()}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ selected: view.following }}
            accessibilityLabel={
              view.following
                ? `Unfollow ${profile.displayName}`
                : `Follow ${profile.displayName}`
            }
          >
            <Ionicons
              name={view.following ? "checkmark" : "person-add-outline"}
              size={18}
              color={COLORS.onSurface}
            />
            <Text style={styles.secondaryBtnText}>
              {view.following ? "Following" : "Follow"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {view.friends ? (
        <Text style={styles.friendNote}>You are friends on BRO.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingHorizontal: SPACING.gutter,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    marginBottom: SPACING.spaceLg,
  },
  headerBtn: {
    padding: SPACING.spaceXs,
    minWidth: 36,
    minHeight: 36,
    justifyContent: "center",
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    flex: 1,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
  },
  displayName: {
    ...TYPOGRAPHY.headlineMD,
    color: COLORS.onSurface,
    flexShrink: 1,
  },
  username: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurfaceVariant,
  },
  presence: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.tertiaryContainer,
  },
  blockedBanner: {
    flexDirection: "row",
    gap: SPACING.spaceSm,
    alignItems: "flex-start",
    marginTop: SPACING.spaceLg,
    padding: SPACING.spaceMd,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.errorContainer,
  },
  blockedText: {
    ...TYPOGRAPHY.bodySM,
    flex: 1,
    color: COLORS.onErrorContainer,
  },
  bio: {
    ...TYPOGRAPHY.bodyLG,
    color: COLORS.onSurface,
    marginTop: SPACING.spaceLg,
  },
  bioMuted: {
    ...TYPOGRAPHY.bodyLG,
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.spaceLg,
  },
  interests: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.spaceXs,
    marginTop: SPACING.spaceMd,
  },
  interestChip: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  interestText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurfaceVariant,
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.spaceLg,
    paddingVertical: SPACING.spaceMd,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  statValue: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
  },
  statLabel: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurfaceVariant,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.spaceSm,
    marginTop: SPACING.spaceLg,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceXs,
    minHeight: 48,
    paddingHorizontal: SPACING.spaceMd,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryContainer,
  },
  primaryBtnText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceXs,
    minHeight: 48,
    paddingHorizontal: SPACING.spaceMd,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  secondaryBtnText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onSurface,
  },
  btnBusy: {
    opacity: 0.6,
  },
  friendNote: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.spaceMd,
    textAlign: "center",
  },
});
