import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Chat appearance preferences, stored locally on the device.
 *
 * These are purely cosmetic choices — a bubble shape, bubble colours and an
 * optional background image — so they live in AsyncStorage rather than the
 * backend: nothing to sync, nothing to validate, nothing anyone else can
 * influence.
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

/**
 * The bubble colour palette. Every entry is a mid-to-deep tone so that
 * readableTextOn() can always pick a high-contrast text colour for it.
 * "null" means "use the theme default".
 */
export const BUBBLE_COLORS: ReadonlyArray<{
  id: string;
  label: string;
  value: string | null;
}> = [
  { id: "default", label: "Default", value: null },
  { id: "sky", label: "Sky", value: "#0EA5E9" },
  { id: "blue", label: "Blue", value: "#3B82F6" },
  { id: "indigo", label: "Indigo", value: "#4F46E5" },
  { id: "violet", label: "Violet", value: "#7C3AED" },
  { id: "pink", label: "Pink", value: "#EC4899" },
  { id: "rose", label: "Rose", value: "#F43F5E" },
  { id: "red", label: "Red", value: "#EF4444" },
  { id: "orange", label: "Orange", value: "#F97316" },
  { id: "amber", label: "Amber", value: "#F59E0B" },
  { id: "lime", label: "Lime", value: "#84CC16" },
  { id: "emerald", label: "Emerald", value: "#10B981" },
  { id: "teal", label: "Teal", value: "#14B8A6" },
  { id: "cyan", label: "Cyan", value: "#06B6D4" },
  { id: "slate", label: "Slate", value: "#475569" },
  { id: "graphite", label: "Graphite", value: "#1F2937" },
];

export const STORAGE_KEY_APPEARANCE = "@bro:chat_appearance";

export interface ChatAppearance {
  bubbleTheme: BubbleTheme;
  /** Local file URI of a chosen background image, or null for none. */
  backgroundUri: string | null;
  /** Bubble colour for your own messages; null = theme default. */
  mineColor: string | null;
  /** Bubble colour for other people's messages; null = theme default. */
  theirsColor: string | null;
}

export const DEFAULT_APPEARANCE: ChatAppearance = {
  bubbleTheme: "default",
  backgroundUri: null,
  mineColor: null,
  theirsColor: null,
};

function isBubbleTheme(value: unknown): value is BubbleTheme {
  return (
    value === "default" || value === "rounded" || value === "teardrop"
  );
}

function asColorOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Only accept colours from our own palette; anything else (a stray blob,
  // an old build's value) falls back to the theme default.
  return BUBBLE_COLORS.some((color) => color.value === value)
    ? value
    : null;
}

/**
 * Relative luminance of a #RRGGBB colour, 0 (black) to 1 (white).
 * Pure so it can be unit tested.
 */
export function colorLuminance(hex: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return 0;
  const int = parseInt(match[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map(
    (channel) => {
      const srgb = channel / 255;
      return srgb <= 0.03928
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
    },
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Pick a readable text colour for a bubble background. The threshold is the
 * luminance where dark-on-light and light-on-dark contrast cross over, so
 * every palette swatch lands on the higher-contrast pairing (≥4.5:1).
 */
export function readableTextOn(hex: string): string {
  return colorLuminance(hex) > 0.18 ? "#101318" : "#F5F7FA";
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
      mineColor: asColorOrNull(obj.mineColor),
      theirsColor: asColorOrNull(obj.theirsColor),
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
