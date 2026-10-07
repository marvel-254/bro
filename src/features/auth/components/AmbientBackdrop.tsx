import { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { COLORS } from "../../../theme";
import { useReducedMotion } from "../../../hooks/useReducedMotion";

/**
 * The static atmosphere behind the Welcome screen.
 *
 * Every expensive-looking thing here is depth, not decoration: a gradient that
 * lifts the top of the canvas, two radial halos that read as light falling from
 * somewhere off-screen, a dot lattice that only survives the top half, and one
 * slow light sweep so the surface never looks frozen.
 *
 * Deliberately monochrome plus the single cyan accent. Depth comes from
 * luminance, not hue, which is what keeps it from reading as a gradient poster.
 */

const CANVAS_TOP = "#05060A";
const CANVAS_MID = COLORS.semantic.canvasRoot;
const CANVAS_BOTTOM = "#0B1016";

/** One pass of the sweep, in ms. Slow enough to notice only if you watch. */
const SWEEP_MS = 11_000;

export default function AmbientBackdrop() {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();

  const sweep = useSharedValue(0.28);

  useEffect(() => {
    if (reduced) {
      sweep.value = 0.28;
      return;
    }
    sweep.value = withRepeat(
      withTiming(1.05, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [reduced, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * height * 0.72 }],
  }));

  const glowRadius = width * 0.95;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[CANVAS_TOP, CANVAS_MID, CANVAS_BOTTOM]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* The lattice. Hairline dots, spaced so they never compete with type. */}
          <Pattern
            id="dotLattice"
            x="0"
            y="0"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <Circle cx="1" cy="1" r="0.9" fill="#EAFBFF" opacity={0.12} />
          </Pattern>

          {/* Light falling onto the upper third. */}
          <RadialGradient
            id="upperHalo"
            gradientUnits="userSpaceOnUse"
            cx={width * 0.5}
            cy={height * 0.26}
            r={glowRadius}
          >
            <Stop offset="0" stopColor={COLORS.primaryContainer} stopOpacity={0.22} />
            <Stop offset="0.45" stopColor={COLORS.primaryContainer} stopOpacity={0.06} />
            <Stop offset="1" stopColor={COLORS.primaryContainer} stopOpacity={0} />
          </RadialGradient>

          {/* A cooler fill low and left, so the canvas is not lit from one side. */}
          <RadialGradient
            id="lowerHalo"
            gradientUnits="userSpaceOnUse"
            cx={width * 0.08}
            cy={height * 1.02}
            r={width * 0.78}
          >
            <Stop offset="0" stopColor="#7DF4FF" stopOpacity={0.1} />
            <Stop offset="0.6" stopColor="#7DF4FF" stopOpacity={0.02} />
            <Stop offset="1" stopColor="#7DF4FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Halos first, lattice over them: light sits behind the structure. */}
        <Rect width={width} height={height} fill="url(#upperHalo)" />
        <Rect width={width} height={height} fill="url(#lowerHalo)" />
        <Rect width={width} height={height} fill="url(#dotLattice)" />
        <Ellipse
          cx={width * 0.5}
          cy={height * 0.26}
          rx={width * 0.62}
          ry={width * 0.62}
          fill="none"
          stroke={COLORS.primaryContainer}
          strokeOpacity={0.06}
          strokeWidth={1}
        />
      </Svg>

      {/* The lattice has to die out before the CTAs, or it reads as noise. */}
      <LinearGradient
        colors={["transparent", "rgba(9,10,15,0.72)", CANVAS_MID]}
        locations={[0.42, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.sweep, sweepStyle]}>
        <LinearGradient
          colors={["transparent", "rgba(0,240,255,0.55)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sweepLine}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sweep: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "center",
  },
  sweepLine: {
    width: "72%",
    height: 1.5,
    borderRadius: 1,
  },
});
