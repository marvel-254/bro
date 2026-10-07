import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { COLORS } from "../../../theme";
import { useReducedMotion } from "../../../hooks/useReducedMotion";

/**
 * The BRO mark: a hex node lattice with the wordmark at its centre.
 *
 * Built rather than drawn as artwork so it stays crisp at any size and can be
 * tinted from the theme. Three layers, two of them turning: the dashed orbit
 * drifts one way and the node trio the other, which is what makes the mark feel
 * alive without anything visibly moving.
 */

const WORDMARK = "#EAFBFF";

/** Full turns in ms. Slow enough to read as drift rather than rotation. */
const ORBIT_MS = 52_000;
const NODES_MS = 34_000;
const BREATH_MS = 5_400;

type Props = {
  size?: number;
};

/** Six points on a circle, first point at 12 o'clock. */
function hexPath(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 2;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  });
  return `M${points.join("L")}Z`;
}

function hexVertex(cx: number, cy: number, r: number, index: number) {
  const angle = (Math.PI / 3) * index - Math.PI / 2;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

export default function BrandMark({ size = 224 }: Props) {
  const reduced = useReducedMotion();

  const orbit = useSharedValue(0);
  const counterOrbit = useSharedValue(0);
  const breath = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) {
      orbit.value = 0;
      counterOrbit.value = 0;
      breath.value = 0.5;
      return;
    }

    orbit.value = withRepeat(
      withTiming(360, { duration: ORBIT_MS, easing: Easing.linear }),
      -1,
      false,
    );
    counterOrbit.value = withRepeat(
      withTiming(-360, { duration: NODES_MS, easing: Easing.linear }),
      -1,
      false,
    );
    breath.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.42, { duration: BREATH_MS, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [reduced, orbit, counterOrbit, breath]);

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value}deg` }],
  }));

  const nodeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${counterOrbit.value}deg` }],
  }));

  const breathStyle = useAnimatedStyle(() => ({
    opacity: breath.value,
    transform: [{ scale: 0.94 + breath.value * 0.12 }],
  }));

  const centre = size / 2;
  const haloRadius = size * 0.49;
  const dashedRadius = size * 0.405;
  const hexRadius = size * 0.285;
  const tickInner = hexRadius + size * 0.05;
  const tickOuter = tickInner + size * 0.042;

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Animated.View style={[styles.layer, breathStyle]}>
        <View
          style={[
            styles.core,
            {
              width: size * 0.5,
              height: size * 0.5,
              borderRadius: size * 0.25,
            },
          ]}
        />
      </Animated.View>

      <Animated.View style={[styles.layer, orbitStyle]}>
        <Svg width={size} height={size}>
          <Circle
            cx={centre}
            cy={centre}
            r={dashedRadius}
            fill="none"
            stroke={COLORS.primaryContainer}
            strokeOpacity={0.26}
            strokeWidth={1}
            strokeDasharray="2 7"
          />
        </Svg>
      </Animated.View>

      <View style={styles.layer}>
        <Svg width={size} height={size}>
          <Circle
            cx={centre}
            cy={centre}
            r={haloRadius}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={0.05}
            strokeWidth={1}
          />
          <Path
            d={hexPath(centre, centre, hexRadius)}
            fill="rgba(0,240,255,0.04)"
            stroke={WORDMARK}
            strokeOpacity={0.5}
            strokeWidth={1.3}
          />
          {[0, 1, 2, 3].map((index) => {
            const dx = Math.cos((Math.PI / 2) * index) * 1;
            const dy = Math.sin((Math.PI / 2) * index) * 1;
            return (
              <Line
                key={index}
                x1={centre + dx * tickInner}
                y1={centre + dy * tickInner}
                x2={centre + dx * tickOuter}
                y2={centre + dy * tickOuter}
                stroke={COLORS.primaryContainer}
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            );
          })}
        </Svg>
      </View>

      <Animated.View style={[styles.layer, nodeStyle]}>
        <Svg width={size} height={size}>
          {[0, 2, 4].map((index) => {
            const vertex = hexVertex(centre, centre, hexRadius, index);
            return (
              <Circle
                key={index}
                cx={vertex.x}
                cy={vertex.y}
                r={1.9}
                fill={COLORS.primaryContainer}
              />
            );
          })}
        </Svg>
      </Animated.View>

      <Text
        style={[
          styles.wordmark,
          {
            fontSize: size * 0.135,
            letterSpacing: size * 0.026,
            paddingLeft: size * 0.026,
          },
        ]}
        allowFontScaling={false}
        accessibilityRole="header"
      >
        BRO
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    backgroundColor: "rgba(0,240,255,0.1)",
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 34,
    elevation: 6,
  },
  wordmark: {
    fontWeight: "900",
    color: WORDMARK,
    includeFontPadding: false,
  },
});
