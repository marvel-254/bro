import React, { useMemo } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { COLORS, SPACING, RADIUS } from "../../theme";

/** Skeleton shimmer animation */
const Shimmer: React.FC<{ opacity: number }> = ({ opacity }) => (
  <View style={[styles.shimmer, { opacity }]} />
);

/**
 * Basic skeleton loading state.
 *
 * Usage:
 * ```tsx
 * <Skeleton width={200} height={40} />
 * ```
 */
interface SkeletonProps {
  width: number;
  height: number;
  variant?: "circle" | "rect";
}

export function Skeleton({ width, height, variant = "rect" }: SkeletonProps) {
  return (
    <View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: variant === "circle" ? height / 2 : RADIUS.sm,
        },
      ]}
    >
      <Shimmer opacity={0.12} />
    </View>
  );
}

/**
 * Message list skeleton.
 *
 * Usage:
 * ```tsx
 * <MessageListSkeleton count={10} />
 * ```
 */
interface MessageListSkeletonProps {
  count?: number;
}

export function MessageListSkeleton({ count = 10 }: MessageListSkeletonProps) {
  const initial = useMemo(() => Array.from({ length: count }), [count]);

  return (
    <View>
      {initial.map((_, index) => (
        <View key={index} style={styles.messageRow}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonContent}>
            <View style={styles.skeletonText} />
            <View style={styles.skeletonTextShort} />
            <Skeleton width={80} height={20} />
          </View>
        </View>
      ))}
    </View>
  );
}

interface SkeletonStyles {
  skeleton: ViewStyle;
  shimmer: ViewStyle;
  skeletonAvatar: ViewStyle;
  skeletonContent: ViewStyle;
  skeletonText: ViewStyle;
  skeletonTextShort: ViewStyle;
  messageRow: ViewStyle;
}

const styles = StyleSheet.create<SkeletonStyles>({
  skeleton: {
    backgroundColor: COLORS.surfaceContainerHigh,
    overflow: "hidden",
  },
  shimmer: {
    width: "100%",
    height: "100%",
    // Note: animation requires react-native-reanimated or style animation
    // Using a placeholder style for now
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainerHigh,
    marginRight: SPACING.gutter,
  },
  skeletonContent: {
    flex: 1,
    flexDirection: "column",
    gap: SPACING.spaceSm,
  },
  skeletonText: {
    width: "100%",
    height: 16,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  skeletonTextShort: {
    width: "60%",
    height: 14,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: SPACING.margin,
  },
});