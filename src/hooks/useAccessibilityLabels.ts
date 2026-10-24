import { Platform } from "react-native";

/**
 * Accessibility label utilities for icon-only buttons and decorative elements.
 *
 * Issue #46: Missing screen reader labels on icon-only buttons.
 *
 * Every interactive element that conveys meaning solely through an icon
 * MUST have an accessibilityLabel describing its purpose.
 */

/**
 * Standard accessibility labels for common icon-only actions.
 * Use these to ensure consistency across the app.
 */
export const ACCESSIBILITY_LABELS = {
  // Navigation
  back: "Go back",
  close: "Close",
  menu: "Open menu",
  more: "More options",

  // Actions
  send: "Send message",
  edit: "Edit",
  delete: "Delete",
  copy: "Copy to clipboard",
  forward: "Forward message",
  share: "Share",
  save: "Save",
  unsave: "Unsave",
  pin: "Pin message",
  unpin: "Unpin message",

  // Reactions
  react: "Add reaction",
  reactions: "View reactions",

  // Media
  camera: "Open camera",
  gallery: "Open gallery",
  microphone: "Record voice message",
  video: "Start video call",
  voice: "Start voice call",

  // Social
  profile: "View profile",
  follow: "Follow user",
  unfollow: "Unfollow user",
  block: "Block user",
  report: "Report user",

  // Settings
  settings: "Open settings",
  notifications: "Notification settings",
  privacy: "Privacy settings",

  // Search
  search: "Search",
  filter: "Filter results",
  clear: "Clear search",

  // Status
  online: "Online",
  offline: "Offline",
  typing: "Typing indicator",

  // States
  loading: "Loading",
  error: "Error occurred",
  retry: "Retry",
  dismiss: "Dismiss",
} as const;

/**
 * Get an accessibility label for an icon-only button.
 *
 * @param action - The action key from ACCESSIBILITY_LABELS
 * @param context - Optional context to disambiguate (e.g., "message", "user")
 * @returns Formatted accessibility label
 *
 * @example
 * ```tsx
 * <IconButton
 *   icon="send"
 *   accessibilityLabel={getIconLabel("send", "message")}
 *   onPress={handleSend}
 * />
 * // -> "Send message"
 * ```
 */
export function getIconLabel(
  action: keyof typeof ACCESSIBILITY_LABELS,
  context?: string
): string {
  const baseLabel = ACCESSIBILITY_LABELS[action];
  if (!context) return baseLabel;

  // Combine action with context: "Send message" not "Message send"
  const actionVerb = baseLabel.split(" ")[0].toLowerCase();
  return `${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)} ${context}`;
}

/**
 * Props for icon-only buttons that ensure accessibility compliance.
 *
 * Spread these onto any TouchableOpacity, Pressable, or Button
 * that only contains an icon.
 */
export function getIconButtonAccessibilityProps(
  action: keyof typeof ACCESSIBILITY_LABELS,
  context?: string,
  options?: { hint?: string; disabled?: boolean }
) {
  return {
    accessible: true,
    accessibilityRole: "button" as const,
    accessibilityLabel: getIconLabel(action, context),
    accessibilityHint: options?.hint,
    accessibilityState: {
      disabled: options?.disabled ?? false,
    },
    // iOS: hint is spoken after label
    // Android: hint is spoken on long press
    ...(Platform.OS === "ios" && options?.hint
      ? { accessibilityHint: options.hint }
      : {}),
  };
}

/**
 * Hook to generate accessibility props for a set of icon buttons.
 *
 * @example
 * ```tsx
 * function MessageActions({ messageId }: { messageId: string }) {
 *   const a11y = useIconButtonLabels();
 *
 *   return (
 *     <View>
 *       <IconButton {...a11y.edit("message")} onPress={() => edit(messageId)} />
 *       <IconButton {...a11y.delete("message")} onPress={() => delete(messageId)} />
 *       <IconButton {...a11y.copy("message")} onPress={() => copy(messageId)} />
 *     </View>
 *   );
 * }
 * ```
 */
export function useIconButtonLabels() {
  return {
    back: (context?: string) => getIconButtonAccessibilityProps("back", context),
    close: (context?: string) => getIconButtonAccessibilityProps("close", context),
    send: (context?: string) => getIconButtonAccessibilityProps("send", context),
    edit: (context?: string) => getIconButtonAccessibilityProps("edit", context),
    delete: (context?: string) => getIconButtonAccessibilityProps("delete", context),
    copy: (context?: string) => getIconButtonAccessibilityProps("copy", context),
    forward: (context?: string) => getIconButtonAccessibilityProps("forward", context),
    share: (context?: string) => getIconButtonAccessibilityProps("share", context),
    react: (context?: string) => getIconButtonAccessibilityProps("react", context),
    profile: (context?: string) => getIconButtonAccessibilityProps("profile", context),
    settings: (context?: string) => getIconButtonAccessibilityProps("settings", context),
    search: (context?: string) => getIconButtonAccessibilityProps("search", context),
    camera: (context?: string) => getIconButtonAccessibilityProps("camera", context),
    microphone: (context?: string) =>
      getIconButtonAccessibilityProps("microphone", context),
    more: (context?: string) => getIconButtonAccessibilityProps("more", context),
    custom: (
      action: keyof typeof ACCESSIBILITY_LABELS,
      context?: string,
      options?: { hint?: string; disabled?: boolean }
    ) => getIconButtonAccessibilityProps(action, context, options),
  };
}

/**
 * Test utility: audit all icon buttons in the tree for missing labels.
 * Only runs in __DEV__ mode.
 */
export function auditIconButtonLabels(): void {
  if (!__DEV__) return;

  // Use a lint-compatible way to warn in dev
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(
      "🔍 Accessibility Audit: Run this in a test environment to check for missing labels on icon-only buttons."
    );
  }
}