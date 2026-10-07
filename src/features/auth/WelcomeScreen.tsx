import { useEffect } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { useAuth } from "../../lib/auth-context";
import { useInvites } from "../../lib/invite-context";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import AmbientBackdrop from "./components/AmbientBackdrop";
import BrandMark from "./components/BrandMark";

/**
 * First run.
 *
 * Copy is the locked Welcome lines from `docs/research/bro-voice-guide.md`
 * (1-4) rather than the generic register this screen used to carry, plus the
 * one honest architecture line from `docs/research/welcome-bros-me.md`.
 *
 * Two things were removed on purpose rather than restyled:
 *   * the fabricated telemetry ("98.4k ONLINE") — the project's own design
 *     rules ban fake stats, and handoff.md records the same numbers being
 *     deleted from the Me tab for the same reason;
 *   * "Secured via decentralized node mesh", which is false: this app runs on
 *     a hosted Postgres. A claim about where your data lives is the last place
 *     to be aspirational.
 */

const WORDMARK = "#EAFBFF";
const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

/** Mirrors package.json. Hardcoded because expo-constants is not a dependency. */
const APP_VERSION = "0.1.0";

/** One shared entrance, staggered by section. */
function useIntro(delay: number) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    progress.value = reduced
      ? 1
      : withDelay(
          delay,
          withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }),
        );
  }, [delay, progress, reduced]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 18 }],
  }));
}

