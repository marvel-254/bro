import React, { useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from "../../theme";
import { Ionicons } from "@expo/vector-icons";

/**
 * BottomSheet component.
 *
 * Replaces the Alert.alert pattern with a proper, accessible bottom sheet.
 * Supports title, description, custom content, and action items.
 *
 * Usage:
 * ```tsx
 * <BottomSheet
 *   visible={isVisible}
 *   onClose={handleClose}
 *   title="Message actions"
 * >
 *   <Text>Custom content here</Text>
 * </BottomSheet>
 * ```
 */

interface BottomSheetAction {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  actions?: BottomSheetAction[];
  children?: React.ReactNode;
  /** Whether tapping the backdrop closes the sheet. Default true. */
  dismissOnBackdropPress?: boolean;
  /** Maximum height as a fraction of screen height. Default 0.6. */
  maxHeightRatio?: number;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  description,
  actions,
  children,
  dismissOnBackdropPress = true,
  maxHeightRatio = 0.6,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = React.useRef(new Animated.Value(Dimensions.get("window").height)).current;

  const animateIn = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 8,
    }).start();
  }, [translateY]);

  const animateOut = useCallback(
    (callback?: () => void) => {
      Animated.timing(translateY, {
        toValue: Dimensions.get("window").height,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        callback?.();
      });
    },
    [translateY]
  );

  useEffect(() => {
    if (visible) {
      animateIn();
    } else {
      translateY.setValue(Dimensions.get("window").height);
    }
  }, [visible, animateIn, translateY]);

  const handleClose = () => {
    animateOut(onClose);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (dismissOnBackdropPress) handleClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => dismissOnBackdropPress && handleClose()}
          accessible={false}
        />

        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY }],
              maxHeight: Dimensions.get("window").height * maxHeightRatio,
              paddingBottom: insets.bottom + SPACING.lg,
            },
          ]}
          accessibilityRole="alert"
          accessibilityLabel={title}
        >
          {/* Grab handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {title && <Text style={styles.title}>{title}</Text>}
          {description && <Text style={styles.description}>{description}</Text>}

          {children}

          {actions && (
            <ScrollView style={styles.actionsContainer} bounces={false}>
              {actions.map((action, index) => (
                <Pressable
                  key={`${action.label}-${index}`}
                  style={({ pressed }) => [
                    styles.actionRow,
                    pressed && styles.actionPressed,
                  ]}
                  onPress={() => {
                    action.onPress();
                    handleClose();
                  }}
                  disabled={action.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityState={{ disabled: action.disabled }}
                >
                  {action.icon && (
                    <Ionicons
                      name={action.icon}
                      size={20}
                      color={getActionColor(action.variant)}
                      style={styles.actionIcon}
                    />
                  )}
                  <Text
                    style={[
                      styles.actionLabel,
                      { color: getActionColor(action.variant) },
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function getActionColor(variant?: "default" | "primary" | "danger"): string {
  switch (variant) {
    case "primary":
      return COLORS.primary;
    case "danger":
      return COLORS.error;
    default:
      return COLORS.onSurface;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  backdropContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.spaceSm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: SPACING.spaceSm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outline,
    opacity: 0.5,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.textPrimary,
    marginBottom: SPACING.spaceSm,
  },
  description: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  actionsContainer: {
    marginTop: SPACING.spaceSm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.spaceMd,
    paddingHorizontal: SPACING.gutter,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.spaceXs,
  },
  actionPressed: {
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  actionIcon: {
    marginRight: SPACING.md,
  },
  actionLabel: {
    ...TYPOGRAPHY.labelLG,
    flex: 1,
  },
});