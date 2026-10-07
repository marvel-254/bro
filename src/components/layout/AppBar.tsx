import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
  return (
    <View style={styles.bar}>
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
    minHeight: 56,
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceSm,
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
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.semantic.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textSecondary,
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