export default function WelcomeScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pendingInvite, setPendingInvite, clearInvite } = useInvites();
  const router = useRouter();

  const primaryScale = useSharedValue(1);
  const secondaryScale = useSharedValue(1);

  const heroIntro = useIntro(60);
  const copyIntro = useIntro(180);
  const actionsIntro = useIntro(320);
  const footIntro = useIntro(460);

  const primaryStyle = useAnimatedStyle(() => ({
    transform: [{ scale: primaryScale.value }],
  }));
  const secondaryStyle = useAnimatedStyle(() => ({
    transform: [{ scale: secondaryScale.value }],
  }));

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, router]);

  /**
   * Manual invite trigger, kept from the old screen for testing without an
   * external intent — but only in development builds, so a shipped app never
   * offers a button that fabricates an invitation out of nothing.
   */
  const simulateInvite = () => {
    setPendingInvite({
      code: "MESH-7701",
      inviterName: "Sarah",
      spaceName: "Neural Nexus",
      spaceId: "neural-nexus",
      targetType: "space",
      timestamp: Date.now(),
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <AmbientBackdrop />
        <BrandMark size={140} />
        <Text style={styles.loadingText}>starting up</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AmbientBackdrop />

      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.topBar}>
            <Text style={styles.buildChip}>
              v{APP_VERSION} · ANDROID
            </Text>
          </View>

          {pendingInvite ? (
            <Animated.View style={[styles.inviteCard, copyIntro]}>
              <LinearGradient
                colors={["rgba(0,240,255,0.5)", "rgba(0,240,255,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.inviteRule}
              />

              <View style={styles.inviteHeader}>
                <Text style={styles.inviteEyebrow}>INVITE</Text>
                <Pressable
                  onPress={clearInvite}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss invite"
                >
                  <Ionicons
                    name="close"
                    size={16}
                    color={COLORS.semantic.textDim}
                  />
                </Pressable>
              </View>

              <Text style={styles.inviteLine}>
                yoh bruv —{" "}
                <Text style={styles.inviteName}>
                  {pendingInvite.inviterName ?? "a bro"}
                </Text>
                {" "}says pull up
              </Text>
              <Text style={styles.inviteTarget}>
                {pendingInvite.spaceName ?? "the BRO network"}
              </Text>

              <View style={styles.inviteFooter}>
                <Text style={styles.inviteCode}>
                  {pendingInvite.code ?? "NO CODE"}
                </Text>
                <Pressable
                  onPress={() => router.push("/(auth)/sign-up")}
                  accessibilityRole="button"
                  accessibilityLabel="Accept invite and claim your spot"
                  style={({ pressed }) => [
                    styles.inviteButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.inviteButtonText}>Tap in</Text>
                  <Ionicons name="arrow-forward" size={13} color="#00363A" />
                </Pressable>
              </View>
            </Animated.View>
          ) : null}

          <Animated.View style={[styles.hero, heroIntro]}>
            <BrandMark size={230} />
            <View style={styles.mottoRow}>
              <Text style={styles.motto}>TALK</Text>
              <View style={styles.mottoRule} />
              <Text style={styles.motto}>CONNECT</Text>
              <View style={styles.mottoRule} />
              <Text style={styles.motto}>EXIST</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.copy, copyIntro]}>
            <Text style={styles.headline}>Yoh. Tsup bruv?</Text>
            <Text style={styles.subtitle}>
              Uko wapi msee? Your people are already inside. Pull up.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.actions, actionsIntro]}>
            <Pressable
              onPressIn={() => {
                primaryScale.value = withTiming(0.975, { duration: 110 });
              }}
              onPressOut={() => {
                primaryScale.value = withTiming(1, { duration: 160 });
              }}
              onPress={() => router.push("/(auth)/sign-up")}
              accessibilityRole="button"
              accessibilityLabel="Claim your spot — create an account"
            >
              <Animated.View style={[styles.primaryWrap, primaryStyle]}>
                <LinearGradient
                  colors={["#7DF4FF", COLORS.primaryContainer, "#00C9DA"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryButton}
                >
                  {/* Specular edge: what a real surface does under light. */}
                  <LinearGradient
                    colors={["rgba(255,255,255,0.55)", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.primarySheen}
                  />
                  <Text style={styles.primaryText}>Claim your spot</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={COLORS.onPrimary}
                    style={styles.primaryIcon}
                  />
                </LinearGradient>
              </Animated.View>
            </Pressable>

            <View style={styles.secondaryRow}>
              <Text style={styles.secondaryPrompt}>already one of us?</Text>
              <Pressable
                onPressIn={() => {
                  secondaryScale.value = withTiming(0.975, { duration: 110 });
                }}
                onPressOut={() => {
                  secondaryScale.value = withTiming(1, { duration: 160 });
                }}
                onPress={() => router.push("/(auth)/sign-in")}
                accessibilityRole="button"
                accessibilityLabel="Already have an account — sign in"
              >
                <Animated.View style={[styles.secondaryButton, secondaryStyle]}>
                  <Ionicons
                    name="key-outline"
                    size={16}
                    color={WORDMARK}
                    style={styles.secondaryIcon}
                  />
                  <Text style={styles.secondaryText}>slide in</Text>
                </Animated.View>
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View style={[styles.footer, footIntro]}>
            <Text style={styles.promise}>no ads tbh. just talk fr.</Text>
            <Text style={styles.footnote}>
              Open-source · No tracking · Built for Android
            </Text>

            {__DEV__ ? (
              <Pressable
                onPress={simulateInvite}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Simulate an incoming invite"
              >
                <Text style={styles.devTrigger}>dev · simulate invite</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  safeArea: {
    flex: 1,
  },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceLg,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  loadingText: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: COLORS.semantic.textDim,
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: SPACING.margin,
    paddingTop: SPACING.spaceSm,
    paddingBottom: SPACING.spaceLg,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  buildChip: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1.6,
    color: COLORS.semantic.textDim,
  },
  hero: {
    alignItems: "center",
    marginTop: SPACING.spaceXl,
  },
  mottoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    marginTop: SPACING.spaceLg,
  },
  motto: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 3,
    color: COLORS.semantic.textSecondary,
  },
  mottoRule: {
    width: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.semantic.ghostBorderLight,
  },
  copy: {
    alignItems: "center",
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.spaceSm,
    marginTop: SPACING.spaceXl,
  },
  headline: {
    ...TYPOGRAPHY.headlineXL,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -1.3,
    color: COLORS.semantic.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    ...TYPOGRAPHY.bodyLG,
    color: COLORS.semantic.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
  actions: {
    marginTop: SPACING.spaceXl,
    gap: SPACING.spaceMd,
  },
  primaryWrap: {
    borderRadius: RADIUS.full,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 26,
    elevation: 8,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },
  primarySheen: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 1,
  },
  primaryText: {
    ...TYPOGRAPHY.labelLG,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: COLORS.onPrimary,
  },
  primaryIcon: {
    marginLeft: SPACING.spaceSm,
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceSm,
  },
  secondaryPrompt: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textDim,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    paddingHorizontal: SPACING.spaceLg,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(22,27,38,0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryIcon: {
    marginRight: SPACING.spaceSm,
  },
  secondaryText: {
    ...TYPOGRAPHY.labelMD,
    fontWeight: "700",
    letterSpacing: 1,
    color: WORDMARK,
  },
  pressed: {
    opacity: 0.85,
  },
  footer: {
    alignItems: "center",
    gap: SPACING.spaceSm,
    marginTop: SPACING.spaceXl,
  },
  promise: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textSecondary,
  },
  footnote: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 0.6,
    color: COLORS.semantic.textDim,
  },
  devTrigger: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.outlineVariant,
    marginTop: SPACING.spaceSm,
  },
  inviteCard: {
    marginTop: SPACING.spaceMd,
    padding: SPACING.gutter,
    borderRadius: RADIUS.DEFAULT,
    backgroundColor: "rgba(14,17,24,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
    overflow: "hidden",
    gap: SPACING.spaceXs,
  },
  inviteRule: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 1,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inviteEyebrow: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.primaryContainer,
  },
  inviteLine: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textSecondary,
  },
  inviteName: {
    color: WORDMARK,
    fontWeight: "700",
  },
  inviteTarget: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.semantic.textPrimary,
  },
  inviteFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.spaceSm,
  },
  inviteCode: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1.2,
    color: COLORS.semantic.textDim,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
    paddingHorizontal: SPACING.spaceMd,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
  },
  inviteButtonText: {
    ...TYPOGRAPHY.labelMD,
    fontWeight: "800",
    color: COLORS.onPrimary,
  },
});
