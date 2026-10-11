import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Chat appearance preferences, stored locally on the device.
 *
 * These are purely cosmetic choices — a bubble shape and an optional
 * background image — so they live in AsyncStorage rather than the backend:
 * nothing to sync, nothing to validate, nothing anyone else can influence.
 */

export type BubbleTheme = "default" | "rounded" | "teardrop";

export const BUBBLE_THEMES: ReadonlyArray<{
  id: BubbleTheme;
  label: string;
  hint: string;
}> = [
  { id: "default", label: "BRO", hint: "Asymmetric tail on your side" },
  { id: "rounded", label: "Soft", hint: "Fully rounded bubbles" },
  { id: "teardrop", label: "Teardrop", hint: "One sharp corner per side" },
];

export const STORAGE_KEY_APPEARANCE = "@bro:chat_appearance";

export interface ChatAppearance {
  bubbleTheme: BubbleTheme;
  /** Local file URI of a chosen background image, or null for none. */
  backgroundUri: string | null;
}

export const DEFAULT_APPEARANCE: ChatAppearance = {
  bubbleTheme: "default",
  backgroundUri: null,
};

function isBubbleTheme(value: unknown): value is BubbleTheme {
  return (
    value === "default" || value === "rounded" || value === "teardrop"
  );
}

/** Parse a stored JSON blob, tolerating anything an old build may have left. */
export function parseAppearance(raw: string | null): ChatAppearance {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_APPEARANCE;
    }
    const obj = parsed as Record<string, unknown>;
    return {
      bubbleTheme: isBubbleTheme(obj.bubbleTheme)
        ? obj.bubbleTheme
        : DEFAULT_APPEARANCE.bubbleTheme,
      backgroundUri:
        typeof obj.backgroundUri === "string" && obj.backgroundUri.length > 0
          ? obj.backgroundUri
          : null,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export async function loadAppearance(): Promise<ChatAppearance> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_APPEARANCE);
    return parseAppearance(raw);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export async function saveAppearance(
  appearance: ChatAppearance,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY_APPEARANCE,
    JSON.stringify(appearance),
  );
}
