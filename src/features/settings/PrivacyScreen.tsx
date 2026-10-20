import React, { useCallback } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
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
import { usePrivacy } from "../../lib/privacy-context";
import type { PrivacySettings } from "../../lib/privacy";
import { LoadingState } from "../../components/feedback/States";

/**
 * Privacy controls for presence, last-active, typing and read receipts.
 *
 * Each switch is independent on purpose: hiding "Active now" should not
 * silently disable read receipts, and every row says what the choice means so
 * "hidden" is not confused with "offline for everyone" or "messages stop".
 */

interface ToggleRow {
  key: keyof PrivacySettings;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TOGGLES: ToggleRow[] = [
  {
    key: "sharePresence",
    title: "Share active status",
    description:
      "When off, you appear offline in chats and People. You can still send and receive messages.",
    icon: "radio-outline",
  },
  {
    key: "shareLastActive",
    title: "Share last active time",
    description:
      "When off, BRO does not record or show the time you were last online.",
    icon: "time-outline",
  },
  {
    key: "shareTyping",
    title: "Share typing indicator",
    description:
      "When off, people never see “typing…” from you. Your messages still arrive normally.",
    icon: "ellipsis-horizontal-circle-outline",
  },
  {
    key: "shareReadReceipts",
    title: "Send read receipts",
    description:
      "When off, people cannot see that you read their messages. You also stop seeing theirs.",
    icon: "checkmark-done-outline",
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, loading, saving, update } = usePrivacy();

  const onToggle = useCallback(
    async (key: keyof PrivacySettings, value: boolean) => {
      const ok = await update({ [key]: value } as Partial<PrivacySettings>);
      if (!ok) {
        Alert.alert("Could not save", "Check your connection and try again.");
      }
    },
    [update],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.spaceSm }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy</Text>
      </View>

      {loading ? (
        <LoadingState message="Loading privacy settings..." />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + SPACING.spaceXl },
          ]}
        >
          <Text style={styles.intro}>
            Choose what other people can see. These settings apply everywhere
            on BRO, including group chats and message requests.
          </Text>

          {TOGGLES.map((toggle) => (
            <View key={toggle.key} style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons
                  name={toggle.icon}
                  size={20}
                  color={COLORS.surfaceTint}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{toggle.title}</Text>
                <Text style={styles.rowDescription}>{toggle.description}</Text>
              </View>
              <Switch
                value={settings[toggle.key]}
                onValueChange={(value) => void onToggle(toggle.key, value)}
                disabled={saving}
                trackColor={{
                  false: COLORS.surfaceContainerHighest,
                  true: COLORS.primaryContainer,
                }}
                thumbColor={
                  settings[toggle.key]
                    ? COLORS.onPrimary
                    : COLORS.onSurfaceVariant
                }
                accessibilityLabel={toggle.title}
                accessibilityHint={toggle.description}
              />
            </View>
          ))}

          <Text style={styles.footnote}>
            Hiding presence never stops message delivery, and blocking is
            managed from the person’s profile.
          </Text>
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
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceSm,
    paddingBottom: SPACING.spaceSm,
  },
  headerBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: SPACING.gutter,
    gap: SPACING.spaceSm,
  },
  intro: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurfaceVariant,
    marginBottom: SPACING.spaceSm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.spaceMd,
    padding: SPACING.spaceMd,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEMANTIC_COLORS.ghostBorderLight,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onSurface,
  },
  rowDescription: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
  },
  footnote: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.spaceLg,
    textAlign: "center",
  },
});
