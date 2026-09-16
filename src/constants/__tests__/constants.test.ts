import { APP_NAME, APP_VERSION, NAVIGATION, LAUNCH_OPTIONS } from '../index';

describe('APP_NAME', () => {
  it('is the expected app name', () => {
    expect(APP_NAME).toBe('BRO');
  });
});

describe('APP_VERSION', () => {
  it('matches the package version', () => {
    expect(APP_VERSION).toBe('0.1.0');
  });
});

describe('NAVIGATION', () => {
  it('defines all tab routes', () => {
    expect(NAVIGATION.TABS.PULSE).toBe('pulse');
    expect(NAVIGATION.TABS.PEOPLE).toBe('people');
    expect(NAVIGATION.TABS.SPACES).toBe('spaces');
    expect(NAVIGATION.TABS.YOU).toBe('you');
  });
});

describe('LAUNCH_OPTIONS', () => {
  it('defines splash screen timeout', () => {
    expect(LAUNCH_OPTIONS.SPLASH_SCREEN_TIMEOUT).toBe(3000);
  });
});