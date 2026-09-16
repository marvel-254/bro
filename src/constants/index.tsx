export const APP_NAME = 'BRO';
export const APP_VERSION = '0.1.0';
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.bro.app';
export const DEEP_LINK_SCHEME = 'bro';
export const NAVIGATION = {
  TABS: {
    PULSE: 'pulse',
    PEOPLE: 'people',
    SPACES: 'spaces',
    YOU: 'you',
  },
} as const;
export const LAUNCH_OPTIONS = {
  SPLASH_SCREEN_TIMEOUT: 3000,
} as const;