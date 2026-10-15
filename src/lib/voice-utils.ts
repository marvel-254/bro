/**
 * Pure helpers for voice-note rendering.
 *
 * Kept in `lib` rather than next to `VoiceMessage.tsx` on purpose: the screen
 * component imports `expo-av`, whose ESM build jest cannot transform, so any
 * test that touches the component file fails to parse. These functions have no
 * native dependencies and are covered directly instead.
 */

/** m:ss for a duration in seconds. */
export function formatVoiceDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

/** Fraction of a clip played, clamped to [0, 1]. 0 when the duration is unknown. */
export function playbackFraction(
  positionMillis: number,
  durationMillis: number | undefined,
): number {
  if (!durationMillis || durationMillis <= 0) return 0;
  const fraction = positionMillis / durationMillis;
  return fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
}
