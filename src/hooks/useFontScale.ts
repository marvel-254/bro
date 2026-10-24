import { useEffect, useState } from "react";
import { PixelRatio } from "react-native";

interface FontScaleInfo {
  fontScale: number;
  isLarge: boolean;
  isExtraLarge: boolean;
  category: "normal" | "large" | "extra-large";
}

/**
 * Hook to monitor font scale changes for accessibility testing.
 *
 * Helps identify layouts that break at larger font sizes.
 * Categories:
 * - normal: < 1.3x (standard)
 * - large: 1.3x - 1.5x (accessibility large)
 * - extra-large: > 1.5x (accessibility extra large)
 */
export function useFontScale(): FontScaleInfo {
  const [fontScale, setFontScale] = useState(() => PixelRatio.getFontScale());

  useEffect(() => {
    // Poll the font scale periodically since React Native does not expose
    // a dedicated event for font scale changes on all platforms.
    const interval = setInterval(() => {
      const current = PixelRatio.getFontScale();
      setFontScale((prev) => {
        if (current !== prev) return current;
        return prev;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return {
    fontScale,
    isLarge: fontScale >= 1.3,
    isExtraLarge: fontScale >= 1.5,
    category:
      fontScale >= 1.5
        ? "extra-large"
        : fontScale >= 1.3
        ? "large"
        : "normal",
  };
}

/**
 * Hook to get responsive dimensions that adapt to font scale.
 *
 * Use this instead of hardcoded pixel values for text containers,
 * button heights, and other elements that should scale with text.
 */
export function useScaledDimensions(
  baseDimensions: { width?: number; height?: number; minHeight?: number; maxHeight?: number }
) {
  const { fontScale, category } = useFontScale();

  // Cap scaling at extra-large to prevent layout explosion
  const cappedScale = Math.min(fontScale, 1.5);

  return {
    width: baseDimensions.width ? Math.round(baseDimensions.width * cappedScale) : undefined,
    height: baseDimensions.height ? Math.round(baseDimensions.height * cappedScale) : undefined,
    minHeight: baseDimensions.minHeight ? Math.round(baseDimensions.minHeight * cappedScale) : undefined,
    maxHeight: baseDimensions.maxHeight ? Math.round(baseDimensions.maxHeight * cappedScale) : undefined,
    fontScale,
    category,
  };
}

/**
 * Get the current font scale category synchronously (for one-time checks).
 */
export function getFontScaleCategory(): FontScaleInfo["category"] {
  const scale = PixelRatio.getFontScale();
  if (scale >= 1.5) return "extra-large";
  if (scale >= 1.3) return "large";
  return "normal";
}

/**
 * Test utility: simulate different font scales in development.
 * Only works in __DEV__ mode.
 */
export function debugFontScale(): void {
  if (!__DEV__) return;

  const categories = [
    { scale: 1.0, label: "Normal (1.0x)" },
    { scale: 1.15, label: "Slightly Large (1.15x)" },
    { scale: 1.3, label: "Accessibility Large (1.3x)" },
    { scale: 1.5, label: "Accessibility Extra Large (1.5x)" },
    { scale: 2.0, label: "Maximum (2.0x)" },
  ];

  // eslint-disable-next-line no-console
  console.group("Font Scale Test Matrix");
  categories.forEach(({ scale, label }) => {
    // eslint-disable-next-line no-console
    console.log(`${label}: current scale = ${PixelRatio.getFontScale().toFixed(2)}x (target ${scale}x)`);
  });
  // eslint-disable-next-line no-console
  console.groupEnd();
}