import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";

type Props = {
  /** Page title, e.g. "Chats". Always present: this bar exists to name the page. */
  title: string;
  /** Optional second line, e.g. "Who's Around". */
  subtitle?: string;
  /** Leading slot, usually a back button or avatar. */
  left?: React.ReactNode;
  /** Trailing slot, usually icon buttons. */
  right?: React.ReactNode;
};

/**
 * The app bar that names the current page.
 *
 * Screens used to roll their own headers, so titles were inconsistent and the
 * Pulse screen had none at all. One shared bar keeps every page's title in the
 * same place, at the same height, with the same type scale.
 */
export default function AppBar({ title, subtitle, left, right }: Props) {
  // The bar is the topmost thing on the page, so it has to clear the status
  // bar itself rather than relying on an enclosing SafeAreaView.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + SPACING.spaceSm }]}>
      {left ? <View style={styles.side}>{left}</View> : null}
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={[styles.side, styles.sideRight]}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 68,
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceMd,
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.semantic.ghostBorderLight,
    borderTopLeftRadius: RADIUS.sm,
    borderTopRightRadius: RADIUS.sm,
  },
  titles: {
    flex: 1,
  },
  title: {
    ...TYPOGRAPHY.headlineMD,
    color: COLORS.semantic.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textSecondary,
    marginTop: 2,
  },
  side: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
  },
  sideRight: {
    justifyContent: "flex-end",
  },
});
