import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { fetchMemes, pickMeme, type Meme } from "../../lib/memes";

type Props = {
  onUseMeme?: (meme: Meme) => void;
};

/**
 * A meme card for Pulse.
 *
 * Hides itself entirely until it has something to show. A missing meme is not
 * an error worth surfacing on someone's home screen.
 */
export default function MemeCard({ onUseMeme }: Props) {
  const [meme, setMeme] = useState<Meme | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (currentId?: string) => {
    try {
      const memes = await fetchMemes();
      setMeme(pickMeme(memes, currentId));
    } catch {
      // Leave the card hidden rather than rendering a broken image.
      setMeme(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.section}>
        <View style={styles.card}>
          <ActivityIndicator color={COLORS.primaryContainer} />
        </View>
      </View>
    );
  }

  if (!meme) return null;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>Meme of the moment</Text>
        <Pressable
          onPress={() => void load(meme.id)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Shuffle meme"
          style={styles.shuffle}
        >
          <Ionicons name="shuffle" size={16} color={COLORS.primaryContainer} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => onUseMeme?.(meme)}
        disabled={!onUseMeme}
        accessibilityRole="button"
        accessibilityLabel={`Meme: ${meme.name}`}
        style={styles.card}
      >
        <Image
          source={{ uri: meme.url }}
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={styles.caption} numberOfLines={1}>
          {meme.name}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: SPACING.gutter,
    marginTop: SPACING.spaceLg,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceSm,
  },
  title: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.semantic.textPrimary,
  },
  shuffle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.semantic.surfaceLevel2,
  },
  card: {
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderRadius: RADIUS.DEFAULT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
    padding: SPACING.spaceSm,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: 180,
  },
  caption: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textSecondary,
    marginTop: SPACING.spaceSm,
    alignSelf: "flex-start",
  },
});
