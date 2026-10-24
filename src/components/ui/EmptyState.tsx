import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { COLORS, SPACING, TYPOGRAPHY } from "../../theme";
import { Ionicons } from "@expo/vector-icons";

interface EmptyStateProps {
  title: string;
  description: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: {
    label: string;
    onPress: () => void;
  };
  variant?: "minimal" | "feature";
}

/**
 * Consistent empty state component.
 *
 * Usage:
 * ```tsx
 * <EmptyState
 *   title="No conversations"
 *   description="Start a new chat"
 *   icon="chatbubble-ellipses-outline"
 *   action={{ label: "New Chat", onPress: () => navigation.push('new-chat') }}
 * />
 * ```
 */
export function EmptyState({
  title,
  description,
  icon = "help-circle-outline",
  action,
  variant = "minimal",
}: EmptyStateProps) {
  return (
    <View style={[styles.container, styles[`${variant}Container` as keyof typeof styles]]}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={48} color={COLORS.primary} />
      </View>

      <Text style={[styles.title, styles[`${variant}Title` as keyof typeof styles]]}>{title}</Text>

      {description && <Text style={styles.description}>{description}</Text>}

      {action && (
        <Pressable
          style={styles.action}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  minimalContainer: {
    // Minimal variation - more focus on content
  },
  featureContainer: {
    // Feature variation - slightly taller
    paddingVertical: SPACING.xxxl,
  },
  iconContainer: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.headlineLG,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  minimalTitle: {
    ...TYPOGRAPHY.headlineMD,
  },
  featureTitle: {
    ...TYPOGRAPHY.headlineXLMobile,
  },
  description: {
    ...TYPOGRAPHY.bodyLG,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  action: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  actionText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.primary,
    fontWeight: "600",
  },
});