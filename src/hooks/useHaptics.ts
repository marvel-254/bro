import { Platform } from "react-native";

/**
 * Haptic feedback patterns for interactive elements.
 *
 * Uses platform-native APIs where available. On Android, uses
 * `react-native-haptic-feedback` patterns; on iOS, uses the
 * built-in `UIFeedbackGenerator` via the `react-native` bridge.
 *
 * This is a lightweight wrapper that gracefully degrades if
 * haptics are unavailable (e.g., simulator, web).
 */

type HapticPattern =
  | "light"
  | "medium"
  | "heavy"
  | "selection"
  | "success"
  | "warning"
  | "error";

const ANDROID_PATTERNS: Record<HapticPattern, string> = {
  light: "KEYBOARD_TAP",
  medium: "KEYBOARD_PRESS",
  heavy: "LONG_PRESS",
  selection: "SELECTION",
  success: "SUCCESS",
  warning: "WARNING",
  error: "ERROR",
};

let HapticFeedback: {
  trigger: (pattern: string, options?: { enableVibration: boolean }) => void;
} | null = null;

// Use dynamic import to avoid require() style
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  import("react-native-haptic-feedback")
    .then((module) => {
      HapticFeedback = module.default ?? module;
    })
    .catch(() => {
      // Optional dependency not installed; haptics will no-op
    });
}

function triggerAndroid(pattern: HapticPattern): void {
  if (HapticFeedback && Platform.OS === "android") {
    try {
      HapticFeedback.trigger(ANDROID_PATTERNS[pattern], { enableVibration: true });
    } catch {
      // Silently ignore haptic failures
    }
  }
}

function triggerIOS(pattern: HapticPattern): void {
  if (Platform.OS === "ios") {
    try {
      // iOS haptics via UIFeedbackGenerator
      // Using the native bridge through react-native's internal APIs
      const { NativeModules } = await import("react-native");
      if (NativeModules?.Haptics) {
        NativeModules.Haptics.trigger(pattern);
      }
    } catch {
      // Silently ignore
    }
  }
}

/**
 * Trigger a haptic feedback pattern.
 *
 * @param pattern - The haptic pattern to trigger
 * @example
 * ```tsx
 * import { useHaptics } from "@/hooks/useHaptics";
 *
 * function MyButton() {
 *   const haptics = useHaptics();
 *   return <Pressable onPress={() => haptics.trigger("light")} />;
 * }
 * ```
 */
export function useHaptics() {
  const trigger = (pattern: HapticPattern) => {
    if (Platform.OS === "android") {
      triggerAndroid(pattern);
    } else if (Platform.OS === "ios") {
      triggerIOS(pattern);
    }
  };

  return { trigger };
}

/**
 * Convenience hook for common interaction patterns.
 */
export function useInteractionHaptics() {
  const { trigger } = useHaptics();

  return {
    press: () => trigger("light"),
    longPress: () => trigger("medium"),
    selection: () => trigger("selection"),
    success: () => trigger("success"),
    warning: () => trigger("warning"),
    error: () => trigger("error"),
  };
}