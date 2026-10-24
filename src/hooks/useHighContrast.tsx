import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AccessibilityInfo } from "react-native";
import { COLORS } from "../theme";

type ContrastMode = "normal" | "high";

interface HighContrastContextValue {
  contrastMode: ContrastMode;
  toggleContrast: () => void;
  setContrastMode: (mode: ContrastMode) => void;
}

/**
 * Context for high contrast mode preference.
 *
 * High contrast mode increases color contrast ratios to meet WCAG AAA
 * (7:1) instead of WCAG AA (4.5:1). This is particularly helpful for
 * users with low vision, color blindness, or in bright environments.
 */
const HighContrastContext = createContext<HighContrastContextValue | null>(null);

const STORAGE_KEY = "@bro:high_contrast";

/**
 * Provider for high contrast mode.
 *
 * Wraps the app and manages the contrast mode state, persisting to
 * AsyncStorage and responding to system accessibility changes.
 */
export function HighContrastProvider({ children }: { children: ReactNode }) {
  const [contrastMode, setContrastModeState] = useState<ContrastMode>("normal");
  const [hydrated, setHydrated] = useState(false);

  // Load persisted preference
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && stored) {
          setContrastModeState(stored as ContrastMode);
        }
      } catch {
        // Ignore storage errors
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen for system high contrast changes
  // Note: React Native's AccessibilityInfo doesn't expose a highContrastChanged event
  // We poll the system setting instead
  useEffect(() => {
    if (!hydrated) return;

    const checkHighContrast = async () => {
      try {
        const enabled = await AccessibilityInfo.isHighTextContrastEnabled?.() ?? false;
        setContrastModeState(enabled ? "high" : "normal");
      } catch {
        // Ignore if method not available on platform
      }
    };

    // Check immediately
    checkHighContrast();

    // Poll periodically (iOS doesn't always fire events)
    const interval = setInterval(checkHighContrast, 10000);

    return () => clearInterval(interval);
  }, [hydrated]);

  const setContrastMode = async (mode: ContrastMode) => {
    setContrastModeState(mode);
    try {
      const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleContrast = () => {
    setContrastMode(contrastMode === "normal" ? "high" : "normal");
  };

  if (!hydrated) {
    return <>{children}</>; // Render children while hydrating
  }

  return (
    <HighContrastContext.Provider value={{ contrastMode, toggleContrast, setContrastMode }}>
      {children}
    </HighContrastContext.Provider>
  );
}

/**
 * Hook to access high contrast mode.
 *
 * Must be used within a HighContrastProvider.
 */
export function useHighContrast(): HighContrastContextValue {
  const context = useContext(HighContrastContext);
  if (!context) {
    throw new Error("useHighContrast must be used within a HighContrastProvider");
  }
  return context;
}

/**
 * Hook that returns theme colors adjusted for high contrast mode.
 */
export function useHighContrastColors(baseColors: typeof COLORS) {
  const { contrastMode } = useHighContrast();

  if (contrastMode === "normal") return baseColors;

  // High contrast adjustments: increase contrast ratios
  return {
    ...baseColors,
    // Boost text contrast
    onSurface: "#FFFFFF",
    onSurfaceVariant: "#E0E0E0",
    textPrimary: "#FFFFFF",
    textSecondary: "#CCCCCC",
    textDim: "#AAAAAA",
    // Increase border visibility
    outline: "#FFFFFF",
    outlineVariant: "#CCCCCC",
    ghostBorder: "rgba(255, 255, 255, 0.3)",
    ghostBorderLight: "rgba(255, 255, 255, 0.2)",
    // Boost surface separation
    surface: "#000000",
    surfaceContainer: "#1A1A1A",
    surfaceContainerHigh: "#2A2A2A",
    surfaceContainerHighest: "#3A3A3A",
    surfaceDim: "#000000",
    surfaceBright: "#2A2A2A",
    surfaceContainerLowest: "#000000",
    surfaceContainerLow: "#0D0D0D",
    semantic: {
      ...baseColors.semantic,
      canvasRoot: "#000000",
      surfaceLevel1: "#0D0D0D",
      surfaceLevel2: "#1A1A1A",
      ghostBorder: "rgba(255, 255, 255, 0.3)",
      ghostBorderLight: "rgba(255, 255, 255, 0.2)",
      textPrimary: "#FFFFFF",
      textSecondary: "#CCCCCC",
      textDim: "#AAAAAA",
    },
  };
}