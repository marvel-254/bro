import { useEffect, useState } from "react";
import { Image, View, Text, StyleSheet } from "react-native";
import { COLORS } from "../../theme";
import { PRESENCE_COLORS, type Presence } from "../../lib/presence";

/**
 * Avatar with a presence dot.
 *
 * Deliberately compact: the dot is a ring-bounded circle rather than a badge,
 * and the whole thing stays square-edged enough not to read as a generic
 * rounded card. Presence colour is the only thing that changes.
 */

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  presence?: Presence | null;
  style?: object;
}

function initialsOf(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Avatar({ uri, name, size = 40, presence, style }: AvatarProps) {
  const initials = initialsOf(name);
  const dot = Math.max(10, Math.round(size * 0.26));
  const [failed, setFailed] = useState(false);

  // A changed uri must retry, so drop the failure when the source changes.
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  } as const;

  const face =
    uri && !failed ? (
      <Image
        source={{ uri }}
        style={[styles.circle, circle]}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    ) : (
      <View style={[styles.circle, circle]}>
        <Text style={[styles.text, { fontSize: size * 0.36 }]}>
          {initials}
        </Text>
      </View>
    );

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      {face}

      {presence ? (
        <View
          style={[
            styles.dot,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor:
                PRESENCE_COLORS[presence] ?? PRESENCE_COLORS.offline,
            },
          ]}
          accessibilityLabel={`Presence: ${presence}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
  },
  text: {
    fontWeight: "700",
    color: COLORS.onSurface,
    letterSpacing: 0.5,
  },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    borderWidth: 2,
    borderColor: COLORS.semantic.canvasRoot,
  },
});
