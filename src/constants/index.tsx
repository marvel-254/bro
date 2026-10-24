export const APP_NAME = "BRO";
export const APP_VERSION = "0.1.0";
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "https://api.bro.app";
export const DEEP_LINK_SCHEME = "bro";
export const NAVIGATION = {
  TABS: {
    PULSE: "pulse",
    PEOPLE: "people",
    SPACES: "spaces",
    YOU: "you",
  },
} as const;
export const LAUNCH_OPTIONS = {
  SPLASH_SCREEN_TIMEOUT: 3000,
} as const;

/**
 * Time window (in milliseconds) during which a sender may unsend a message.
 * After this, the sender can no longer delete for everyone.
 */
export const UNSEND_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Time (in milliseconds) within which we show a live "unsend" countdown
 * next to the sender's own messages.
 */
export const UNSEND_HINT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
