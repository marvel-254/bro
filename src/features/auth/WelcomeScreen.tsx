import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { COLORS, SPACING, RADIUS } from "../../theme";
import { useAuth } from "../../lib/auth-context";
import { useInvites } from "../../lib/invite-context";
import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function WelcomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pendingInvite, setPendingInvite, clearInvite } = useInvites();
  const router = useRouter();

  // Subtle breathing pulse animation for the ambient core glow
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);

  // Micro-interaction scaling for buttons
  const primaryScale = useSharedValue(1);
  const secondaryScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.65, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulseScale, pulseOpacity]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const primaryAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: primaryScale.value }],
  }));

  const secondaryAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: secondaryScale.value }],
  }));

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const handleSimulateInvite = () => {
    setPendingInvite({
      code: "MESH-7701",
      inviterName: "Sarah",
      spaceName: "Neural Nexus",
      spaceId: "neural-nexus",
      targetType: "space",
      timestamp: Date.now(),
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Top Status / Network Connectivity Beacon */}
        <View style={styles.topBar}>
          <Pressable
            style={styles.statusBadge}
            onPress={handleSimulateInvite}
            accessibilityHint="Tap to simulate invite reception"
          >
            <View style={styles.statusDotWrapper}>
              <View style={styles.statusDotGlow} />
              <View style={styles.statusDot} />
            </View>
            <Text style={styles.statusText}>MESH SYNCHRONIZED</Text>
          </Pressable>

          <View style={styles.liveBadge}>
            <Ionicons
              name="radio-outline"
              size={12}
              color={COLORS.primaryContainer}
              style={styles.liveIcon}
            />
            <Text style={styles.liveText}>98.4k ONLINE</Text>
          </View>
        </View>

        {/* Incoming Transmission Holographic Card (Deep Link / Invite Awareness) */}
        {pendingInvite ? (
          <View style={styles.inviteCard}>
            <View style={styles.inviteCardHeader}>
              <View style={styles.inviteCardBeacon}>
                <View style={styles.invitePulseDot} />
                <Text style={styles.inviteCardBadgeText}>
                  INCOMING TRANSMISSION DETECTED
                </Text>
              </View>
              <Pressable onPress={() => clearInvite()} hitSlop={10}>
                <Ionicons name="close" size={16} color={COLORS.outline} />
              </Pressable>
            </View>

            <View style={styles.inviteBody}>
              <View style={styles.invitePlanetBox}>
                <Ionicons
                  name="planet"
                  size={24}
                  color={COLORS.primaryContainer}
                />
              </View>
              <View style={styles.inviteTextWrapper}>
                <Text style={styles.inviteTitle}>
                  {pendingInvite.inviterName ? (
                    <Text style={styles.inviteHighlight}>
                      {pendingInvite.inviterName}{" "}
                    </Text>
                  ) : (
                    "A node operator "
                  )}
                  invited you to enter
                </Text>
                <Text style={styles.inviteTargetName}>
                  {pendingInvite.spaceName || "the BRO communication network"}
                </Text>
              </View>
            </View>

            <View style={styles.inviteFooter}>
              <View style={styles.tokenPill}>
                <Text style={styles.tokenPillText}>
                  Invite from {pendingInvite.inviterName ?? "a bro"}
                </Text>
              </View>
              <Pressable
                style={styles.acceptInviteBtn}
                onPress={() => router.push("/(auth)/sign-up")}
              >
                <Text style={styles.acceptInviteText}>ACCEPT TRANSMISSION</Text>
                <Ionicons name="arrow-forward" size={12} color="#00363a" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Center Stage: Ambient Glow & Brand Emblem */}
        <View style={styles.heroSection}>
          <View style={styles.ambientWrapper}>
            <Animated.View style={[styles.ambientGlow, animatedGlowStyle]} />
            <View style={styles.outerRing} />
            <View style={styles.innerRing} />

            {/* Geometric Brand Emblem */}
            <View style={styles.emblemBox}>
              <Text style={styles.emblemText}>BRO</Text>
            </View>
          </View>

          {/* Tagline Motto Pill */}
          <View style={styles.mottoPill}>
            <Text style={styles.mottoPrimary}>TALK</Text>
            <View style={styles.mottoDot} />
            <Text style={styles.mottoSecondary}>CONNECT</Text>
            <View style={styles.mottoDot} />
            <Text style={styles.mottoTertiary}>EXIST</Text>
          </View>
        </View>

        {/* Polished Typography Deck */}
        <View style={styles.copySection}>
          <Text style={styles.headline}>
            Communication,
            {"\n"}
            <Text style={styles.headlineAccent}>reimagined.</Text>
          </Text>
          <Text style={styles.subtitle}>
            A living communication environment for active conversations,
            branches, and spaces.
          </Text>
        </View>

        {/* Glowing Action Buttons Deck */}
        <View style={styles.actionsDeck}>
          {/* Primary Glowing Action Button */}
          <Pressable
            onPressIn={() => {
              primaryScale.value = withTiming(0.97, { duration: 100 });
            }}
            onPressOut={() => {
              primaryScale.value = withTiming(1, { duration: 150 });
            }}
            onPress={() => router.push("/(auth)/sign-up")}
          >
            <Animated.View style={[styles.primaryBtn, primaryAnimatedStyle]}>
              <Text style={styles.primaryBtnText}>Create Account</Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color={COLORS.onPrimary}
                style={styles.btnIcon}
              />
            </Animated.View>
          </Pressable>

          {/* Secondary Glassmorphic Button */}
          <Pressable
            onPressIn={() => {
              secondaryScale.value = withTiming(0.97, { duration: 100 });
            }}
            onPressOut={() => {
              secondaryScale.value = withTiming(1, { duration: 150 });
            }}
            onPress={() => router.push("/(auth)/sign-in")}
          >
            <Animated.View
              style={[styles.secondaryBtn, secondaryAnimatedStyle]}
            >
              <Ionicons
                name="key-outline"
                size={17}
                color={COLORS.onSurfaceVariant}
                style={styles.btnIconLeft}
              />
              <Text style={styles.secondaryBtnText}>Sign In</Text>
            </Animated.View>
          </Pressable>

          {/* Protocol Security Footnote */}
          <View style={styles.footnote}>
            <Ionicons
              name="shield-checkmark-outline"
              size={13}
              color={COLORS.semantic.textDim}
            />
            <Text style={styles.footnoteText}>
              Secured via decentralized node mesh • v0.1.0
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.semantic.textSecondary,
    letterSpacing: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceMd,
    paddingBottom: SPACING.spaceLg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(25, 27, 35, 0.85)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  statusDotWrapper: {
    width: 10,
    height: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 7,
  },
  statusDotGlow: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.tertiaryContainer,
    opacity: 0.4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.tertiaryContainer,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.onSurfaceVariant,
    letterSpacing: 1.2,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(25, 27, 35, 0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  liveIcon: {
    marginRight: 5,
  },
  liveText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.5,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: SPACING.spaceLg,
  },
  ambientWrapper: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ambientGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(0, 240, 255, 0.16)",
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
  },
  outerRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(0, 240, 255, 0.08)",
    borderStyle: "dashed",
  },
  innerRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: "rgba(222, 183, 255, 0.12)",
  },
  emblemBox: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "rgba(29, 32, 39, 0.85)",
    borderWidth: 1.5,
    borderColor: "rgba(0, 240, 255, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  emblemText: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.primaryContainer,
    letterSpacing: 4,
  },
  mottoPill: {
    marginTop: SPACING.spaceLg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(25, 27, 35, 0.8)",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  mottoPrimary: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primaryContainer,
    letterSpacing: 2,
  },
  mottoSecondary: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.secondary,
    letterSpacing: 2,
  },
  mottoTertiary: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.onSurface,
    letterSpacing: 2,
  },
  mottoDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginHorizontal: 10,
  },
  copySection: {
    alignItems: "center",
    paddingHorizontal: SPACING.spaceSm,
    marginVertical: SPACING.spaceMd,
  },
  headline: {
    fontSize: 34,
    fontWeight: "800",
    color: COLORS.semantic.textPrimary,
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 42,
  },
  headlineAccent: {
    color: COLORS.primaryContainer,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "400",
    color: COLORS.semantic.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  actionsDeck: {
    width: "100%",
    gap: 12,
    marginTop: SPACING.spaceMd,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 22,
    elevation: 8,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.onPrimary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  btnIcon: {
    marginLeft: 8,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(29, 32, 39, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.onSurface,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  btnIconLeft: {
    marginRight: 8,
  },
  footnote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    gap: 6,
  },
  footnoteText: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.semantic.textDim,
    letterSpacing: 0.3,
  },
  inviteCard: {
    marginTop: SPACING.spaceMd,
    backgroundColor: "rgba(16, 23, 34, 0.95)",
    borderRadius: RADIUS.DEFAULT,
    borderWidth: 1,
    borderColor: "rgba(0, 240, 255, 0.35)",
    padding: 14,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  inviteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  inviteCardBeacon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  invitePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.tertiaryContainer,
  },
  inviteCardBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.primaryContainer,
    letterSpacing: 1.5,
  },
  inviteBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  invitePlanetBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(0, 240, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 240, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteTextWrapper: {
    flex: 1,
  },
  inviteTitle: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  inviteHighlight: {
    fontWeight: "700",
    color: COLORS.primaryContainer,
  },
  inviteTargetName: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.semantic.textPrimary,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  inviteFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  tokenPill: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tokenPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.semantic.textDim,
    letterSpacing: 0.8,
  },
  acceptInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    gap: 4,
  },
  acceptInviteText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#00363a",
    letterSpacing: 0.8,
  },
});
