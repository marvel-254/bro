import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the OS is asking us to reduce motion.
 *
 * Screen animations are decorative, so nothing here is worth fighting the
 * user's accessibility setting over: callers skip their loops and render the
 * final frame instead of the journey to it.
 *
 * Starts `false` because the read is async and animations are already running
 * by the time it resolves; a flip to `true` simply stops them.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduced(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
