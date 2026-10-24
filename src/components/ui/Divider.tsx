import React from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { SPACING } from "../../theme";

interface DividerProps {
  /** Visual weight of the divider */
  weight?: "hairline" | "thin" | "medium";
  /** Whether the divider spans full width or is inset */
  inset?: "none" | "start" | "end" | "both";
  /** Custom color override */
  color?: string;
  /** Custom style */
  style?: ViewStyle;
}

/**
 * Consistent divider component.
 *
 * Replaces inconsistent border styles across lists.
 *
 * Usage:
 * ```tsx
 * <Divider weight="hairline" inset="start" />
 * <Divider weight="thin" inset="none" />
 * ```
 */
export function Divider({
  weight = "hairline",
  inset = "none",
  color,
  style,
}: DividerProps) {
  const insetKey = `inset${inset.charAt(0).toUpperCase() + inset.slice(1)}` as keyof typeof styles;

  return (
    <View
      style={[
        styles.divider,
        styles[weight],
        styles[insetKey],
        color && { backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    width: "100%",
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
  thin: {
    height: 1,
  },
  medium: {
    height: 2,
  },
  insetNone: {},
  insetStart: {
    marginLeft: SPACING.gutter,
  },
  insetEnd: {
    marginRight: SPACING.gutter,
  },
  insetBoth: {
    marginHorizontal: SPACING.gutter,
  },
});